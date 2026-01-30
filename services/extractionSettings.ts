// Extraction Settings Service
// PRD 3: CRUD operations for user extraction settings

import { getSupabase, getCurrentUserId } from './supabase';
import type { ExtractionSettings, ExtractionMode, AnchorEmphasis } from '../types/extraction';
import { DEFAULT_EXTRACTION_SETTINGS } from '../types/extraction';

/**
 * Get user's extraction settings
 * Returns default values if no settings exist
 */
export const getUserExtractionSettings = async (): Promise<ExtractionSettings | null> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    console.warn('No authenticated user for extraction settings');
    return null;
  }

  const { data, error } = await client
    .from('extraction_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    // Settings don't exist yet - this is okay, return null
    if (error.code === 'PGRST116') return null;
    console.error('Failed to fetch extraction settings:', error);
    return null;
  }

  return data as ExtractionSettings;
};

/**
 * Get extraction settings or defaults if none exist
 */
export const getExtractionSettingsOrDefaults = async (): Promise<Omit<ExtractionSettings, 'id' | 'user_id' | 'created_at' | 'updated_at'>> => {
  const settings = await getUserExtractionSettings();

  if (settings) {
    return {
      default_mode: settings.default_mode,
      default_anchor_emphasis: settings.default_anchor_emphasis,
      settings: settings.settings
    };
  }

  return DEFAULT_EXTRACTION_SETTINGS;
};

/**
 * Create or update extraction settings
 */
export const upsertExtractionSettings = async (
  defaultMode: ExtractionMode,
  defaultAnchorEmphasis: AnchorEmphasis,
  additionalSettings?: Record<string, any>
): Promise<{ data: ExtractionSettings | null; error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { data: null, error: new Error('Not authenticated') };
  }

  const { data, error } = await client
    .from('extraction_settings')
    .upsert({
      user_id: userId,
      default_mode: defaultMode,
      default_anchor_emphasis: defaultAnchorEmphasis,
      settings: additionalSettings || {},
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to save extraction settings:', error);
    return { data: null, error };
  }

  return { data: data as ExtractionSettings, error: null };
};

/**
 * Update just the default extraction mode
 */
export const updateDefaultMode = async (mode: ExtractionMode): Promise<{ error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const { error } = await client
    .from('extraction_settings')
    .upsert({
      user_id: userId,
      default_mode: mode,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  return { error };
};

/**
 * Update just the default anchor emphasis
 */
export const updateDefaultAnchorEmphasis = async (emphasis: AnchorEmphasis): Promise<{ error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const { error } = await client
    .from('extraction_settings')
    .upsert({
      user_id: userId,
      default_anchor_emphasis: emphasis,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  return { error };
};

/**
 * Delete extraction settings (reset to defaults)
 */
export const deleteExtractionSettings = async (): Promise<{ error: any }> => {
  const client = getSupabase();
  const userId = await getCurrentUserId();

  if (!userId) {
    return { error: new Error('Not authenticated') };
  }

  const { error } = await client
    .from('extraction_settings')
    .delete()
    .eq('user_id', userId);

  return { error };
};

/**
 * Get default settings constant (for UI defaults before user has saved)
 */
export const getDefaultSettings = () => DEFAULT_EXTRACTION_SETTINGS;
