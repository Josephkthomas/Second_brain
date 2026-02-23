// Orientation Engine — Digest Generation Service
// Orchestrates sub-agents and meta-agent to generate composable intelligence digests.

import { GoogleGenAI } from '@google/genai';
import { getSupabase, getCurrentUserId, fetchAnchors, fetchExistingNodes } from './supabase';
import { fetchDigestProfile, fetchDigestHistory, saveDigestResult, updateDigestHistoryStatus } from './digest';
import { getDigestTemplate, type DigestTemplateDefinition } from '../config/digestTemplates';
import type {
  DigestProfile, DigestModule, DigestOutput, DigestModuleOutput,
  DigestSection, DigestAction, DigestHistoryEntry, ScheduleFrequency,
} from '../types/digest';

const initGenAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API Key is missing');
  return new GoogleGenAI({ apiKey });
};

const cleanAndParseJSON = (text: string) => {
  if (!text) return {};
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(clean.substring(start, end + 1)); } catch {}
    }
    throw new Error(`JSON Parse Error: ${(e as Error).message}`);
  }
};

// ─── Time Range Helpers ─────────────────────────────────────

export function getTimeRange(frequency: ScheduleFrequency): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  switch (frequency) {
    case 'daily': from.setDate(from.getDate() - 1); break;
    case 'weekly': from.setDate(from.getDate() - 7); break;
    case 'monthly': from.setMonth(from.getMonth() - 1); break;
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

// ─── Graph Data Gathering ───────────────────────────────────

async function gatherGraphContext(
  userId: string,
  timeRange: { from: string; to: string },
  entityTypeFilter?: string[]
): Promise<{ nodes: any[]; edges: any[]; anchors: any[] }> {
  const client = getSupabase();

  // Fetch anchors
  const anchors = await fetchAnchors();

  // Fetch recent nodes
  let nodesQuery = client
    .from('knowledge_nodes')
    .select('id, label, entity_type, description, source, source_type, is_anchor, created_at')
    .eq('user_id', userId)
    .gte('created_at', timeRange.from)
    .lte('created_at', timeRange.to)
    .order('created_at', { ascending: false })
    .limit(200);

  if (entityTypeFilter && entityTypeFilter.length > 0) {
    nodesQuery = nodesQuery.in('entity_type', entityTypeFilter);
  }

  const { data: nodes, error: nodesError } = await nodesQuery;
  if (nodesError) console.error('Error fetching nodes for digest:', nodesError);

  // Fetch recent edges
  const { data: edges, error: edgesError } = await client
    .from('knowledge_edges')
    .select('id, source_node_id, target_node_id, relation_type, evidence, created_at')
    .eq('user_id', userId)
    .gte('created_at', timeRange.from)
    .lte('created_at', timeRange.to)
    .order('created_at', { ascending: false })
    .limit(200);

  if (edgesError) console.error('Error fetching edges for digest:', edgesError);

  return {
    nodes: nodes || [],
    edges: edges || [],
    anchors: anchors || [],
  };
}

// ─── Sub-Agent Execution ────────────────────────────────────

async function executeSubAgent(
  module: DigestModule,
  template: DigestTemplateDefinition | null,
  graphContext: { nodes: any[]; edges: any[]; anchors: any[] },
  frequency: ScheduleFrequency,
  density: string,
  timeRange: { from: string; to: string }
): Promise<DigestModuleOutput> {
  const ai = initGenAI();

  // Build system prompt
  let systemPrompt = template?.systemPrompt || module.custom_system_prompt || 'Analyse the provided knowledge graph data and produce a useful summary.';
  if (module.user_context) {
    systemPrompt += `\n\nAdditional user instructions: ${module.user_context}`;
  }

  const moduleName = template?.name || module.custom_name || 'Custom Module';
  const moduleIcon = template?.iconName || 'Sparkles';

  // Summarise graph data for the prompt (avoid token overflow)
  const nodeSummary = graphContext.nodes.slice(0, 100).map(n =>
    `- [${n.entity_type}] ${n.label}${n.description ? `: ${n.description.slice(0, 100)}` : ''} (id: ${n.id.slice(0, 8)})`
  ).join('\n');

  const edgeSummary = graphContext.edges.slice(0, 80).map(e =>
    `- ${e.source_node_id?.slice(0, 8)} --[${e.relation_type}]--> ${e.target_node_id?.slice(0, 8)}${e.evidence ? ` (${e.evidence.slice(0, 60)})` : ''}`
  ).join('\n');

  const anchorSummary = graphContext.anchors.map(a =>
    `- [Anchor] ${a.label} (${a.entity_type})${a.description ? `: ${a.description.slice(0, 80)}` : ''}`
  ).join('\n');

  const prompt = `${systemPrompt}

=== CONTEXT ===
Reporting period: ${timeRange.from.slice(0, 10)} to ${timeRange.to.slice(0, 10)}
Frequency: ${frequency}
Density level: ${density}

=== ANCHORS (Priority Projects/Goals) ===
${anchorSummary || '(No anchors configured)'}

=== RECENT NODES (${graphContext.nodes.length} total) ===
${nodeSummary || '(No nodes in this period)'}

=== RECENT EDGES (${graphContext.edges.length} total) ===
${edgeSummary || '(No edges in this period)'}

=== INSTRUCTIONS ===
Respond with valid JSON only:
{
  "content": "Your markdown-formatted analysis here",
  "highlights": ["Key bullet point 1", "Key bullet point 2", "Key bullet point 3"],
  "entities_referenced": ["node_id_1", "node_id_2"]
}

If there is insufficient data for a meaningful analysis, say so honestly and suggest what kinds of knowledge would help.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    });

    const text = response.text || '';
    const parsed = cleanAndParseJSON(text);

    return {
      module_id: module.id,
      module_name: moduleName,
      icon: moduleIcon,
      template_id: module.template_id,
      content: parsed.content || 'No analysis generated.',
      highlights: parsed.highlights || [],
      entities_referenced: parsed.entities_referenced || [],
      raw_data: {
        nodes_count: graphContext.nodes.length,
        edges_count: graphContext.edges.length,
      },
    };
  } catch (error) {
    console.error(`Sub-agent error for ${moduleName}:`, error);
    return {
      module_id: module.id,
      module_name: moduleName,
      icon: moduleIcon,
      template_id: module.template_id,
      content: `Error generating analysis: ${(error as Error).message}`,
      highlights: [],
      entities_referenced: [],
      raw_data: { nodes_count: 0, edges_count: 0 },
    };
  }
}

// ─── Meta-Agent Synthesis ───────────────────────────────────

const META_AGENT_PROMPT = `You are the Synapse Orientation Meta-Agent. You synthesise multiple intelligence module outputs into a coherent briefing.

You will receive outputs from sub-agents. Your tasks:

1. EXECUTIVE SUMMARY: Write a 2-4 sentence overview capturing the single most important insight across all modules. Synthesise across modules — do not simply list what each found.

2. SUGGESTED NEXT STEPS: Derive 3-5 concrete, specific actions from the module outputs. Each should have an action, rationale, and priority (high/medium/low).

Respond with valid JSON only:
{
  "executive_summary": "Your 2-4 sentence synthesis here",
  "suggested_next_steps": [
    {"action": "Do X", "rationale": "Because Y", "priority": "high", "related_entities": []},
    {"action": "Do Z", "rationale": "Because W", "priority": "medium", "related_entities": []}
  ]
}`;

async function runMetaAgent(
  moduleOutputs: DigestModuleOutput[],
  frequency: ScheduleFrequency,
  density: string,
  recentHistory: DigestHistoryEntry[]
): Promise<{ executive_summary: string; suggested_next_steps: DigestAction[] }> {
  const ai = initGenAI();

  const modulesSummary = moduleOutputs.map(o =>
    `--- ${o.module_name} ---\n${o.content}\nHighlights: ${o.highlights.join('; ')}`
  ).join('\n\n');

  const historySummary = recentHistory.slice(0, 3).map(h =>
    `[${h.delivered_at?.slice(0, 10)}] ${h.content?.executive_summary || 'No summary'}`
  ).join('\n');

  const prompt = `${META_AGENT_PROMPT}

=== MODULE OUTPUTS ===
${modulesSummary}

=== RECENT DIGEST HISTORY (for cross-digest awareness) ===
${historySummary || '(No previous digests)'}

Digest frequency: ${frequency}
Density: ${density}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1500,
      },
    });

    const text = response.text || '';
    const parsed = cleanAndParseJSON(text);

    return {
      executive_summary: parsed.executive_summary || 'Digest generated successfully.',
      suggested_next_steps: parsed.suggested_next_steps || [],
    };
  } catch (error) {
    console.error('Meta-agent error:', error);
    return {
      executive_summary: 'Unable to generate executive summary.',
      suggested_next_steps: [],
    };
  }
}

// ─── Main Orchestrator ──────────────────────────────────────

export async function generateDigest(
  profileId: string,
  onProgress?: (step: { module: string; status: string; index: number; total: number }) => void
): Promise<DigestHistoryEntry | null> {
  const startTime = Date.now();

  // Load profile
  const profile = await fetchDigestProfile(profileId);
  if (!profile) {
    console.error('Digest profile not found:', profileId);
    return null;
  }

  const activeModules = profile.modules.filter(m => m.is_active);
  if (activeModules.length === 0) {
    console.error('No active modules in digest profile');
    return null;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('Not authenticated');
    return null;
  }

  // Create initial history entry
  const { data: historyEntry } = await saveDigestResult({
    digest_profile_id: profileId,
    content: {},
    module_outputs: [],
    status: 'generating',
  });

  try {
    const timeRange = getTimeRange(profile.frequency);

    // Gather graph context
    const graphContext = await gatherGraphContext(userId, timeRange);

    // Execute sub-agents
    const moduleOutputs: DigestModuleOutput[] = [];
    for (let i = 0; i < activeModules.length; i++) {
      const mod = activeModules[i];
      const template = mod.template_id ? getDigestTemplate(mod.template_id) || null : null;

      onProgress?.({
        module: template?.name || mod.custom_name || 'Module',
        status: 'running',
        index: i,
        total: activeModules.length,
      });

      const output = await executeSubAgent(
        mod, template, graphContext,
        profile.frequency, profile.density, timeRange
      );
      moduleOutputs.push(output);

      onProgress?.({
        module: template?.name || mod.custom_name || 'Module',
        status: 'complete',
        index: i,
        total: activeModules.length,
      });
    }

    // Run meta-agent synthesis
    onProgress?.({ module: 'Executive Summary', status: 'running', index: activeModules.length, total: activeModules.length + 1 });

    const recentHistory = await fetchDigestHistory(undefined, 5);
    const { executive_summary, suggested_next_steps } = await runMetaAgent(
      moduleOutputs, profile.frequency, profile.density, recentHistory
    );

    onProgress?.({ module: 'Executive Summary', status: 'complete', index: activeModules.length, total: activeModules.length + 1 });

    // Build final digest output
    const digestOutput: DigestOutput = {
      generated_at: new Date().toISOString(),
      digest_profile_id: profileId,
      frequency: profile.frequency,
      executive_summary,
      sections: moduleOutputs.map(o => ({
        module_id: o.module_id,
        module_name: o.module_name,
        icon: o.icon,
        content: o.content,
        highlights: o.highlights,
        entities_referenced: o.entities_referenced,
      })),
      suggested_next_steps,
      metadata: {
        nodes_scanned: graphContext.nodes.length,
        edges_scanned: graphContext.edges.length,
        time_range: timeRange,
        modules_executed: activeModules.length,
        cross_digest_references: recentHistory.map(h => h.id),
      },
    };

    const generationTime = Date.now() - startTime;

    // Update history entry
    if (historyEntry) {
      await updateDigestHistoryStatus(historyEntry.id, {
        status: 'completed',
        channels_delivered: ['in_app'],
      });
      // Update the full content via direct update
      const client = getSupabase();
      await client
        .from('digest_history')
        .update({
          content: digestOutput,
          module_outputs: moduleOutputs,
          generation_time_ms: generationTime,
          status: 'completed',
          channels_delivered: ['in_app'],
        })
        .eq('id', historyEntry.id);
    }

    return {
      ...historyEntry!,
      content: digestOutput,
      module_outputs: moduleOutputs,
      status: 'completed',
      generation_time_ms: generationTime,
      channels_delivered: ['in_app'],
    } as DigestHistoryEntry;

  } catch (error) {
    console.error('Digest generation failed:', error);
    if (historyEntry) {
      await updateDigestHistoryStatus(historyEntry.id, {
        status: 'failed',
        error_details: (error as Error).message,
      });
    }
    return null;
  }
}
