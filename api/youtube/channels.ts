// Vercel API endpoint for YouTube channel management
// GET /api/youtube/channels - List user's channels
// POST /api/youtube/channels - Add new channel
// PATCH /api/youtube/channels - Update channel
// DELETE /api/youtube/channels - Delete channel

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Default video duration settings
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
    console.error(`Error fetching duration for ${videoId}:`, error);
    return null;
  }
}

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

// Resolve channel URL to get channel info
async function resolveChannelUrl(url: string): Promise<{
  channel_id: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url: string | null;
  description: string | null;
  subscriber_count: number | null;
} | null> {
  try {
    // Extract channel identifier from URL and normalize to full URL
    let pageUrl = url.trim();
    console.log('[resolveChannelUrl] Input URL:', url);

    // Handle shorthand formats:
    // @username -> https://www.youtube.com/@username
    // UCxxxxxxx -> https://www.youtube.com/channel/UCxxxxxxx
    // username (no @ or UC) -> https://www.youtube.com/@username
    if (!pageUrl.includes('youtube.com') && !pageUrl.includes('youtu.be')) {
      // Remove leading @ if present for consistent handling
      const cleanInput = pageUrl.startsWith('@') ? pageUrl : `@${pageUrl}`;

      // Check if it's a channel ID (starts with UC)
      if (pageUrl.startsWith('UC') && pageUrl.length >= 24) {
        pageUrl = `https://www.youtube.com/channel/${pageUrl}`;
      } else {
        pageUrl = `https://www.youtube.com/${cleanInput}`;
      }
    } else if (!pageUrl.startsWith('http')) {
      pageUrl = 'https://' + pageUrl;
    }

    console.log('[resolveChannelUrl] Fetching URL:', pageUrl);

    // Fetch the channel page to extract info
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    console.log('[resolveChannelUrl] Response status:', response.status);

    if (!response.ok) {
      console.error('[resolveChannelUrl] Fetch failed:', response.status, response.statusText);
      return null;
    }

    const html = await response.text();
    console.log('[resolveChannelUrl] HTML length:', html.length);

    // Extract channel ID - try multiple patterns
    const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ||
                           html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/) ||
                           html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/) ||
                           html.match(/\\?"channelId\\?":\\?"(UC[a-zA-Z0-9_-]+)\\?"/);

    if (!channelIdMatch) {
      console.error('[resolveChannelUrl] Could not find channel ID in HTML');
      // Log a snippet to help debug
      const snippet = html.substring(0, 2000);
      console.log('[resolveChannelUrl] HTML snippet:', snippet.includes('channelId') ? 'contains channelId' : 'NO channelId found');
      return null;
    }

    const channelId = channelIdMatch[1];
    console.log('[resolveChannelUrl] Found channel ID:', channelId);

    // Extract channel name
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                     html.match(/<title>([^<]+)<\/title>/);
    const channelName = nameMatch
      ? nameMatch[1].replace(' - YouTube', '').trim()
      : 'Unknown Channel';

    // Extract thumbnail
    const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const thumbnailUrl = thumbnailMatch ? thumbnailMatch[1] : null;

    // Extract description
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1].substring(0, 500) : null;

    return {
      channel_id: channelId,
      channel_name: channelName,
      channel_url: `https://www.youtube.com/channel/${channelId}`,
      thumbnail_url: thumbnailUrl,
      description,
      subscriber_count: null, // Would need YouTube API for accurate count
    };
  } catch (error) {
    console.error('Error resolving channel URL:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
    // GET - List channels
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('youtube_channels')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ channels: data || [] });
    }

    // POST - Add channel
    if (req.method === 'POST') {
      console.log('[channels] POST request received');

      const {
        channel_url,
        auto_ingest = true,
        extraction_mode = 'comprehensive',
        anchor_emphasis = 'standard',
        linked_anchor_ids = [],
        custom_instructions = null,
        backfill_count = 0,
        min_video_duration = DEFAULT_MIN_DURATION,
        max_video_duration = DEFAULT_MAX_DURATION,
      } = req.body;

      console.log('[channels] channel_url:', channel_url);

      if (!channel_url) {
        return res.status(400).json({ error: 'channel_url is required' });
      }

      // Resolve channel URL
      console.log('[channels] Resolving channel URL...');
      const channelInfo = await resolveChannelUrl(channel_url);
      console.log('[channels] Channel info:', channelInfo ? 'found' : 'null');
      if (!channelInfo) {
        return res.status(400).json({
          error: 'Could not resolve channel URL. Please check the URL and try again.'
        });
      }

      // Check if channel already exists for this user
      const { data: existing } = await supabase
        .from('youtube_channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('channel_id', channelInfo.channel_id)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'This channel is already in your list'
        });
      }

      // Insert channel
      const { data, error } = await supabase
        .from('youtube_channels')
        .insert({
          user_id: user.id,
          channel_id: channelInfo.channel_id,
          channel_name: channelInfo.channel_name,
          channel_url: channelInfo.channel_url,
          thumbnail_url: channelInfo.thumbnail_url,
          description: channelInfo.description,
          subscriber_count: channelInfo.subscriber_count,
          auto_ingest,
          extraction_mode,
          anchor_emphasis,
          linked_anchor_ids,
          custom_instructions,
          min_video_duration,
          max_video_duration,
          is_active: true,
          total_videos_ingested: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // If backfill requested, add recent videos to queue
      if (backfill_count > 0 && data) {
        // Fetch videos from RSS
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelInfo.channel_id}`;
        try {
          const rssResponse = await fetch(rssUrl);
          const rssXml = await rssResponse.text();

          // Parse RSS feed
          const videos: Array<{
            video_id: string;
            title: string;
            url: string;
            thumbnail_url: string;
            published_at: string;
          }> = [];

          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          let match;
          while ((match = entryRegex.exec(rssXml)) !== null && videos.length < backfill_count) {
            const entry = match[1];
            const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
            const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
            const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);

            if (videoIdMatch) {
              const videoId = videoIdMatch[1];
              videos.push({
                video_id: videoId,
                title: titleMatch ? titleMatch[1] : 'Untitled',
                url: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                published_at: publishedMatch ? publishedMatch[1] : new Date().toISOString(),
              });
            }
          }

          // Fetch duration for each video and filter out Shorts
          console.log(`[channels] Checking duration for ${videos.length} videos...`);
          const videosWithDuration = await Promise.all(
            videos.map(async (video) => {
              const duration = await getVideoDuration(video.video_id);
              console.log(`[channels] Video "${video.title}" duration: ${duration}s`);
              return { ...video, duration_seconds: duration };
            })
          );

          // Filter by channel duration settings
          // NOTE: If duration is unknown (YouTube blocking), INCLUDE the video to avoid blocking all content
          const filteredVideos = videosWithDuration.filter(v => {
            // If we couldn't get duration, INCLUDE the video (YouTube may be rate-limiting)
            if (v.duration_seconds === null) {
              console.log(`[channels] Including "${v.title}" - unknown duration (YouTube may be blocking)`);
              return true;
            }

            // Check minimum duration
            if (v.duration_seconds < min_video_duration) {
              console.log(`[channels] Excluding (too short): "${v.title}" (${v.duration_seconds}s < ${min_video_duration}s)`);
              return false;
            }

            // Check maximum duration (if set)
            if (max_video_duration !== null && v.duration_seconds > max_video_duration) {
              console.log(`[channels] Excluding (too long): "${v.title}" (${v.duration_seconds}s > ${max_video_duration}s)`);
              return false;
            }

            return true;
          });

          console.log(`[channels] ${filteredVideos.length}/${videos.length} videos match duration filter`);

          // Add videos to queue
          if (filteredVideos.length > 0) {
            const queueItems = filteredVideos.map(video => ({
              user_id: user.id,
              channel_id: data.id,
              video_id: video.video_id,
              video_title: video.title,
              video_url: video.url,
              thumbnail_url: video.thumbnail_url,
              published_at: video.published_at,
              duration_seconds: video.duration_seconds,
              status: 'pending',
              priority: 5,
              retry_count: 0,
              max_retries: 3,
            }));

            await supabase
              .from('youtube_ingestion_queue')
              .upsert(queueItems, { onConflict: 'user_id,video_id', ignoreDuplicates: true });
          }
        } catch (rssError) {
          console.error('Error fetching RSS for backfill:', rssError);
          // Don't fail the request, just skip backfill
        }
      }

      return res.status(201).json({ channel: data });
    }

    // PATCH - Update channel
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Channel id is required' });
      }

      // Only allow updating specific fields
      const allowedUpdates: Record<string, any> = {};
      const allowedFields = [
        'auto_ingest', 'extraction_mode', 'anchor_emphasis',
        'linked_anchor_ids', 'custom_instructions', 'is_active',
        'min_video_duration', 'max_video_duration'
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          allowedUpdates[field] = updates[field];
        }
      }

      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      const { data, error } = await supabase
        .from('youtube_channels')
        .update(allowedUpdates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      return res.status(200).json({ channel: data });
    }

    // DELETE - Delete channel
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Channel id is required' });
      }

      const { error } = await supabase
        .from('youtube_channels')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('YouTube channels API error:', error);
    // Return more detailed error in dev
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV !== 'production' ? errorStack : undefined
    });
  }
}
