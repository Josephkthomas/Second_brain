// Vercel API endpoint for repairing YouTube channel IDs
// GET /api/youtube/repair-channels - Check all channels for valid/invalid IDs
// POST /api/youtube/repair-channels - Attempt to fix invalid channel IDs

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

// Check if a channel_id is valid (YouTube channel IDs start with UC)
function isValidChannelId(channelId: string | null | undefined): boolean {
  return !!channelId && channelId.startsWith('UC') && channelId.length >= 24;
}

// Resolve channel URL to get channel ID (copied from channels.ts for independence)
async function resolveChannelUrl(url: string): Promise<{
  channel_id: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url: string | null;
  description: string | null;
} | null> {
  try {
    // Normalize URL
    let pageUrl = url.trim();

    // Handle shorthand formats
    if (!pageUrl.includes('youtube.com') && !pageUrl.includes('youtu.be')) {
      const cleanInput = pageUrl.startsWith('@') ? pageUrl : `@${pageUrl}`;
      if (pageUrl.startsWith('UC') && pageUrl.length >= 24) {
        pageUrl = `https://www.youtube.com/channel/${pageUrl}`;
      } else {
        pageUrl = `https://www.youtube.com/${cleanInput}`;
      }
    } else if (!pageUrl.startsWith('http')) {
      pageUrl = 'https://' + pageUrl;
    }

    console.log(`[Repair] Fetching URL: ${pageUrl}`);

    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log(`[Repair] Failed to fetch URL: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract channel ID
    const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/) ||
                           html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/) ||
                           html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);

    if (!channelIdMatch) {
      console.log('[Repair] Could not find channel ID in HTML');
      return null;
    }

    const channelId = channelIdMatch[1];

    // Extract channel name
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                     html.match(/<title>([^<]+)<\/title>/);
    const channelName = nameMatch
      ? nameMatch[1].replace(' - YouTube', '').trim()
      : 'Unknown Channel';

    // Extract thumbnail
    const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
    const thumbnailUrl = thumbnailMatch ? thumbnailMatch[1] : null;

    // Extract description
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/);
    const description = descMatch ? descMatch[1].substring(0, 500) : null;

    return {
      channel_id: channelId,
      channel_name: channelName,
      channel_url: `https://www.youtube.com/channel/${channelId}`,
      thumbnail_url: thumbnailUrl,
      description,
    };
  } catch (error) {
    console.error('[Repair] Error resolving channel URL:', error);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    // GET - Check all channels for valid/invalid IDs
    if (req.method === 'GET') {
      console.log('[Repair] Checking channel IDs for user:', user.id);

      const { data: channels, error } = await supabase
        .from('youtube_channels')
        .select('id, channel_id, channel_name, channel_url, is_active, auto_ingest, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const results = (channels || []).map(channel => ({
        id: channel.id,
        channel_name: channel.channel_name,
        channel_url: channel.channel_url,
        channel_id: channel.channel_id,
        is_valid: isValidChannelId(channel.channel_id),
        is_active: channel.is_active,
        auto_ingest: channel.auto_ingest,
        issue: !isValidChannelId(channel.channel_id)
          ? channel.channel_id
            ? `Invalid format: "${channel.channel_id}" (should start with UC)`
            : 'Missing channel_id (null or empty)'
          : null,
      }));

      const validCount = results.filter(r => r.is_valid).length;
      const invalidCount = results.filter(r => !r.is_valid).length;

      console.log(`[Repair] Found ${validCount} valid, ${invalidCount} invalid channels`);

      return res.status(200).json({
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
        channels: results,
      });
    }

    // POST - Attempt to fix invalid channel IDs
    if (req.method === 'POST') {
      const { channel_ids } = req.body;  // Optional: specific channel IDs to fix

      console.log('[Repair] Attempting to repair channel IDs for user:', user.id);

      // Fetch channels to repair
      let query = supabase
        .from('youtube_channels')
        .select('id, channel_id, channel_name, channel_url')
        .eq('user_id', user.id);

      if (channel_ids && Array.isArray(channel_ids) && channel_ids.length > 0) {
        query = query.in('id', channel_ids);
      }

      const { data: channels, error } = await query;
      if (error) throw error;

      // Filter to only invalid channels
      const invalidChannels = (channels || []).filter(c => !isValidChannelId(c.channel_id));

      if (invalidChannels.length === 0) {
        return res.status(200).json({
          message: 'All channels have valid IDs',
          repaired: 0,
          failed: 0,
          results: [],
        });
      }

      console.log(`[Repair] Found ${invalidChannels.length} channels to repair`);

      const results: Array<{
        id: string;
        channel_name: string;
        old_channel_id: string | null;
        new_channel_id: string | null;
        status: 'repaired' | 'failed';
        error?: string;
      }> = [];

      // Process each invalid channel
      for (const channel of invalidChannels) {
        console.log(`[Repair] Repairing: ${channel.channel_name}`);

        if (!channel.channel_url) {
          results.push({
            id: channel.id,
            channel_name: channel.channel_name,
            old_channel_id: channel.channel_id,
            new_channel_id: null,
            status: 'failed',
            error: 'No channel_url stored to resolve from',
          });
          continue;
        }

        // Try to resolve the channel URL
        const resolved = await resolveChannelUrl(channel.channel_url);

        if (!resolved || !isValidChannelId(resolved.channel_id)) {
          results.push({
            id: channel.id,
            channel_name: channel.channel_name,
            old_channel_id: channel.channel_id,
            new_channel_id: resolved?.channel_id || null,
            status: 'failed',
            error: 'Could not resolve valid channel ID from URL',
          });
          continue;
        }

        // Update the channel with the correct ID
        const { error: updateError } = await supabase
          .from('youtube_channels')
          .update({
            channel_id: resolved.channel_id,
            channel_url: resolved.channel_url,  // Also update to canonical URL
            thumbnail_url: resolved.thumbnail_url,
            description: resolved.description,
          })
          .eq('id', channel.id)
          .eq('user_id', user.id);

        if (updateError) {
          results.push({
            id: channel.id,
            channel_name: channel.channel_name,
            old_channel_id: channel.channel_id,
            new_channel_id: resolved.channel_id,
            status: 'failed',
            error: `Database update failed: ${updateError.message}`,
          });
        } else {
          console.log(`[Repair] Successfully repaired ${channel.channel_name}: ${channel.channel_id} -> ${resolved.channel_id}`);
          results.push({
            id: channel.id,
            channel_name: channel.channel_name,
            old_channel_id: channel.channel_id,
            new_channel_id: resolved.channel_id,
            status: 'repaired',
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const repaired = results.filter(r => r.status === 'repaired').length;
      const failed = results.filter(r => r.status === 'failed').length;

      console.log(`[Repair] Complete. Repaired: ${repaired}, Failed: ${failed}`);

      return res.status(200).json({
        message: `Repaired ${repaired} channels, ${failed} failed`,
        repaired,
        failed,
        results,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Repair] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
