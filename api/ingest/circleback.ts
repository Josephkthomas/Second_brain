// Circleback Webhook Adapter
// POST /api/ingest/circleback?token=<webhook_token>
// Receives Circleback meeting data, transforms it, inserts into ingest_queue

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Token auth from query string
  const token = req.query.token as string;
  if (!token || typeof token !== 'string' || token.length < 16) {
    return res.status(401).json({ error: 'Missing or invalid webhook token' });
  }

  const supabase = getSupabase();

  // Look up integration by token
  const { data: integration, error: lookupError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('webhook_token', token)
    .eq('integration_slug', 'circleback')
    .single();

  if (lookupError || !integration) {
    return res.status(401).json({ error: 'Invalid webhook token' });
  }

  if (integration.status !== 'active') {
    return res.status(200).json({ message: 'Integration paused, webhook accepted but not queued' });
  }

  // Parse Circleback payload (defensive — handles both naming conventions)
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const title = (body.title || body.name || 'Untitled Meeting').trim();

  // Build rich content string
  const contentParts: string[] = [`# ${title}`];

  // Date and duration
  const meetingDate = body.date || body.createdAt;
  if (meetingDate) {
    try {
      contentParts.push(`**Date**: ${new Date(meetingDate).toLocaleDateString()}`);
    } catch { /* skip invalid dates */ }
  }
  if (body.duration) {
    contentParts.push(`**Duration**: ${Math.round(body.duration / 60)} minutes`);
  }

  // Attendees
  const attendees = body.attendees || [];
  if (attendees.length > 0) {
    const names = attendees.map((a: any) => typeof a === 'string' ? a : a.name).filter(Boolean);
    if (names.length > 0) contentParts.push(`**Attendees**: ${names.join(', ')}`);
  }

  // Summary / Notes
  const summary = body.summary || body.notes;
  if (summary) contentParts.push(`\n## Meeting Notes\n${summary}`);

  // Action items (handles both naming conventions)
  const actionItems = body.action_items || body.actionItems || [];
  if (actionItems.length > 0) {
    const items = actionItems.map((item: any) => {
      const text = item.text || item.title || '';
      const assignee = typeof item.assignee === 'string' ? item.assignee : item.assignee?.name;
      const parts = [text];
      if (assignee) parts.push(`(${assignee})`);
      if (item.due_date) parts.push(`[Due: ${item.due_date}]`);
      if (item.status) parts.push(`[${item.status}]`);
      return `- ${parts.join(' ')}`;
    }).join('\n');
    contentParts.push(`\n## Action Items\n${items}`);
  }

  // Transcript
  const transcript = body.transcript;
  if (transcript) {
    if (typeof transcript === 'string') {
      contentParts.push(`\n## Transcript\n${transcript}`);
    } else if (Array.isArray(transcript)) {
      const text = transcript.map((t: any) => `${t.speaker}: ${t.text}`).join('\n');
      contentParts.push(`\n## Transcript\n${text}`);
    }
  }

  const content = contentParts.join('\n');
  if (content.length < 20) {
    return res.status(400).json({ error: 'Insufficient content to extract knowledge from' });
  }

  // Map to ingest_queue columns
  const userConfig = integration.config || {};

  const { data: queueItem, error: insertError } = await supabase
    .from('ingest_queue')
    .insert({
      user_id: integration.user_id,
      title,
      content,
      source_type: userConfig.source_type || 'Meeting',
      source_url: body.meeting_url || null,
      custom_instructions: userConfig.custom_instructions || null,
      extraction_mode: userConfig.extraction_mode || 'comprehensive',
      anchor_emphasis: userConfig.anchor_emphasis || 'standard',
      linked_anchor_ids: userConfig.linked_anchor_ids || [],
      priority: 5,
      metadata: {
        ingestion_method: 'circleback_webhook',
        integration_id: integration.id,
        tags: body.tags || [],
        attendees: attendees.map((a: any) => typeof a === 'string' ? a : a.name).filter(Boolean),
        meeting_date: meetingDate || null,
        circleback_meeting_id: body.id || null,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[Circleback] Queue insert error:', insertError);
    return res.status(500).json({ error: 'Failed to queue meeting for processing' });
  }

  // Update integration stats
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
