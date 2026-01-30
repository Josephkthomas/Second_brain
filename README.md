<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Synapse - Knowledge Graph Explorer

A React + Vite application for exploring and managing knowledge graphs with AI-powered entity extraction.

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini API
- **Visualization**: D3.js

## Local Development

**Prerequisites:** Node.js 18+

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env.local` and fill in your values:
   ```bash
   cp .env.example .env.local
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (admin access) | Yes |
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

Get your Supabase credentials from: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api

Get your Gemini API key from: https://aistudio.google.com/apikey

## Deployment

### Deploy to Vercel

1. **Create Vercel Account**
   - Go to [vercel.com/signup](https://vercel.com/signup)
   - Sign up with GitHub

2. **Import Project**
   - Click "New Project"
   - Select your Synapse repository
   - Vercel auto-detects Vite settings:
     - Framework: Vite
     - Build Command: `npm run build`
     - Output Directory: `dist`

3. **Configure Environment Variables**

   In Vercel dashboard, go to **Settings > Environment Variables** and add:

   | Name | Value | Environments |
   |------|-------|--------------|
   | `SUPABASE_URL` | Your Supabase URL | All |
   | `SUPABASE_ANON_KEY` | Your anon key | All |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your service role key | All |
   | `GEMINI_API_KEY` | Your Gemini API key | All |

4. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app is live at `your-project.vercel.app`

### Continuous Deployment

After initial setup:
- Push to `main` branch triggers automatic deployment
- Pull requests get preview deployments
- Zero-downtime deployments

### Build Commands

```bash
# Test build locally before deploying
npm run build

# Preview production build locally
npm run preview
```

## Security Notes

- **Never commit `.env.local`** - it's gitignored
- **Rotate keys** if they were ever exposed
- The **service role key** bypasses Row Level Security - use carefully

## Troubleshooting

### Build Failures
- Run `npm run build` locally to debug
- Check environment variables are set correctly in Vercel

### API Connection Issues
- Verify environment variable names match exactly
- Check Supabase project is active
- Verify API keys are valid

### CORS Issues
- Supabase allows all origins by default
- For custom domains, check Supabase CORS settings

## Rollback

If deployment fails:
1. Go to Vercel dashboard > Deployments
2. Find last working deployment
3. Click menu > "Promote to Production"
