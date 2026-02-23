// Vercel API endpoint for browsing YouTube playlist videos
// GET /api/youtube/playlist-videos?playlist_id=<uuid>
// Returns all videos in the playlist with their current queue status

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaylistItems, getUserYouTubeApiKey } from './_utils/playlist-helpers';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    const { playlist_id } = req.query;

    if (!playlist_id || typeof playlist_id !== 'string') {
      return res.status(400).json({ error: 'playlist_id query parameter is required' });
    }

    // Look up the playlist — verify it belongs to this user
    const { data: playlist, error: playlistError } = await supabase
      .from('youtube_playlists')
      .select('*')
      .eq('id', playlist_id)
      .eq('user_id', user.id)
      .single();

    if (playlistError || !playlist) {
      return res.status(404).json({ error: 'Playlist not found' });
    }

    // Get YouTube API key
    const apiKey = await getUserYouTubeApiKey(supabase, user.id);
    if (!apiKey) {
      return res.status(400).json({ error: 'YouTube API key is required. Please configure it in YouTube Settings.' });
    }

    // Fetch live video list from YouTube (capped at 200)
    const videos = await fetchPlaylistItems(playlist.playlist_id, apiKey, 200);

    // Get queue status for all this user's videos (to annotate each video)
    const videoIds = videos.map(v => v.videoId);
    const { data: queueItems } = await supabase
      .from('youtube_ingestion_queue')
      .select('id, video_id, status')
      .eq('user_id', user.id)
      .in('video_id', videoIds.length > 0 ? videoIds : ['__none__']);

    // Build lookup map: videoId → { queueItemId, queueStatus }
    const queueMap = new Map<string, { queueItemId: string; queueStatus: string }>();
    for (const item of queueItems || []) {
      queueMap.set(item.video_id, {
        queueItemId: item.id,
        queueStatus: item.status,
      });
    }

    // Merge and return
    const annotatedVideos = videos.map(video => {
      const queueInfo = queueMap.get(video.videoId);
      return {
        videoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
        channelTitle: video.channelTitle,
        position: video.position,
        queueStatus: queueInfo?.queueStatus || null,
        queueItemId: queueInfo?.queueItemId || null,
      };
    });

    return res.status(200).json({
      playlist: {
        id: playlist.id,
        playlist_name: playlist.playlist_name,
        playlist_id: playlist.playlist_id,
        thumbnail_url: playlist.thumbnail_url,
        known_video_count: playlist.known_video_count,
      },
      videos: annotatedVideos,
      total: annotatedVideos.length,
      capped: videos.length >= 200,
    });

  } catch (error: any) {
    console.error('[playlist-videos] API error:', error);
    return res.status(500).json({
      error: error?.message || 'Internal server error',
    });
  }
}
