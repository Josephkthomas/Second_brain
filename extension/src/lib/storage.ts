// Chrome storage wrapper for session persistence

const AUTH_STORAGE_KEY = 'synapse_auth_session';
const USER_STORAGE_KEY = 'synapse_user';

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export interface StoredUser {
  id: string;
  email: string;
}

// Save the auth session to Chrome storage
export const saveSession = async (session: StoredSession): Promise<void> => {
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: session });
};

// Get the stored session
export const getSession = async (): Promise<StoredSession | null> => {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return result[AUTH_STORAGE_KEY] || null;
};

// Save user info
export const saveUser = async (user: StoredUser): Promise<void> => {
  await chrome.storage.local.set({ [USER_STORAGE_KEY]: user });
};

// Get stored user info
export const getUser = async (): Promise<StoredUser | null> => {
  const result = await chrome.storage.local.get(USER_STORAGE_KEY);
  return result[USER_STORAGE_KEY] || null;
};

// Clear all auth data (logout)
export const clearAuthData = async (): Promise<void> => {
  await chrome.storage.local.remove([AUTH_STORAGE_KEY, USER_STORAGE_KEY]);
};

// Check if session is expired
export const isSessionExpired = (session: StoredSession): boolean => {
  if (!session.expires_at) return false;
  // Add 60 second buffer before actual expiry
  return Date.now() > (session.expires_at * 1000) - 60000;
};
