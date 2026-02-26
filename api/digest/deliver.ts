// Vercel API endpoint for digest delivery to channels
// POST /api/digest/deliver
// Body: { history_id: string, channels?: string[], email?: string }
// If `email` is provided, sends directly to that address (ad-hoc / share)
// Headers: Authorization: Bearer <jwt>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Inlined delivery functions (Vercel cannot bundle cross-file imports in api/) ───

function formatDigestEmail(content: any, profileName: string): { subject: string; html: string } {
  const date = new Date(content.generated_at).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const appUrl = process.env.APP_URL || 'https://connectsynapse.com';
  const subject = `Synapse ${content.frequency} Brief — ${date}`;
  const font = "'Rajdhani', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const mdToHtml = (md: string): string => {
    return md
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return `<div style="padding: 3px 0; display: flex;"><span style="color: #22d3ee; margin-right: 8px; flex-shrink: 0;">&#9670;</span><span>${trimmed.slice(2)}</span></div>`;
        }
        if (/^\d+\.\s/.test(trimmed)) return `<div style="padding: 3px 0;">${trimmed}</div>`;
        if (trimmed === '') return '<div style="height: 8px;"></div>';
        return `<div style="padding: 2px 0;">${trimmed}</div>`;
      })
      .join('');
  };

  const sectionsHtml = (content.sections || [])
    .filter((s: any) => !s.content?.startsWith('Error'))
    .map((section: any, idx: number) => {
      const isCustom = !section.template_id;
      let bodyHtml: string;
      if (isCustom && section.content) {
        bodyHtml = `<div style="color: #cbd5e1; font-family: ${font}; font-size: 13px; line-height: 1.6;">${mdToHtml(section.content)}</div>`;
      } else if (section.highlights?.length > 0) {
        bodyHtml = `<table cellpadding="0" cellspacing="0" border="0" width="100%">${section.highlights.map((h: string) => `
          <tr><td style="padding: 5px 0; vertical-align: top; width: 18px;"><span style="color: #22d3ee; font-size: 12px;">&#9670;</span></td>
          <td style="padding: 5px 0; color: #cbd5e1; font-family: ${font}; font-size: 13px; line-height: 1.5;">${h}</td></tr>`).join('')}</table>`;
      } else {
        bodyHtml = `<p style="padding: 5px 0; color: #64748b; font-family: ${font}; font-size: 12px; font-style: italic; margin: 0;">No key highlights for this module.</p>`;
      }
      const badge = isCustom
        ? `<span style="margin-left: 8px; padding: 1px 6px; border-radius: 3px; font-family: ${font}; font-size: 9px; color: #a78bfa; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.2); vertical-align: middle;">CUSTOM</span>`
        : '';
      return `
    <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden; border: 1px solid ${isCustom ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.08)'};">
      <div style="padding: 12px 16px; background: #111827; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
          <td style="width: 26px; vertical-align: middle;"><div style="width: 20px; height: 20px; border-radius: 5px; background: ${isCustom ? 'rgba(167,139,250,0.12)' : 'rgba(34,211,238,0.12)'}; text-align: center; line-height: 20px; font-family: ${font}; font-size: 11px; color: ${isCustom ? '#a78bfa' : '#22d3ee'}; font-weight: 700;">${idx + 1}</div></td>
          <td style="vertical-align: middle;"><span style="color: #f1f5f9; font-family: ${font}; font-size: 14px; font-weight: 600;">${section.module_name}</span>${badge}</td>
        </tr></table>
      </div>
      <div style="padding: 12px 16px; background: #0a0f1a;">${bodyHtml}</div>
    </div>`;
    }).join('');

  const priorityStyles: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: '#1c0a0a', text: '#f87171', border: '#7f1d1d' },
    medium: { bg: '#1a1505', text: '#fbbf24', border: '#78350f' },
    low: { bg: '#051a0e', text: '#34d399', border: '#064e3b' },
  };

  const stepsHtml = (content.suggested_next_steps || []).map((step: any) => {
    const ps = priorityStyles[step.priority] || priorityStyles.medium;
    return `<tr><td style="padding: 6px 0; vertical-align: top; width: 55px;"><span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-family: ${font}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${ps.text}; background: ${ps.bg}; border: 1px solid ${ps.border};">${step.priority}</span></td>
    <td style="padding: 6px 0; padding-left: 6px;"><span style="color: #f1f5f9; font-family: ${font}; font-size: 13px; font-weight: 500; display: block;">${step.action}</span><span style="color: #64748b; font-family: ${font}; font-size: 11px; display: block; margin-top: 2px;">${step.rationale}</span></td></tr>`;
  }).join('');

  const modulesCount = (content.sections || []).filter((s: any) => !s.content?.startsWith('Error')).length;
  const nodesScanned = content.metadata?.nodes_scanned || 0;
  const edgesScanned = content.metadata?.edges_scanned || 0;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet"></head>
<body style="margin: 0; padding: 0; background: #020617; font-family: ${font};">
  <div style="max-width: 580px; margin: 0 auto; padding: 32px 16px;">
    <div style="text-align: center; margin-bottom: 6px;">
      <div style="display: inline-block; padding: 5px 14px; border-radius: 20px; background: rgba(34,211,238,0.08); border: 1px solid rgba(34,211,238,0.15); margin-bottom: 12px;">
        <span style="color: #22d3ee; font-family: ${font}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">&#x26A1; Synapse Intelligence Briefing</span>
      </div>
      <h1 style="color: #f1f5f9; font-family: ${font}; font-size: 24px; margin: 0 0 4px 0; font-weight: 700;">${profileName}</h1>
      <p style="color: #64748b; font-family: ${font}; font-size: 13px; margin: 0;">${date}</p>
    </div>
    <div style="text-align: center; margin-bottom: 24px; padding: 8px 0;">
      <span style="color: #475569; font-family: ${font}; font-size: 11px;">${modulesCount} modules</span>
      <span style="color: #334155; margin: 0 6px;">&#8226;</span>
      <span style="color: #475569; font-family: ${font}; font-size: 11px;">${nodesScanned} nodes</span>
      <span style="color: #334155; margin: 0 6px;">&#8226;</span>
      <span style="color: #475569; font-family: ${font}; font-size: 11px;">${edgesScanned} edges</span>
    </div>
    <div style="padding: 20px; background: linear-gradient(135deg, rgba(34,211,238,0.08), rgba(139,92,246,0.08)); border: 1px solid rgba(34,211,238,0.15); border-radius: 10px; margin-bottom: 24px;">
      <p style="color: #22d3ee; font-family: ${font}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin: 0 0 8px 0;">Executive Summary</p>
      <p style="color: #e2e8f0; font-family: ${font}; font-size: 14px; line-height: 1.7; margin: 0;">${content.executive_summary || ''}</p>
    </div>
    ${sectionsHtml}
    ${(content.suggested_next_steps || []).length > 0 ? `
    <div style="margin-bottom: 24px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(251,191,36,0.15);">
      <div style="padding: 12px 16px; background: #111827; border-bottom: 1px solid rgba(251,191,36,0.1);"><span style="color: #fbbf24; font-family: ${font}; font-size: 14px; font-weight: 600;">Suggested Next Steps</span></div>
      <div style="padding: 12px 16px; background: #0a0f1a;"><table cellpadding="0" cellspacing="0" border="0" width="100%">${stepsHtml}</table></div>
    </div>` : ''}
    <div style="text-align: center; margin-bottom: 28px;">
      <a href="${appUrl}" style="display: inline-block; padding: 11px 28px; background: linear-gradient(135deg, #0891b2, #6d28d9); color: #ffffff; font-family: ${font}; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">View Full Briefing in Synapse &#x2192;</a>
    </div>
    <div style="text-align: center; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.04);">
      <p style="color: #334155; font-family: ${font}; font-size: 11px; margin: 0 0 4px 0;">Generated by Synapse Orientation Engine</p>
      <p style="color: #1e293b; font-family: ${font}; font-size: 10px; margin: 0;">You received this because a digest was shared with you via <a href="${appUrl}" style="color: #1e293b; text-decoration: underline;">Synapse</a></p>
    </div>
  </div>
</body></html>`;

  return { subject, html };
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { success: false, error: 'RESEND_API_KEY not configured' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Synapse <onboarding@resend.dev>',
        to: [to], subject, html,
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      try { const parsed = JSON.parse(errBody); return { success: false, error: parsed.message || parsed.name || errBody }; }
      catch { return { success: false, error: `Resend error (${response.status})` }; }
    }
    return { success: true };
  } catch (error) { return { success: false, error: (error as Error).message }; }
}

function formatDigestTelegram(content: any, profileName: string): string {
  const date = new Date(content.generated_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  let text = `*Synapse — ${profileName}*\n_${date}_\n\n`;
  text += `*Executive Summary*\n${content.executive_summary || 'N/A'}\n\n`;
  for (const section of (content.sections || [])) {
    if (section.content?.startsWith('Error')) continue;
    text += `*${section.module_name}*\n`;
    if (section.highlights?.length > 0) { for (const h of section.highlights) { text += `• ${h}\n`; } }
    text += '\n';
  }
  if (content.suggested_next_steps?.length > 0) {
    text += `*Next Steps*\n`;
    for (const step of content.suggested_next_steps) { text += `[${step.priority?.toUpperCase()}] ${step.action}\n`; }
  }
  return text;
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    if (!response.ok) { const err = await response.text(); return { success: false, error: `Telegram API error: ${err}` }; }
    return { success: true };
  } catch (error) { return { success: false, error: (error as Error).message }; }
}

function formatDigestSlack(content: any, profileName: string): any {
  const date = new Date(content.generated_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const blocks: any[] = [
    { type: 'header', text: { type: 'plain_text', text: `Synapse — ${profileName}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `_${date}_` }] },
    { type: 'divider' },
    { type: 'section', text: { type: 'mrkdwn', text: `*Executive Summary*\n${content.executive_summary || 'N/A'}` } },
  ];
  for (const section of (content.sections || [])) {
    if (section.content?.startsWith('Error')) continue;
    let t = `*${section.module_name}*\n`;
    if (section.highlights?.length > 0) { t += section.highlights.map((h: string) => `• ${h}`).join('\n'); }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: t } });
  }
  if (content.suggested_next_steps?.length > 0) {
    blocks.push({ type: 'divider' });
    let stepsText = '*Next Steps*\n';
    for (const step of content.suggested_next_steps) { stepsText += `[${step.priority?.toUpperCase()}] ${step.action}\n`; }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: stepsText } });
  }
  return { blocks };
}

async function sendSlack(webhookUrl: string, payload: any): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) { const err = await response.text(); return { success: false, error: `Slack webhook error: ${err}` }; }
    return { success: true };
  } catch (error) { return { success: false, error: (error as Error).message }; }
}

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
