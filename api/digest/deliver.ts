// Vercel API endpoint for digest delivery to channels
// POST /api/digest/deliver
// Body: { history_id: string, channels?: string[], email?: string }
// If `email` is provided, sends directly to that address (ad-hoc / share)
// Headers: Authorization: Bearer <jwt>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  formatDigestEmail, sendEmail,
  formatDigestTelegram, sendTelegram,
  formatDigestSlack, sendSlack,
} from './_delivery';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Handler ────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const jwt = authHeader.slice(7);
  const supabase = getSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { history_id, channels: channelFilter, email: adHocEmail } = req.body;
  if (!history_id) return res.status(400).json({ error: 'history_id required' });

  try {
    // Load digest history entry
    const { data: entry, error: entryError } = await supabase
      .from('digest_history')
      .select('*')
      .eq('id', history_id)
      .eq('user_id', user.id)
      .single();

    if (entryError || !entry) return res.status(404).json({ error: 'Digest not found' });

    // Load profile for name
    const { data: profile } = await supabase
      .from('digest_profiles')
      .select('name')
      .eq('id', entry.digest_profile_id)
      .single();

    // ─── Ad-hoc email: send to a specific address and return ───
    if (adHocEmail && typeof adHocEmail === 'string') {
      const { subject, html } = formatDigestEmail(entry.content, profile?.name || 'Digest');
      const { success, error } = await sendEmail(adHocEmail, subject, html);
      return res.status(200).json({
        success,
        results: { email: success ? 'delivered' : (error || 'Send failed') },
      });
    }

    // ─── Channel-based delivery ────────────────────────────────
    // Load channels
    const { data: channels, error: channelsError } = await supabase
      .from('digest_channels')
      .select('*')
      .eq('digest_profile_id', entry.digest_profile_id)
      .eq('is_active', true);

    if (channelsError) {
      console.error('Failed to fetch channels:', channelsError);
      return res.status(500).json({ error: 'Failed to load delivery channels' });
    }

    const results: Record<string, string> = {};
    const deliveredChannels = [...(entry.channels_delivered || [])];

    // Process each channel (optionally filtered)
    const activeChannels = (channels || []).filter((ch: any) =>
      !channelFilter || channelFilter.includes(ch.channel_type)
    );

    for (const channel of activeChannels) {
      if (channel.channel_type === 'email') {
        const address = channel.channel_config?.address;
        if (!address) {
          results.email = 'No email address configured';
          continue;
        }

        const { subject, html } = formatDigestEmail(entry.content, profile?.name || 'Digest');
        const { success, error } = await sendEmail(address, subject, html);

        if (success) {
          results.email = 'delivered';
          if (!deliveredChannels.includes('email')) deliveredChannels.push('email');
        } else {
          results.email = error || 'Send failed';
        }
      }

      if (channel.channel_type === 'telegram') {
        const botToken = channel.channel_config?.bot_token;
        const chatId = channel.channel_config?.chat_id;
        if (!botToken || !chatId) {
          results.telegram = 'Bot token or chat ID not configured';
          continue;
        }

        const text = formatDigestTelegram(entry.content, profile?.name || 'Digest');
        const { success, error } = await sendTelegram(botToken, chatId, text);

        if (success) {
          results.telegram = 'delivered';
          if (!deliveredChannels.includes('telegram')) deliveredChannels.push('telegram');
        } else {
          results.telegram = error || 'Send failed';
        }
      }

      if (channel.channel_type === 'slack') {
        const webhookUrl = channel.channel_config?.webhook_url;
        if (!webhookUrl) {
          results.slack = 'Webhook URL not configured';
          continue;
        }

        const payload = formatDigestSlack(entry.content, profile?.name || 'Digest');
        const { success, error } = await sendSlack(webhookUrl, payload);

        if (success) {
          results.slack = 'delivered';
          if (!deliveredChannels.includes('slack')) deliveredChannels.push('slack');
        } else {
          results.slack = error || 'Send failed';
        }
      }
    }

    // Update delivery status
    await supabase
      .from('digest_history')
      .update({
        channels_delivered: deliveredChannels,
      })
      .eq('id', history_id);

    return res.status(200).json({ success: true, results });

  } catch (error) {
    console.error('Delivery error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
