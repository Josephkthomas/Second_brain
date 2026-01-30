import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';
import { saveSession, getSession, saveUser, clearAuthData, isSessionExpired, StoredSession } from './storage';

let supabaseClient: SupabaseClient | null = null;

// Custom storage adapter for Chrome extension
const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

// Get or create Supabase client
export const getSupabase = (): SupabaseClient => {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return supabaseClient;
};

// Sign in with email and password
export const signIn = async (email: string, password: string): Promise<{ user: User | null; error: Error | null }> => {
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { user: null, error };
    }

    if (data.session && data.user) {
      // Store session data
      await saveSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      });

      await saveUser({
        id: data.user.id,
        email: data.user.email || '',
      });
    }

    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err as Error };
  }
};

// Sign out
export const signOut = async (): Promise<void> => {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  await clearAuthData();
  supabaseClient = null;
};

// Get current session (check if authenticated)
export const getCurrentSession = async (): Promise<{ session: Session | null; user: User | null }> => {
  const supabase = getSupabase();

  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      // Try to restore from storage
      const storedSession = await getSession();
      if (storedSession && !isSessionExpired(storedSession)) {
        // Attempt to refresh the session
        const { data: refreshData } = await supabase.auth.refreshSession({
          refresh_token: storedSession.refresh_token,
        });

        if (refreshData.session) {
          await saveSession({
            access_token: refreshData.session.access_token,
            refresh_token: refreshData.session.refresh_token,
            expires_at: refreshData.session.expires_at,
          });
          return { session: refreshData.session, user: refreshData.user };
        }
      }
      return { session: null, user: null };
    }

    return { session, user: session.user };
  } catch (err) {
    console.error('Error getting session:', err);
    return { session: null, user: null };
  }
};

// Get access token for API calls
export const getAccessToken = async (): Promise<string | null> => {
  const { session } = await getCurrentSession();
  return session?.access_token || null;
};

// Save knowledge source to database
export interface KnowledgeSourceInput {
  title: string;
  content: string;
  sourceType: 'YouTube' | 'Document';
  sourceUrl: string;
  metadata?: Record<string, unknown>;
}

export const saveKnowledgeSource = async (input: KnowledgeSourceInput): Promise<{ id: string | null; error: Error | null }> => {
  const supabase = getSupabase();
  const { session, user } = await getCurrentSession();

  if (!session || !user) {
    return { id: null, error: new Error('Not authenticated') };
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_sources')
      .insert({
        title: input.title,
        content: input.content,
        source_type: input.sourceType,
        source_url: input.sourceUrl,
        user_id: user.id,
        metadata: {
          ...input.metadata,
          extraction_pending: true,
          captured_via: 'chrome_extension',
          captured_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (error) {
      return { id: null, error };
    }

    return { id: data?.id, error: null };
  } catch (err) {
    return { id: null, error: err as Error };
  }
};
