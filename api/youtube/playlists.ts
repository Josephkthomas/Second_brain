// Vercel API endpoint for YouTube playlist management
// GET /api/youtube/playlists — List user's playlists
// POST /api/youtube/playlists — Connect new playlist (INSERT minimal + UPDATE optional)
// PATCH /api/youtube/playlists — Update playlist settings
// DELETE /api/youtube/playlists — Disconnect playlist
//
// POST uses a two-phase write to avoid PostgREST pattern validation failures:
//   Phase 1: INSERT only NOT NULL fields (no UUID[], no nullable *_url columns)
//   Phase 2: UPDATE to add optional fields (playlist_name, thumbnail_url, linked_anchor_ids, etc.)
//
// All helpers are inlined to avoid cross-file import bundling issues on Vercel.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';


const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── Auth ─────────────────────────────────────────────

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

// ── Helpers (all inlined) ────────────────────────────

function extractPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const listParam = parsed.searchParams.get('list');
    if (listParam) return listParam;
  } catch {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  return null;
}

function generateSynapseCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SYN-${code}`;
}

async function verifyPlaylist(playlistId: string): Promise<{
  valid: boolean;
  title: string | null;
  thumbnailUrl: string | null;
  itemCount: number;
  error?: string;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn('[playlists] No YOUTUBE_API_KEY — skipping verification');
    return { valid: true, title: null, thumbnailUrl: null, itemCount: 0 };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}&key=${apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 403) {
        return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: 'Playlist must be Public or Unlisted.' };
      }
      return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: `YouTube API error ${response.status}: ${errorBody}` };
    }

    const data = await response.json();
    const playlist = data.items?.[0];

    if (!playlist) {
      return { valid: false, title: null, thumbnailUrl: null, itemCount: 0, error: 'Playlist not found. It may be private or deleted.' };
    }

    return {
      valid: true,
      title: playlist.snippet?.title || null,
      thumbnailUrl: playlist.snippet?.thumbnails?.high?.url || playlist.snippet?.thumbnails?.default?.url || null,
      itemCount: playlist.contentDetails?.itemCount || 0,
    };
  } catch (err) {
    return {
      valid: false,
      title: null,
      thumbnailUrl: null,
      itemCount: 0,
      error: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

// ── Main Handler ─────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Auth
    const { user, error: authError } = await verifyAuth(req);
    if (!user) {
      return res.status(401).json({ error: authError });
    }

    const supabase = getSupabase();

    // ── GET: List playlists ──────────────────────
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('youtube_playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[playlists] GET error:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ playlists: data || [] });
    }

    // ── POST: Connect new playlist ───────────────
    if (req.method === 'POST') {
      const { playlist_url } = req.body;
      if (!playlist_url) {
        return res.status(400).json({ error: 'playlist_url is required' });
      }

      // Step 1: Extract playlist ID
      const playlistId = extractPlaylistId(playlist_url);
      if (!playlistId) {
        return res.status(400).json({ error: 'Invalid playlist URL. Must contain a ?list= parameter.' });
      }

      // Step 2: Check for duplicates
      const { data: existing } = await supabase
        .from('youtube_playlists')
        .select('id')
        .eq('user_id', user.id)
        .eq('playlist_id', playlistId)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'This playlist is already connected' });
      }

      // Step 3: Verify playlist on YouTube
      const verification = await verifyPlaylist(playlistId);
      if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Could not verify playlist' });
      }

      // Step 4: Generate synapse code
      const synapseCode = generateSynapseCode();

      // Step 5: MINIMAL INSERT — only NOT NULL fields
      const { data: inserted, error: insertError } = await supabase
        .from('youtube_playlists')
        .insert({
          user_id: user.id,
          playlist_id: playlistId,
          playlist_url: playlist_url.trim(),
          synapse_code: synapseCode,
          connection_status: 'verified',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[playlists] INSERT error:', JSON.stringify(insertError));
        return res.status(500).json({
          error: 'Failed to save playlist',
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        });
      }

      // Step 6: UPDATE to add optional fields
      const updates: Record<string, any> = {};

      if (verification.title) updates.playlist_name = verification.title;
      if (verification.thumbnailUrl && verification.thumbnailUrl.startsWith('http')) {
        updates.thumbnail_url = verification.thumbnailUrl;
      }
      if (typeof req.body.auto_process === 'boolean') updates.auto_process = req.body.auto_process;
      if (req.body.extraction_mode && ['comprehensive', 'strategic', 'actionable', 'relational'].includes(req.body.extraction_mode)) {
        updates.extraction_mode = req.body.extraction_mode;
      }
      if (req.body.anchor_emphasis && ['standard', 'aggressive', 'passive'].includes(req.body.anchor_emphasis)) {
        updates.anchor_emphasis = req.body.anchor_emphasis;
      }
      if (req.body.custom_instructions && typeof req.body.custom_instructions === 'string') {
        updates.custom_instructions = req.body.custom_instructions.trim();
      }
      if (Array.isArray(req.body.linked_anchor_ids) && req.body.linked_anchor_ids.length > 0) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validIds = req.body.linked_anchor_ids.filter((id: string) => uuidRegex.test(id));
        if (validIds.length > 0) updates.linked_anchor_ids = validIds;
      }
      if (typeof verification.itemCount === 'number' && verification.itemCount > 0) {
        updates.known_video_count = verification.itemCount;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('youtube_playlists')
          .update(updates)
          .eq('id', inserted.id);

        if (updateError) {
          console.warn('[playlists] UPDATE optional fields error (non-fatal):', updateError.message);
        }
      }

      // Step 7: Fetch the final row
      const { data: finalPlaylist } = await supabase
        .from('youtube_playlists')
        .select('*')
        .eq('id', inserted.id)
        .single();

      return res.status(201).json({ playlist: finalPlaylist || inserted });
    }

    // ── PATCH: Update playlist settings ──────────
    if (req.method === 'PATCH') {
      const { id, ...body } = req.body;
      if (!id) return res.status(400).json({ error: 'Playlist id is required' });

      const allowed = [
        'is_active', 'auto_process', 'extraction_mode', 'anchor_emphasis',
        'linked_anchor_ids', 'custom_instructions', 'connection_status',
      ];
      const safeUpdates: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) safeUpdates[key] = body[key];
      }
      safeUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('youtube_playlists')
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ playlist: data });
    }

    // ── DELETE: Disconnect playlist ──────────────
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Playlist id is required' });

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
    console.error('[playlists] Unhandled error:', error?.message || error, error?.stack);
    return res.status(500).json({
      error: error?.message || 'Internal server error',
      stack: process.env.NODE_ENV !== 'production' ? error?.stack : undefined,
    });
  }
}
