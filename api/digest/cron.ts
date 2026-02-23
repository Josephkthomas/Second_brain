// Vercel Cron endpoint for scheduled digest generation
// Runs hourly, checks which digest profiles are due for generation
// POST /api/digest/cron (called by Vercel Cron every hour)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

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

// Check if a profile is due for generation
function isProfileDue(profile: any): boolean {
  const now = new Date();
  const lastGenerated = profile.last_generated_at ? new Date(profile.last_generated_at) : null;

  if (!lastGenerated) return true; // Never generated

  const hoursSinceLastGen = (now.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60);

  switch (profile.frequency) {
    case 'daily':
      return hoursSinceLastGen >= 20; // Allow some buffer
    case 'weekly':
      return hoursSinceLastGen >= 164; // ~6.8 days
    case 'monthly':
      return hoursSinceLastGen >= 672; // ~28 days
    default:
      return false;
  }
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

      const prompt = `${sysPrompt}\n\nPeriod: ${timeRange.from.slice(0, 10)} to ${timeRange.to.slice(0, 10)} | ${profile.frequency} | ${profile.density}\n\nAnchors:\n${graphContext.anchors.map((a: any) => `- ${a.label}`).join('\n') || '(None)'}\n\nNodes (${graphContext.nodes.length}):\n${nodeSummary || '(None)'}\n\nRespond JSON: {"content":"markdown","highlights":["..."],"entities_referenced":[]}`;

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { temperature: 0.3, maxOutputTokens: 1500 },
        });
        const parsed = cleanAndParseJSON(response.text || '');
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
        contents: `Synthesise these module outputs into a 2-4 sentence executive summary and 3-5 next steps.\n\n${summaries}\n\nJSON: {"executive_summary":"...","suggested_next_steps":[{"action":"...","rationale":"...","priority":"high|medium|low","related_entities":[]}]}`,
        config: { temperature: 0.3, maxOutputTokens: 1000 },
      });
      meta = cleanAndParseJSON(metaResponse.text || '');
    } catch {}

    // Save
    const digestOutput = {
      generated_at: new Date().toISOString(),
      digest_profile_id: profile.id,
      frequency: profile.frequency,
      executive_summary: meta.executive_summary || 'Digest generated.',
      sections: moduleOutputs.map((o: any) => ({
        module_id: o.module_id, module_name: o.module_name, icon: o.icon,
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

    await supabase.from('digest_history').insert({
      user_id: profile.user_id,
      digest_profile_id: profile.id,
      content: digestOutput,
      module_outputs: moduleOutputs,
      channels_delivered: ['in_app'],
      status: 'completed',
    });

    await supabase.from('digest_profiles')
      .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', profile.id);

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
