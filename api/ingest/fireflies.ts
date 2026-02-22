// Fireflies Webhook Adapter
// POST /api/ingest/fireflies?token=<webhook_token>
// Two-step: receives meetingId notification → fetches full transcript via GraphQL API

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const getSupabase = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchFirefliesTranscript(meetingId: string, apiKey: string) {
  const query = `
    query($meetingId: String!) {
      transcript(id: $meetingId) {
        title
        date
        duration
        host_email
        participants
        sentences {
          index
          text
          speaker_name
          start_time
        }
        summary {
          keywords
          action_items
          overview
        }
      }
    }
  `;

  const response = await fetch('https://api.fireflies.ai/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables: { meetingId } }),
  });

  if (!response.ok) {
    throw new Error(`Fireflies API returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Fireflies GraphQL error: ${data.errors.map((e: any) => e.message).join(', ')}`);
  }

  return data.data?.transcript;
}

function transformFirefliesTranscript(transcript: any): { title: string; content: string } {
  const transcriptText = (transcript.sentences || [])
    .map((s: any) => `${s.speaker_name}: ${s.text}`)
    .join('\n');

  const actionItems = (transcript.summary?.action_items || [])
    .map((a: string) => `- ${a}`)
    .join('\n');

  const title = transcript.title || 'Fireflies Meeting';

  const content = [
    `# ${title}`,
    transcript.date ? `**Date**: ${new Date(transcript.date).toLocaleDateString()}` : '',
    transcript.duration ? `**Duration**: ${Math.round((transcript.duration || 0) / 60)} minutes` : '',
    (transcript.participants || []).length > 0 ? `**Participants**: ${transcript.participants.join(', ')}` : '',
    '',
    '## Overview',
    transcript.summary?.overview || '(No summary)',
    '',
    '## Action Items',
    actionItems || '(None)',
    '',
    '## Full Transcript',
    transcriptText || '(No transcript)',
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
    .eq('integration_slug', 'fireflies')
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

  // Fireflies webhook payload: { meetingId: "ASxwZxCstx", eventType: "Transcription completed" }
  const meetingId = body.meetingId;
  if (!meetingId) {
    return res.status(400).json({ error: 'Missing meetingId in webhook payload' });
  }

  // Get API key from integration config
  const apiKey = integration.config?.api_key;
  if (!apiKey) {
    console.error('[Fireflies] No API key found in integration config');
    await supabase
      .from('user_integrations')
      .update({ error_message: 'API key missing from config. Please reconnect.' })
      .eq('id', integration.id);
    return res.status(400).json({ error: 'Fireflies API key not configured. Please update your integration settings.' });
  }

  // Fetch full transcript from Fireflies GraphQL API
  let transcript;
  try {
    transcript = await fetchFirefliesTranscript(meetingId, apiKey);
  } catch (err: any) {
    console.error('[Fireflies] Failed to fetch transcript:', err.message);
    await supabase
      .from('user_integrations')
      .update({ error_message: `Failed to fetch transcript: ${err.message}` })
      .eq('id', integration.id);
    return res.status(502).json({ error: `Failed to fetch transcript from Fireflies: ${err.message}` });
  }

  if (!transcript) {
    return res.status(404).json({ error: 'Transcript not found for the given meetingId' });
  }

  const { title, content } = transformFirefliesTranscript(transcript);

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
        ingestion_method: 'fireflies_webhook',
        integration_id: integration.id,
        fireflies_meeting_id: meetingId,
        participants: transcript.participants || [],
        meeting_date: transcript.date || null,
      },
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[Fireflies] Queue insert error:', insertError);
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
