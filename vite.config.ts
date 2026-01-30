import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Support both .env files (local dev) AND process.env (Vercel deployment)
    const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    const SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || '';
    const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(GEMINI_API_KEY),
        'process.env.SUPABASE_URL': JSON.stringify(SUPABASE_URL),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(SUPABASE_ANON_KEY),
        'process.env.SUPABASE_SERVICE_ROLE_KEY': JSON.stringify(SUPABASE_SERVICE_ROLE_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
