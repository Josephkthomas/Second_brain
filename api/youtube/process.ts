// Vercel Cron endpoint for processing YouTube video queue
// POST /api/youtube/process (called by Vercel Cron every 5 minutes)
// Processes pending videos: fetch transcript -> extract knowledge -> save to graph

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const APIFY_API_KEY = process.env.APIFY_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET;

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

// Vercel serverless function config — extend timeout to 300s (Pro) or 60s (Hobby)
export const config = { maxDuration: 300 };

// Max items to process per batch — keep LOW to avoid Vercel timeout
// Each video takes 30-120s (transcript + Gemini + embeddings + cross-ref)
const MAX_ITEMS_PER_BATCH = 1;
// User-triggered: process 1 item per request, UI loops for remaining
const MAX_ITEMS_PROCESS_ALL = 1;

// Items stuck in processing states for longer than this are reset to failed
const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// Verify cron authorization
function verifyCronAuth(req: VercelRequest): boolean {
  const cronAuth = req.headers['authorization'];
  if (cronAuth === `Bearer ${CRON_SECRET}`) return true;
  const vercelSignature = req.headers['x-vercel-signature'];
  if (vercelSignature) return true;
  const userAgent = req.headers['user-agent'] || '';
  if (userAgent.includes('vercel-cron')) return true;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ') && !CRON_SECRET) return true;
  return !CRON_SECRET;
}

// Verify user JWT and return user info
async function verifyUserAuth(req: VercelRequest): Promise<{ user: { id: string } | null; isCron: boolean }> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, isCron: false };
  }

  const token = authHeader.slice(7);

  // Check if it's cron auth
  if (token === CRON_SECRET) {
    return { user: { id: 'cron' }, isCron: true };
  }

  // Check Vercel cron signature
  if (req.headers['x-vercel-signature']) {
    return { user: { id: 'cron' }, isCron: true };
  }

  // Try to verify as user JWT
  const supabase = getSupabase();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { user: null, isCron: false };
  }

  return { user: { id: user.id }, isCron: false };
}

// ── Inlined Transcript Extraction ────────────────────────────────
// Inlined to avoid cross-directory import bundling issues on Vercel serverless.
// Tiered extraction: youtube-caption-extractor → Innertube API → Apify → fail

interface TieredTranscriptResult {
  success: boolean;
  transcript: string | null;
  language: string | null;
  method: 'caption_extractor' | 'innertube' | 'apify' | 'manual';
  is_auto_generated: boolean;
  error?: string;
  duration_ms: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

async function tier1CaptionExtractor(videoId: string): Promise<string | null> {
  const { getSubtitles } = await import('youtube-caption-extractor');
  const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
  if (!subtitles || subtitles.length === 0) return null;
  const transcript = subtitles
    .map((s: { text: string }) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return transcript.length > 50 ? transcript : null;
}

async function fetchViaInnertube(videoId: string): Promise<string | null> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageResponse = await fetch(videoUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  const html = await pageResponse.text();
  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) return null;
  const apiKey = apiKeyMatch[1];

  const playerResponse = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '17.31.35', hl: 'en' } },
        videoId,
      }),
    }
  );
  const playerData = await playerResponse.json();
  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!captionTracks || captionTracks.length === 0) return null;

  const track = captionTracks.find((t: any) => t.languageCode === 'en') || captionTracks[0];
  if (!track?.baseUrl) return null;

  const captionResponse = await fetch(track.baseUrl);
  const captionXml = await captionResponse.text();

  const textSegments: string[] = [];
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = textRegex.exec(captionXml)) !== null) {
    let text = match[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, '')
      .trim();
    if (text) textSegments.push(text);
  }
  return textSegments.join(' ').replace(/\s+/g, ' ').trim() || null;
}

async function fetchViaApify(
  videoUrl: string,
  apifyApiKey: string
): Promise<{ success: boolean; transcript: string | null; language: string | null; is_auto_generated: boolean; error?: string }> {
  const APIFY_ACTOR_ID = 'pintostudio/youtube-transcript-scraper';
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID.replace('/', '~')}/runs?waitForFinish=55`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apifyApiKey}` },
      body: JSON.stringify({ videoUrl }),
    }
  );
  if (!runResponse.ok) {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: `Apify run failed: ${runResponse.status}` };
  }
  const runData = await runResponse.json();
  const runId = runData.data?.id;
  const status = runData.data?.status;
  if (status !== 'SUCCEEDED') {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: `Apify status: ${status}` };
  }
  const resultsResponse = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items`,
    { headers: { 'Authorization': `Bearer ${apifyApiKey}` } }
  );
  const results = await resultsResponse.json();
  if (!results || results.length === 0) {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: 'No transcript found' };
  }
  const firstResult = results[0];
  let transcript: string;
  if (firstResult.data && Array.isArray(firstResult.data)) {
    transcript = firstResult.data.map((seg: { text?: string }) => seg.text || '').join(' ').replace(/\s+/g, ' ').trim();
  } else if (firstResult.transcript) {
    transcript = firstResult.transcript;
  } else {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: 'Unexpected format' };
  }
  if (!transcript || transcript.length < 50) {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: 'Transcript too short' };
  }
  return { success: true, transcript, language: firstResult.language || 'en', is_auto_generated: firstResult.isAutoGenerated ?? true };
}

async function extractTranscript(
  videoId: string,
  videoUrl: string,
  apifyApiKey?: string
): Promise<TieredTranscriptResult> {
  const overallStart = Date.now();
  const errors: string[] = [];

  // Tier 1: youtube-caption-extractor
  try {
    console.log(`[Transcript] Tier 1: caption-extractor for ${videoId} (+${Date.now() - overallStart}ms)`);
    // Short timeout — YouTube blocks cloud/datacenter IPs, so this usually fails on Vercel
    const result = await withTimeout(tier1CaptionExtractor(videoId), 5000, 'Tier 1 timed out');
    if (result && result.length > 50) {
      console.log(`[Transcript] Tier 1 SUCCESS: ${result.length} chars`);
      return { success: true, transcript: result, language: 'en', method: 'caption_extractor', is_auto_generated: true, duration_ms: Date.now() - overallStart };
    }
    errors.push('Tier 1: Empty or too short');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 1: ${msg}`);
    console.warn(`[Transcript] Tier 1 failed: ${msg}`);
  }

  // Tier 2: Innertube API
  try {
    console.log(`[Transcript] Tier 2: Innertube for ${videoId} (+${Date.now() - overallStart}ms)`);
    // Short timeout — YouTube blocks cloud/datacenter IPs, so this usually fails on Vercel
    const result = await withTimeout(fetchViaInnertube(videoId), 5000, 'Tier 2 timed out');
    if (result && result.length > 50) {
      console.log(`[Transcript] Tier 2 SUCCESS: ${result.length} chars`);
      return { success: true, transcript: result, language: 'en', method: 'innertube', is_auto_generated: true, duration_ms: Date.now() - overallStart };
    }
    errors.push('Tier 2: Empty or too short');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 2: ${msg}`);
    console.warn(`[Transcript] Tier 2 failed: ${msg}`);
  }

  // Tier 3: Apify
  if (apifyApiKey) {
    try {
      console.log(`[Transcript] Tier 3: Apify for ${videoId} (+${Date.now() - overallStart}ms)`);
      const result = await withTimeout(fetchViaApify(videoUrl, apifyApiKey), 60000, 'Tier 3 timed out');
      if (result.success && result.transcript && result.transcript.length > 50) {
        console.log(`[Transcript] Tier 3 SUCCESS: ${result.transcript.length} chars`);
        return { success: true, transcript: result.transcript, language: result.language || 'en', method: 'apify', is_auto_generated: result.is_auto_generated, duration_ms: Date.now() - overallStart };
      }
      errors.push(`Tier 3: ${result.error || 'Empty transcript'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Tier 3: ${msg}`);
      console.warn(`[Transcript] Tier 3 failed: ${msg}`);
    }
  } else {
    errors.push('Tier 3: Apify API key not configured');
  }

  // All tiers failed
  console.error(`[Transcript] All tiers failed for ${videoId}:`, errors);
  return {
    success: false, transcript: null, language: null, method: 'manual', is_auto_generated: false,
    error: `All transcript extraction methods failed: ${errors.join('; ')}`,
    duration_ms: Date.now() - overallStart,
  };
}

// Extraction schema - comprehensive for knowledge graph
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

// Cross-connection schema for linking to existing nodes
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

// Build extraction system prompt based on channel settings
function buildExtractionSystemPrompt(
  videoTitle: string,
  channelName: string,
  extractionMode: string,
  anchorEmphasis: string,
  linkedAnchors: { label: string; description?: string }[],
  customInstructions?: string | null
): string {
  let prompt = `
# Role: Elite Knowledge Graph Engineer for YouTube Content

You are an advanced AI system designed to exhaustively mine YouTube video transcripts and structure them into a high-fidelity Knowledge Graph.
Your PRIMARY goal is **Total Information Capture** with **Comprehensive Relationship Extraction**.

## Video Context
- Title: ${videoTitle}
- Channel: ${channelName}

## Entity Ontology (use these standardized types)
- **Person**: Individuals mentioned by name (speakers, experts, guests)
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

## Relationship Types (CRITICAL - create edges between ALL related entities)
- **leads_to**: Causal relationship (A causes or enables B)
- **supports**: Reinforcement (A helps or supports B)
- **blocks**: Prevention (A prevents or hinders B)
- **depends_on**: Dependency (A requires B)
- **part_of**: Composition (A is contained within B)
- **mentions**: Reference (A references or discusses B)
- **authored**: Creation (Person created work)
- **conflicts_with**: Opposition (A contradicts B)
- **relates_to**: General connection
- **enables**: Facilitation (A makes B possible)
- **recommends**: Suggestion (A suggests using B)
- **works_at**: Employment (Person works at Organization)
- **created**: Authorship (Person/Org created Product/Project)

## CRITICAL EXTRACTION RULES
1. **Specificity**: Use specific labels. "GPT-4" not "AI model". "Simon Sinek" not "speaker".
2. **COMPREHENSIVE EDGES**: Extract ALL relationships - THIS IS THE MOST IMPORTANT RULE.
   - Every entity should connect to at least 1-2 other entities
   - Look for implicit relationships, not just explicit ones
   - Connect speakers to topics they discuss, products to companies that make them, etc.
3. **Evidence**: Include quotes or evidence for important claims.
4. **Tags**: Generate 2-4 search keywords per entity.
5. **Confidence**: Rate 0.8-1.0 for explicit facts, 0.5-0.7 for opinions, 0.3-0.5 for brief mentions.
6. **No Orphan Nodes**: NEVER leave a node without any edges.
`;

  // Add mode-specific instructions
  if (extractionMode === 'quick') {
    prompt += `
## Extraction Mode: Quick Summary
Focus on: Key takeaways, main speakers, core concepts (8-15 nodes max)
Skip: Minor details, tangential mentions, background context
Still maintain edge density - every node needs connections.
`;
  } else if (extractionMode === 'comprehensive') {
    prompt += `
## Extraction Mode: Comprehensive (DEFAULT)
Extract ALL meaningful entities and relationships. Include:
- Every person, organization, and product mentioned
- All key concepts and frameworks discussed
- Actionable insights and recommendations
- Questions raised and decisions made
- Be thorough - capture 20-50+ nodes for long-form content
- Create 1.5-2x as many edges as nodes (dense connectivity)
`;
  } else if (extractionMode === 'research') {
    prompt += `
## Extraction Mode: Research Focus
Prioritize: Facts, data points, methodologies, sources, citations
Create a network of verifiable information suitable for research.
Focus on: Claims, evidence, counter-arguments, methodologies
`;
  }

  // Add anchor context based on emphasis
  if (linkedAnchors.length > 0) {
    prompt += `
## Priority Anchors (User's Key Focus Areas)
These are the user's priority topics. Extract information relevant to these anchors and CREATE EDGES TO THEM:
`;
    for (const anchor of linkedAnchors) {
      prompt += `- **${anchor.label}**${anchor.description ? `: ${anchor.description}` : ''}\n`;
    }

    if (anchorEmphasis === 'focused') {
      prompt += `
IMPORTANT: Strongly prioritize content related to these anchors. Create edges connecting extracted entities to these anchor topics when relevant.
`;
    } else if (anchorEmphasis === 'exclusive') {
      prompt += `
IMPORTANT: ONLY extract content directly relevant to these anchors. Skip unrelated topics entirely.
`;
    } else {
      prompt += `
Note: Look for connections to these anchors while also capturing general content.
`;
    }
  }

  // Add custom instructions (highest priority)
  if (customInstructions && customInstructions.trim()) {
    prompt += `
## Custom User Instructions (HIGHEST PRIORITY - FOLLOW THESE EXACTLY)
${customInstructions.trim()}
`;
  }

  return prompt;
}

// Generate cross-connections between new nodes and existing database nodes
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

Your task is to find meaningful connections between NEW nodes from a YouTube video and EXISTING nodes in the user's knowledge graph.

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
NEW NODES (from the YouTube video just extracted):
${newNodesList}

USER'S PRIORITY ANCHORS (high-priority focal points):
${anchorsList || '(none defined)'}

EXISTING KNOWLEDGE GRAPH NODES:
${existingNodesList || '(empty graph)'}

Find meaningful connections between NEW NODES and EXISTING NODES/ANCHORS.
Return as JSON array with exact label strings.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
    console.error('[Process] Cross-connection generation error:', error);
    return [];
  }
}

// Extract knowledge from transcript with channel settings
async function extractFromTranscript(
  transcript: string,
  videoTitle: string,
  channelName: string,
  channelSettings: {
    extraction_mode?: string;
    anchor_emphasis?: string;
    linked_anchor_ids?: string[];
    custom_instructions?: string | null;
  },
  linkedAnchors: { label: string; description?: string }[]
): Promise<{ nodes: any[]; edges: any[] }> {
  const ai = getGenAI();

  const systemPrompt = buildExtractionSystemPrompt(
    videoTitle,
    channelName,
    channelSettings.extraction_mode || 'comprehensive',
    channelSettings.anchor_emphasis || 'standard',
    linkedAnchors,
    channelSettings.custom_instructions
  );

  // Clean transcript
  const cleanedTranscript = transcript
    .replace(/\[[\d:]+\]/g, '')
    .replace(/\([\d:]+\)/g, '')
    .replace(/\[(Music|Applause|Laughter)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `YouTube Video Transcript to analyze:\n"""\n${cleanedTranscript.slice(0, 30000)}\n"""\n\nExtract comprehensive knowledge graph nodes AND edges. CRITICAL: Create edges between ALL related entities - every node should have at least one connection.`,
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

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
        result = { nodes: [], edges: [] };
      }
    }

    return {
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
    };
  } catch (error) {
    console.error('Gemini extraction error:', error);
    return { nodes: [], edges: [] };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Try user auth first, then fall back to cron auth
  const { user, isCron } = await verifyUserAuth(req);

  if (!user && !verifyCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const startTime = Date.now();

  // Check for process_all mode (user clicked "Process Now" and wants all items processed)
  const { process_all = false } = req.body || {};
  const itemLimit = process_all ? MAX_ITEMS_PROCESS_ALL : MAX_ITEMS_PER_BATCH;

  try {
    console.log(`[Process] Starting queue processing (${isCron ? 'cron' : 'user: ' + user?.id}, process_all: ${process_all})...`);

    // ── Stuck item recovery ──────────────────────────────
    // Reset items stuck in fetching_transcript or extracting for > 10 minutes
    // Also catches items with NULL started_at (stuck from before this field existed)
    const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString();

    // Phase 1: Items with started_at older than 10 minutes
    {
      let stuckUpdate = supabase
        .from('youtube_ingestion_queue')
        .update({
          status: 'failed',
          error_message: 'Processing timed out (stuck for >10 minutes). Click retry to try again.',
          processing_step: null,
          completed_at: new Date().toISOString(),
        })
        .in('status', ['fetching_transcript', 'extracting'])
        .lt('started_at', stuckCutoff);

      if (!isCron && user?.id) {
        stuckUpdate = stuckUpdate.eq('user_id', user.id);
      }

      const { error: stuckError } = await stuckUpdate;
      if (stuckError) {
        console.warn('[Process] Failed to reset stuck items (with started_at):', stuckError.message);
      }
    }

    // Phase 2: Items with NULL started_at stuck in processing states
    {
      let stuckNullUpdate = supabase
        .from('youtube_ingestion_queue')
        .update({
          status: 'failed',
          error_message: 'Processing was interrupted (no start time recorded). Click retry to try again.',
          processing_step: null,
          completed_at: new Date().toISOString(),
        })
        .in('status', ['fetching_transcript', 'extracting'])
        .is('started_at', null);

      if (!isCron && user?.id) {
        stuckNullUpdate = stuckNullUpdate.eq('user_id', user.id);
      }

      const { error: stuckNullError } = await stuckNullUpdate;
      if (stuckNullError) {
        console.warn('[Process] Failed to reset stuck items (null started_at):', stuckNullError.message);
      }
    }

    console.log('[Process] Stuck item recovery complete');

    // Build query for pending items with channel AND playlist info
    let query = supabase
      .from('youtube_ingestion_queue')
      .select('*, youtube_channels(channel_name, extraction_mode, anchor_emphasis, linked_anchor_ids, custom_instructions), youtube_playlists(playlist_name, extraction_mode, anchor_emphasis, linked_anchor_ids, custom_instructions)')
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(itemLimit);

    // If user-triggered (not cron), only process that user's items
    if (!isCron && user?.id) {
      query = query.eq('user_id', user.id);
    }

    // Fetch pending items
    const { data: queueItems, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!queueItems || queueItems.length === 0) {
      // Diagnostic: check what items actually exist for this user
      let diagnostics: any = { reason: 'no_pending_items' };
      if (user?.id && user.id !== 'cron') {
        const { data: allItems, error: diagError } = await supabase
          .from('youtube_ingestion_queue')
          .select('id, status')
          .eq('user_id', user.id);

        if (!diagError && allItems) {
          const counts: Record<string, number> = {};
          for (const item of allItems) {
            counts[item.status] = (counts[item.status] || 0) + 1;
          }
          diagnostics.user_id = user.id;
          diagnostics.status_counts = counts;
          diagnostics.total_items = allItems.length;
        }
      }

      console.log('[Process] No pending items. Diagnostics:', JSON.stringify(diagnostics));
      return res.status(200).json({
        success: true,
        processed: 0,
        remaining: 0,
        diagnostics,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(`[Process] Processing ${queueItems.length} items`);

    const results: Array<{ id: string; status: string; error?: string }> = [];

    for (const item of queueItems) {
      const itemStartTime = Date.now();

      try {
        console.log(`[Process] Processing: ${item.video_title}`);

        // Mark as processing
        await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'fetching_transcript',
            processing_step: 'Fetching transcript...',
            started_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        // Fetch transcript using tiered extraction (free methods first, Apify as fallback)
        const videoId = item.video_id || item.video_url.match(/[?&]v=([^&]+)/)?.[1] || '';
        const transcriptResult = await extractTranscript(videoId, item.video_url, APIFY_API_KEY);

        if (!transcriptResult.success || !transcriptResult.transcript) {
          throw new Error(transcriptResult.error || 'Failed to fetch transcript');
        }

        console.log(`[Process] Transcript fetched via ${transcriptResult.method} (${transcriptResult.transcript.length} chars in ${transcriptResult.duration_ms}ms)`);

        // Update status to extracting
        const transcriptLen = (transcriptResult.transcript.length / 1000).toFixed(1);
        await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'extracting',
            processing_step: `Transcript fetched (${transcriptLen}k chars). Extracting knowledge...`,
            transcript: transcriptResult.transcript.substring(0, 50000), // Store truncated
            transcript_language: transcriptResult.language,
            transcript_fetched_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        // Check if item was force-cancelled while we were fetching transcript
        const { data: cancelCheck } = await supabase
          .from('youtube_ingestion_queue')
          .select('status')
          .eq('id', item.id)
          .single();
        if (cancelCheck?.status === 'failed') {
          console.log(`[Process] Item ${item.id} was force-cancelled, skipping extraction`);
          results.push({ queue_item_id: item.id, status: 'failed', nodes_created: 0, edges_created: 0, error: 'Force cancelled by user' });
          continue;
        }

        // Get extraction settings — prefer playlist settings for playlist-sourced items, fall back to channel
        const playlistSettings = item.youtube_playlists;
        const channelInfo = item.youtube_channels;
        const channelName = playlistSettings?.playlist_name || channelInfo?.channel_name || 'Unknown Source';
        const channelSettings = {
          extraction_mode: playlistSettings?.extraction_mode || channelInfo?.extraction_mode || 'comprehensive',
          anchor_emphasis: playlistSettings?.anchor_emphasis || channelInfo?.anchor_emphasis || 'standard',
          linked_anchor_ids: playlistSettings?.linked_anchor_ids || channelInfo?.linked_anchor_ids || [],
          custom_instructions: playlistSettings?.custom_instructions || channelInfo?.custom_instructions,
        };

        // Fetch linked anchors if any are configured
        let linkedAnchors: { id: string; label: string; description?: string }[] = [];
        if (channelSettings.linked_anchor_ids.length > 0) {
          const { data: anchorsData } = await supabase
            .from('knowledge_nodes')
            .select('id, label, description')
            .in('id', channelSettings.linked_anchor_ids)
            .eq('is_anchor', true);
          linkedAnchors = anchorsData || [];
          console.log(`[Process] Loaded ${linkedAnchors.length} linked anchors for channel`);
        }

        // Extract knowledge with channel settings
        const extracted = await extractFromTranscript(
          transcriptResult.transcript,
          item.video_title || 'Untitled Video',
          channelName,
          channelSettings,
          linkedAnchors
        );

        console.log(`[Process] Extracted ${extracted.nodes.length} nodes, ${extracted.edges.length} internal edges`);

        // Update processing step
        await supabase
          .from('youtube_ingestion_queue')
          .update({
            processing_step: `Extracted ${extracted.nodes.length} nodes, ${extracted.edges.length} edges. Saving to graph...`,
          })
          .eq('id', item.id);

        // Save knowledge source
        const { data: source, error: sourceError } = await supabase
          .from('knowledge_sources')
          .insert({
            title: item.video_title || 'Untitled Video',
            content: transcriptResult.transcript.substring(0, 100000),
            source_type: 'YouTube',
            source_url: item.video_url,
            metadata: {
              video_id: item.video_id,
              channel_name: channelName,
              thumbnail_url: item.thumbnail_url,
              published_at: item.published_at,
              transcript_language: transcriptResult.language,
            },
            user_id: item.user_id,
          })
          .select('id')
          .single();

        if (sourceError) {
          console.error('[Process] Error saving source:', sourceError);
        }

        // Insert nodes
        const labelToId: Record<string, string> = {};
        let nodesCreated = 0;

        if (extracted.nodes.length > 0) {
          const nodesToInsert = extracted.nodes.map(node => {
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
              source: item.video_title,
              source_type: 'YouTube',
              source_url: item.video_url,
              source_id: source?.id || null,
              user_id: item.user_id,
            };
          });

          const { error: nodesError } = await supabase
            .from('knowledge_nodes')
            .insert(nodesToInsert);

          if (nodesError) {
            console.error('[Process] Error inserting nodes:', nodesError);
          } else {
            nodesCreated = nodesToInsert.length;
          }
        }

        // Insert internal edges (relationships extracted from the video)
        let edgesCreated = 0;
        if (extracted.edges.length > 0) {
          const edgesToInsert = extracted.edges
            .filter(edge => labelToId[edge.source] && labelToId[edge.target])
            .map(edge => ({
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
              console.error('[Process] Error inserting internal edges:', edgesError);
            } else {
              edgesCreated = edgesToInsert.length;
              console.log(`[Process] Created ${edgesCreated} internal edges`);
            }
          }
        }

        // Chunk and embed source transcript for RAG grounding (non-blocking)
        if (source?.id && transcriptResult.transcript && transcriptResult.transcript.length > 200) {
          try {
            const textChunks = chunkText(transcriptResult.transcript);
            const chunksToInsert: any[] = [];
            for (let i = 0; i < textChunks.length; i++) {
              const embedding = await generateChunkEmbedding(textChunks[i]);
              if (embedding.length > 0) {
                chunksToInsert.push({
                  source_id: source.id,
                  chunk_index: i,
                  content: textChunks[i],
                  token_count: Math.ceil(textChunks[i].split(/\s+/).length / 0.75),
                  embedding,
                  user_id: item.user_id,
                });
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (chunksToInsert.length > 0) {
              const { error: chunkError } = await supabase
                .from('knowledge_source_chunks')
                .insert(chunksToInsert);
              if (!chunkError) {
                console.log(`[Process] Created ${chunksToInsert.length} source chunks for RAG grounding`);
              } else {
                console.error('[Process] Chunk insert error:', chunkError);
              }
            }
          } catch (chunkErr) {
            console.warn('[Process] Source chunking failed (non-blocking):', chunkErr);
          }
        }

        // Cross-reference with existing database nodes
        if (nodesCreated > 0) {
          console.log('[Process] Starting cross-reference with existing knowledge...');

          await supabase
            .from('youtube_ingestion_queue')
            .update({
              processing_step: `Cross-referencing ${nodesCreated} nodes with existing knowledge graph...`,
            })
            .eq('id', item.id);

          // Fetch existing nodes for cross-referencing (recent, non-source nodes)
          const { data: existingNodes } = await supabase
            .from('knowledge_nodes')
            .select('id, label, entity_type, description')
            .eq('user_id', item.user_id)
            .neq('source_id', source?.id || 'none') // Exclude nodes from this same source
            .order('created_at', { ascending: false })
            .limit(100);

          // Fetch all user's anchors for cross-referencing
          const { data: allAnchors } = await supabase
            .from('knowledge_nodes')
            .select('id, label, description')
            .eq('user_id', item.user_id)
            .eq('is_anchor', true);

          const existingNodesList = existingNodes || [];
          const anchorsList = allAnchors || [];

          console.log(`[Process] Found ${existingNodesList.length} existing nodes, ${anchorsList.length} anchors for cross-reference`);

          if (existingNodesList.length > 0 || anchorsList.length > 0) {
            // Build new nodes list for cross-referencing
            const newNodesForCrossRef = extracted.nodes.map(n => ({
              label: n.label,
              type: n.type,
              description: n.description
            }));

            // Generate cross-connections
            const crossConnections = await generateCrossConnections(
              newNodesForCrossRef,
              existingNodesList,
              anchorsList
            );

            console.log(`[Process] Generated ${crossConnections.length} cross-connections`);

            // Build lookup for existing node labels to IDs
            const existingLabelToId: Record<string, string> = {};
            for (const node of existingNodesList) {
              existingLabelToId[node.label] = node.id;
            }
            for (const anchor of anchorsList) {
              existingLabelToId[anchor.label] = anchor.id;
            }

            // Insert cross-connection edges
            if (crossConnections.length > 0) {
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
                  evidence: conn.evidence || `Cross-referenced from: ${item.video_title}`,
                  weight: 0.8,
                  user_id: item.user_id,
                }));

              if (crossEdges.length > 0) {
                const { error: crossEdgesError } = await supabase
                  .from('knowledge_edges')
                  .insert(crossEdges);

                if (crossEdgesError) {
                  console.error('[Process] Error inserting cross-edges:', crossEdgesError);
                } else {
                  edgesCreated += crossEdges.length;
                  console.log(`[Process] Created ${crossEdges.length} cross-reference edges`);
                }
              }
            }
          }
        }

        // Mark as completed
        await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'completed',
            processing_step: `Completed: ${nodesCreated} nodes, ${edgesCreated} edges created.`,
            source_id: source?.id || null,
            nodes_created: nodesCreated,
            edges_created: edgesCreated,
            completed_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        // Update source stats (channel or playlist)
        if (item.playlist_source_id) {
          try {
            await supabase.rpc('increment_playlist_ingested', { playlist_id: item.playlist_source_id });
          } catch {
            // Fallback: manual update if RPC not available
            await supabase
              .from('youtube_playlists')
              .update({ total_videos_ingested: ((playlistSettings as any)?.total_videos_ingested || 0) + 1 })
              .eq('id', item.playlist_source_id);
          }
        } else if (item.channel_id) {
          await supabase
            .from('youtube_channels')
            .update({
              total_videos_ingested: (item.youtube_channels as any)?.total_videos_ingested + 1 || 1,
              last_video_published_at: item.published_at,
            })
            .eq('id', item.channel_id);
        }

        // Update user's daily count
        const { data: userSettings } = await supabase
          .from('youtube_settings')
          .select('videos_ingested_today, daily_limit_reset_at')
          .eq('user_id', item.user_id)
          .single();

        if (userSettings) {
          const today = new Date().toISOString().split('T')[0];
          const lastReset = userSettings.daily_limit_reset_at?.split('T')[0];

          await supabase
            .from('youtube_settings')
            .update({
              videos_ingested_today: lastReset === today
                ? (userSettings.videos_ingested_today || 0) + 1
                : 1,
              daily_limit_reset_at: lastReset === today
                ? userSettings.daily_limit_reset_at
                : new Date().toISOString(),
            })
            .eq('user_id', item.user_id);
        }

        results.push({ id: item.id, status: 'completed' });
        console.log(`[Process] Completed: ${item.video_title} (${Date.now() - itemStartTime}ms)`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Process] Failed: ${item.video_title}:`, errorMessage);

        // Mark as failed
        await supabase
          .from('youtube_ingestion_queue')
          .update({
            status: 'failed',
            processing_step: null,
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

    // Check if there are more items remaining
    let remainingQuery = supabase
      .from('youtube_ingestion_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (!isCron && user?.id) {
      remainingQuery = remainingQuery.eq('user_id', user.id);
    }

    const { count: remainingCount } = await remainingQuery;

    console.log(`[Process] Complete. ${completed} succeeded, ${failed} failed, ${remainingCount || 0} remaining in ${duration}ms`);

    // Log to scan history (only if we processed something)
    if (results.length > 0 && user?.id && user.id !== 'cron') {
      await supabase.from('youtube_scan_history').insert({
        user_id: user.id,
        scan_type: isCron ? 'auto_poll' : 'process',
        videos_processed: completed,
        videos_failed: failed,
        status: failed === 0 ? 'completed' : (completed === 0 ? 'failed' : 'partial'),
        completed_at: new Date().toISOString(),
        duration_ms: duration,
        metadata: { process_all, remaining: remainingCount || 0 },
      });
    }

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
    console.error('[Process] Fatal error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Processing failed',
      duration_ms: Date.now() - startTime,
    });
  }
}
