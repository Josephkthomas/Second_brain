// Vercel API endpoint for YouTube settings management
// GET /api/youtube/settings - Get user's YouTube settings
// PATCH /api/youtube/settings - Update settings

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

// Default settings for new users
const DEFAULT_SETTINGS = {
  default_auto_ingest: true,
  default_extraction_mode: 'comprehensive',
  default_anchor_emphasis: 'standard',
  max_concurrent_extractions: 3,
  max_videos_per_channel: 50,
  daily_video_limit: 20,
  videos_ingested_today: 0,
  daily_limit_reset_at: null,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
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
    // GET - Fetch settings
    if (req.method === 'GET') {
      let { data, error } = await supabase
        .from('youtube_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // Settings don't exist, create default
        const { data: newSettings, error: insertError } = await supabase
          .from('youtube_settings')
          .insert({
            user_id: user.id,
            ...DEFAULT_SETTINGS,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        data = newSettings;
      } else if (error) {
        throw error;
      }

      // Check if daily limit needs reset
      if (data) {
        const today = new Date().toISOString().split('T')[0];
        const lastReset = data.daily_limit_reset_at?.split('T')[0];

        if (lastReset !== today) {
          // Reset daily counter
          const { data: updated } = await supabase
            .from('youtube_settings')
            .update({
              videos_ingested_today: 0,
              daily_limit_reset_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .select()
            .single();

          if (updated) {
            data = updated;
          }
        }
      }

      // Check if global Apify API key is configured
      data = {
        ...data,
        has_apify_key: !!process.env.APIFY_API_KEY,
        apify_api_key_preview: process.env.APIFY_API_KEY
          ? 'Configured globally'
          : null,
      };

      return res.status(200).json({ settings: data });
    }

    // PATCH - Update settings
    if (req.method === 'PATCH') {
      const updates = req.body;

      // Validate extraction mode
      if (updates.default_extraction_mode) {
        const validModes = ['comprehensive', 'strategic', 'actionable', 'relational'];
        if (!validModes.includes(updates.default_extraction_mode)) {
          return res.status(400).json({
            error: `Invalid extraction mode. Must be one of: ${validModes.join(', ')}`
          });
        }
      }

      // Validate anchor emphasis
      if (updates.default_anchor_emphasis) {
        const validEmphasis = ['standard', 'aggressive', 'passive'];
        if (!validEmphasis.includes(updates.default_anchor_emphasis)) {
          return res.status(400).json({
            error: `Invalid anchor emphasis. Must be one of: ${validEmphasis.join(', ')}`
          });
        }
      }

      // Validate numeric fields
      if (updates.daily_video_limit !== undefined) {
        const limit = parseInt(updates.daily_video_limit, 10);
        if (isNaN(limit) || limit < 1 || limit > 100) {
          return res.status(400).json({
            error: 'daily_video_limit must be between 1 and 100'
          });
        }
        updates.daily_video_limit = limit;
      }

      if (updates.max_videos_per_channel !== undefined) {
        const max = parseInt(updates.max_videos_per_channel, 10);
        if (isNaN(max) || max < 1 || max > 200) {
          return res.status(400).json({
            error: 'max_videos_per_channel must be between 1 and 200'
          });
        }
        updates.max_videos_per_channel = max;
      }

      // Only allow updating specific fields (Apify key is now global, not per-user)
      const allowedFields = [
        'default_auto_ingest',
        'default_extraction_mode',
        'default_anchor_emphasis',
        'max_concurrent_extractions',
        'max_videos_per_channel',
        'daily_video_limit',
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

      // Check if settings exist
      const { data: existing } = await supabase
        .from('youtube_settings')
        .select('id')
        .eq('user_id', user.id)
        .single();

      let data;
      if (!existing) {
        // Create with updates
        const { data: newSettings, error } = await supabase
          .from('youtube_settings')
          .insert({
            user_id: user.id,
            ...DEFAULT_SETTINGS,
            ...allowedUpdates,
          })
          .select()
          .single();

        if (error) throw error;
        data = newSettings;
      } else {
        // Update existing
        const { data: updated, error } = await supabase
          .from('youtube_settings')
          .update(allowedUpdates)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        data = updated;
      }

      // Add global Apify key status to response
      data = {
        ...data,
        has_apify_key: !!process.env.APIFY_API_KEY,
        apify_api_key_preview: process.env.APIFY_API_KEY
          ? 'Configured globally'
          : null,
      };

      return res.status(200).json({ settings: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('YouTube settings API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
