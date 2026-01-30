# Synapse Chrome Extension

One-click knowledge capture from YouTube videos and web articles into your Synapse knowledge graph.

## Setup

### 1. Configure Supabase Credentials

Edit `src/lib/constants.ts` and update the values:

```typescript
export const SUPABASE_URL = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
export const SYNAPSE_APP_URL = 'https://your-synapse-app.vercel.app';
```

Get these values from:
- Supabase Dashboard → Project Settings → API
- Your deployed Synapse app URL

### 2. Install Dependencies

```bash
cd extension
npm install
```

### 3. Build the Extension

```bash
npm run build
```

This creates the `dist/` folder with the bundled extension.

### 4. Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/dist/` folder

### 5. Test the Extension

1. Click the Synapse extension icon in Chrome toolbar
2. Log in with your Synapse credentials
3. Navigate to a YouTube video or article
4. Click the extension icon to capture content

## Development

Watch mode for development:

```bash
npm run dev
```

This will rebuild automatically when you make changes. After changes, click the refresh button on the extension card in `chrome://extensions/`.

## Features

- **YouTube Capture**: Automatically extracts video metadata and transcripts
- **Article Capture**: Extracts main content from web articles
- **Text Selection**: Capture only selected text on any page
- **Two Capture Modes**:
  - "Capture & Extract Now" - Immediately processes with AI
  - "Save for Later" - Queues for processing in main app

## Icons

The extension includes SVG icon templates in `public/icons/`. For production:

1. Convert SVGs to PNG (16x16, 48x48, 128x128)
2. Place PNGs in `public/icons/`
3. Update `manifest.json` to reference the PNG files:

```json
{
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

## API Endpoint

The extension requires the `/api/extract` endpoint to be deployed. This is included in the main Synapse project and will be available when deployed to Vercel.

For local development, you can:
1. Run the Synapse app locally with Vercel CLI: `vercel dev`
2. Update `SYNAPSE_APP_URL` in constants.ts to `http://localhost:3000`

## Troubleshooting

### "Content script not loaded" error
- Refresh the page and try again
- Some pages (chrome://, file://) cannot run content scripts

### "Not authenticated" error
- Click "Sign out" and log in again
- Check that your Supabase credentials are correct

### No transcript available
- Not all YouTube videos have captions
- The extension will show "metadata only" and allow saving without transcript

### Extraction fails
- Ensure the API endpoint is deployed and accessible
- Check browser console for detailed error messages
