// Orientation Engine — Digest CRUD Service
// All database operations for digest profiles, modules, channels, and history.

import { getSupabase, getCurrentUserId } from './supabase';
import type {
  DigestProfile,
  DigestModule,
  DigestChannel,
  DigestHistoryEntry,
  DigestScope,
  DensityLevel,
  ScheduleFrequency,
  ChannelType,
} from '../types/digest';

// ─── Digest Profile CRUD ──────────────────────────────────────────

export const fetchDigestProfiles = async (): Promise<DigestProfile[]> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await client
    .from('digest_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch digest profiles:', error);
    return [];
  }
  return data || [];
};

export const fetchDigestProfile = async (
  id: string
): Promise<(DigestProfile & { modules: DigestModule[]; channels: DigestChannel[] }) | null> => {
  const client = getSupabase();

  const { data: profile, error: profileError } = await client
    .from('digest_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (profileError) {
    console.error('Failed to fetch digest profile:', profileError);
    return null;
  }

  const [modulesResult, channelsResult] = await Promise.all([
    client
      .from('digest_modules')
      .select('*')
      .eq('digest_profile_id', id)
      .order('sort_order', { ascending: true }),
    client
      .from('digest_channels')
      .select('*')
      .eq('digest_profile_id', id),
  ]);

  if (modulesResult.error) console.error('Failed to fetch modules:', modulesResult.error);
  if (channelsResult.error) console.error('Failed to fetch channels:', channelsResult.error);

  return {
    ...profile,
    modules: modulesResult.data || [],
    channels: channelsResult.data || [],
  };
};

export const createDigestProfile = async (profile: {
  name: string;
  description?: string;
  frequency: ScheduleFrequency;
  delivery_time: string;
  delivery_day_of_week?: number | null;
  delivery_day_of_month?: number | null;
  timezone?: string;
  scope?: DigestScope;
  density?: DensityLevel;
}): Promise<{ data: DigestProfile | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  const { data, error } = await client
    .from('digest_profiles')
    .insert({
      user_id: userId,
      name: profile.name,
      description: profile.description || null,
      frequency: profile.frequency,
      delivery_time: profile.delivery_time,
      delivery_day_of_week: profile.delivery_day_of_week ?? null,
      delivery_day_of_month: profile.delivery_day_of_month ?? null,
      timezone: profile.timezone || 'UTC',
      scope: profile.scope || { mode: 'all_active' },
      density: profile.density || 'standard',
    })
    .select()
    .single();

  if (error) console.error('Failed to create digest profile:', error);
  return { data, error };
};

export const updateDigestProfile = async (
  id: string,
  updates: Partial<Pick<DigestProfile,
    'name' | 'description' | 'frequency' | 'delivery_time' |
    'delivery_day_of_week' | 'delivery_day_of_month' | 'timezone' |
    'scope' | 'density' | 'is_active' | 'last_generated_at'
  >>
): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) console.error('Failed to update digest profile:', error);
  return { error };
};

export const deleteDigestProfile = async (id: string): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_profiles')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to delete digest profile:', error);
  return { error };
};

// ─── Digest Module CRUD ──────────────────────────────────────────

export const addDigestModule = async (module: {
  digest_profile_id: string;
  template_id?: string | null;
  custom_name?: string | null;
  custom_system_prompt?: string | null;
  user_context?: string | null;
  tools_enabled?: string[];
  sort_order?: number;
}): Promise<{ data: DigestModule | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  const { data, error } = await client
    .from('digest_modules')
    .insert({
      user_id: userId,
      digest_profile_id: module.digest_profile_id,
      template_id: module.template_id || null,
      custom_name: module.custom_name || null,
      custom_system_prompt: module.custom_system_prompt || null,
      user_context: module.user_context || null,
      tools_enabled: module.tools_enabled || ['graph_query'],
      sort_order: module.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) console.error('Failed to add digest module:', error);
  return { data, error };
};

export const updateDigestModule = async (
  id: string,
  updates: Partial<Pick<DigestModule,
    'template_id' | 'custom_name' | 'custom_system_prompt' |
    'user_context' | 'tools_enabled' | 'sort_order' | 'is_active'
  >>
): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_modules')
    .update(updates)
    .eq('id', id);

  if (error) console.error('Failed to update digest module:', error);
  return { error };
};

export const deleteDigestModule = async (id: string): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_modules')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to delete digest module:', error);
  return { error };
};

export const reorderDigestModules = async (
  profileId: string,
  moduleIds: string[]
): Promise<{ error: any }> => {
  const client = getSupabase();
  let lastError: any = null;

  for (let i = 0; i < moduleIds.length; i++) {
    const { error } = await client
      .from('digest_modules')
      .update({ sort_order: i })
      .eq('id', moduleIds[i])
      .eq('digest_profile_id', profileId);

    if (error) {
      console.error(`Failed to reorder module ${moduleIds[i]}:`, error);
      lastError = error;
    }
  }

  return { error: lastError };
};

// ─── Digest Channel CRUD ──────────────────────────────────────────

export const addDigestChannel = async (channel: {
  digest_profile_id: string;
  channel_type: ChannelType;
  channel_config?: Record<string, string>;
  density_override?: DensityLevel | null;
  format_instructions?: string | null;
}): Promise<{ data: DigestChannel | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  const { data, error } = await client
    .from('digest_channels')
    .insert({
      user_id: userId,
      digest_profile_id: channel.digest_profile_id,
      channel_type: channel.channel_type,
      channel_config: channel.channel_config || {},
      density_override: channel.density_override ?? null,
      format_instructions: channel.format_instructions ?? null,
    })
    .select()
    .single();

  if (error) console.error('Failed to add digest channel:', error);
  return { data, error };
};

export const updateDigestChannel = async (
  id: string,
  updates: Partial<Pick<DigestChannel,
    'channel_config' | 'density_override' | 'format_instructions' | 'is_active'
  >>
): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_channels')
    .update(updates)
    .eq('id', id);

  if (error) console.error('Failed to update digest channel:', error);
  return { error };
};

export const deleteDigestChannel = async (id: string): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_channels')
    .delete()
    .eq('id', id);

  if (error) console.error('Failed to delete digest channel:', error);
  return { error };
};

// ─── Digest History ──────────────────────────────────────────────

export const fetchDigestHistory = async (
  profileId?: string,
  limit: number = 20
): Promise<DigestHistoryEntry[]> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return [];

  let query = client
    .from('digest_history')
    .select('*')
    .eq('user_id', userId)
    .order('delivered_at', { ascending: false })
    .limit(limit);

  if (profileId) {
    query = query.eq('digest_profile_id', profileId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch digest history:', error);
    return [];
  }
  return data || [];
};

export const fetchDigestHistoryEntry = async (
  id: string
): Promise<DigestHistoryEntry | null> => {
  const client = getSupabase();
  const { data, error } = await client
    .from('digest_history')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch digest history entry:', error);
    return null;
  }
  return data;
};

export const saveDigestResult = async (result: {
  digest_profile_id: string;
  content: any;
  module_outputs: any[];
  channels_delivered?: string[];
  status: string;
  error_details?: string | null;
  generation_time_ms?: number | null;
}): Promise<{ data: DigestHistoryEntry | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return { data: null, error: 'Not authenticated' };

  const { data, error } = await client
    .from('digest_history')
    .insert({
      user_id: userId,
      digest_profile_id: result.digest_profile_id,
      content: result.content,
      module_outputs: result.module_outputs,
      channels_delivered: result.channels_delivered || [],
      status: result.status,
      error_details: result.error_details || null,
      generation_time_ms: result.generation_time_ms || null,
    })
    .select()
    .single();

  if (error) console.error('Failed to save digest result:', error);
  return { data, error };
};

export const updateDigestHistoryStatus = async (
  id: string,
  updates: {
    status?: string;
    channels_delivered?: string[];
    error_details?: string | null;
  }
): Promise<{ error: any }> => {
  const client = getSupabase();
  const { error } = await client
    .from('digest_history')
    .update(updates)
    .eq('id', id);

  if (error) console.error('Failed to update digest history:', error);
  return { error };
};
