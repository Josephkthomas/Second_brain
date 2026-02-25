// Orientation Engine — Digest Generation Service
// Orchestrates sub-agents and meta-agent to generate composable intelligence digests.

import { GoogleGenAI, Type } from '@google/genai';
import { getSupabase, getCurrentUserId, fetchAnchors } from './supabase';
import { fetchDigestProfile, fetchDigestHistory, saveDigestResult, updateDigestHistoryStatus } from './digest';
import { getDigestTemplate, type DigestTemplateDefinition } from '../config/digestTemplates';
import type {
  DigestProfile, DigestModule, DigestOutput, DigestModuleOutput,
  DigestSection, DigestAction, DigestHistoryEntry, ScheduleFrequency,
  DigestScope,
} from '../types/digest';

const initGenAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API Key is missing');
  return new GoogleGenAI({ apiKey });
};

// ─── Robust JSON Extraction ─────────────────────────────────

function safeExtractJSON(response: any, label: string): any {
  // Step 1: Get raw text safely (some SDK versions throw on .text)
  let rawText = '';
  try {
    rawText = response.text || '';
  } catch {
    // Fallback: dig into response candidates
    rawText = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (!rawText.trim()) {
    console.warn(`[${label}] Empty response from Gemini`);
    return null;
  }

  // Step 2: Try direct parse first (happy path with responseMimeType: 'application/json')
  try {
    return JSON.parse(rawText);
  } catch {
    // continue to fallback strategies
  }

  // Step 3: Strip markdown code fences (model sometimes wraps JSON in ```json ... ```)
  const fenceMatch = rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // continue
    }
  }

  // Step 4: Find the outermost { ... } in the text
  const braceStart = rawText.indexOf('{');
  const braceEnd = rawText.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(rawText.slice(braceStart, braceEnd + 1));
    } catch {
      // continue
    }
  }

  console.error(`[${label}] Could not parse JSON from response (first 300 chars): ${rawText.slice(0, 300)}`);
  return null;
}

// ─── Progress Types ─────────────────────────────────────────

export type AgentPhase = 'init' | 'gathering' | 'sub_agent' | 'meta_agent' | 'saving' | 'complete' | 'error';

export interface AgentProgressStep {
  phase: AgentPhase;
  module?: string;
  moduleIndex?: number;
  totalModules?: number;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface GenerationProgress {
  phase: AgentPhase;
  overallStatus: string;
  steps: AgentProgressStep[];
  graphStats?: { nodes: number; edges: number; anchors: number };
  startedAt: number;
  elapsedMs: number;
}

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
  scope?: DigestScope,
  entityTypeFilter?: string[]
): Promise<{ nodes: any[]; edges: any[]; anchors: any[] }> {
  const client = getSupabase();

  const allAnchors = await fetchAnchors();
  // Filter anchors by scope — only pass selected anchors to sub-agents
  const anchors = (scope?.mode === 'selected' && (scope as { mode: 'selected'; anchor_ids: string[] }).anchor_ids?.length > 0)
    ? allAnchors.filter(a => (scope as { mode: 'selected'; anchor_ids: string[] }).anchor_ids.includes(a.id))
    : allAnchors;

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
  timeRange: { from: string; to: string },
  scope?: DigestScope
): Promise<DigestModuleOutput> {
  const ai = initGenAI();

  const isCustomModule = !template;
  let systemPrompt = template?.systemPrompt || module.custom_system_prompt || 'Analyse the provided knowledge graph data and produce a useful summary.';
  if (module.user_context) {
    systemPrompt += `\n\nAdditional user instructions: ${module.user_context}`;
  }
  if (isCustomModule) {
    systemPrompt += `\n\nIMPORTANT OUTPUT FORMAT: Your "content" output will be displayed DIRECTLY in a newsletter email and digest UI — it will NOT be further summarised. Therefore:
- Follow the user's instructions exactly for what information to include
- Keep the output concise and scannable (200-400 words max)
- Use short paragraphs and bullet points for data
- Do NOT use large headers or section titles (the module name is already shown as a header)
- Think of this as writing a section of a newsletter, not a full report
- Include specific numbers, names, and facts — avoid vague generalisations`;
  }

  const moduleName = template?.name || module.custom_name || 'Custom Module';
  const moduleIcon = template?.iconName || 'Sparkles';

  const nodeSummary = graphContext.nodes.slice(0, 100).map(n =>
    `- [${n.entity_type}] ${n.label}${n.description ? `: ${n.description.slice(0, 100)}` : ''}`
  ).join('\n');

  const edgeSummary = graphContext.edges.slice(0, 80).map(e =>
    `- ${e.source_node_id?.slice(0, 8)} --[${e.relation_type}]--> ${e.target_node_id?.slice(0, 8)}${e.evidence ? ` (${e.evidence.slice(0, 60)})` : ''}`
  ).join('\n');

  const anchorSummary = graphContext.anchors.map(a =>
    `- [Anchor] ${a.label} (${a.entity_type})${a.description ? `: ${a.description.slice(0, 80)}` : ''}`
  ).join('\n');

  const scopeNote = scope?.mode === 'selected'
    ? `\n=== SCOPE ===\nThis digest focuses on selected anchors only. Only the anchors listed below are in scope for this analysis. Do NOT flag unlisted anchors as neglected, missing, or requiring attention — they are intentionally excluded from this digest.\n`
    : '';

  const prompt = `${systemPrompt}

=== CONTEXT ===
Reporting period: ${timeRange.from.slice(0, 10)} to ${timeRange.to.slice(0, 10)}
Frequency: ${frequency}
Density level: ${density}
${scopeNote}
=== ANCHORS (Priority Projects/Goals) ===
${anchorSummary || '(No anchors configured)'}

=== RECENT NODES (${graphContext.nodes.length} total) ===
${nodeSummary || '(No nodes in this period)'}

=== RECENT EDGES (${graphContext.edges.length} total) ===
${edgeSummary || '(No edges in this period)'}

Provide your analysis as structured JSON. The "content" field should be your full markdown-formatted analysis. The "highlights" should be 3-5 concise key bullet points summarising the most important findings. If there is insufficient data, explain what kinds of knowledge would help.`;

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
            content: { type: Type.STRING, description: 'Full markdown-formatted analysis' },
            highlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-5 concise key bullet points',
            },
            entities_referenced: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Node IDs referenced in analysis',
            },
          },
          required: ['content', 'highlights'],
        },
      },
    });

    const parsed = safeExtractJSON(response, `sub-agent:${moduleName}`);

    if (!parsed) {
      return {
        module_id: module.id,
        module_name: moduleName,
        icon: moduleIcon,
        template_id: module.template_id,
        content: 'Analysis could not be generated — the AI returned an unparseable response. Try regenerating the digest.',
        highlights: [],
        entities_referenced: [],
        raw_data: { nodes_count: graphContext.nodes.length, edges_count: graphContext.edges.length },
      };
    }

    return {
      module_id: module.id,
      module_name: moduleName,
      icon: moduleIcon,
      template_id: module.template_id,
      content: parsed.content || 'No analysis generated.',
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      entities_referenced: Array.isArray(parsed.entities_referenced) ? parsed.entities_referenced : [],
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

async function runMetaAgent(
  moduleOutputs: DigestModuleOutput[],
  frequency: ScheduleFrequency,
  density: string,
  recentHistory: DigestHistoryEntry[],
  scope?: DigestScope
): Promise<{ executive_summary: string; suggested_next_steps: DigestAction[] }> {
  const ai = initGenAI();

  const modulesSummary = moduleOutputs.map(o =>
    `--- ${o.module_name} ---\n${o.content}\nHighlights: ${o.highlights.join('; ')}`
  ).join('\n\n');

  const historySummary = recentHistory.slice(0, 3).map(h =>
    `[${h.delivered_at?.slice(0, 10)}] ${h.content?.executive_summary || 'No summary'}`
  ).join('\n');

  const scopeInstruction = scope?.mode === 'selected'
    ? `\nScope: This digest is focused on selected anchors only. Do not reference, flag, or recommend action for anchors that are not part of the selected scope. Only analyse what is in scope.\n`
    : '';

  const prompt = `You synthesise intelligence module outputs into a coherent briefing.
${scopeInstruction}
=== MODULE OUTPUTS ===
${modulesSummary}

=== RECENT DIGEST HISTORY (for cross-digest awareness) ===
${historySummary || '(No previous digests)'}

Digest frequency: ${frequency}
Density: ${density}

Write a 2-4 sentence executive summary capturing the single most important insight across all modules. Then derive 3-5 concrete, specific next-step actions.`;

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
            executive_summary: { type: Type.STRING, description: '2-4 sentence synthesis' },
            suggested_next_steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  action: { type: Type.STRING },
                  rationale: { type: Type.STRING },
                  priority: { type: Type.STRING, description: 'high, medium, or low' },
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

    const parsed = safeExtractJSON(response, 'meta-agent');

    return {
      executive_summary: parsed?.executive_summary || 'Digest generated successfully.',
      suggested_next_steps: Array.isArray(parsed?.suggested_next_steps) ? parsed.suggested_next_steps : [],
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
  onProgress?: (progress: GenerationProgress) => void
): Promise<DigestHistoryEntry | null> {
  const startTime = Date.now();
  const steps: AgentProgressStep[] = [];

  const emitProgress = (phase: AgentPhase, overallStatus: string, graphStats?: { nodes: number; edges: number; anchors: number }) => {
    onProgress?.({
      phase,
      overallStatus,
      steps: [...steps],
      graphStats,
      startedAt: startTime,
      elapsedMs: Date.now() - startTime,
    });
  };

  // Phase: Init
  steps.push({ phase: 'init', status: 'running', detail: 'Loading digest profile configuration...', startedAt: Date.now() });
  emitProgress('init', 'Initialising digest generation...');

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

  steps[0].status = 'complete';
  steps[0].completedAt = Date.now();
  steps[0].detail = `Loaded "${profile.name}" with ${activeModules.length} active modules`;

  // Pre-populate sub-agent steps
  for (let i = 0; i < activeModules.length; i++) {
    const mod = activeModules[i];
    const template = mod.template_id ? getDigestTemplate(mod.template_id) || null : null;
    steps.push({
      phase: 'sub_agent',
      module: template?.name || mod.custom_name || 'Custom Module',
      moduleIndex: i,
      totalModules: activeModules.length,
      status: 'pending',
      detail: 'Waiting...',
    });
  }
  // Meta-agent step
  steps.push({
    phase: 'meta_agent',
    module: 'Executive Synthesis',
    status: 'pending',
    detail: 'Waiting for sub-agents to complete...',
  });
  // Saving step
  steps.push({
    phase: 'saving',
    module: 'Finalising',
    status: 'pending',
    detail: 'Waiting...',
  });

  // Phase: Gather graph data
  steps.push({ phase: 'gathering', status: 'running', detail: 'Scanning knowledge graph for recent activity...', startedAt: Date.now() });
  emitProgress('gathering', 'Scanning your knowledge graph...');

  const { data: historyEntry } = await saveDigestResult({
    digest_profile_id: profileId,
    content: {},
    module_outputs: [],
    status: 'generating',
  });

  try {
    const timeRange = getTimeRange(profile.frequency);
    const graphContext = await gatherGraphContext(userId, timeRange, profile.scope);

    const graphStats = {
      nodes: graphContext.nodes.length,
      edges: graphContext.edges.length,
      anchors: graphContext.anchors.length,
    };

    // Update gathering step
    const gatherIdx = steps.findIndex(s => s.phase === 'gathering');
    if (gatherIdx >= 0) {
      steps[gatherIdx].status = 'complete';
      steps[gatherIdx].completedAt = Date.now();
      steps[gatherIdx].detail = `Found ${graphStats.nodes} nodes, ${graphStats.edges} edges, ${graphStats.anchors} anchors`;
    }

    emitProgress('sub_agent', 'Running intelligence sub-agents...', graphStats);

    // Phase: Execute sub-agents
    const moduleOutputs: DigestModuleOutput[] = [];
    for (let i = 0; i < activeModules.length; i++) {
      const mod = activeModules[i];
      const template = mod.template_id ? getDigestTemplate(mod.template_id) || null : null;
      const stepIdx = steps.findIndex(s => s.phase === 'sub_agent' && s.moduleIndex === i);

      // Mark running
      if (stepIdx >= 0) {
        steps[stepIdx].status = 'running';
        steps[stepIdx].startedAt = Date.now();
        steps[stepIdx].detail = `Analysing graph data through ${template?.name || 'custom'} lens...`;
      }
      emitProgress('sub_agent', `Running ${template?.name || mod.custom_name || 'Module'} agent...`, graphStats);

      const output = await executeSubAgent(
        mod, template, graphContext,
        profile.frequency, profile.density, timeRange, profile.scope
      );
      moduleOutputs.push(output);

      // Mark complete
      if (stepIdx >= 0) {
        const hasError = output.content.startsWith('Error');
        steps[stepIdx].status = hasError ? 'error' : 'complete';
        steps[stepIdx].completedAt = Date.now();
        steps[stepIdx].detail = hasError
          ? output.content
          : `Generated ${output.highlights.length} highlights`;
        if (hasError) steps[stepIdx].error = output.content;
      }
      emitProgress('sub_agent', `Completed ${template?.name || mod.custom_name || 'Module'}`, graphStats);
    }

    // Phase: Meta-agent
    const metaIdx = steps.findIndex(s => s.phase === 'meta_agent');
    if (metaIdx >= 0) {
      steps[metaIdx].status = 'running';
      steps[metaIdx].startedAt = Date.now();
      steps[metaIdx].detail = 'Synthesising insights across all modules...';
    }
    emitProgress('meta_agent', 'Synthesising executive summary...', graphStats);

    const recentHistory = await fetchDigestHistory(undefined, 5);
    // Only pass successful module outputs to the meta-agent — error outputs would confuse synthesis
    const successfulOutputs = moduleOutputs.filter(o => !o.content.startsWith('Error') && !o.content.startsWith('Analysis could not'));
    const { executive_summary, suggested_next_steps } = await runMetaAgent(
      successfulOutputs.length > 0 ? successfulOutputs : moduleOutputs,
      profile.frequency, profile.density, recentHistory, profile.scope
    );

    if (metaIdx >= 0) {
      steps[metaIdx].status = 'complete';
      steps[metaIdx].completedAt = Date.now();
      steps[metaIdx].detail = `Generated summary with ${suggested_next_steps.length} action items`;
    }

    // Phase: Save
    const saveIdx = steps.findIndex(s => s.phase === 'saving');
    if (saveIdx >= 0) {
      steps[saveIdx].status = 'running';
      steps[saveIdx].startedAt = Date.now();
      steps[saveIdx].detail = 'Saving digest to history...';
    }
    emitProgress('saving', 'Saving digest...', graphStats);

    const digestOutput: DigestOutput = {
      generated_at: new Date().toISOString(),
      digest_profile_id: profileId,
      frequency: profile.frequency,
      executive_summary,
      sections: moduleOutputs.map(o => ({
        module_id: o.module_id,
        module_name: o.module_name,
        icon: o.icon,
        template_id: o.template_id,
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

    if (historyEntry) {
      await updateDigestHistoryStatus(historyEntry.id, {
        status: 'completed',
        channels_delivered: ['in_app'],
      });
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

    if (saveIdx >= 0) {
      steps[saveIdx].status = 'complete';
      steps[saveIdx].completedAt = Date.now();
      steps[saveIdx].detail = `Digest saved (${(generationTime / 1000).toFixed(1)}s total)`;
    }
    emitProgress('complete', 'Digest generation complete!', graphStats);

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
    const errorStep = steps.find(s => s.status === 'running');
    if (errorStep) {
      errorStep.status = 'error';
      errorStep.error = (error as Error).message;
    }
    emitProgress('error', `Generation failed: ${(error as Error).message}`);

    if (historyEntry) {
      await updateDigestHistoryStatus(historyEntry.id, {
        status: 'failed',
        error_details: (error as Error).message,
      });
    }
    return null;
  }
}

// ─── Custom Module Prompt Generator ──────────────────────────

export async function generateCustomModulePrompt(
  name: string,
  lookFor: string,
  prioritise: string,
  outputFormat: string,
): Promise<string> {
  const ai = initGenAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `You are a meta-prompt engineer. Generate a system prompt for a knowledge graph analysis sub-agent.

The user wants a custom module called "${name}" that:
- Looks for: ${lookFor}
- Prioritises: ${prioritise}
- Output format: ${outputFormat}

Generate a detailed, professional system prompt (200-400 words) that instructs the sub-agent to:
1. Analyse the user's knowledge graph data
2. Focus specifically on what the user described
3. Use the prioritisation criteria they specified
4. Output in their preferred format
5. Be concise and factual

Return ONLY the system prompt text, no additional commentary.`,
    config: {
      maxOutputTokens: 1000,
      temperature: 0.7,
    },
  });
  return response.text?.trim() || '';
}
