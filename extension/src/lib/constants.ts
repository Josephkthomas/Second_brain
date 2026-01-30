// Synapse Extension Constants
// These values need to match your Supabase project configuration

// IMPORTANT: Copy these from your .env.local or Supabase dashboard
// These are safe to include in the extension (anon key respects RLS policies)
export const SUPABASE_URL = 'https://ipjuhmohrmfqfbtylfqv.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwanVobW9ocm1mcWZidHlsZnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNjQ2MjcsImV4cCI6MjA4Mzc0MDYyN30.tEaGrsLIKAyiHhXKU9m1Y9KNbWqNqhJPib9D8LVmTuU';

// URL to your deployed Synapse app (for "View in Synapse" links)
export const SYNAPSE_APP_URL = 'http://localhost:5173';

// API endpoint for extraction (deployed Vercel function)
export const EXTRACT_API_URL = `${SYNAPSE_APP_URL}/api/extract`;
