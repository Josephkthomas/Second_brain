// Vercel API endpoint for finalizing a watch history import
// POST /api/youtube/finalize-import
// PRD Sections 9-10: Merge, resolve, and persist extracted knowledge

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

// Cross-connection schema (same as process.ts)
const CROSS_CONNECTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      newNodeLabel: { type: Type.STRING },
      existingNodeLabel: { type: Type.STRING },
      relation: { type: Type.STRING },
      evidence: { type: Type.STRING },
    },
    required: ['newNodeLabel', 'existingNodeLabel', 'relation'],
  },
};

interface MergedNode {
  label: string;
  normalizedLabel: string;
  type: string;
  description: string;
  confidence: number;
  tags: string[];
  total_view_weight: number;
  source_batches: string[];
  batch_count: number;
}

interface MergedEdge {
  source: string;
  target: string;
  relation: string;
  evidence: string;
  weight: number;
}

/**
 * Merge entities across all batches (PRD Section 9.2)
 */
function mergeEntities(
  batchResults: { batch_id: string; nodes: any[]; edges: any[]; summary: string }[]
): { nodes: MergedNode[]; edges: MergedEdge[] } {
  // Merge nodes
  const nodeMap = new Map<string, MergedNode>();

  for (const batch of batchResults) {
    for (const node of batch.nodes) {
      const normalized = (node.label || '').toLowerCase().trim();
      const existing = nodeMap.get(normalized);

      if (existing) {
        // Merge: take highest confidence, union tags, sum view weights, keep longest description
        existing.confidence = Math.max(existing.confidence, node.confidence || 0.5);
        existing.total_view_weight += node.view_weight || 1;
        existing.source_batches.push(batch.batch_id);
        existing.batch_count++;
        if ((node.description || '').length > existing.description.length) {
          existing.description = node.description;
        }
        const newTags = node.tags || [];
        for (const tag of newTags) {
          if (!existing.tags.includes(tag)) existing.tags.push(tag);
        }
      } else {
        nodeMap.set(normalized, {
          label: node.label || 'Unknown',
          normalizedLabel: normalized,
          type: node.type || 'Topic',
          description: node.description || '',
          confidence: node.confidence || 0.5,
          tags: node.tags || [],
          total_view_weight: node.view_weight || 1,
          source_batches: [batch.batch_id],
          batch_count: 1,
        });
      }
    }
  }

  // Merge edges
  const edgeMap = new Map<string, MergedEdge>();

  for (const batch of batchResults) {
    for (const edge of batch.edges) {
      const key = `${(edge.source || '').toLowerCase()}→${(edge.target || '').toLowerCase()}→${(edge.relation || 'relates_to').toLowerCase()}`;
      const existing = edgeMap.get(key);

      if (existing) {
        existing.weight = Math.max(existing.weight, edge.weight || 0.6);
        if (edge.evidence && !existing.evidence.includes(edge.evidence)) {
          existing.evidence += '; ' + edge.evidence;
        }
      } else {
        edgeMap.set(key, {
          source: edge.source || '',
          target: edge.target || '',
          relation: (edge.relation || 'relates_to').toLowerCase().replace(/\s+/g, '_'),
          evidence: edge.evidence || '',
          weight: edge.weight || 0.6,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

/**
 * Generate cross-connections between new nodes and existing graph (same pattern as process.ts)
 */
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
Role: Knowledge Graph Weaver — Cross-Reference Agent

Your task is to find meaningful connections between NEW nodes from a YouTube watch history import and EXISTING nodes in the user's knowledge graph.

## Connection Guidelines:
1. Only create edges where there's a genuine semantic relationship
2. Don't force connections - if entities are truly unrelated, don't connect them
3. Prioritize connections to ANCHORS (user's priority focus areas)
4. Use appropriate relation types: leads_to, supports, blocks, depends_on, part_of, mentions, relates_to, enables, recommends, teaches, discusses, applies_to

## Important:
- Return connections using the EXACT label strings provided
- newNodeLabel must match a label from NEW NODES exactly
- existingNodeLabel must match a label from EXISTING NODES or ANCHORS exactly
`;

  const newNodesList = newNodes.slice(0, 50).map(n => `- "${n.label}" (${n.type}): ${n.description}`).join('\n');
  const anchorsList = anchors.slice(0, 20).map(n => `- [ANCHOR] "${n.label}"${n.description ? `: ${n.description}` : ''}`).join('\n');
  const existingNodesList = existingNodes.slice(0, 50).map(n => `- "${n.label}" (${n.entity_type})`).join('\n');

  const prompt = `
NEW NODES (from YouTube watch history import):
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
        responseSchema: CROSS_CONNECTION_SCHEMA,
      },
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
    console.error('[Finalize] Cross-connection generation error:', error);
    return [];
  }
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

  const { batchResults, metadata, options } = req.body || {};

  if (!batchResults || !Array.isArray(batchResults) || batchResults.length === 0) {
    return res.status(400).json({ error: 'batchResults array is required' });
  }

  const startTime = Date.now();
  const supabase = getSupabase();

  try {
    console.log(`[Finalize] Starting import finalization for user ${user.id} with ${batchResults.length} batches`);

    // Step 1: Cross-batch entity merge
    const { nodes: mergedNodes, edges: mergedEdges } = mergeEntities(batchResults);
    console.log(`[Finalize] Merged: ${mergedNodes.length} unique nodes, ${mergedEdges.length} unique edges`);

    // Step 2: Fetch existing graph context
    const { data: existingNodes } = await supabase
      .from('knowledge_nodes')
      .select('id, label, entity_type, description, tags, confidence')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    const { data: allAnchors } = await supabase
      .from('knowledge_nodes')
      .select('id, label, description, entity_type')
      .eq('user_id', user.id)
      .eq('is_anchor', true);

    const existingNodesList = existingNodes || [];
    const anchorsList = allAnchors || [];

    console.log(`[Finalize] Found ${existingNodesList.length} existing nodes, ${anchorsList.length} anchors`);

    // Step 3: Label matching — classify each merged entity
    const existingLabelMap = new Map<string, { id: string; label: string; entity_type: string; description?: string; tags?: string[]; confidence?: number }>();
    for (const node of existingNodesList) {
      existingLabelMap.set(node.label.toLowerCase().trim(), node);
    }
    for (const anchor of anchorsList) {
      existingLabelMap.set(anchor.label.toLowerCase().trim(), anchor);
    }

    const matchedNodes: { merged: MergedNode; existing: typeof existingNodesList[0] }[] = [];
    const newNodes: MergedNode[] = [];

    for (const merged of mergedNodes) {
      const existing = existingLabelMap.get(merged.normalizedLabel);
      if (existing) {
        matchedNodes.push({ merged, existing });
      } else {
        newNodes.push(merged);
      }
    }

    console.log(`[Finalize] Classification: ${matchedNodes.length} matched, ${newNodes.length} new`);

    // Step 4: Enrich matched nodes
    let nodesEnriched = 0;
    for (const { merged, existing } of matchedNodes) {
      const enrichmentSuffix = ` [Watch History: Referenced across ${merged.batch_count} content cluster${merged.batch_count > 1 ? 's' : ''}, ${merged.total_view_weight} total video views]`;
      const existingDesc = existing.description || '';
      const newDesc = existingDesc.includes('[Watch History:')
        ? existingDesc // Already enriched from a previous import
        : existingDesc + enrichmentSuffix;

      // Union tags
      const existingTags: string[] = (existing as any).tags || [];
      const mergedTags = [...new Set([...existingTags, ...merged.tags])];

      const newConfidence = Math.max((existing as any).confidence || 0.5, merged.confidence);

      const { error: updateError } = await supabase
        .from('knowledge_nodes')
        .update({
          description: newDesc.slice(0, 5000),
          tags: mergedTags,
          confidence: newConfidence,
        })
        .eq('id', existing.id);

      if (!updateError) nodesEnriched++;
    }

    console.log(`[Finalize] Enriched ${nodesEnriched} existing nodes`);

    // Step 5: Insert new nodes
    const labelToId = new Map<string, string>();

    // Map matched labels to their existing IDs
    for (const { merged, existing } of matchedNodes) {
      labelToId.set(merged.label, existing.id);
    }

    let nodesCreated = 0;
    if (newNodes.length > 0) {
      const nodesToInsert = newNodes.map(node => {
        const id = crypto.randomUUID();
        labelToId.set(node.label, id);
        return {
          id,
          label: node.label,
          entity_type: node.type,
          description: node.description,
          confidence: node.confidence,
          tags: node.tags,
          source: 'YouTube Watch History Import',
          source_type: 'WatchHistory',
          user_id: user.id,
        };
      });

      // Insert in batches of 100 to avoid payload limits
      for (let i = 0; i < nodesToInsert.length; i += 100) {
        const batch = nodesToInsert.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from('knowledge_nodes')
          .insert(batch);

        if (insertError) {
          console.error(`[Finalize] Error inserting nodes batch ${i}:`, insertError);
        } else {
          nodesCreated += batch.length;
        }
      }
    }

    console.log(`[Finalize] Created ${nodesCreated} new nodes`);

    // Step 6: Cross-reference new nodes with existing graph
    let crossRefEdges: { newNodeLabel: string; existingNodeLabel: string; relation: string; evidence: string }[] = [];
    if (newNodes.length > 0 && (existingNodesList.length > 0 || anchorsList.length > 0)) {
      console.log('[Finalize] Generating cross-references...');
      crossRefEdges = await generateCrossConnections(
        newNodes.slice(0, 50).map(n => ({ label: n.label, type: n.type, description: n.description })),
        existingNodesList.slice(0, 50),
        anchorsList
      );
      console.log(`[Finalize] Generated ${crossRefEdges.length} cross-references`);
    }

    // Step 7: Insert all edges (3 layers)
    let internalEdges = 0;
    let crossReferenceEdges = 0;
    let enrichmentEdges = 0;
    let skippedDuplicate = 0;

    // Build a set of existing edges for deduplication
    const existingEdgeKeys = new Set<string>();
    const nodeIds = Array.from(labelToId.values());
    if (nodeIds.length > 0) {
      // Fetch existing edges involving our nodes (in batches)
      for (let i = 0; i < nodeIds.length; i += 100) {
        const batch = nodeIds.slice(i, i + 100);
        const { data: existingEdges } = await supabase
          .from('knowledge_edges')
          .select('source_node_id, target_node_id, relation_type')
          .or(`source_node_id.in.(${batch.join(',')}),target_node_id.in.(${batch.join(',')})`);

        for (const edge of existingEdges || []) {
          existingEdgeKeys.add(`${edge.source_node_id}→${edge.target_node_id}→${edge.relation_type}`);
        }
      }
    }

    // Layer 1: Internal edges (within watch history)
    const internalEdgesToInsert: any[] = [];
    for (const edge of mergedEdges) {
      const sourceId = labelToId.get(edge.source);
      const targetId = labelToId.get(edge.target);

      if (!sourceId || !targetId || sourceId === targetId) continue;

      const key = `${sourceId}→${targetId}→${edge.relation}`;
      if (existingEdgeKeys.has(key)) {
        skippedDuplicate++;
        continue;
      }

      existingEdgeKeys.add(key);
      internalEdgesToInsert.push({
        id: crypto.randomUUID(),
        source_node_id: sourceId,
        target_node_id: targetId,
        relation_type: edge.relation,
        evidence: (edge.evidence || '').slice(0, 1000),
        weight: Math.min(edge.weight, 0.8),
        user_id: user.id,
      });
    }

    // Layer 2: Cross-reference edges (new → existing)
    const crossEdgesToInsert: any[] = [];
    for (const conn of crossRefEdges) {
      const sourceId = labelToId.get(conn.newNodeLabel);
      const targetNode = existingLabelMap.get(conn.existingNodeLabel.toLowerCase().trim());
      const targetId = targetNode?.id;

      if (!sourceId || !targetId || sourceId === targetId) continue;

      const relation = (conn.relation || 'relates_to').toLowerCase().replace(/\s+/g, '_');
      const key = `${sourceId}→${targetId}→${relation}`;
      if (existingEdgeKeys.has(key)) {
        skippedDuplicate++;
        continue;
      }

      existingEdgeKeys.add(key);
      crossEdgesToInsert.push({
        id: crypto.randomUUID(),
        source_node_id: sourceId,
        target_node_id: targetId,
        relation_type: relation,
        evidence: conn.evidence || 'Cross-referenced from watch history import',
        weight: 0.7,
        user_id: user.id,
      });
    }

    // Layer 3: Enrichment edges (between existing nodes revealed by watch history)
    const enrichmentEdgesToInsert: any[] = [];
    for (const edge of mergedEdges) {
      const sourceMatch = existingLabelMap.get(edge.source.toLowerCase().trim());
      const targetMatch = existingLabelMap.get(edge.target.toLowerCase().trim());

      if (!sourceMatch || !targetMatch) continue;
      if (sourceMatch.id === targetMatch.id) continue;

      // Both source and target map to existing nodes
      const key = `${sourceMatch.id}→${targetMatch.id}→${edge.relation}`;
      if (existingEdgeKeys.has(key)) {
        skippedDuplicate++;
        continue;
      }

      existingEdgeKeys.add(key);
      enrichmentEdgesToInsert.push({
        id: crypto.randomUUID(),
        source_node_id: sourceMatch.id,
        target_node_id: targetMatch.id,
        relation_type: edge.relation,
        evidence: `Revealed by watch history: ${(edge.evidence || '').slice(0, 500)}`,
        weight: 0.6,
        user_id: user.id,
      });
    }

    // Insert all edges in batches
    const allEdges = [...internalEdgesToInsert, ...crossEdgesToInsert, ...enrichmentEdgesToInsert];
    for (let i = 0; i < allEdges.length; i += 100) {
      const batch = allEdges.slice(i, i + 100);
      const { error: edgesError } = await supabase
        .from('knowledge_edges')
        .insert(batch);

      if (edgesError) {
        console.error(`[Finalize] Error inserting edges batch ${i}:`, edgesError);
      }
    }

    internalEdges = internalEdgesToInsert.length;
    crossReferenceEdges = crossEdgesToInsert.length;
    enrichmentEdges = enrichmentEdgesToInsert.length;

    console.log(`[Finalize] Edges: ${internalEdges} internal, ${crossReferenceEdges} cross-ref, ${enrichmentEdges} enrichment, ${skippedDuplicate} skipped`);

    // Step 8: Save knowledge_source record
    const dateRange = metadata?.dateRange || { earliest: '', latest: '' };
    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .insert({
        title: `YouTube Watch History Import (${dateRange.earliest?.split('T')[0] || '?'} → ${dateRange.latest?.split('T')[0] || '?'})`,
        content: null,
        source_type: 'WatchHistory',
        metadata: {
          import_type: 'google_takeout',
          total_entries: metadata?.totalParsed || 0,
          unique_videos: metadata?.uniqueVideos || 0,
          unique_channels: metadata?.uniqueChannels || 0,
          date_range: dateRange,
          batches_processed: batchResults.length,
          skipped: {
            ads: metadata?.skippedAds || 0,
            deleted: metadata?.skippedDeleted || 0,
            shorts: metadata?.skippedShorts || 0,
          },
          processing_duration_ms: Date.now() - startTime,
          filters_applied: {
            includeShorts: options?.includeShorts || false,
            minViewCount: options?.minViewCount || 1,
          },
          nodes_created: nodesCreated,
          nodes_enriched: nodesEnriched,
          edges_created: internalEdges + crossReferenceEdges + enrichmentEdges,
        },
        user_id: user.id,
      })
      .select('id')
      .single();

    if (sourceError) {
      console.error('[Finalize] Error saving knowledge source:', sourceError);
    }

    // Compute top entities by batch coverage
    const topEntities = mergedNodes
      .sort((a, b) => b.batch_count - a.batch_count)
      .slice(0, 10)
      .map(n => ({ label: n.label, batchCount: n.batch_count }));

    const processingDurationMs = Date.now() - startTime;
    console.log(`[Finalize] Complete in ${processingDurationMs}ms`);

    return res.status(200).json({
      success: true,
      sourceId: source?.id || null,
      nodesCreated,
      nodesEnriched,
      edges: {
        internal: internalEdges,
        crossReference: crossReferenceEdges,
        enrichment: enrichmentEdges,
      },
      batchesProcessed: batchResults.length,
      batchesFailed: 0,
      processingDurationMs,
      topEntities,
    });
  } catch (error) {
    console.error('[Finalize] Error:', error);
    return res.status(500).json({
      error: 'Import finalization failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
