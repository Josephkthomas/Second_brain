// Vercel Cron endpoint for polling YouTube channels
// POST /api/youtube/poll (called by Vercel Cron every 15 minutes)
// Also supports manual trigger with Authorization header

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET; // Optional: for securing cron endpoints

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Default video duration settings (fallback if channel doesn't have settings)
const DEFAULT_MIN_DURATION = 90;  // 1.5 minutes (skip Shorts)
const DEFAULT_MAX_DURATION = null;  // Unlimited

// Fetch video duration in seconds from YouTube using multiple strategies
async function getVideoDuration(videoId: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      }
    );

    if (!response.ok) return null;

    const html = await response.text();

    // Try multiple patterns that YouTube uses
    const patterns = [
      /"lengthSeconds":"(\d+)"/,
      /"lengthSeconds":\s*"(\d+)"/,
      /lengthSeconds\\?":\\?"(\d+)\\?"/,
      /"approxDurationMs":"(\d+)"/,
      /approxDurationMs\\?":\\?"(\d+)\\?"/,
      /"duration":"PT(\d+)M(\d+)S"/,
      /"duration":"PT(\d+)S"/,
      /itemprop="duration" content="PT(\d+)M(\d+)S"/,
      /itemprop="duration" content="PT(\d+)S"/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        if (pattern.source.includes('PT') && match[2]) {
          return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
        } else if (pattern.source.includes('PT')) {
          return parseInt(match[1], 10);
        } else if (pattern.source.includes('approxDurationMs')) {
          return Math.floor(parseInt(match[1], 10) / 1000);
        } else {
          return parseInt(match[1], 10);
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`[Poll] Error fetching duration for ${videoId}:`, error);
    return null;
  }
}

// Verify cron authorization
function verifyCronAuth(req: VercelRequest): boolean {
  // Vercel automatically sets this header for cron jobs
  const cronAuth = req.headers['authorization'];
  if (cronAuth === `Bearer ${CRON_SECRET}`) {
    return true;
  }

  // Also allow requests with valid Vercel cron signature
  const vercelSignature = req.headers['x-vercel-signature'];
  if (vercelSignature) {
    return true;
  }

  // For manual testing with user JWT
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !CRON_SECRET) {
    return true;
  }

  return !CRON_SECRET; // Allow if no CRON_SECRET configured
}

interface YouTubeVideoFromRSS {
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string;
  published_at: string;
  description: string | null;
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

    while ((match = entryRegex.exec(xml)) !== null) {
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
      });
    }

    return videos;
  } catch (error) {
    console.error(`Error fetching RSS for ${channelId}:`, error);
    return [];
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization
  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    console.log('[Poll] Starting YouTube channel poll...');

    // Fetch all active channels with their duration settings
    const { data: channels, error: channelsError } = await supabase
      .from('youtube_channels')
      .select('id, user_id, channel_id, channel_name, last_checked_at, auto_ingest, min_video_duration, max_video_duration')
      .eq('is_active', true)
      .eq('auto_ingest', true);

    if (channelsError) throw channelsError;

    if (!channels || channels.length === 0) {
      console.log('[Poll] No active channels to poll');
      return res.status(200).json({
        success: true,
        channelsPolled: 0,
        newVideosQueued: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[Poll] Found ${channels.length} active channels to poll`);

    let totalVideosQueued = 0;
    const errors: string[] = [];

    // Process each channel
    for (const channel of channels) {
      try {
        // Get channel-specific duration settings
        const minDuration = channel.min_video_duration ?? DEFAULT_MIN_DURATION;
        const maxDuration = channel.max_video_duration ?? DEFAULT_MAX_DURATION;

        console.log(`[Poll] Polling: ${channel.channel_name} (min: ${minDuration}s, max: ${maxDuration || 'unlimited'})`);

        // Fetch videos from RSS
        const videos = await fetchChannelVideosFromRSS(channel.channel_id);

        if (videos.length === 0) {
          console.log(`[Poll] No videos found for ${channel.channel_name}`);
          continue;
        }

        // Get existing video IDs for this user to avoid duplicates
        const { data: existingItems } = await supabase
          .from('youtube_ingestion_queue')
          .select('video_id')
          .eq('user_id', channel.user_id);

        const existingVideoIds = new Set(existingItems?.map(item => item.video_id) || []);

        // Filter to only new videos
        let newVideos = videos.filter(v => !existingVideoIds.has(v.video_id));

        if (newVideos.length === 0) {
          console.log(`[Poll] No new videos for ${channel.channel_name}`);
        } else {
          console.log(`[Poll] Found ${newVideos.length} new videos for ${channel.channel_name}`);

          // Fetch duration for each video and filter out Shorts
          const videosWithDuration = await Promise.all(
            newVideos.map(async (video) => {
              const duration = await getVideoDuration(video.video_id);
              return { ...video, duration_seconds: duration };
            })
          );

          // Filter by channel-specific duration settings
          // IMPORTANT: Exclude videos with unknown duration since we can't verify they meet criteria
          const filteredVideos = videosWithDuration.filter(v => {
            // If we couldn't get duration, EXCLUDE the video
            if (v.duration_seconds === null) {
              console.log(`[Poll] Excluding "${v.title}" - unknown duration`);
              return false;
            }

            // Check minimum duration
            if (v.duration_seconds < minDuration) {
              console.log(`[Poll] Excluding "${v.title}" - too short (${v.duration_seconds}s < ${minDuration}s)`);
              return false;
            }

            // Check maximum duration (if set)
            if (maxDuration !== null && v.duration_seconds > maxDuration) {
              console.log(`[Poll] Excluding "${v.title}" - too long (${v.duration_seconds}s > ${maxDuration}s)`);
              return false;
            }

            return true;
          });

          if (filteredVideos.length === 0) {
            console.log(`[Poll] No videos passed duration filter for ${channel.channel_name}`);
          } else {
            console.log(`[Poll] ${filteredVideos.length}/${newVideos.length} videos passed duration filter`);
          }

          // Update newVideos to only include filtered
          newVideos = filteredVideos;

          // Add new videos to queue (only if there are any after filtering)
          if (newVideos.length > 0) {
            const queueItems = newVideos.map(video => ({
              user_id: channel.user_id,
              channel_id: channel.id,
              video_id: video.video_id,
              video_title: video.title,
              video_url: video.url,
              thumbnail_url: video.thumbnail_url,
              published_at: video.published_at,
              duration_seconds: (video as any).duration_seconds,
              status: 'pending',
              priority: 5,
              retry_count: 0,
              max_retries: 3,
            }));

            const { error: insertError } = await supabase
              .from('youtube_ingestion_queue')
              .upsert(queueItems, { onConflict: 'user_id,video_id', ignoreDuplicates: true });

            if (insertError) {
              console.error(`[Poll] Error inserting queue items for ${channel.channel_name}:`, insertError);
              errors.push(`${channel.channel_name}: ${insertError.message}`);
            } else {
              totalVideosQueued += newVideos.length;
            }
          }
        }

        // Update last_checked_at
        await supabase
          .from('youtube_channels')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', channel.id);

      } catch (channelError) {
        console.error(`[Poll] Error processing ${channel.channel_name}:`, channelError);
        errors.push(`${channel.channel_name}: ${channelError instanceof Error ? channelError.message : 'Unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Poll] Complete. Polled ${channels.length} channels, queued ${totalVideosQueued} videos in ${duration}ms`);

    return res.status(200).json({
      success: true,
      channelsPolled: channels.length,
      newVideosQueued: totalVideosQueued,
      duration_ms: duration,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[Poll] Fatal error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Poll failed',
      duration_ms: Date.now() - startTime,
    });
  }
}
