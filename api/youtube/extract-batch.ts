// Vercel API endpoint for extracting entities/edges from a single watch history batch
// POST /api/youtube/extract-batch
// PRD Section 8: Stage 4 — Entity & Edge Extraction

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

// Extraction schema for watch history batches
const WATCH_HISTORY_EXTRACTION_SCHEMA = {
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
          evidence: { type: Type.STRING },
          view_weight: { type: Type.NUMBER },
        },
        required: ['label', 'type', 'description', 'confidence'],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING },
          relation: { type: Type.STRING },
          evidence: { type: Type.STRING },
          weight: { type: Type.NUMBER },
        },
        required: ['source', 'target', 'relation'],
      },
    },
    batch_summary: { type: Type.STRING },
  },
};

/**
 * Build the extraction prompt for a watch history batch
 */
function buildWatchHistoryPrompt(
  batch: {
    batch_type: string;
    label: string;
    entries: { video_title: string; channel_name: string; view_count: number; first_watched: string; last_watched: string }[];
    total_views: number;
    channel_names: string[];
    channel_tags: string[];
    date_range: { start: string; end: string };
  },
  linkedAnchors: { label: string; description?: string }[],
  anchorEmphasis: string,
  extractionMode: string
): string {
  let prompt = `# Role: Watch History Knowledge Graph Analyst

You are analyzing a batch of YouTube video titles and channel names to extract a KNOWLEDGE GRAPH — both entities (nodes) AND relationships (edges). You are NOT reading transcripts — you are inferring entities, topics, and their CONNECTIONS from **title patterns, channel context, and viewing frequency**.

**CRITICAL: You MUST output both nodes AND edges. A graph without edges is useless. For every batch you should produce AT LEAST as many edges as nodes.**

## Batch Context
Batch: "${batch.label}" (${batch.batch_type}-based)
Videos: ${batch.entries.length} unique (${batch.total_views} total views)
${batch.channel_tags.length > 0 ? `Channel Tags: ${batch.channel_tags.join(', ')}` : ''}
Date Range: ${batch.date_range.start} → ${batch.date_range.end}
Channels: ${batch.channel_names.slice(0, 10).join(', ')}${batch.channel_names.length > 10 ? ` (+${batch.channel_names.length - 10} more)` : ''}

## Entity Types to Extract
- **Person**: Named individuals (creators, experts, public figures mentioned in titles)
- **Topic**: Subject areas the user is learning about
- **Organization**: Companies, teams, institutions
- **Product/Technology**: Tools, platforms, frameworks, specific products
- **Concept**: Abstract ideas, theories, frameworks, methodologies
- **Channel**: The YouTube channel itself as a knowledge source node
- **Skill**: Skills the user appears to be developing
- **Interest**: Identifiable interest clusters

## Edge Types to Create — YOU MUST CREATE EDGES
For EVERY node you extract, create at least one edge connecting it to another node. The edges array must NOT be empty.

**Required edge patterns (use these):**
- Channel \`teaches\` Topic — e.g., {"source": "Fireship", "target": "Web Development", "relation": "teaches"}
- Person \`discusses\` Topic — e.g., {"source": "Elon Musk", "target": "SpaceX", "relation": "discusses"}
- Topic \`relates_to\` Topic — e.g., {"source": "Machine Learning", "target": "Python", "relation": "relates_to"}
- Person \`created_by\` Channel — e.g., {"source": "Matt Wolfe", "target": "AI News", "relation": "created_by"}
- Product \`part_of\` Topic — e.g., {"source": "React", "target": "Frontend Development", "relation": "part_of"}
- Topic \`enables\` Skill — e.g., {"source": "TypeScript", "target": "Full-Stack Development", "relation": "enables"}
- Concept \`applies_to\` Topic — e.g., {"source": "RAG", "target": "LLM Applications", "relation": "applies_to"}
- Topic \`competes_with\` Topic — e.g., {"source": "Vue.js", "target": "React", "relation": "competes_with"}

**Additional relations:** \`supports\`, \`leads_to\`, \`consumes_alongside\`, \`discovered_via\`, \`bridges\`, \`evolved_into\`, \`blocks\`, \`challenges\`

**IMPORTANT:** The "source" and "target" in every edge MUST exactly match a node "label" from your nodes array. Do not use labels that don't exist in nodes.

## CRITICAL RULES
1. **EDGES ARE MANDATORY** — you must return at least 1 edge per node. Aim for 1.5x-2x edges relative to nodes. A response with 0 edges is WRONG.
2. **Extract the KNOWLEDGE SUBSTANCE** — not just topic labels. "Claude Code" not just "AI Tool".
3. **Weight by viewing frequency** — entities from videos watched 3x+ should get higher view_weight and confidence.
4. **Find cross-domain connections** — the most valuable extraction is when titles reveal connections between different domains.
5. **Every node needs edges** — no orphan nodes. If a node has no edge, either add an edge or remove the node.
6. **Evidence field** — cite specific video titles that support each entity/edge.
7. **Be specific** — "GPT-4o" not "AI model", "n8n" not "automation tool".
`;

  // Extraction mode instructions
  if (extractionMode === 'comprehensive' || extractionMode === 'relational') {
    prompt += `\n## Mode: Comprehensive\nExtract ALL meaningful entities. Create dense edges. Aim for 15-40 nodes and 25-60 edges (1.5-2x nodes).\n`;
  } else if (extractionMode === 'strategic') {
    prompt += `\n## Mode: Strategic\nFocus on high-level topics, goals, and strategic themes. 10-25 nodes and 15-40 edges.\n`;
  } else if (extractionMode === 'actionable') {
    prompt += `\n## Mode: Actionable\nFocus on skills, tools, and actionable knowledge. 10-25 nodes and 15-40 edges.\n`;
  }

  // Anchor injection
  if (linkedAnchors.length > 0) {
    prompt += `\n## Priority Anchors — find connections to these:\n`;
    for (const anchor of linkedAnchors) {
      prompt += `- "${anchor.label}"${anchor.description ? `: ${anchor.description}` : ''}\n`;
    }

    if (anchorEmphasis === 'aggressive') {
      prompt += `\nIMPORTANT: Strongly prioritize content related to these anchors. Create edges connecting extracted entities to these anchor topics.\n`;
    } else if (anchorEmphasis === 'passive') {
      prompt += `\nNote: Look for connections to these anchors while also capturing general content.\n`;
    } else {
      prompt += `\nFind connections to these anchors where relevant, but also capture general content.\n`;
    }
  }

  // Video list
  prompt += `\n## Video List\n`;
  for (const entry of batch.entries) {
    const viewTag = entry.view_count > 1 ? ` [watched ${entry.view_count}x]` : '';
    const date = entry.last_watched.split('T')[0] || '';
    prompt += `- "${entry.video_title}" by ${entry.channel_name} (${date})${viewTag}\n`;
  }

  prompt += `\n## Output Requirements
1. **nodes**: Array of entities extracted (15-40 for comprehensive mode)
2. **edges**: Array of relationships between nodes — MUST NOT BE EMPTY. Every edge source/target must match a node label exactly. Aim for MORE edges than nodes.
3. **batch_summary**: 2-3 sentence narrative of what this viewing pattern reveals about the user's interests.

REMINDER: If your edges array is empty or has fewer entries than your nodes array, you are doing it wrong. Go back and create edges connecting your nodes.\n`;

  return prompt;
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

  const { batch, options } = req.body || {};

  if (!batch || !batch.entries || batch.entries.length === 0) {
    return res.status(400).json({ error: 'batch with entries is required' });
  }

  try {
    const supabase = getSupabase();
    const ai = getGenAI();

    // Fetch linked anchors if any
    let linkedAnchors: { label: string; description?: string }[] = [];
    if (options?.linkedAnchorIds?.length > 0) {
      const { data: anchorsData } = await supabase
        .from('knowledge_nodes')
        .select('label, description')
        .in('id', options.linkedAnchorIds)
        .eq('is_anchor', true);
      linkedAnchors = anchorsData || [];
    }

    // Build prompt
    const systemPrompt = buildWatchHistoryPrompt(
      batch,
      linkedAnchors,
      options?.anchorEmphasis || 'standard',
      options?.extractionMode || 'comprehensive'
    );

    // Call Gemini
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Extract knowledge graph entities (nodes) AND relationships (edges) from the video titles listed in your instructions. You MUST return both a populated nodes array and a populated edges array. Every node should connect to at least one other node via an edge.',
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: WATCH_HISTORY_EXTRACTION_SCHEMA,
      },
    });

    // Parse response
    let result;
    try {
      result = JSON.parse(response.text || '{}');
    } catch {
      const text = response.text || '{}';
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        result = JSON.parse(text.substring(start, end + 1));
      } else {
        result = { nodes: [], edges: [], batch_summary: '' };
      }
    }

    let nodes = Array.isArray(result.nodes) ? result.nodes : [];
    let edges = Array.isArray(result.edges) ? result.edges : [];

    // Fallback: if model returned nodes but very few/no edges, generate basic edges
    if (nodes.length > 0 && edges.length < nodes.length * 0.5) {
      const fallbackEdges = generateFallbackEdges(nodes, batch.label, batch.channel_names);
      edges = [...edges, ...fallbackEdges];
    }

    return res.status(200).json({
      nodes,
      edges,
      batch_summary: result.batch_summary || '',
    });
  } catch (error) {
    console.error('[Extract Batch] Error:', error);
    return res.status(500).json({
      error: 'Batch extraction failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generate basic edges when the model fails to produce enough.
 * Connects nodes to the channel node and creates relates_to edges between same-type nodes.
 */
function generateFallbackEdges(
  nodes: { label: string; type: string; description?: string }[],
  batchLabel: string,
  channelNames: string[]
): { source: string; target: string; relation: string; evidence: string; weight: number }[] {
  const edges: { source: string; target: string; relation: string; evidence: string; weight: number }[] = [];
  const existingPairs = new Set<string>();

  // Find Channel-type nodes, or use the batch label as a hub
  const channelNodes = nodes.filter(n => n.type === 'Channel');
  const hubLabel = channelNodes.length > 0
    ? channelNodes[0].label
    : nodes.find(n => n.type === 'Interest' || n.type === 'Topic')?.label;

  if (!hubLabel) return edges;

  // Connect non-hub nodes to the hub via appropriate relations
  for (const node of nodes) {
    if (node.label === hubLabel) continue;

    const pairKey = `${hubLabel}->${node.label}`;
    if (existingPairs.has(pairKey)) continue;
    existingPairs.add(pairKey);

    let relation = 'relates_to';
    if (node.type === 'Topic' || node.type === 'Concept') {
      relation = channelNodes.length > 0 ? 'teaches' : 'relates_to';
    } else if (node.type === 'Person') {
      relation = 'discusses';
    } else if (node.type === 'Product/Technology') {
      relation = 'discusses';
    } else if (node.type === 'Skill') {
      relation = 'enables';
    }

    edges.push({
      source: hubLabel,
      target: node.label,
      relation,
      evidence: `Inferred from batch "${batchLabel}"`,
      weight: 0.5,
    });
  }

  // Connect Topic/Concept nodes to each other via relates_to (up to 10 extra edges)
  const topicNodes = nodes.filter(n => n.type === 'Topic' || n.type === 'Concept' || n.type === 'Product/Technology');
  let extraCount = 0;
  for (let i = 0; i < topicNodes.length && extraCount < 10; i++) {
    for (let j = i + 1; j < topicNodes.length && extraCount < 10; j++) {
      const pairKey = `${topicNodes[i].label}->${topicNodes[j].label}`;
      if (existingPairs.has(pairKey)) continue;
      existingPairs.add(pairKey);

      edges.push({
        source: topicNodes[i].label,
        target: topicNodes[j].label,
        relation: 'relates_to',
        evidence: `Co-occurring topics in batch "${batchLabel}"`,
        weight: 0.4,
      });
      extraCount++;
    }
  }

  return edges;
}
