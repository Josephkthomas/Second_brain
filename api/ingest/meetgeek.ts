// MeetGeek Webhook Adapter
// POST /api/ingest/meetgeek?token=<webhook_token>
// Receives MeetGeek meeting data, transforms it, inserts into ingest_queue
// NOTE: MeetGeek fires webhooks up to 3 times (built-in retry) — this adapter is idempotent.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function transformMeetgeekPayload(payload: any): { title: string; content: string } {
  const participants = (payload.participants || []).map((p: any) => p.name || p.email).filter(Boolean).join(', ');
  const transcript = (payload.transcript || [])
    .map((t: any) => `${t.speaker}: ${t.text}`)
    .join('\n');
  const actionItems = (payload.action_items || [])
    .map((a: any) => `- ${a.text}${a.assignee ? ` (${a.assignee})` : ''}`)
    .join('\n');

  const title = payload.title || 'MeetGeek Meeting';

  const content = [
    `# ${title}`,
    payload.start_time ? `**Date**: ${new Date(payload.start_time).toLocaleDateString()}` : '',
    participants ? `**Participants**: ${participants}` : '',
    '',
    '## Summary',
    payload.summary || '(No summary)',
    '',
    '## Action Items',
    actionItems || '(None)',
    '',
    '## Full Transcript',
    transcript || '(No transcript)',
  ].filter(Boolean).join('\n');

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
    .eq('integration_slug', 'meetgeek')
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

  // Idempotency: MeetGeek fires up to 3 retries per meeting.
  // Check if we already have a queue item for this meeting_id.
  const meetgeekMeetingId = body.meeting_id;
  if (meetgeekMeetingId) {
    const { data: existing } = await supabase
      .from('ingest_queue')
      .select('id')
      .eq('user_id', integration.user_id)
      .contains('metadata', { meetgeek_meeting_id: meetgeekMeetingId })
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({
        id: existing[0].id,
        status: 'already_queued',
        message: 'This meeting was already queued (duplicate webhook)',
      });
    }
  }

  const { title, content } = transformMeetgeekPayload(body);

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
        ingestion_method: 'meetgeek_webhook',
        integration_id: integration.id,
        meetgeek_meeting_id: meetgeekMeetingId || null,
        participants: (body.participants || []).map((p: any) => p.name || p.email).filter(Boolean),
        meeting_date: body.start_time || null,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[MeetGeek] Queue insert error:', insertError);
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
