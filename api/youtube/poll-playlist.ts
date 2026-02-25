// Vercel Cron endpoint for polling YouTube playlists
// Runs every 5 minutes to detect new videos added to connected playlists
// New videos are queued into youtube_ingestion_queue for processing

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaylistItems, getUserYouTubeApiKey } from './_utils/playlist-helpers';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Verify cron authorization (same pattern as poll.ts)
function verifyCronAuth(req: VercelRequest): boolean {
  const cronAuth = req.headers['authorization'];
  if (cronAuth === `Bearer ${CRON_SECRET}`) return true;
  if (req.headers['x-vercel-signature']) return true;
  const userAgent = req.headers['user-agent'] || '';
  if (userAgent.includes('vercel-cron')) return true;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !CRON_SECRET) return true;
  return !CRON_SECRET;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    // Fetch all active, verified playlist connections
    const { data: playlists, error } = await supabase
      .from('youtube_playlists')
      .select('*')
      .eq('is_active', true)
      .eq('connection_status', 'verified');

    if (error) throw error;

    if (!playlists || playlists.length === 0) {
      return res.status(200).json({ success: true, playlistsPolled: 0, newVideosQueued: 0 });
    }

    let totalNewVideos = 0;

    for (const playlist of playlists) {
      try {
        // Get YouTube API key (shared helper checks env + user settings)
        const youtubeApiKey = await getUserYouTubeApiKey(supabase, playlist.user_id);

        if (!youtubeApiKey) {
          console.warn(`[Poll-Playlist] No API key for user ${playlist.user_id}`);
          continue;
        }

        // Fetch playlist items from YouTube Data API
        const videos = await fetchPlaylistItems(playlist.playlist_id, youtubeApiKey);

        // Get existing video IDs to avoid duplicates
        const { data: existingItems } = await supabase
          .from('youtube_ingestion_queue')
          .select('video_id')
          .eq('user_id', playlist.user_id);

        const existingVideoIds = new Set(
          existingItems?.map((item: any) => item.video_id) || []
        );

        // Filter to new videos only
        const newVideos = videos.filter(v => !existingVideoIds.has(v.videoId));

        if (newVideos.length > 0) {
          // Insert into ingestion queue
          const queueItems = newVideos.map(video => ({
            user_id: playlist.user_id,
            playlist_source_id: playlist.id,
            video_id: video.videoId,
            video_title: video.title,
            video_url: `https://www.youtube.com/watch?v=${video.videoId}`,
            thumbnail_url: video.thumbnailUrl,
            published_at: video.publishedAt,
            status: playlist.auto_process ? 'pending' : 'skipped',
            priority: 5,
            retry_count: 0,
            max_retries: 3,
          }));

          const { error: insertError } = await supabase
            .from('youtube_ingestion_queue')
            .upsert(queueItems, { onConflict: 'user_id,video_id', ignoreDuplicates: true });

          if (insertError) {
            console.error(`[Poll-Playlist] Insert error:`, insertError);
          } else {
            totalNewVideos += newVideos.length;
            console.log(
              `[Poll-Playlist] Queued ${newVideos.length} new videos from "${playlist.playlist_name}"`
            );
          }
        }

        // Update polling state
        await supabase
          .from('youtube_playlists')
          .update({
            last_polled_at: new Date().toISOString(),
            known_video_count: videos.length,
            ...(newVideos.length > 0
              ? { last_new_video_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', playlist.id);

      } catch (err) {
        console.error(
          `[Poll-Playlist] Error polling "${playlist.playlist_name}":`,
          err
        );

        // Update connection status on API errors
        await supabase
          .from('youtube_playlists')
          .update({
            connection_status: 'error',
            connection_error: err instanceof Error ? err.message : String(err),
            last_polled_at: new Date().toISOString(),
          })
          .eq('id', playlist.id);
      }
    }

    return res.status(200).json({
      success: true,
      playlistsPolled: playlists.length,
      newVideosQueued: totalNewVideos,
      duration_ms: Date.now() - startTime,
    });

  } catch (err) {
    console.error('[Poll-Playlist] Fatal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

