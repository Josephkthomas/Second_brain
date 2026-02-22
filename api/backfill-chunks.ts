// Vercel API endpoint for retroactive source chunking
// POST /api/backfill-chunks
// Headers: Authorization: Bearer <jwt> or Bearer <CRON_SECRET>
// Body (optional): { limit?: number } — max sources to process (default 50)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const getGenAI = () => new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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

async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getGenAI();
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: { outputDimensionality: 768 },
    });
    return result.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error('Embedding failed:', error);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabase();
  let userFilter: string | null = null;

  if (token === CRON_SECRET) {
    userFilter = null; // Process all users
  } else {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    userFilter = user.id;
  }

  const limit = Math.min(req.body?.limit || 50, 200);
  const startTime = Date.now();

  const progress = {
    sourcesProcessed: 0,
    chunksCreated: 0,
    sourcesFailed: 0,
    sourcesSkipped: 0,
    remaining: 0,
    duration_ms: 0,
  };

  try {
    // Find sources with content long enough to chunk
    let query = supabase
      .from('knowledge_sources')
      .select('id, content, user_id')
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (userFilter) query = query.eq('user_id', userFilter);

    const { data: sources, error: fetchError } = await query;
    if (fetchError || !sources) {
      return res.status(500).json({ error: 'Failed to fetch sources', details: fetchError?.message });
    }

    for (const source of sources) {
      if (!source.content || source.content.length < 200) {
        progress.sourcesSkipped++;
        continue;
      }

      // Check if already chunked
      const { count } = await supabase
        .from('knowledge_source_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('source_id', source.id);

      if ((count || 0) > 0) {
        progress.sourcesSkipped++;
        continue;
      }

      try {
        const chunks = chunkText(source.content);
        const chunksToInsert: any[] = [];

        for (let i = 0; i < chunks.length; i++) {
          const embedding = await generateEmbedding(chunks[i]);
          if (embedding.length > 0) {
            chunksToInsert.push({
              source_id: source.id,
              chunk_index: i,
              content: chunks[i],
              token_count: Math.ceil(chunks[i].split(/\s+/).length / 0.75),
              embedding,
              user_id: source.user_id,
            });
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (chunksToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('knowledge_source_chunks')
            .insert(chunksToInsert);

          if (!insertError) {
            progress.chunksCreated += chunksToInsert.length;
            progress.sourcesProcessed++;
          } else {
            progress.sourcesFailed++;
            console.error(`Insert error for source ${source.id}:`, insertError);
          }
        }
      } catch (err) {
        progress.sourcesFailed++;
        console.error(`Failed to chunk source ${source.id}:`, err);
      }
    }

    // Count remaining unchunked sources
    let remainingQuery = supabase
      .from('knowledge_sources')
      .select('id', { count: 'exact', head: true })
      .not('content', 'is', null);

    if (userFilter) remainingQuery = remainingQuery.eq('user_id', userFilter);

    const { count: totalSources } = await remainingQuery;

    let chunkedQuery = supabase
      .from('knowledge_source_chunks')
      .select('source_id', { count: 'exact', head: true });

    // Approximate remaining = total sources - processed - previously chunked
    progress.remaining = Math.max(0, (totalSources || 0) - progress.sourcesProcessed - progress.sourcesSkipped);
    progress.duration_ms = Date.now() - startTime;

    return res.status(200).json(progress);
  } catch (error) {
    progress.duration_ms = Date.now() - startTime;
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Backfill failed',
      progress,
    });
  }
}
