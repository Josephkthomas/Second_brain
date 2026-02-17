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

You are analyzing a batch of YouTube video titles and channel names to extract the knowledge graph that lives in the aggregate viewing pattern. You are NOT reading transcripts — you are inferring entities, topics, and relationships from **title patterns, channel context, and viewing frequency**.

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

## Edge Types to Create
1. **Knowledge source edges**: Channel X \`teaches\` Topic Y, Person X \`discusses\` Concept Y
2. **Thematic bridges**: Concept X \`applies_to\` Topic Y (cross-domain connections)
3. **Temporal evolution**: Topic X \`evolved_into\` Topic Y (if title dates suggest progression)
4. **Standard semantic edges**: \`part_of\`, \`enables\`, \`relates_to\`, \`created_by\`, \`competes_with\`
5. **Additional**: \`teaches\`, \`discusses\`, \`consumes_alongside\`, \`discovered_via\`, \`bridges\`

## CRITICAL RULES
1. **Extract the KNOWLEDGE SUBSTANCE** — not just topic labels. "Claude Code" not just "AI Tool".
2. **Weight by viewing frequency** — entities from videos watched 3x+ should get higher view_weight and confidence.
3. **Find cross-domain connections** — the most valuable extraction is when titles reveal connections between different domains.
4. **Every node needs edges** — no orphan nodes.
5. **Evidence field** — cite specific video titles that support each entity/edge.
6. **Be specific** — "GPT-4o" not "AI model", "n8n" not "automation tool".
`;

  // Extraction mode instructions
  if (extractionMode === 'comprehensive' || extractionMode === 'relational') {
    prompt += `\n## Mode: Comprehensive\nExtract ALL meaningful entities. Create dense edges. Aim for 15-40 nodes with 1.5-2x as many edges.\n`;
  } else if (extractionMode === 'strategic') {
    prompt += `\n## Mode: Strategic\nFocus on high-level topics, goals, and strategic themes. 10-25 nodes.\n`;
  } else if (extractionMode === 'actionable') {
    prompt += `\n## Mode: Actionable\nFocus on skills, tools, and actionable knowledge. 10-25 nodes.\n`;
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

  prompt += `\n## Output\nProvide a batch_summary (2-3 sentence narrative of what this viewing pattern reveals about the user's interests) along with nodes and edges.\n`;

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
      contents: 'Extract knowledge graph entities and edges from the video titles listed in your instructions.',
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

    return res.status(200).json({
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
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
