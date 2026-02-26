// Vercel Cron endpoint for scheduled digest generation
// Runs hourly, checks which digest profiles are due for generation
// POST /api/digest/cron (called by Vercel Cron every hour)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

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

async function deliverToChannels(
  supabase: any, profileName: string, historyId: string, digestContent: any, channels: any[],
): Promise<{ deliveredChannels: string[]; errors: Record<string, string> }> {
  const deliveredChannels: string[] = ['in_app'];
  const errors: Record<string, string> = {};
  for (const channel of channels) {
    try {
      if (channel.channel_type === 'email') {
        const address = channel.channel_config?.address;
        if (!address) { errors.email = 'No email address configured'; continue; }
        const { subject, html } = formatDigestEmail(digestContent, profileName);
        const { success, error } = await sendEmail(address, subject, html);
        if (success) { if (!deliveredChannels.includes('email')) deliveredChannels.push('email'); }
        else { errors.email = error || 'Send failed'; }
      }
    } catch (err) {
      console.error(`[Delivery] Channel error (${channel.channel_type}):`, err);
      errors[channel.channel_type] = (err as Error).message;
    }
  }
  if (deliveredChannels.length > 1) {
    await supabase.from('digest_history').update({ channels_delivered: deliveredChannels }).eq('id', historyId);
  }
  return { deliveredChannels, errors };
}

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const MAX_PROFILES_PER_RUN = 5;

function verifyCronAuth(req: VercelRequest): boolean {
  const cronAuth = req.headers['authorization'];
  if (cronAuth === `Bearer ${CRON_SECRET}`) return true;
  const vercelSignature = req.headers['x-vercel-signature'];
  if (vercelSignature) return true;
  const userAgent = req.headers['user-agent'] || '';
  if (userAgent.includes('vercel-cron')) return true;
  return !CRON_SECRET;
}

function cleanAndParseJSON(text: string) {
  if (!text) return {};
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(clean.substring(start, end + 1)); } catch {}
    }
    return {};
  }
}

function getTimeRange(frequency: string): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  switch (frequency) {
    case 'daily': from.setDate(from.getDate() - 1); break;
    case 'weekly': from.setDate(from.getDate() - 7); break;
    case 'monthly': from.setMonth(from.getMonth() - 1); break;
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

// Check if a profile is due for generation.
// Calculates the most recent past scheduled delivery time based on the
// profile's delivery_time, delivery_day_of_week, delivery_day_of_month,
// and timezone. If last_generated_at is before that scheduled time,
// the profile is due. This ensures schedule edits take effect immediately —
// e.g. if a weekly digest was sent Monday and the user changes to Tuesday,
// it will resend on Tuesday.
function isProfileDue(profile: any): boolean {
  const now = new Date();
  const lastGenerated = profile.last_generated_at ? new Date(profile.last_generated_at) : null;

  if (!lastGenerated) return true; // Never generated

  const tz = profile.timezone || 'UTC';
  const [schedH, schedM] = (profile.delivery_time || '08:00').split(':').map(Number);

  // Get current and last-generated wall-clock time in the user's timezone
  const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: tz, hour12: false }));
  const lastInTz = new Date(lastGenerated.toLocaleString('en-US', { timeZone: tz, hour12: false }));

  // Calculate the most recent past scheduled delivery time (in user's TZ)
  let mostRecentScheduled: Date;

  if (profile.frequency === 'daily') {
    mostRecentScheduled = new Date(nowInTz);
    mostRecentScheduled.setHours(schedH, schedM, 0, 0);
    if (mostRecentScheduled > nowInTz) {
      // Today's slot hasn't arrived yet — look at yesterday's slot
      mostRecentScheduled.setDate(mostRecentScheduled.getDate() - 1);
    }
  } else if (profile.frequency === 'weekly') {
    const targetDay = profile.delivery_day_of_week ?? 1; // 0=Sun, 1=Mon, ...
    mostRecentScheduled = new Date(nowInTz);
    const currentDay = nowInTz.getDay();
    let daysSince = currentDay - targetDay;
    if (daysSince < 0) daysSince += 7;
    mostRecentScheduled.setDate(mostRecentScheduled.getDate() - daysSince);
    mostRecentScheduled.setHours(schedH, schedM, 0, 0);
    if (mostRecentScheduled > nowInTz) {
      // This week's slot hasn't arrived yet — look at last week's
      mostRecentScheduled.setDate(mostRecentScheduled.getDate() - 7);
    }
  } else if (profile.frequency === 'monthly') {
    const targetDay = profile.delivery_day_of_month ?? 1;
    mostRecentScheduled = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), targetDay, schedH, schedM, 0, 0);
    if (mostRecentScheduled > nowInTz) {
      mostRecentScheduled.setMonth(mostRecentScheduled.getMonth() - 1);
    }
  } else {
    return false;
  }

  // Due if last generation was before the most recent scheduled slot
  return lastInTz < mostRecentScheduled;
}

// Template prompts (same as generate.ts)
const TEMPLATE_PROMPTS: Record<string, { name: string; icon: string; systemPrompt: string }> = {
  active_project_status: {
    name: 'Active Project Status', icon: 'FolderKanban',
    systemPrompt: 'You are a project status analyst. Identify active projects, goals, anchors. For each: recent activity, blockers, key people, status assessment. Order by urgency.',
  },
  todays_priorities: {
    name: "Today's Priorities", icon: 'ListChecks',
    systemPrompt: 'You are a priority analyst. Identify pending Actions and Decisions. Rank by deadlines, dependencies, recency, connection density. List 5-10 priorities.',
  },
  people_pulse: {
    name: 'People Pulse', icon: 'Users',
    systemPrompt: 'You are a relationship analyst. Identify Person nodes: most active, pending items, gone quiet, clusters. Highlight follow-ups.',
  },
  attention_map: {
    name: 'Attention Map', icon: 'Radar',
    systemPrompt: 'You are an attention analyst. Analyse content distribution across topics. Top 5 topics, growing/declining, imbalances, new topics.',
  },
  signals_alerts: {
    name: 'Signals & Alerts', icon: 'AlertTriangle',
    systemPrompt: 'You are an anomaly detector. Stale commitments, orphaned nodes, risk escalation, topic surges, contradictions. Prioritise by impact.',
  },
  learning_gaps: {
    name: 'Learning & Knowledge Gaps', icon: 'GraduationCap',
    systemPrompt: 'You are a learning analyst. Shallow areas, unresolved questions, concepts lacking evidence, skill gaps. Suggest what fills each gap.',
  },
};

async function generateDigestForProfile(supabase: any, profile: any): Promise<boolean> {
  try {
    const { data: modules } = await supabase
      .from('digest_modules')
      .select('*')
      .eq('digest_profile_id', profile.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!modules || modules.length === 0) return false;

    const timeRange = getTimeRange(profile.frequency);

    // Gather graph data
    const { data: nodes } = await supabase
      .from('knowledge_nodes')
      .select('id, label, entity_type, description, is_anchor, created_at')
      .eq('user_id', profile.user_id)
      .gte('created_at', timeRange.from)
      .lte('created_at', timeRange.to)
      .limit(200);

    const { data: edges } = await supabase
      .from('knowledge_edges')
      .select('id, source_node_id, target_node_id, relation_type, evidence, created_at')
      .eq('user_id', profile.user_id)
      .gte('created_at', timeRange.from)
      .lte('created_at', timeRange.to)
      .limit(200);

    const { data: anchors } = await supabase
      .from('knowledge_nodes')
      .select('id, label, entity_type, description')
      .eq('user_id', profile.user_id)
      .eq('is_anchor', true);

    const graphContext = { nodes: nodes || [], edges: edges || [], anchors: anchors || [] };
    const ai = getGenAI();

    // Run sub-agents
    const moduleOutputs = [];
    for (const mod of modules) {
      const tmpl = mod.template_id ? TEMPLATE_PROMPTS[mod.template_id] : null;
      let sysPrompt = tmpl?.systemPrompt || mod.custom_system_prompt || 'Analyse the knowledge graph.';
      if (mod.user_context) sysPrompt += `\nUser: ${mod.user_context}`;

      const nodeSummary = graphContext.nodes.slice(0, 80).map((n: any) =>
        `- [${n.entity_type}] ${n.label}`
      ).join('\n');

      const prompt = `${sysPrompt}\n\nPeriod: ${timeRange.from.slice(0, 10)} to ${timeRange.to.slice(0, 10)} | ${profile.frequency} | ${profile.density}\n\nAnchors:\n${graphContext.anchors.map((a: any) => `- ${a.label}`).join('\n') || '(None)'}\n\nNodes (${graphContext.nodes.length}):\n${nodeSummary || '(None)'}\n\nProvide your analysis as structured JSON with content, highlights, and entities_referenced fields.`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            temperature: 0.3,
            maxOutputTokens: 4000,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING },
                highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                entities_referenced: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['content', 'highlights'],
            },
          },
        });
        const parsed = JSON.parse(response.text || '{}');
        moduleOutputs.push({
          module_id: mod.id,
          module_name: tmpl?.name || mod.custom_name || 'Custom',
          icon: tmpl?.icon || 'Sparkles',
          template_id: mod.template_id,
          content: parsed.content || 'No analysis.',
          highlights: parsed.highlights || [],
          entities_referenced: parsed.entities_referenced || [],
        });
      } catch (err) {
        moduleOutputs.push({
          module_id: mod.id,
          module_name: tmpl?.name || mod.custom_name || 'Custom',
          icon: tmpl?.icon || 'Sparkles',
          template_id: mod.template_id,
          content: `Error: ${(err as Error).message}`,
          highlights: [],
          entities_referenced: [],
        });
      }
    }

    // Meta-agent
    const summaries = moduleOutputs.map(o => `--- ${o.module_name} ---\n${o.content}`).join('\n\n');
    let meta = { executive_summary: '', suggested_next_steps: [] as any[] };
    try {
      const metaResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Synthesise these module outputs into a 2-4 sentence executive summary and 3-5 next steps.\n\n${summaries}`,
        config: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executive_summary: { type: Type.STRING },
              suggested_next_steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    priority: { type: Type.STRING },
                    related_entities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['action', 'rationale', 'priority'],
                },
              },
            },
            required: ['executive_summary', 'suggested_next_steps'],
          },
        },
      });
      meta = JSON.parse(metaResponse.text || '{}');
    } catch {}

    // Save
    const digestOutput = {
      generated_at: new Date().toISOString(),
      digest_profile_id: profile.id,
      frequency: profile.frequency,
      executive_summary: meta.executive_summary || 'Digest generated.',
      sections: moduleOutputs.map((o: any) => ({
        module_id: o.module_id, module_name: o.module_name, icon: o.icon,
        template_id: o.template_id || null,
        content: o.content, highlights: o.highlights, entities_referenced: o.entities_referenced,
      })),
      suggested_next_steps: meta.suggested_next_steps || [],
      metadata: {
        nodes_scanned: graphContext.nodes.length,
        edges_scanned: graphContext.edges.length,
        time_range: timeRange,
        modules_executed: modules.length,
        cross_digest_references: [],
      },
    };

    // Save digest to history (return id for delivery)
    const { data: insertedHistory, error: insertError } = await supabase.from('digest_history').insert({
      user_id: profile.user_id,
      digest_profile_id: profile.id,
      content: digestOutput,
      module_outputs: moduleOutputs,
      channels_delivered: ['in_app'],
      status: 'completed',
    }).select('id').single();

    if (insertError) {
      console.error(`[Cron] Failed to save digest history for profile ${profile.id}:`, insertError);
      return false;
    }

    await supabase.from('digest_profiles')
      .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    // Auto-deliver to configured channels (email, telegram, slack)
    if (insertedHistory?.id) {
      const { data: channels, error: channelsError } = await supabase
        .from('digest_channels')
        .select('*')
        .eq('digest_profile_id', profile.id)
        .eq('is_active', true);

      if (channelsError) {
        console.error(`[Cron] Failed to fetch channels for profile ${profile.id}:`, channelsError);
      } else if (channels && channels.length > 0) {
        const { deliveredChannels, errors } = await deliverToChannels(
          supabase,
          profile.name || 'Digest',
          insertedHistory.id,
          digestOutput,
          channels,
        );
        console.log(`[Cron] Auto-delivered profile ${profile.id} to: ${deliveredChannels.join(', ')}`);
        if (Object.keys(errors).length > 0) {
          console.warn(`[Cron] Delivery errors for profile ${profile.id}:`, errors);
        }
      }
    }

    return true;
  } catch (error) {
    console.error(`[Cron] Error generating digest for profile ${profile.id}:`, error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  try {
    console.log('[Digest Cron] Starting scheduled digest check...');

    // Fetch all active profiles
    const { data: profiles, error } = await supabase
      .from('digest_profiles')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      return res.status(200).json({ message: 'No active profiles', processed: 0 });
    }

    // Filter to profiles that are due
    const dueProfiles = profiles.filter(isProfileDue).slice(0, MAX_PROFILES_PER_RUN);
    console.log(`[Digest Cron] Found ${dueProfiles.length} due profiles out of ${profiles.length} active`);

    let successCount = 0;
    for (const profile of dueProfiles) {
      const success = await generateDigestForProfile(supabase, profile);
      if (success) successCount++;
    }

    const duration = Date.now() - startTime;
    console.log(`[Digest Cron] Completed: ${successCount}/${dueProfiles.length} in ${duration}ms`);

    return res.status(200).json({
      message: 'Digest cron completed',
      total_active: profiles.length,
      due: dueProfiles.length,
      processed: successCount,
      duration_ms: duration,
    });

  } catch (error) {
    console.error('[Digest Cron] Error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
