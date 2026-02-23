// Vercel API endpoint for browsing YouTube playlist videos
// GET /api/youtube/playlist-videos?playlist_id=<uuid>
// Returns all videos in the playlist with their current queue status
//
// All helpers are inlined to avoid cross-file import bundling issues on Vercel.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

// ── Inlined helpers ──────────────────────────────────

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
    if (!response.ok) break;

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
        publishedAt:
          item.contentDetails?.videoPublishedAt ||
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

async function getYouTubeApiKey(userId: string): Promise<string | null> {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;

  try {
    const supabase = getSupabase();
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

// ── Main Handler ─────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const supabase = getSupabase();
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
    const apiKey = await getYouTubeApiKey(user.id);
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
    console.error('[playlist-videos] API error:', error?.message || error, error?.stack);
    return res.status(500).json({
      error: error?.message || 'Internal server error',
    });
  }
}
