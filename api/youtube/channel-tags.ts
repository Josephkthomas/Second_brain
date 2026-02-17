// Vercel API endpoint for fetching YouTube channel topic tags
// POST /api/youtube/channel-tags
// Used by Watch History import pipeline (Tier 2 clustering)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Verify JWT and return user
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

/**
 * Fetch channel topic details and snippet tags from YouTube Data API v3
 * Accepts up to 50 channel IDs per request (YouTube API limit)
 */
async function fetchChannelTags(
  channelIds: string[],
  apiKey: string
): Promise<Record<string, { topicCategories: string[]; tags: string[]; description: string }>> {
  const results: Record<string, { topicCategories: string[]; tags: string[]; description: string }> = {};

  if (!apiKey || channelIds.length === 0) return results;

  // YouTube API allows max 50 channels per request
  const ids = channelIds.slice(0, 50).join(',');
  const url = `https://www.googleapis.com/youtube/v3/channels?part=topicDetails,snippet&id=${ids}&key=${apiKey}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Channel Tags] YouTube API error:', response.status, errorData);
      return results;
    }

    const data = await response.json();

    for (const item of data.items || []) {
      const topicCategories = item.topicDetails?.topicCategories || [];
      const tags = item.snippet?.tags || [];
      const description = item.snippet?.description || '';

      results[item.id] = {
        topicCategories,
        tags: tags.slice(0, 20), // Cap at 20 tags
        description: description.slice(0, 500), // Cap description length
      };
    }
  } catch (error) {
    console.error('[Channel Tags] Fetch error:', error);
  }

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify auth
  const { user, error: authError } = await verifyAuth(req);
  if (!user || authError) {
    return res.status(401).json({ error: authError || 'Unauthorized' });
  }

  const { channelIds } = req.body || {};

  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'channelIds array is required' });
  }

  if (channelIds.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 channel IDs per request' });
  }

  try {
    // Get YouTube API key - prefer global env var, fallback to user's personal key
    let youtubeApiKey: string | null = process.env.YOUTUBE_API_KEY || null;

    if (!youtubeApiKey) {
      const supabase = getSupabase();
      try {
        const { data: userSettings } = await supabase
          .from('youtube_settings')
          .select('youtube_api_key')
          .eq('user_id', user.id)
          .single();
        youtubeApiKey = userSettings?.youtube_api_key || null;
      } catch {
        // Settings table may not exist or no settings row
      }
    }

    if (!youtubeApiKey) {
      return res.status(200).json({
        channels: {},
        warning: 'No YouTube API key configured. Tier 2 clustering will be skipped.',
      });
    }

    const channels = await fetchChannelTags(channelIds, youtubeApiKey);

    return res.status(200).json({ channels });
  } catch (error) {
    console.error('[Channel Tags] Handler error:', error);
    return res.status(500).json({
      error: 'Failed to fetch channel tags',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
