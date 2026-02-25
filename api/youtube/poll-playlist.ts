// Vercel Cron + Manual endpoint for polling YouTube playlists
// Cron: runs every 15 minutes to detect new videos added to connected playlists
// Manual: POST with user JWT to trigger immediate rescan
// New videos are queued into youtube_ingestion_queue for processing
//
// ALL helpers inlined — imports from _utils/ cause FUNCTION_INVOCATION_FAILED on Vercel

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Inlined playlist helpers ────────────────────────────────

interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelTitle: string;
  position: number;
}

async function fetchPlaylistItems(
  playlistId: string,
  apiKey: string,
  maxVideos: number = 200
): Promise<PlaylistVideo[]> {
  const videos: PlaylistVideo[] = [];
  let nextPageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: apiKey,
    });
    if (nextPageToken) params.set('pageToken', nextPageToken);

    const response = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params.toString()}`);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;

      const title = item.snippet?.title || '';
      if (title === 'Deleted video' || title === 'Private video') continue;

      videos.push({
        videoId,
        title: title || 'Untitled',
        thumbnailUrl:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.default?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: item.contentDetails?.videoPublishedAt ||
          item.snippet?.publishedAt ||
          new Date().toISOString(),
        channelTitle: item.snippet?.videoOwnerChannelTitle || '',
        position: item.snippet?.position || 0,
      });

      if (videos.length >= maxVideos) return videos;
    }

    nextPageToken = data.nextPageToken || null;
  } while (nextPageToken);

  return videos;
}

async function getUserYouTubeApiKey(
  supabase: any,
  userId: string
): Promise<string | null> {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  try {
    const { data } = await supabase
      .from('youtube_settings')
      .select('youtube_api_key')
      .eq('user_id', userId)
      .single();
    return (data as any)?.youtube_api_key || null;
  } catch {
    return null;
  }
}

// ── Auth helpers ────────────────────────────────

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

async function verifyUserAuth(req: VercelRequest): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  if (token === CRON_SECRET) return null;
  if (req.headers['x-vercel-signature']) return null;

  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ── Handler ────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = await verifyUserAuth(req);
  const isCron = !userId && verifyCronAuth(req);

  if (!userId && !isCron) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    let query = supabase
      .from('youtube_playlists')
      .select('*')
      .eq('is_active', true)
      .eq('connection_status', 'verified');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: playlists, error } = await query;

    if (error) throw error;

    if (!playlists || playlists.length === 0) {
      return res.status(200).json({
        success: true,
        playlistsPolled: 0,
        newVideosQueued: 0,
        last_polled_at: new Date().toISOString(),
        playlistResults: [],
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[Poll-Playlist] Scanning ${playlists.length} playlists (${isCron ? 'cron' : 'user: ' + userId})`);

    let totalNewVideos = 0;
    const playlistResults: Array<{
      name: string;
      totalVideos: number;
      newVideos: number;
      status: 'ok' | 'error';
      error?: string;
    }> = [];

    for (const playlist of playlists) {
      try {
        const youtubeApiKey = await getUserYouTubeApiKey(supabase, playlist.user_id);

        if (!youtubeApiKey) {
          console.warn(`[Poll-Playlist] No API key for user ${playlist.user_id}`);
          playlistResults.push({ name: playlist.playlist_name || 'Unknown', totalVideos: 0, newVideos: 0, status: 'error', error: 'No YouTube API key' });
          continue;
        }

        console.log(`[Poll-Playlist] Fetching "${playlist.playlist_name}"...`);
        const videos = await fetchPlaylistItems(playlist.playlist_id, youtubeApiKey);
        console.log(`[Poll-Playlist] Found ${videos.length} videos in "${playlist.playlist_name}"`);

        const { data: existingItems } = await supabase
          .from('youtube_ingestion_queue')
          .select('video_id')
          .eq('user_id', playlist.user_id);

        const existingVideoIds = new Set(
          existingItems?.map((item: any) => item.video_id) || []
        );

        const newVideos = videos.filter(v => !existingVideoIds.has(v.videoId));

        if (newVideos.length > 0) {
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
            console.error(`[Poll-Playlist] Insert error for "${playlist.playlist_name}":`, insertError);
          } else {
            totalNewVideos += newVideos.length;
            console.log(`[Poll-Playlist] Queued ${newVideos.length} new videos from "${playlist.playlist_name}"`);
          }
        }

        await supabase
          .from('youtube_playlists')
          .update({
            last_polled_at: new Date().toISOString(),
            known_video_count: videos.length,
            connection_status: 'verified',
            connection_error: null,
            ...(newVideos.length > 0 ? { last_new_video_at: new Date().toISOString() } : {}),
          })
          .eq('id', playlist.id);

        playlistResults.push({ name: playlist.playlist_name || 'Unknown', totalVideos: videos.length, newVideos: newVideos.length, status: 'ok' });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Poll-Playlist] Error polling "${playlist.playlist_name}":`, errMsg);

        await supabase
          .from('youtube_playlists')
          .update({
            connection_status: 'error',
            connection_error: errMsg,
            last_polled_at: new Date().toISOString(),
          })
          .eq('id', playlist.id);

        playlistResults.push({ name: playlist.playlist_name || 'Unknown', totalVideos: 0, newVideos: 0, status: 'error', error: errMsg });
      }
    }

    console.log(`[Poll-Playlist] Done. ${playlists.length} playlists, ${totalNewVideos} new videos (${Date.now() - startTime}ms)`);

    return res.status(200).json({
      success: true,
      playlistsPolled: playlists.length,
      newVideosQueued: totalNewVideos,
      last_polled_at: new Date().toISOString(),
      playlistResults,
      duration_ms: Date.now() - startTime,
    });

  } catch (err) {
    console.error('[Poll-Playlist] Fatal error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
}
