// Vercel API endpoint for scanning a YouTube channel for recent videos
// GET /api/youtube/scan?channel_id=xxx - Fetch up to 20 recent videos for manual selection
// POST /api/youtube/scan - Add selected videos to queue (with optional immediate processing)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Default duration settings (used as fallback)
const DEFAULT_MIN_DURATION = 90;  // 1.5 minutes (skip Shorts)
const DEFAULT_MAX_DURATION = null;  // Unlimited
const MAX_VIDEOS_TO_RETURN = 15;  // Return top 15 matching videos
const MAX_VIDEOS_TO_FETCH = 30;  // Fetch more to have buffer after filtering

// Helper to verify JWT and get user
async function verifyAuth(req: VercelRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid authorization header' };
  }

  const jwt = authHeader.slice(7);
  const supabase = getSupabase();

  const { data: { user }, error } = await supabase.auth.getUser(jwt);
  if (error || !user) {
    return { user: null, error: 'Invalid or expired token' };
  }

  return { user, error: null };
}

interface YouTubeVideoFromRSS {
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string;
  published_at: string;
  description: string | null;
  duration_seconds: number | null;
}

// Fetch video duration in seconds from YouTube
async function getVideoDuration(videoId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) return null;

    const html = await response.text();

    const durationMatch = html.match(/"lengthSeconds":"(\d+)"/) ||
                          html.match(/"approxDurationMs":"(\d+)"/);

    if (durationMatch) {
      if (durationMatch[0].includes('lengthSeconds')) {
        return parseInt(durationMatch[1], 10);
      } else if (durationMatch[0].includes('approxDurationMs')) {
        return Math.floor(parseInt(durationMatch[1], 10) / 1000);
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching duration for ${videoId}:`, error);
    return null;
  }
}

function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };
  return text.replace(/&[^;]+;/g, (entity) => entities[entity] || entity);
}

// Fetch videos from RSS feed
async function fetchChannelVideosFromRSS(channelId: string): Promise<YouTubeVideoFromRSS[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  try {
    const response = await fetch(rssUrl);
    if (!response.ok) {
      console.error(`RSS fetch failed for ${channelId}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const videos: YouTubeVideoFromRSS[] = [];

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = entryRegex.exec(xml)) !== null && videos.length < MAX_VIDEOS_TO_FETCH) {
      const entry = match[1];

      const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      if (!videoIdMatch) continue;

      const videoId = videoIdMatch[1];
      const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
      const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
      const descMatch = entry.match(/<media:description>([^<]*)<\/media:description>/);

      videos.push({
        video_id: videoId,
        title: titleMatch ? decodeHTMLEntities(titleMatch[1]) : 'Untitled',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        published_at: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
        description: descMatch ? decodeHTMLEntities(descMatch[1]).substring(0, 500) : null,
        duration_seconds: null,
      });
    }

    return videos;
  } catch (error) {
    console.error(`Error fetching RSS for ${channelId}:`, error);
    return [];
  }
}

// Format duration for display
function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'Unknown';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export interface ScanVideoResult {
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string;
  published_at: string;
  duration_seconds: number | null;
  duration_formatted: string;
  description: string | null;
  status: 'new' | 'queued' | 'processing' | 'completed' | 'failed';
  queue_item_id?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    // GET - Scan channel and return recent videos with their status
    if (req.method === 'GET') {
      const { channel_id } = req.query;

      if (!channel_id || typeof channel_id !== 'string') {
        return res.status(400).json({ error: 'channel_id is required' });
      }

      // Verify channel belongs to user and get duration settings
      const { data: channel, error: channelError } = await supabase
        .from('youtube_channels')
        .select('id, channel_id, channel_name, min_video_duration, max_video_duration')
        .eq('id', channel_id)
        .eq('user_id', user.id)
        .single();

      if (channelError || !channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Get channel-specific duration settings (with defaults)
      const minDuration = channel.min_video_duration ?? DEFAULT_MIN_DURATION;
      const maxDuration = channel.max_video_duration ?? DEFAULT_MAX_DURATION;

      console.log(`[Scan] Scanning channel: ${channel.channel_name} (min: ${minDuration}s, max: ${maxDuration || 'unlimited'})`);

      // Fetch recent videos from RSS
      const videos = await fetchChannelVideosFromRSS(channel.channel_id);

      if (videos.length === 0) {
        return res.status(200).json({
          channel_name: channel.channel_name,
          videos: [],
          message: 'No videos found in RSS feed',
        });
      }

      // Fetch durations for all videos (in parallel with limit)
      const videosWithDuration = await Promise.all(
        videos.map(async (video) => {
          const duration = await getVideoDuration(video.video_id);
          return { ...video, duration_seconds: duration };
        })
      );

      // Filter videos by channel-specific duration settings
      const filteredVideos = videosWithDuration.filter(v => {
        // If we couldn't get duration, include it (benefit of the doubt)
        if (v.duration_seconds === null) return true;

        // Check minimum duration
        if (v.duration_seconds < minDuration) return false;

        // Check maximum duration (if set)
        if (maxDuration !== null && v.duration_seconds > maxDuration) return false;

        return true;
      }).slice(0, MAX_VIDEOS_TO_RETURN);  // Limit to top 15 matching videos

      // Get existing queue items for these videos
      const videoIds = filteredVideos.map(v => v.video_id);
      const { data: existingItems } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, video_id, status')
        .eq('user_id', user.id)
        .in('video_id', videoIds);

      const existingMap = new Map(
        (existingItems || []).map(item => [item.video_id, { id: item.id, status: item.status }])
      );

      // Build result with status
      const results: ScanVideoResult[] = filteredVideos.map(video => {
        const existing = existingMap.get(video.video_id);
        let status: ScanVideoResult['status'] = 'new';
        let queue_item_id: string | undefined;

        if (existing) {
          queue_item_id = existing.id;
          if (existing.status === 'pending') {
            status = 'queued';
          } else if (existing.status === 'fetching_transcript' || existing.status === 'extracting') {
            status = 'processing';
          } else if (existing.status === 'completed') {
            status = 'completed';
          } else if (existing.status === 'failed') {
            status = 'failed';
          } else {
            status = 'queued';
          }
        }

        return {
          video_id: video.video_id,
          title: video.title,
          url: video.url,
          thumbnail_url: video.thumbnail_url,
          published_at: video.published_at,
          duration_seconds: video.duration_seconds,
          duration_formatted: formatDuration(video.duration_seconds),
          description: video.description,
          status,
          queue_item_id,
        };
      });

      // Update last_checked_at for the channel
      await supabase
        .from('youtube_channels')
        .update({ last_checked_at: new Date().toISOString() })
        .eq('id', channel_id);

      const newCount = results.filter(v => v.status === 'new').length;
      const queuedCount = results.filter(v => v.status === 'queued').length;
      const completedCount = results.filter(v => v.status === 'completed').length;

      // Log scan to history
      await supabase.from('youtube_scan_history').insert({
        user_id: user.id,
        channel_id: channel.id,
        scan_type: 'manual_scan',
        channel_name: channel.channel_name,
        channel_youtube_id: channel.channel_id,
        videos_found: results.length,
        videos_added: 0,
        videos_skipped: queuedCount + completedCount,
        status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: { new_count: newCount, queued_count: queuedCount, completed_count: completedCount },
      });

      return res.status(200).json({
        channel_name: channel.channel_name,
        videos: results,
        summary: {
          total: results.length,
          new: newCount,
          queued: queuedCount,
          completed: completedCount,
        },
        duration_filter: {
          min_seconds: minDuration,
          max_seconds: maxDuration,
        },
      });
    }

    // POST - Add selected videos to queue (optionally with immediate processing)
    // Accepts full video data from frontend to avoid re-fetching RSS
    if (req.method === 'POST') {
      const { channel_id, videos: videosToAdd, process_immediately } = req.body;

      if (!channel_id || typeof channel_id !== 'string') {
        return res.status(400).json({ error: 'channel_id is required' });
      }

      if (!videosToAdd || !Array.isArray(videosToAdd) || videosToAdd.length === 0) {
        return res.status(400).json({ error: 'videos array is required' });
      }

      // Verify channel belongs to user
      const { data: channel, error: channelError } = await supabase
        .from('youtube_channels')
        .select('id, channel_id, channel_name')
        .eq('id', channel_id)
        .eq('user_id', user.id)
        .single();

      if (channelError || !channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      console.log(`[Scan] Adding ${videosToAdd.length} videos to queue for ${channel.channel_name}`);

      // Check which videos are already queued
      const videoIds = videosToAdd.map((v: any) => v.video_id);
      const { data: existingItems } = await supabase
        .from('youtube_ingestion_queue')
        .select('video_id')
        .eq('user_id', user.id)
        .in('video_id', videoIds);

      const existingVideoIds = new Set((existingItems || []).map(item => item.video_id));
      const newVideos = videosToAdd.filter((v: any) => !existingVideoIds.has(v.video_id));

      if (newVideos.length === 0) {
        return res.status(200).json({
          success: true,
          added: 0,
          skipped: videosToAdd.length,
          message: 'All selected videos are already in the queue',
        });
      }

      // Insert into queue using the video data passed from frontend
      // Note: duration_seconds is not in the actual table schema
      const queueItems = newVideos.map((video: any) => ({
        user_id: user.id,
        channel_id: channel.id,
        video_id: video.video_id,
        video_title: video.title,
        video_url: video.url,
        thumbnail_url: video.thumbnail_url,
        published_at: video.published_at,
        status: 'pending',
        priority: process_immediately ? 1 : 5, // High priority if processing immediately
        retry_count: 0,
        max_retries: 3,
      }));

      const { data: insertedData, error: insertError } = await supabase
        .from('youtube_ingestion_queue')
        .insert(queueItems)
        .select();

      if (insertError) {
        console.error('[Scan] Error adding to queue:', insertError);
        return res.status(500).json({
          error: 'Failed to add videos to queue',
          details: insertError.message
        });
      }

      console.log(`[Scan] Added ${queueItems.length} videos to queue`);

      // If process_immediately, trigger the process endpoint
      let processResult = null;
      if (process_immediately) {
        console.log('[Scan] Triggering immediate processing...');

        // Call the process endpoint internally
        try {
          const processResponse = await fetch(
            `${req.headers.origin || 'http://localhost:3000'}/api/youtube/process`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || '',
              },
              body: JSON.stringify({ process_all: true }),
            }
          );

          if (processResponse.ok) {
            processResult = await processResponse.json();
            console.log('[Scan] Process result:', processResult);
          }
        } catch (processError) {
          console.error('[Scan] Error triggering process:', processError);
          // Don't fail the request, videos are queued
        }
      }

      // Log to scan history
      await supabase.from('youtube_scan_history').insert({
        user_id: user.id,
        channel_id: channel.id,
        scan_type: 'manual_scan',
        channel_name: channel.channel_name,
        channel_youtube_id: channel.channel_id,
        videos_found: videosToAdd.length,
        videos_added: queueItems.length,
        videos_skipped: videosToAdd.length - newVideos.length,
        status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: { process_immediately },
      });

      return res.status(200).json({
        success: true,
        added: queueItems.length,
        skipped: videosToAdd.length - newVideos.length,
        process_immediately,
        process_result: processResult,
        message: process_immediately
          ? `Added ${queueItems.length} videos and started processing`
          : `Added ${queueItems.length} videos to queue`,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Scan] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
