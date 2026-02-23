// Vercel API endpoint for YouTube playlist management
// GET /api/youtube/playlists - List user's playlists
// POST /api/youtube/playlists - Add new playlist (verify & connect)
// PATCH /api/youtube/playlists - Update playlist settings
// DELETE /api/youtube/playlists - Delete playlist connection

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { fetchPlaylistItems } from './_utils/playlist-helpers';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

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

// Get YouTube API key (global env or user's personal key)
async function getYouTubeApiKey(userId: string): Promise<string | null> {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;

  try {
    const supabase = getSupabase();
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

// Generate a unique 4-character Synapse playlist code
function generatePlaylistCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SYN-${code}`;
}

// Extract playlist ID from YouTube URL
function extractPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('list');
    }
    return null;
  } catch {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
}

// Verify playlist exists and is accessible via YouTube Data API
async function verifyPlaylist(playlistId: string, apiKey: string): Promise<{
  valid: boolean;
  title: string | null;
  thumbnailUrl: string | null;
  itemCount: number;
  error?: string;
}> {
  try {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: playlistId,
      key: apiKey,
    });

    const response = await fetch(`${YOUTUBE_API_BASE}/playlists?${params.toString()}`);

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 403) {
        return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: 'Playlist must be Public or Unlisted. Private playlists cannot be accessed.' };
      }
      return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: `YouTube API error ${response.status}: ${errorBody}` };
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: 'Playlist not found. It may be private or deleted.' };
    }

    const playlist = data.items[0];
    return {
      valid: true,
      title: playlist.snippet?.title || null,
      thumbnailUrl: playlist.snippet?.thumbnails?.high?.url || playlist.snippet?.thumbnails?.default?.url || null,
      itemCount: playlist.contentDetails?.itemCount || 0,
    };
  } catch (err) {
    return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: err instanceof Error ? err.message : 'Verification failed' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify authentication
  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    // ── GET: List playlists ──────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('youtube_playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ playlists: data || [] });
    }

    // ── POST: Add playlist ───────────────────
    if (req.method === 'POST') {
      const {
        playlist_url,
        auto_process = true,
        extraction_mode = 'comprehensive',
        anchor_emphasis = 'standard',
        linked_anchor_ids = [],
        custom_instructions = null,
      } = req.body;

      if (!playlist_url) {
        return res.status(400).json({ error: 'playlist_url is required' });
      }

      // Extract playlist ID from URL
      const playlistId = extractPlaylistId(playlist_url);
      if (!playlistId) {
        return res.status(400).json({ error: 'Invalid YouTube playlist URL. URL should contain a ?list= parameter.' });
      }

      // Get YouTube API key
      const apiKey = await getYouTubeApiKey(user.id);
      if (!apiKey) {
        return res.status(400).json({ error: 'YouTube API key is required. Please configure it in YouTube Settings.' });
      }

      // Verify playlist is accessible
      const verification = await verifyPlaylist(playlistId, apiKey);
      if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Could not verify playlist' });
      }

      // Check if playlist already exists for this user
      const { data: existing } = await supabase
        .from('youtube_playlists')
        .select('id')
        .eq('user_id', user.id)
        .eq('playlist_id', playlistId)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'This playlist is already connected' });
      }

      // Validate anchor IDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validAnchorIds = Array.isArray(linked_anchor_ids)
        ? linked_anchor_ids.filter((id: string) => uuidRegex.test(id))
        : [];

      // Generate Synapse code
      const synapseCode = generatePlaylistCode();

      // Insert playlist
      const { data, error } = await supabase
        .from('youtube_playlists')
        .insert({
          user_id: user.id,
          playlist_id: playlistId,
          playlist_url: playlist_url.trim(),
          playlist_name: verification.title,
          synapse_code: synapseCode,
          thumbnail_url: verification.thumbnailUrl,
          auto_process,
          extraction_mode,
          anchor_emphasis,
          linked_anchor_ids: validAnchorIds,
          custom_instructions,
          known_video_count: verification.itemCount,
          connection_status: 'verified',
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Immediately queue existing playlist videos for processing
      if (data) {
        try {
          await queuePlaylistVideos(supabase, data, apiKey);
        } catch (queueErr) {
          console.error('[playlists] Error queueing initial videos:', queueErr);
          // Don't fail the request for this
        }
      }

      return res.status(201).json({ playlist: data });
    }

    // ── PATCH: Update playlist ───────────────
    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Playlist id is required' });
      }

      const allowedFields = [
        'auto_process', 'extraction_mode', 'anchor_emphasis',
        'linked_anchor_ids', 'custom_instructions', 'is_active'
      ];

      const allowedUpdates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          allowedUpdates[field] = updates[field];
        }
      }

      if (Object.keys(allowedUpdates).length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      allowedUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('youtube_playlists')
        .update(allowedUpdates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Playlist not found' });

      return res.status(200).json({ playlist: data });
    }

    // ── DELETE: Disconnect playlist ──────────
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Playlist id is required' });
      }

      const { error } = await supabase
        .from('youtube_playlists')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error: any) {
    console.error('[playlists] API error:', error);
    return res.status(500).json({
      error: error?.message || 'Internal server error',
      code: error?.code,
      details: error?.details || error?.hint,
    });
  }
}

// ── Queue playlist videos on initial connection ──

async function queuePlaylistVideos(
  supabase: ReturnType<typeof createClient>,
  playlist: any,
  apiKey: string
) {
  const videos = await fetchPlaylistItems(playlist.playlist_id, apiKey);

  if (videos.length === 0) return;

  // Check for existing queue items to avoid duplicates
  const { data: existingItems } = await supabase
    .from('youtube_ingestion_queue')
    .select('video_id')
    .eq('user_id', playlist.user_id);

  const existingVideoIds = new Set(existingItems?.map((item: any) => item.video_id) || []);

  const newVideos = videos.filter(v => !existingVideoIds.has(v.videoId));

  if (newVideos.length === 0) return;

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

  await supabase
    .from('youtube_ingestion_queue')
    .upsert(queueItems, { onConflict: 'user_id,video_id', ignoreDuplicates: true });

  console.log(`[playlists] Queued ${newVideos.length} videos from playlist "${playlist.playlist_name}"`);
}

