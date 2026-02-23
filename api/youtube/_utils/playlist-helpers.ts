// Shared YouTube playlist helpers
// Used by playlists.ts, poll-playlist.ts, and playlist-videos.ts

import { createClient } from '@supabase/supabase-js';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelTitle: string;
  position: number;
}

/**
 * Fetch all videos from a YouTube playlist via Data API v3.
 * Paginates through all pages (50 per page), skips deleted/private videos.
 * Cap at maxVideos to prevent excessive API usage on large playlists.
 */
export async function fetchPlaylistItems(
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

    if (nextPageToken) {
      params.set('pageToken', nextPageToken);
    }

    const response = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params.toString()}`);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    for (const item of data.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId) continue;

      // Skip deleted/private videos
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

/**
 * Get YouTube API key — checks global env first, then user's personal key.
 */
export async function getUserYouTubeApiKey(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;

  try {
    const { data } = await supabase
      .from('youtube_settings')
      .select('youtube_api_key')
      .eq('user_id', userId)
      .single();
    return data?.youtube_api_key || null;
  } catch {
    return null;
  }
}
