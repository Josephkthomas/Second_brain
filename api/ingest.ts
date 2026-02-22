// Vercel API endpoint for Universal Ingest
// POST /api/ingest - Submit content for async knowledge extraction
// GET /api/ingest - List user's queue items

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_CONTENT_BYTES = 500 * 1024; // 500KB

const VALID_SOURCE_TYPES = [
  'Meeting', 'YouTube', 'Note', 'Research', 'Document',
  'Podcast', 'Email', 'Chat', 'Article', 'API'
];

const VALID_EXTRACTION_MODES = [
  'comprehensive', 'strategic', 'actionable', 'relational'
];

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { user, error: authError } = await verifyAuth(req);
  if (!user) {
    return res.status(401).json({ error: authError });
  }

  const supabase = getSupabase();

  try {
    // POST - Submit content for ingestion
    if (req.method === 'POST') {
      const body = req.body;

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Request body must be a JSON object' });
      }

      // Validate required fields
      if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
        return res.status(400).json({ error: 'title is required and must be a non-empty string' });
      }

      if (!body.content || typeof body.content !== 'string' || body.content.trim().length < 10) {
        return res.status(400).json({ error: 'content is required and must be at least 10 characters' });
      }

      // Check content size
      const contentBytes = Buffer.byteLength(body.content, 'utf-8');
      if (contentBytes > MAX_CONTENT_BYTES) {
        return res.status(413).json({
          error: `Content exceeds maximum size of 500KB (received ${Math.round(contentBytes / 1024)}KB)`
        });
      }

      // Sanitize optional fields
      const sourceType = body.source_type && VALID_SOURCE_TYPES.includes(body.source_type)
        ? body.source_type
        : 'API';

      const extractionMode = body.extraction_mode && VALID_EXTRACTION_MODES.includes(body.extraction_mode)
        ? body.extraction_mode
        : 'comprehensive';

      const priority = typeof body.priority === 'number'
        ? Math.max(1, Math.min(10, Math.round(body.priority)))
        : 5;

      // Insert into queue
      const { data: queueItem, error: insertError } = await supabase
        .from('ingest_queue')
        .insert({
          user_id: user.id,
          title: body.title.trim(),
          content: body.content,
          source_type: sourceType,
          source_url: body.source_url || null,
          custom_instructions: body.custom_instructions || null,
          extraction_mode: extractionMode,
          anchor_emphasis: body.anchor_emphasis || 'standard',
          linked_anchor_ids: Array.isArray(body.linked_anchor_ids) ? body.linked_anchor_ids : [],
          priority,
          metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[Ingest] Queue insert error:', insertError);
        return res.status(500).json({ error: 'Failed to queue content for ingestion' });
      }

      return res.status(202).json({
        id: queueItem.id,
        status: 'pending',
        message: 'Content queued for ingestion. Use GET /api/ingest?status=all to check progress.',
      });
    }

    // GET - List queue items
    if (req.method === 'GET') {
      const { status, limit = '50' } = req.query;

      let query = supabase
        .from('ingest_queue')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(Math.min(parseInt(limit as string, 10) || 50, 200));

      if (status && typeof status === 'string' && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({ items: data || [] });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[Ingest] API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}
