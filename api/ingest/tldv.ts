// tl;dv Webhook Adapter
// POST /api/ingest/tldv?token=<webhook_token>
// Receives tl;dv TranscriptReady data, transforms it, inserts into ingest_queue

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function transformTldvPayload(payload: any): { title: string; content: string } {
  const transcript = (payload.data?.data || [])
    .map((t: any) => `${t.speaker}: ${t.text}`)
    .join('\n');

  const date = payload.executedAt
    ? new Date(payload.executedAt).toLocaleDateString()
    : new Date().toLocaleDateString();

  const title = `tl;dv Meeting — ${date}`;

  const content = [
    `# Meeting Transcript`,
    `**Recorded**: ${date}`,
    '',
    '## Full Transcript',
    transcript || '(No transcript available)',
  ].join('\n');

  return { title, content };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.query.token as string;
  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(401).json({ error: 'Missing or invalid webhook token' });
  }

  const supabase = getSupabase();

  const { data: integration, error: lookupError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('webhook_token', token)
    .eq('integration_slug', 'tldv')
    .single();

  if (lookupError || !integration) {
    return res.status(401).json({ error: 'Invalid webhook token' });
  }

  if (integration.status !== 'active') {
    return res.status(200).json({ message: 'Integration paused, webhook accepted but not queued' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { title, content } = transformTldvPayload(body);

  if (content.length < 20) {
    return res.status(400).json({ error: 'Insufficient content to extract knowledge from' });
  }

  const userConfig = integration.config || {};

  const { data: queueItem, error: insertError } = await supabase
    .from('ingest_queue')
    .insert({
      user_id: integration.user_id,
      title,
      content,
      source_type: userConfig.source_type || 'Meeting',
      source_url: null,
      custom_instructions: userConfig.custom_instructions || null,
      extraction_mode: userConfig.extraction_mode || 'comprehensive',
      anchor_emphasis: userConfig.anchor_emphasis || 'standard',
      linked_anchor_ids: userConfig.linked_anchor_ids || [],
      priority: 5,
      metadata: {
        ingestion_method: 'tldv_webhook',
        integration_id: integration.id,
        tldv_meeting_id: body.data?.meetingId || body.data?.id || null,
        executed_at: body.executedAt || null,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[tl;dv] Queue insert error:', insertError);
    return res.status(500).json({ error: 'Failed to queue meeting for processing' });
  }

  await supabase
    .from('user_integrations')
    .update({
      total_items_ingested: (integration.total_items_ingested || 0) + 1,
      last_received_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', integration.id);

  return res.status(202).json({
    id: queueItem.id,
    status: 'pending',
    message: 'Meeting queued for knowledge extraction',
  });
}
