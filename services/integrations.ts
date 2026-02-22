// Integration Service — Client-side CRUD for user_integrations table

import { getSupabase, getCurrentUserId } from './supabase';
import type { UserIntegration } from '../types/integrations';

function generateWebhookToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchUserIntegrations(): Promise<UserIntegration[]> {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await client
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch user integrations:', error);
    return [];
  }
  return data || [];
}

export async function fetchUserIntegration(slug: string): Promise<UserIntegration | null> {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await client
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to fetch integration:', error);
    return null;
  }
  return data;
}

export async function createUserIntegration(
  slug: string,
  config: Record<string, any> = {},
  needsWebhookToken: boolean = false
): Promise<{ data: UserIntegration | null; error: any }> {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return { data: null, error: new Error('Not authenticated') };

  const { data, error } = await client
    .from('user_integrations')
    .insert({
      user_id: userId,
      integration_slug: slug,
      status: 'active',
      webhook_token: needsWebhookToken ? generateWebhookToken() : null,
      config,
    })
    .select()
    .single();

  return { data, error };
}

export async function updateUserIntegration(
  id: string,
  updates: Partial<Pick<UserIntegration, 'status' | 'config' | 'webhook_token'>>
): Promise<{ error: any }> {
  const client = getSupabase();

  const { error } = await client
    .from('user_integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { error };
}

export async function deleteUserIntegration(id: string): Promise<{ error: any }> {
  const client = getSupabase();
  const { error } = await client
    .from('user_integrations')
    .delete()
    .eq('id', id);
  return { error };
}

export async function regenerateWebhookToken(id: string): Promise<{ token: string | null; error: any }> {
  const newToken = generateWebhookToken();
  const client = getSupabase();

  const { error } = await client
    .from('user_integrations')
    .update({ webhook_token: newToken, updated_at: new Date().toISOString() })
    .eq('id', id);

  return { token: error ? null : newToken, error };
}

export function buildWebhookUrl(slug: string, token: string): string {
  return `https://second-brain-one-mocha.vercel.app/api/ingest/${slug}?token=${token}`;
}
