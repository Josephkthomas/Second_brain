// Vercel Cron endpoint for processing Universal Ingest queue
// POST /api/ingest/process (called by Vercel Cron every 5 minutes)
// Processes pending items: extract knowledge -> cross-connect -> embed -> save to graph

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Max items per cron batch (Vercel has 10-60s timeout depending on plan)
const MAX_ITEMS_PER_BATCH = 3;
const MAX_ITEMS_PROCESS_ALL = 10;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

// ---------- Auth Helpers ----------

function verifyCronAuth(req: VercelRequest): boolean {
  const cronAuth = req.headers['authorization'];
  if (cronAuth === `Bearer ${CRON_SECRET}`) return true;
  const vercelSignature = req.headers['x-vercel-signature'];
  if (vercelSignature) return true;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !CRON_SECRET) return true;
  return !CRON_SECRET;
}

async function verifyUserAuth(req: VercelRequest): Promise<{ user: { id: string } | null; isCron: boolean }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, isCron: false };
  }

  const token = authHeader.slice(7);

  if (token === CRON_SECRET) {
    return { user: { id: 'cron' }, isCron: true };
  }

  if (req.headers['x-vercel-signature']) {
    return { user: { id: 'cron' }, isCron: true };
  }

  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, isCron: false };
  }

  return { user: { id: user.id }, isCron: false };
}

// ---------- JSON Parsing ----------

const cleanAndParseJSON = (text: string) => {
  if (!text) return {};
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try { return JSON.parse(clean.substring(start, end + 1)); } catch { }
    }
    const startArr = clean.indexOf('[');
    const endArr = clean.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      try { return JSON.parse(clean.substring(startArr, endArr + 1)); } catch { }
    }
    return {};
  }
};

// ---------- Gemini Schemas ----------

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          type: { type: Type.STRING },
          description: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          quote: { type: Type.STRING }
        },
        required: ['label', 'type', 'description', 'confidence']
      }
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING },
          relation: { type: Type.STRING },
          evidence: { type: Type.STRING }
        },
        required: ['source', 'target', 'relation']
      }
    }
  }
};

const CROSS_CONNECTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      newNodeLabel: { type: Type.STRING },
      existingNodeLabel: { type: Type.STRING },
      relation: { type: Type.STRING },
      evidence: { type: Type.STRING }
    },
    required: ['newNodeLabel', 'existingNodeLabel', 'relation']
  }
};

// ---------- Extraction ----------

function buildExtractionPrompt(
  title: string,
  sourceType: string,
  extractionMode: string,
  anchors: { label: string; description?: string }[],
  anchorEmphasis: string,
  customInstructions?: string | null
): string {
  let prompt = `
# Role: Elite Knowledge Graph Engineer

You are an advanced AI system designed to exhaustively mine unstructured text and structure it into a high-fidelity Knowledge Graph.
Your PRIMARY goal is **Total Information Capture** with **Comprehensive Relationship Extraction**.

## Content Context
- Title: ${title}
- Source Type: ${sourceType}

## Entity Ontology (use these standardized types)
- **Person**: Individuals mentioned by name
- **Organization**: Companies, institutions, agencies
- **Topic**: Subject areas, domains, themes discussed
- **Project**: Initiatives, products, efforts mentioned
- **Goal**: Objectives, targets, desired outcomes
- **Action**: Tasks, recommendations, next steps
- **Insight**: Key learnings, realizations, important points
- **Decision**: Choices made, commitments
- **Risk**: Potential problems, warnings
- **Question**: Open questions raised
- **Idea**: Proposals, suggestions, concepts
- **Concept**: Abstract ideas, frameworks, theories, models
- **Takeaway**: Key points, summary conclusions
- **Technology**: Tools, platforms, technical systems
- **Product**: Software, services, books, resources
- **Metric**: Data points, statistics, numbers
- **Event**: Past or future events mentioned

## Relationship Types
- **leads_to**: Causal relationship
- **supports**: Reinforcement
- **blocks**: Prevention
- **depends_on**: Dependency
- **part_of**: Composition
- **mentions**: Reference
- **authored**: Creation
- **conflicts_with**: Opposition
- **relates_to**: General connection
- **enables**: Facilitation
- **recommends**: Suggestion
- **works_at**: Employment
- **created**: Authorship

## CRITICAL EXTRACTION RULES
1. **Specificity**: Use specific labels. "GPT-4" not "AI model". "Simon Sinek" not "speaker".
2. **COMPREHENSIVE EDGES**: Extract ALL relationships - THIS IS THE MOST IMPORTANT RULE.
   - Every entity should connect to at least 1-2 other entities
   - Look for implicit relationships, not just explicit ones
3. **Evidence**: Include quotes or evidence for important claims.
4. **Tags**: Generate 2-4 search keywords per entity.
5. **Confidence**: Rate 0.8-1.0 for explicit facts, 0.5-0.7 for opinions, 0.3-0.5 for brief mentions.
6. **No Orphan Nodes**: NEVER leave a node without any edges.
`;

  // Extraction mode
  if (extractionMode === 'strategic') {
    prompt += `\n## Extraction Mode: Strategic\nPrioritize: Goals, Decisions, Insights, high-level concepts. Focus on the "big picture".\n`;
  } else if (extractionMode === 'actionable') {
    prompt += `\n## Extraction Mode: Actionable\nPrioritize: Actions, Goals, Blockers, Decisions. Focus on ownership and next steps.\n`;
  } else if (extractionMode === 'relational') {
    prompt += `\n## Extraction Mode: Relational\nEmphasize connections and patterns between entities. Focus on relationship density.\n`;
  } else {
    prompt += `\n## Extraction Mode: Comprehensive (DEFAULT)\nExtract ALL meaningful entities and relationships. Be thorough - capture 20-50+ nodes for long-form content.\nCreate 1.5-2x as many edges as nodes (dense connectivity).\n`;
  }

  // Anchor context
  if (anchors.length > 0) {
    prompt += `\n## Priority Anchors (User's Key Focus Areas)\nExtract information relevant to these anchors and CREATE EDGES TO THEM:\n`;
    for (const anchor of anchors) {
      prompt += `- **${anchor.label}**${anchor.description ? `: ${anchor.description}` : ''}\n`;
    }

    if (anchorEmphasis === 'aggressive') {
      prompt += `\nIMPORTANT: Strongly prioritize content related to these anchors.\n`;
    } else if (anchorEmphasis === 'passive') {
      prompt += `\nNote: Look for connections to these anchors while also capturing general content.\n`;
    } else {
      prompt += `\nLook for connections to these anchors with moderate emphasis.\n`;
    }
  }

  // Custom instructions
  if (customInstructions?.trim()) {
    prompt += `\n## Custom User Instructions (HIGHEST PRIORITY)\n${customInstructions.trim()}\n`;
  }

  return prompt;
}

async function extractFromContent(
  content: string,
  title: string,
  sourceType: string,
  extractionMode: string,
  anchors: { label: string; description?: string }[],
  anchorEmphasis: string,
  customInstructions?: string | null
): Promise<{ nodes: any[]; edges: any[] }> {
  const ai = getGenAI();

  const systemPrompt = buildExtractionPrompt(
    title, sourceType, extractionMode,
    anchors, anchorEmphasis, customInstructions
  );

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Content to analyze:\n"""\n${content.slice(0, 25000)}\n"""\n\nExtract comprehensive knowledge graph nodes AND edges. CRITICAL: Create edges between ALL related entities.`,
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const result = cleanAndParseJSON(response.text || '{}');
    return {
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
    };
  } catch (error) {
    console.error('[Ingest Process] Extraction error:', error);
    return { nodes: [], edges: [] };
  }
}

// ---------- Cross-Connections ----------

async function generateCrossConnections(
  newNodes: { label: string; type: string; description: string }[],
  existingNodes: { id: string; label: string; entity_type: string; description?: string }[],
  anchors: { id: string; label: string; description?: string }[]
): Promise<{ newNodeLabel: string; existingNodeLabel: string; relation: string; evidence: string }[]> {
  if (newNodes.length === 0 || (existingNodes.length === 0 && anchors.length === 0)) {
    return [];
  }

  const ai = getGenAI();

  const systemInstruction = `
Role: Knowledge Graph Weaver - Cross-Reference Agent

Your task is to find meaningful connections between NEW nodes and EXISTING nodes in the user's knowledge graph.

## Connection Guidelines:
1. Only create edges where there's a genuine semantic relationship
2. Don't force connections - if entities are truly unrelated, don't connect them
3. Prioritize connections to ANCHORS (user's priority focus areas)
4. Use appropriate relation types: leads_to, supports, blocks, depends_on, part_of, mentions, relates_to, enables, recommends

## Important:
- Return connections using the EXACT label strings provided
- newNodeLabel must match a label from NEW NODES exactly
- existingNodeLabel must match a label from EXISTING NODES or ANCHORS exactly
`;

  const newNodesList = newNodes.slice(0, 30).map(n => `- "${n.label}" (${n.type}): ${n.description}`).join('\n');
  const anchorsList = anchors.slice(0, 20).map(n => `- [ANCHOR] "${n.label}"${n.description ? `: ${n.description}` : ''}`).join('\n');
  const existingNodesList = existingNodes.slice(0, 40).map(n => `- "${n.label}" (${n.entity_type})`).join('\n');

  const prompt = `
NEW NODES (just extracted):
${newNodesList}

USER'S PRIORITY ANCHORS:
${anchorsList || '(none defined)'}

EXISTING KNOWLEDGE GRAPH NODES:
${existingNodesList || '(empty graph)'}

Find meaningful connections between NEW NODES and EXISTING NODES/ANCHORS.
Return as JSON array with exact label strings.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CROSS_CONNECTION_SCHEMA
      }
    });

    const text = response.text || '[]';
    try {
      return JSON.parse(text);
    } catch {
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        return JSON.parse(text.substring(start, end + 1));
      }
      return [];
    }
  } catch (error) {
    console.error('[Ingest Process] Cross-connection error:', error);
    return [];
  }
}

// ---------- Main Handler ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user, isCron } = await verifyUserAuth(req);

  if (!user && !verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  const { process_all = false } = req.body || {};
  const itemLimit = process_all ? MAX_ITEMS_PROCESS_ALL : MAX_ITEMS_PER_BATCH;

  try {
    console.log(`[Ingest Process] Starting (${isCron ? 'cron' : 'user: ' + user?.id}, process_all: ${process_all})...`);

    // Stale item recovery: reset items stuck in processing states > 5 min
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    const { data: staleItems } = await supabase
      .from('ingest_queue')
      .update({ status: 'pending', started_at: null })
      .in('status', ['extracting', 'cross_connecting', 'embedding'])
      .lt('started_at', staleThreshold)
      .select('id');

    if (staleItems && staleItems.length > 0) {
      console.log(`[Ingest Process] Reset ${staleItems.length} stale items to pending`);
    }

    // Fetch pending items
    let query = supabase
      .from('ingest_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(itemLimit);

    if (!isCron && user?.id && user.id !== 'cron') {
      query = query.eq('user_id', user.id);
    }

    const { data: queueItems, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!queueItems || queueItems.length === 0) {
      console.log('[Ingest Process] No pending items');
      return res.status(200).json({
        success: true,
        processed: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[Ingest Process] Processing ${queueItems.length} items`);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const item of queueItems) {
      const itemStartTime = Date.now();

      try {
        console.log(`[Ingest Process] Processing: ${item.title}`);

        // Step 1: Mark as extracting
        await supabase
          .from('ingest_queue')
          .update({ status: 'extracting', started_at: new Date().toISOString() })
          .eq('id', item.id);

        // Step 2: Save knowledge source
        const { data: source, error: sourceError } = await supabase
          .from('knowledge_sources')
          .insert({
            title: item.title,
            content: item.content.substring(0, 100000),
            source_type: item.source_type,
            source_url: item.source_url,
            metadata: {
              ...item.metadata,
              api_ingested: true,
              queued_at: item.created_at,
              extraction_mode: item.extraction_mode,
            },
            user_id: item.user_id,
          })
          .select('id')
          .single();

        if (sourceError) {
          console.error('[Ingest Process] Error saving source:', sourceError);
        }

        // Step 3: Fetch linked anchors if configured
        let linkedAnchors: { id: string; label: string; description?: string }[] = [];
        if (item.linked_anchor_ids && item.linked_anchor_ids.length > 0) {
          const { data: anchorsData } = await supabase
            .from('knowledge_nodes')
            .select('id, label, description')
            .in('id', item.linked_anchor_ids)
            .eq('is_anchor', true);
          linkedAnchors = anchorsData || [];
        }

        // Step 4: Extract knowledge
        const extracted = await extractFromContent(
          item.content,
          item.title,
          item.source_type,
          item.extraction_mode || 'comprehensive',
          linkedAnchors,
          item.anchor_emphasis || 'standard',
          item.custom_instructions
        );

        console.log(`[Ingest Process] Extracted ${extracted.nodes.length} nodes, ${extracted.edges.length} internal edges`);

        if (extracted.nodes.length === 0) {
          // No nodes extracted — mark completed with zero counts
          await supabase
            .from('ingest_queue')
            .update({
              status: 'completed',
              source_id: source?.id || null,
              nodes_created: 0,
              edges_created: 0,
              completed_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          results.push({ id: item.id, status: 'completed' });
          continue;
        }

        // Step 5: Mark cross_connecting
        await supabase
          .from('ingest_queue')
          .update({ status: 'cross_connecting' })
          .eq('id', item.id);

        // Step 6: Fetch existing nodes for cross-referencing
        const { data: existingNodes } = await supabase
          .from('knowledge_nodes')
          .select('id, label, entity_type, description')
          .eq('user_id', item.user_id)
          .neq('source_id', source?.id || 'none')
          .order('created_at', { ascending: false })
          .limit(100);

        // Fetch all user anchors
        const { data: allAnchors } = await supabase
          .from('knowledge_nodes')
          .select('id, label, description')
          .eq('user_id', item.user_id)
          .eq('is_anchor', true);

        const existingNodesList = existingNodes || [];
        const anchorsList = allAnchors || [];

        console.log(`[Ingest Process] Found ${existingNodesList.length} existing nodes, ${anchorsList.length} anchors`);

        // Step 7: Generate cross-connections
        let crossConnections: { newNodeLabel: string; existingNodeLabel: string; relation: string; evidence: string }[] = [];
        if (existingNodesList.length > 0 || anchorsList.length > 0) {
          const newNodesForCrossRef = extracted.nodes.map((n: any) => ({
            label: n.label,
            type: n.type,
            description: n.description
          }));

          crossConnections = await generateCrossConnections(
            newNodesForCrossRef,
            existingNodesList,
            anchorsList
          );

          console.log(`[Ingest Process] Generated ${crossConnections.length} cross-connections`);
        }

        // Step 8: Mark embedding
        await supabase
          .from('ingest_queue')
          .update({ status: 'embedding' })
          .eq('id', item.id);

        // Step 9: Insert nodes
        const labelToId: Record<string, string> = {};
        let nodesCreated = 0;

        if (extracted.nodes.length > 0) {
          const nodesToInsert = extracted.nodes.map((node: any) => {
            const id = crypto.randomUUID();
            labelToId[node.label] = id;
            return {
              id,
              label: node.label,
              entity_type: node.type,
              description: node.description,
              confidence: node.confidence,
              tags: node.tags || [],
              quote: node.quote || '',
              source: item.title,
              source_type: item.source_type,
              source_url: item.source_url,
              source_id: source?.id || null,
              user_id: item.user_id,
            };
          });

          const { error: nodesError } = await supabase
            .from('knowledge_nodes')
            .insert(nodesToInsert);

          if (nodesError) {
            console.error('[Ingest Process] Error inserting nodes:', nodesError);
          } else {
            nodesCreated = nodesToInsert.length;
          }

          // Step 10: Generate embeddings
          if (nodesCreated > 0) {
            console.log(`[Ingest Process] Generating embeddings for ${nodesCreated} nodes...`);
            const ai = getGenAI();

            for (const node of nodesToInsert) {
              try {
                const text = `${node.label}: ${node.description || ''}`;
                const result = await ai.models.embedContent({
                  model: 'text-embedding-004',
                  contents: text,
                });
                const embedding = result.embeddings?.[0]?.values || [];

                if (embedding.length > 0) {
                  await supabase
                    .from('knowledge_nodes')
                    .update({ embedding })
                    .eq('id', node.id);
                }

                // Rate limit protection
                await new Promise(resolve => setTimeout(resolve, 100));
              } catch (embError) {
                console.error(`[Ingest Process] Embedding failed for ${node.label}:`, embError);
              }
            }
            console.log('[Ingest Process] Embedding generation complete');
          }
        }

        // Step 11: Insert internal edges
        let edgesCreated = 0;
        if (extracted.edges.length > 0) {
          const edgesToInsert = extracted.edges
            .filter((edge: any) => labelToId[edge.source] && labelToId[edge.target])
            .map((edge: any) => ({
              id: crypto.randomUUID(),
              source_node_id: labelToId[edge.source],
              target_node_id: labelToId[edge.target],
              relation_type: (edge.relation || 'relates_to').toLowerCase().replace(/\s+/g, '_'),
              evidence: edge.evidence || '',
              weight: 1.0,
              user_id: item.user_id,
            }));

          if (edgesToInsert.length > 0) {
            const { error: edgesError } = await supabase
              .from('knowledge_edges')
              .insert(edgesToInsert);

            if (edgesError) {
              console.error('[Ingest Process] Error inserting internal edges:', edgesError);
            } else {
              edgesCreated = edgesToInsert.length;
              console.log(`[Ingest Process] Created ${edgesCreated} internal edges`);
            }
          }
        }

        // Step 12: Insert cross-connection edges
        if (crossConnections.length > 0) {
          const existingLabelToId: Record<string, string> = {};
          for (const node of existingNodesList) {
            existingLabelToId[node.label] = node.id;
          }
          for (const anchor of anchorsList) {
            existingLabelToId[anchor.label] = anchor.id;
          }

          const crossEdges = crossConnections
            .filter(conn =>
              labelToId[conn.newNodeLabel] &&
              existingLabelToId[conn.existingNodeLabel]
            )
            .map(conn => ({
              id: crypto.randomUUID(),
              source_node_id: labelToId[conn.newNodeLabel],
              target_node_id: existingLabelToId[conn.existingNodeLabel],
              relation_type: (conn.relation || 'relates_to').toLowerCase().replace(/\s+/g, '_'),
              evidence: conn.evidence || `Cross-referenced from: ${item.title}`,
              weight: 0.8,
              user_id: item.user_id,
            }));

          if (crossEdges.length > 0) {
            const { error: crossEdgesError } = await supabase
              .from('knowledge_edges')
              .insert(crossEdges);

            if (crossEdgesError) {
              console.error('[Ingest Process] Error inserting cross-edges:', crossEdgesError);
            } else {
              edgesCreated += crossEdges.length;
              console.log(`[Ingest Process] Created ${crossEdges.length} cross-reference edges`);
            }
          }
        }

        // Step 13: Mark completed
        await supabase
          .from('ingest_queue')
          .update({
            status: 'completed',
            source_id: source?.id || null,
            nodes_created: nodesCreated,
            edges_created: edgesCreated,
            completed_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'completed' });
        console.log(`[Ingest Process] Completed: ${item.title} (${Date.now() - itemStartTime}ms, ${nodesCreated} nodes, ${edgesCreated} edges)`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Ingest Process] Failed: ${item.title}:`, errorMessage);

        await supabase
          .from('ingest_queue')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'failed', error: errorMessage });
      }
    }

    const duration = Date.now() - startTime;
    const completed = results.filter(r => r.status === 'completed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    // Check remaining
    let remainingQuery = supabase
      .from('ingest_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (!isCron && user?.id && user.id !== 'cron') {
      remainingQuery = remainingQuery.eq('user_id', user.id);
    }

    const { count: remainingCount } = await remainingQuery;

    console.log(`[Ingest Process] Done. ${completed} succeeded, ${failed} failed, ${remainingCount || 0} remaining in ${duration}ms`);

    return res.status(200).json({
      success: true,
      processed: results.length,
      completed,
      failed,
      remaining: remainingCount || 0,
      results,
      duration_ms: duration,
    });

  } catch (error) {
    console.error('[Ingest Process] Fatal error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Processing failed',
      duration_ms: Date.now() - startTime,
    });
  }
}
