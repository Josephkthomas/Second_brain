// Vercel API endpoint for YouTube ingestion queue
// GET /api/youtube/queue - List queue items (with channel/playlist source names)
// POST /api/youtube/queue - Add videos to queue (single or bulk)
// PATCH /api/youtube/queue - Update queue item (retry or skip)
// DELETE /api/youtube/queue - Remove queue item

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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
    // GET - List queue items
    if (req.method === 'GET') {
      const { channel_id, status, limit = '50' } = req.query;
      const parsedLimit = parseInt(limit as string, 10) || 50;

      // Try with full JOINs first, then fall back if relationships don't exist yet
      const selectVariants = [
        '*, youtube_channels(channel_name), youtube_playlists(playlist_name)',
        '*, youtube_channels(channel_name)',
        '*',
      ];

      let data: any[] | null = null;

      for (const selectStr of selectVariants) {
        let query = supabase
          .from('youtube_ingestion_queue')
          .select(selectStr)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(parsedLimit);

        if (channel_id && typeof channel_id === 'string') {
          query = query.eq('channel_id', channel_id);
        }
        if (status && typeof status === 'string') {
          query = query.eq('status', status);
        }

        const result = await query;

        if (!result.error) {
          data = result.data;
          break;
        }

        // Log the JOIN failure and try the next fallback
        console.warn(`[queue] SELECT with "${selectStr}" failed:`, result.error.message);
      }

      return res.status(200).json({ items: data || [] });
    }

    // POST - Add videos to queue (single or bulk)
    if (req.method === 'POST') {
      const body = req.body;

      // Bulk mode: { items: [...] }
      if (Array.isArray(body.items)) {
        const items = body.items;

        if (items.length === 0) {
          return res.status(400).json({ error: 'No items provided' });
        }

        if (items.length > 200) {
          return res.status(400).json({ error: 'Maximum 200 items per request' });
        }

        const queueItems = items.map((item: any) => ({
          user_id: user.id,
          video_id: item.video_id,
          video_url: item.video_url || `https://www.youtube.com/watch?v=${item.video_id}`,
          video_title: item.video_title || null,
          thumbnail_url: item.thumbnail_url || null,
          published_at: item.published_at || null,
          playlist_source_id: item.playlist_source_id || null,
          channel_id: item.channel_id || null,
          status: 'pending',
          priority: item.priority || 5,
          retry_count: 0,
          max_retries: 3,
        }));

        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
          .upsert(queueItems, { onConflict: 'user_id,video_id', ignoreDuplicates: true })
          .select();

        if (error) throw error;

        return res.status(201).json({
          queued: data?.length || 0,
          skipped: items.length - (data?.length || 0),
        });
      }

      // Single mode: { video_id, video_url, ... }
      const { video_id, video_url, video_title, thumbnail_url, published_at, playlist_source_id, channel_id, priority } = body;

      if (!video_id) {
        return res.status(400).json({ error: 'video_id is required' });
      }

      // Check if already in queue
      const { data: existing } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('video_id', video_id)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'Video is already in queue',
          existing_status: existing.status,
          existing_id: existing.id,
        });
      }

      const { data, error } = await supabase
        .from('youtube_ingestion_queue')
        .insert({
          user_id: user.id,
          video_id,
          video_url: video_url || `https://www.youtube.com/watch?v=${video_id}`,
          video_title: video_title || null,
          thumbnail_url: thumbnail_url || null,
          published_at: published_at || null,
          playlist_source_id: playlist_source_id || null,
          channel_id: channel_id || null,
          status: 'pending',
          priority: priority || 5,
          retry_count: 0,
          max_retries: 3,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ item: data });
    }

    // PATCH - Update queue item (retry or skip)
    if (req.method === 'PATCH') {
      const { id, action } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      if (!action || !['retry', 'skip', 'reset'].includes(action)) {
        return res.status(400).json({ error: 'Action must be "retry", "skip", or "reset"' });
      }

      // Verify the item belongs to this user
      const { data: existingItem, error: fetchError } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, status, retry_count, max_retries')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      if (action === 'retry') {
        // Can only retry failed items that haven't exceeded max retries
        if (existingItem.status !== 'failed') {
          return res.status(400).json({ error: 'Can only retry failed items' });
        }

        if (existingItem.retry_count >= existingItem.max_retries) {
          return res.status(400).json({ error: 'Maximum retries exceeded' });
        }

        // Reset to pending for reprocessing
        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'pending',
            error_message: null,
            retry_count: existingItem.retry_count + 1,
            started_at: null,
            completed_at: null,
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ item: data });
      }

      if (action === 'skip') {
        // Can only skip pending items
        if (existingItem.status !== 'pending') {
          return res.status(400).json({ error: 'Can only skip pending items' });
        }

        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'skipped',
            completed_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ item: data });
      }

      if (action === 'reset') {
        // Reset stuck items (fetching_transcript or extracting) back to pending
        if (!['fetching_transcript', 'extracting', 'failed'].includes(existingItem.status)) {
          return res.status(400).json({ error: 'Can only reset stuck or failed items' });
        }

        const { data, error } = await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'pending',
            error_message: null,
            processing_step: null,
            started_at: null,
            completed_at: null,
            retry_count: existingItem.status === 'failed' ? existingItem.retry_count + 1 : 0,
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ item: data });
      }
    }

    // DELETE - Remove queue item
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Item id is required' });
      }

      // Verify the item belongs to this user and is deletable
      const { data: existingItem, error: fetchError } = await supabase
        .from('youtube_ingestion_queue')
        .select('id, status')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingItem) {
        return res.status(404).json({ error: 'Queue item not found' });
      }

      // Only allow deleting completed, failed, or skipped items
      const deletableStatuses = ['completed', 'failed', 'skipped'];
      if (!deletableStatuses.includes(existingItem.status)) {
        return res.status(400).json({
          error: 'Can only delete completed, failed, or skipped items'
        });
      }

      const { error } = await supabase
        .from('youtube_ingestion_queue')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('YouTube queue API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
