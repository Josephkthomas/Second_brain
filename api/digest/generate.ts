// Vercel API endpoint for digest generation
// POST /api/digest/generate
// Body: { profile_id: string }
// Headers: Authorization: Bearer <jwt>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── Helpers ────────────────────────────────────────────────

function cleanAndParseJSON(text: string) {
  if (!text) return {};
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch (e) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(clean.substring(start, end + 1)); } catch {}
    }
    throw new Error(`JSON Parse Error: ${(e as Error).message}`);
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

// Template system prompts (duplicated here since serverless can't import from frontend)
const TEMPLATE_PROMPTS: Record<string, { name: string; icon: string; systemPrompt: string }> = {
  active_project_status: {
    name: 'Active Project Status',
    icon: 'FolderKanban',
    systemPrompt: `You are a project status analyst. Given the user's knowledge graph data, identify all active projects, goals, and anchors. For each, synthesise: (1) Recent activity, (2) Current blockers or risks, (3) Key people involved, (4) A 1-sentence status assessment. Order by urgency. Be concise.`,
  },
  todays_priorities: {
    name: "Today's Priorities",
    icon: 'ListChecks',
    systemPrompt: `You are a priority analyst. Identify all pending Action, Decision, and commitment nodes. Rank by: (1) Deadlines, (2) Dependency chains, (3) Recency, (4) Connection density. Output a ranked list of 5-10 priorities with rationale.`,
  },
  people_pulse: {
    name: 'People Pulse',
    icon: 'Users',
    systemPrompt: `You are a relationship analyst. Identify all Person nodes and analyse: (1) Most active recently, (2) Pending action items involving them, (3) Gone quiet despite active connections, (4) Relationship clusters. Highlight follow-up opportunities.`,
  },
  attention_map: {
    name: 'Attention Map',
    icon: 'Radar',
    systemPrompt: `You are an attention analyst. Analyse distribution of recent content across topics and projects. Identify: (1) Top 5 topics by volume, (2) Growing vs. declining topics, (3) Attention imbalances, (4) New topics in this period. Use percentages where helpful.`,
  },
  signals_alerts: {
    name: 'Signals & Alerts',
    icon: 'AlertTriangle',
    systemPrompt: `You are an anomaly detector. Identify: (1) Stale commitments >7 days old, (2) Orphaned nodes with few connections, (3) Risk/Blocker nodes gaining connections, (4) Topic surges across 3+ sources, (5) Recent contradictions. Prioritise by impact.`,
  },
  learning_gaps: {
    name: 'Learning & Knowledge Gaps',
    icon: 'GraduationCap',
    systemPrompt: `You are a learning analyst. Identify: (1) Topics in active projects with few supporting nodes, (2) Unresolved Questions/Hypotheses, (3) Frequent concepts lacking evidence, (4) Skills in goals lacking learning content. Suggest what would fill each gap.`,
  },
};

// ─── Sub-Agent ──────────────────────────────────────────────

async function executeSubAgent(
  mod: any,
  graphContext: { nodes: any[]; edges: any[]; anchors: any[] },
  frequency: string,
  density: string,
  timeRange: { from: string; to: string }
) {
  const ai = getGenAI();
  const tmpl = mod.template_id ? TEMPLATE_PROMPTS[mod.template_id] : null;
  let systemPrompt = tmpl?.systemPrompt || mod.custom_system_prompt || 'Analyse the knowledge graph data and produce a useful summary.';
  if (mod.user_context) systemPrompt += `\n\nUser instructions: ${mod.user_context}`;

  const nodeSummary = graphContext.nodes.slice(0, 100).map((n: any) =>
    `- [${n.entity_type}] ${n.label}${n.description ? `: ${n.description.slice(0, 100)}` : ''}`
  ).join('\n');

  const edgeSummary = graphContext.edges.slice(0, 80).map((e: any) =>
    `- ${e.source_node_id?.slice(0, 8)} --[${e.relation_type}]--> ${e.target_node_id?.slice(0, 8)}${e.evidence ? ` (${e.evidence.slice(0, 60)})` : ''}`
  ).join('\n');

  const anchorSummary = graphContext.anchors.map((a: any) =>
    `- [Anchor] ${a.label} (${a.entity_type})`
  ).join('\n');

  const prompt = `${systemPrompt}

=== CONTEXT ===
Period: ${timeRange.from.slice(0, 10)} to ${timeRange.to.slice(0, 10)} | Frequency: ${frequency} | Density: ${density}

=== ANCHORS ===
${anchorSummary || '(None)'}

=== RECENT NODES (${graphContext.nodes.length}) ===
${nodeSummary || '(None)'}

=== RECENT EDGES (${graphContext.edges.length}) ===
${edgeSummary || '(None)'}

Provide your analysis as structured JSON. The "content" field should be your full markdown-formatted analysis. The "highlights" should be 3-5 concise key bullet points.`;

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
    return {
      module_id: mod.id,
      module_name: tmpl?.name || mod.custom_name || 'Custom',
      icon: tmpl?.icon || 'Sparkles',
      template_id: mod.template_id,
      content: parsed.content || 'No analysis.',
      highlights: parsed.highlights || [],
      entities_referenced: parsed.entities_referenced || [],
      raw_data: { nodes_count: graphContext.nodes.length, edges_count: graphContext.edges.length },
    };
  } catch (error) {
    return {
      module_id: mod.id,
      module_name: tmpl?.name || mod.custom_name || 'Custom',
      icon: tmpl?.icon || 'Sparkles',
      template_id: mod.template_id,
      content: `Error: ${(error as Error).message}`,
      highlights: [],
      entities_referenced: [],
      raw_data: { nodes_count: 0, edges_count: 0 },
    };
  }
}

// ─── Meta-Agent ─────────────────────────────────────────────

async function runMetaAgent(moduleOutputs: any[], frequency: string, density: string) {
  const ai = getGenAI();
  const summaries = moduleOutputs.map(o => `--- ${o.module_name} ---\n${o.content}`).join('\n\n');

  const prompt = `You synthesise intelligence module outputs into a coherent briefing.

=== MODULE OUTPUTS ===
${summaries}

Frequency: ${frequency} | Density: ${density}

Write a 2-4 sentence executive summary and derive 3-5 concrete next-step actions.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
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
    return JSON.parse(response.text || '{}');
  } catch {
    return { executive_summary: 'Unable to generate summary.', suggested_next_steps: [] };
  }
}

// ─── Handler ────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
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

  const { profile_id } = req.body;
  if (!profile_id) return res.status(400).json({ error: 'profile_id required' });

  try {
    const startTime = Date.now();

    // Load profile with modules
    const { data: profile, error: profileError } = await supabase
      .from('digest_profiles')
      .select('*')
      .eq('id', profile_id)
      .eq('user_id', user.id)
      .single();
    if (profileError || !profile) return res.status(404).json({ error: 'Profile not found' });

    const { data: modules } = await supabase
      .from('digest_modules')
      .select('*')
      .eq('digest_profile_id', profile_id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!modules || modules.length === 0) {
      return res.status(400).json({ error: 'No active modules' });
    }

    const timeRange = getTimeRange(profile.frequency);

    // Gather graph data
    const { data: nodes } = await supabase
      .from('knowledge_nodes')
      .select('id, label, entity_type, description, source, source_type, is_anchor, created_at')
      .eq('user_id', user.id)
      .gte('created_at', timeRange.from)
      .lte('created_at', timeRange.to)
      .order('created_at', { ascending: false })
      .limit(200);

    const { data: edges } = await supabase
      .from('knowledge_edges')
      .select('id, source_node_id, target_node_id, relation_type, evidence, created_at')
      .eq('user_id', user.id)
      .gte('created_at', timeRange.from)
      .lte('created_at', timeRange.to)
      .limit(200);

    const { data: anchors } = await supabase
      .from('knowledge_nodes')
      .select('id, label, entity_type, description')
      .eq('user_id', user.id)
      .eq('is_anchor', true);

    const graphContext = { nodes: nodes || [], edges: edges || [], anchors: anchors || [] };

    // Execute sub-agents sequentially
    const moduleOutputs = [];
    for (const mod of modules) {
      const output = await executeSubAgent(mod, graphContext, profile.frequency, profile.density, timeRange);
      moduleOutputs.push(output);
    }

    // Run meta-agent
    const meta = await runMetaAgent(moduleOutputs, profile.frequency, profile.density);

    const generationTime = Date.now() - startTime;

    // Build digest output
    const digestOutput = {
      generated_at: new Date().toISOString(),
      digest_profile_id: profile_id,
      frequency: profile.frequency,
      executive_summary: meta.executive_summary,
      sections: moduleOutputs.map((o: any) => ({
        module_id: o.module_id,
        module_name: o.module_name,
        icon: o.icon,
        content: o.content,
        highlights: o.highlights,
        entities_referenced: o.entities_referenced,
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

    // Save to history
    const { data: historyEntry, error: historyError } = await supabase
      .from('digest_history')
      .insert({
        user_id: user.id,
        digest_profile_id: profile_id,
        content: digestOutput,
        module_outputs: moduleOutputs,
        channels_delivered: ['in_app'],
        status: 'completed',
        generation_time_ms: generationTime,
      })
      .select()
      .single();

    if (historyError) console.error('Failed to save history:', historyError);

    // Update last_generated_at
    await supabase
      .from('digest_profiles')
      .update({ last_generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', profile_id);

    return res.status(200).json({
      success: true,
      digest_id: historyEntry?.id,
      content: digestOutput,
      generation_time_ms: generationTime,
    });

  } catch (error) {
    console.error('Digest generation error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
