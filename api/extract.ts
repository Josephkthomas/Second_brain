// Vercel API endpoint for knowledge extraction
// POST /api/extract
// Body: { sourceId: string }
// Headers: Authorization: Bearer <jwt>

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

// Environment variables (set in Vercel dashboard)
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

// Initialize clients
const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Chunking utilities for RAG grounding
function chunkText(text: string, targetTokens = 500, overlapTokens = 100): string[] {
  if (!text || text.trim().length === 0) return [];
  const targetWords = Math.floor(targetTokens * 0.75);
  const overlapWords = Math.floor(overlapTokens * 0.75);
  const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [text];
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;
    if (currentWordCount + sentenceWords > targetWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' ').trim());
      let overlapCount = 0;
      const overlapSentences: string[] = [];
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const words = currentChunk[i].split(/\s+/).length;
        if (overlapCount + words > overlapWords) break;
        overlapCount += words;
        overlapSentences.unshift(currentChunk[i]);
      }
      currentChunk = [...overlapSentences];
      currentWordCount = overlapCount;
    }
    currentChunk.push(sentence.trim());
    currentWordCount += sentenceWords;
  }
  if (currentChunk.length > 0) {
    const lastChunk = currentChunk.join(' ').trim();
    if (lastChunk.length > 50) chunks.push(lastChunk);
  }
  return chunks;
}

async function generateChunkEmbedding(text: string): Promise<number[]> {
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768 },
    });
    return result.embeddings?.[0]?.values || [];
  } catch {
    return [];
  }
}

// JSON parsing helper
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

// Extraction system instruction
const EXTRACTION_SYSTEM_INSTRUCTION = `
# Role: Elite Knowledge Graph Engineer
You are an advanced AI system designed to exhaustively mine unstructured text and structure it into a high-fidelity Knowledge Graph.
Your goal is **Total Information Capture**.

## Ontology
- **Person**, **Organization**, **Topic**, **Project**, **Goal**
- **Decision**, **Action**, **Insight**, **Hypothesis**, **Question**
- **Risk**, **Blocker**, **Achievement**, **Feedback**

## Rules
- **Specificity**: Never use generic labels. "Q3 Budget", not "Budget".
- **Quotes**: Extract verbatim evidence for every node.
- **Search Tags**: Generate 3-5 keywords for retrieval.
`;

// Extraction schema
const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        sourceTitle: { type: Type.STRING },
        sourceType: { type: Type.STRING },
        sourceUrl: { type: Type.STRING },
        thumbnailUrl: { type: Type.STRING }
      },
      required: ['sourceTitle', 'sourceType']
    },
    searchQueries: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
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
        }
      }
    }
  }
};

// Extract knowledge from text
async function extractKnowledgeFromText(text: string, context: { type: string; title: string; url?: string }) {
  const ai = getGenAI();
  const contextHeader = `USER CONTEXT: Type: ${context.type}, Title: ${context.title}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Input Text:\n"""\n${text.slice(0, 25000)}\n"""`,
    config: {
      temperature: 0.1,
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + '\n' + contextHeader,
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_SCHEMA
    }
  });

  const result = cleanAndParseJSON(response.text || '{}');
  if (!result.metadata) {
    result.metadata = { sourceTitle: context.title, sourceType: context.type };
  }

  return {
    metadata: result.metadata,
    nodes: Array.isArray(result.nodes) ? result.nodes : [],
    edges: Array.isArray(result.edges) ? result.edges : [],
    searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
  };
}

// Main handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const jwt = authHeader.slice(7);

  try {
    const supabase = getSupabase();

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get source ID from request body
    const { sourceId } = req.body;
    if (!sourceId) {
      return res.status(400).json({ error: 'sourceId is required' });
    }

    // Fetch the knowledge source
    const { data: source, error: fetchError } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !source) {
      return res.status(404).json({ error: 'Source not found or access denied' });
    }

    // Check if already extracted
    if (source.metadata?.extraction_pending === false) {
      return res.status(400).json({ error: 'Source has already been extracted' });
    }

    // Extract knowledge
    const extracted = await extractKnowledgeFromText(source.content, {
      type: source.source_type,
      title: source.title,
      url: source.source_url
    });

    if (extracted.nodes.length === 0) {
      return res.status(200).json({
        success: true,
        nodesCreated: 0,
        edgesCreated: 0,
        message: 'No knowledge nodes extracted from content'
      });
    }

    // Prepare nodes for insertion
    const nodesToInsert = extracted.nodes.map((node: any) => ({
      id: crypto.randomUUID(),
      label: node.label,
      entity_type: node.type,
      description: node.description,
      confidence: node.confidence,
      tags: node.tags || [],
      quote: node.quote || '',
      source: source.title,
      source_type: source.source_type,
      source_url: source.source_url,
      source_id: source.id,
      user_id: user.id
    }));

    // Create label to ID mapping
    const labelToId: Record<string, string> = {};
    nodesToInsert.forEach((node: any) => {
      labelToId[node.label] = node.id;
    });

    // Insert nodes
    const { error: nodesError } = await supabase
      .from('knowledge_nodes')
      .insert(nodesToInsert);

    if (nodesError) {
      console.error('Error inserting nodes:', nodesError);
      return res.status(500).json({ error: 'Failed to insert nodes' });
    }

    // Prepare edges for insertion
    const edgesToInsert = extracted.edges
      .filter((edge: any) => labelToId[edge.source] && labelToId[edge.target])
      .map((edge: any) => ({
        id: crypto.randomUUID(),
        source_node_id: labelToId[edge.source],
        target_node_id: labelToId[edge.target],
        relation_type: edge.relation?.toLowerCase().replace(/\s+/g, '_') || 'relates_to',
        evidence: edge.evidence || '',
        weight: 1.0,
        user_id: user.id
      }));

    // Insert edges if any
    let edgesCreated = 0;
    if (edgesToInsert.length > 0) {
      const { error: edgesError } = await supabase
        .from('knowledge_edges')
        .insert(edgesToInsert);

      if (edgesError) {
        console.error('Error inserting edges:', edgesError);
        // Don't fail completely, nodes were inserted
      } else {
        edgesCreated = edgesToInsert.length;
      }
    }

    // Chunk and embed source content for RAG grounding (non-blocking)
    let chunksCreated = 0;
    if (source.content && source.content.length > 200) {
      try {
        const textChunks = chunkText(source.content);
        const chunksToInsert: any[] = [];
        for (let i = 0; i < textChunks.length; i++) {
          const embedding = await generateChunkEmbedding(textChunks[i]);
          if (embedding.length > 0) {
            chunksToInsert.push({
              source_id: sourceId,
              chunk_index: i,
              content: textChunks[i],
              token_count: Math.ceil(textChunks[i].split(/\s+/).length / 0.75),
              embedding,
              user_id: user.id,
            });
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (chunksToInsert.length > 0) {
          const { error: chunkError } = await supabase
            .from('knowledge_source_chunks')
            .insert(chunksToInsert);
          if (!chunkError) chunksCreated = chunksToInsert.length;
          else console.error('Chunk insert error:', chunkError);
        }
      } catch (chunkErr) {
        console.warn('Source chunking failed (non-blocking):', chunkErr);
      }
    }

    // Update source metadata to mark as extracted
    await supabase
      .from('knowledge_sources')
      .update({
        metadata: {
          ...source.metadata,
          extraction_pending: false,
          extracted_at: new Date().toISOString(),
          nodes_created: nodesToInsert.length,
          edges_created: edgesCreated,
          chunks_created: chunksCreated
        }
      })
      .eq('id', sourceId);

    return res.status(200).json({
      success: true,
      nodesCreated: nodesToInsert.length,
      edgesCreated
    });

  } catch (error) {
    console.error('Extraction error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Extraction failed'
    });
  }
}
