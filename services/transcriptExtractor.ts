// Tiered Transcript Extraction Service
// Tries multiple methods in sequence for maximum reliability
// Tier 1: youtube-caption-extractor (free, fast)
// Tier 2: Innertube API direct (free, backup)
// Tier 3: Apify transcript scraper (paid, reliable)
// Tier 4: No transcript available (manual fallback)

import type { TieredTranscriptResult } from '../types/youtube';

// Tier timeout constants
const TIER_1_TIMEOUT_MS = 15000;
const TIER_2_TIMEOUT_MS = 15000;
const TIER_3_TIMEOUT_MS = 120000;

/**
 * Tiered transcript extraction with sequential fallback.
 */
export async function extractTranscript(
  videoId: string,
  videoUrl: string,
  apifyApiKey?: string
): Promise<TieredTranscriptResult> {
  const overallStart = Date.now();
  const errors: string[] = [];

  // ═══════════════════════════════════════════
  // TIER 1: youtube-caption-extractor
  // ═══════════════════════════════════════════
  try {
    console.log(`[Transcript] Tier 1: Trying youtube-caption-extractor for ${videoId}`);
    const start = Date.now();

    const result = await withTimeout(
      tier1CaptionExtractor(videoId),
      TIER_1_TIMEOUT_MS,
      'Tier 1 timed out'
    );

    if (result && result.length > 50) {
      console.log(`[Transcript] Tier 1 SUCCESS: ${result.length} chars in ${Date.now() - start}ms`);
      return {
        success: true,
        transcript: result,
        language: 'en',
        method: 'caption_extractor',
        is_auto_generated: true,
        duration_ms: Date.now() - overallStart,
      };
    }

    errors.push('Tier 1: Empty or too short transcript');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 1: ${msg}`);
    console.warn(`[Transcript] Tier 1 failed for ${videoId}: ${msg}`);
  }

  // ═══════════════════════════════════════════
  // TIER 2: Innertube API Direct
  // ═══════════════════════════════════════════
  try {
    console.log(`[Transcript] Tier 2: Trying Innertube API for ${videoId}`);
    const start = Date.now();

    const result = await withTimeout(
      fetchViaInnertube(videoId),
      TIER_2_TIMEOUT_MS,
      'Tier 2 timed out'
    );

    if (result && result.length > 50) {
      console.log(`[Transcript] Tier 2 SUCCESS: ${result.length} chars in ${Date.now() - start}ms`);
      return {
        success: true,
        transcript: result,
        language: 'en',
        method: 'innertube',
        is_auto_generated: true,
        duration_ms: Date.now() - overallStart,
      };
    }

    errors.push('Tier 2: Empty or too short transcript');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Tier 2: ${msg}`);
    console.warn(`[Transcript] Tier 2 failed for ${videoId}: ${msg}`);
  }

  // ═══════════════════════════════════════════
  // TIER 3: Apify Transcript Scraper
  // ═══════════════════════════════════════════
  if (apifyApiKey) {
    try {
      console.log(`[Transcript] Tier 3: Trying Apify for ${videoId}`);
      const start = Date.now();

      const result = await withTimeout(
        fetchViaApify(videoUrl, apifyApiKey),
        TIER_3_TIMEOUT_MS,
        'Tier 3 timed out'
      );

      if (result.success && result.transcript && result.transcript.length > 50) {
        console.log(`[Transcript] Tier 3 SUCCESS: ${result.transcript.length} chars in ${Date.now() - start}ms`);
        return {
          success: true,
          transcript: result.transcript,
          language: result.language || 'en',
          method: 'apify',
          is_auto_generated: result.is_auto_generated,
          duration_ms: Date.now() - overallStart,
        };
      }

      errors.push(`Tier 3: ${result.error || 'Empty transcript'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Tier 3: ${msg}`);
      console.warn(`[Transcript] Tier 3 failed for ${videoId}: ${msg}`);
    }
  } else {
    errors.push('Tier 3: Apify API key not configured, skipping');
  }

  // ═══════════════════════════════════════════
  // TIER 4: All methods exhausted
  // ═══════════════════════════════════════════
  console.error(`[Transcript] All tiers failed for ${videoId}:`, errors);
  return {
    success: false,
    transcript: null,
    language: null,
    method: 'manual',
    is_auto_generated: false,
    error: `All transcript extraction methods failed: ${errors.join('; ')}`,
    duration_ms: Date.now() - overallStart,
  };
}

// ============================================
// TIER 1: youtube-caption-extractor
// ============================================

async function tier1CaptionExtractor(videoId: string): Promise<string | null> {
  const { getSubtitles } = await import('youtube-caption-extractor');

  const subtitles = await getSubtitles({
    videoID: videoId,
    lang: 'en',
  });

  if (!subtitles || subtitles.length === 0) return null;

  const transcript = subtitles
    .map((s: { text: string }) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return transcript.length > 50 ? transcript : null;
}

// ============================================
// TIER 2: Innertube API Direct
// ============================================

async function fetchViaInnertube(videoId: string): Promise<string | null> {
  // Step 1: Get Innertube API key from video page
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageResponse = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await pageResponse.text();

  const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  if (!apiKeyMatch) return null;
  const apiKey = apiKeyMatch[1];

  // Step 2: Call Innertube player endpoint to get caption tracks
  const playerResponse = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '17.31.35',
            hl: 'en',
          },
        },
        videoId,
      }),
    }
  );

  const playerData = await playerResponse.json();
  const captionTracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

  if (!captionTracks || captionTracks.length === 0) return null;

  // Prefer English, fall back to first available
  const track =
    captionTracks.find((t: any) => t.languageCode === 'en') ||
    captionTracks[0];

  if (!track?.baseUrl) return null;

  // Step 3: Fetch the caption XML
  const captionResponse = await fetch(track.baseUrl);
  const captionXml = await captionResponse.text();

  // Step 4: Parse XML to extract text
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

// ============================================
// TIER 3: Apify
// ============================================

const APIFY_ACTOR_ID = 'pintostudio/youtube-transcript-scraper';

async function fetchViaApify(
  videoUrl: string,
  apifyApiKey: string
): Promise<{ success: boolean; transcript: string | null; language: string | null; is_auto_generated: boolean; error?: string }> {
  const runResponse = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID.replace('/', '~')}/runs?waitForFinish=120`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apifyApiKey}`,
      },
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
    transcript = firstResult.data
      .map((segment: { text?: string }) => segment.text || '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  } else if (firstResult.transcript) {
    transcript = firstResult.transcript;
  } else {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: 'Unexpected format' };
  }

  if (!transcript || transcript.length < 50) {
    return { success: false, transcript: null, language: null, is_auto_generated: false, error: 'Transcript too short' };
  }

  return {
    success: true,
    transcript,
    language: firstResult.language || 'en',
    is_auto_generated: firstResult.isAutoGenerated ?? true,
  };
}

// ============================================
// UTILITIES
// ============================================

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Generate a unique 4-character Synapse playlist code.
 * Excludes ambiguous characters (I, O, 0, 1).
 */
export function generatePlaylistCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SYN-${code}`;
}

/**
 * Extract playlist ID from a YouTube playlist URL.
 * Supports formats like:
 * - https://www.youtube.com/playlist?list=PLxxxxxxx
 * - https://youtube.com/playlist?list=PLxxxxxxx
 */
export function extractPlaylistId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('list');
    }
    return null;
  } catch {
    // Try regex fallback for malformed URLs
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
}
