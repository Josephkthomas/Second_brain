# CLAUDE.md - Synapse Knowledge Graph Platform

---

## AI AGENT INSTRUCTIONS

**READ THIS SECTION FIRST. This is your system prompt for working on this codebase.**

### Mandatory First Steps for Every New Conversation

1. **You have already read this file** - Claude Code automatically loads `CLAUDE.md` at conversation start
2. **Identify the task type** and jump to the relevant section below
3. **Do NOT re-explore the codebase** unless the task requires discovering something not documented here
4. **Reference specific files** mentioned in this document rather than searching

### Task Type Quick Reference

| If the task involves... | Read these sections | Key files |
|------------------------|---------------------|-----------|
| Graph visualization | GraphView Component | `components/GraphView.tsx` |
| Adding/extracting knowledge | InjectionHub, Gemini Service | `components/InjectionHub.tsx`, `services/gemini.ts` |
| Database changes | Database Schema, Supabase Service | `services/supabase.ts` |
| Chat/RAG features | ChatInterface | `components/ChatInterface.tsx` |
| New entity/relationship types | Entity Types, Theme System | `utils/theme.ts`, `types.ts` |
| Authentication | Auth Components | `contexts/AuthContext.tsx`, `pages/` |
| Chrome extension | Browser Extension | `extension/` directory |
| UI/styling changes | Styling and Theming | `utils/theme.ts`, Tailwind classes |
| New lens/filter | Lenses | `constants.ts`, `components/GraphView.tsx` |
| Orientation/digests | Orientation Engine | `components/OrientationCenter.tsx`, `services/digest.ts`, `services/digestAgents.ts` |
| YouTube playlists | YouTube Playlist Ingestion | `components/youtube/PlaylistList.tsx`, `components/youtube/AddPlaylistModal.tsx`, `api/youtube/playlists.ts`, `api/youtube/poll-playlist.ts` |
| Transcript extraction | Tiered Transcript Extraction | `services/transcriptExtractor.ts` |

### After Making Changes

**IMPORTANT**: After completing significant changes, update the relevant sections of this `CLAUDE.md` file to keep it current.

---

## Project Overview

### What is Synapse?

**Synapse** is a personal knowledge graph explorer ("Second Brain") that allows users to:

1. **Extract knowledge** from multiple sources (web pages, YouTube, meetings, documents, notes)
2. **Build an interconnected graph** with AI-powered entity extraction using Google Gemini
3. **Visualize relationships** using interactive D3.js force-directed graph
4. **Query conversationally** using Graph RAG (Retrieval-Augmented Generation)
5. **Capture on-the-go** with a Chrome browser extension

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 19 + TypeScript | UI framework |
| Build | Vite 6 | Dev server and bundling |
| Visualization | D3.js 7 | Force-directed graph |
| Styling | Tailwind CSS | Utility-first CSS |
| Icons | Lucide React | Consistent iconography |
| Database | Supabase (PostgreSQL) | Data persistence + auth |
| Vector Search | pgvector extension | Semantic similarity |
| AI | Google Gemini 1.5 | Entity extraction, embeddings, RAG |
| Extension | Chrome Manifest V3 | Browser capture |

---

## Repository Structure

```
/Second_brain/
│
├── MAIN APPLICATION
├── App.tsx                    # Main app - routing, layout, top-level state
├── index.tsx                  # React entry point
├── index.html                 # HTML template (includes Tailwind CDN)
├── types.ts                   # TypeScript interfaces (Node, Edge, Source)
├── constants.ts               # Lens configurations, app constants
├── vite.config.ts             # Vite config with env var handling
├── .env.local                 # Local credentials (GITIGNORED)
│
├── components/                # React UI Components
│   ├── GraphView.tsx          # [136KB] D3 graph visualization (LARGEST)
│   ├── InjectionHub.tsx       # [67KB] Multi-source knowledge extraction
│   ├── ChatInterface.tsx      # [19KB] Conversational Graph RAG
│   ├── DataGrid.tsx           # [20KB] Database table viewer
│   ├── Sidebar.tsx            # [19KB] Data vault, settings, table discovery
│   ├── SourceLog.tsx          # [16KB] Knowledge source history
│   ├── AIAnalyst.tsx          # [3KB] AI analysis overlay
│   ├── OrientationCenter.tsx  # Composable digest configuration + preview
│   ├── DigestViewer.tsx       # Digest output renderer
│   ├── DigestTemplateSelector.tsx # Module template picker modal
│   ├── AuthLayout.tsx         # Auth page wrapper
│   └── ProtectedRoute.tsx     # Route guard HOC
│
├── pages/                     # Full-page Auth Components
│   ├── Login.tsx              # Sign-in page
│   └── Register.tsx           # Account creation page
│
├── components/youtube/         # YouTube Feature Module
│   ├── YouTubeManager.tsx     # Main hub with tabs: channels, playlists, queue, history
│   ├── PlaylistList.tsx       # Connected playlist cards with status/actions
│   ├── AddPlaylistModal.tsx   # Playlist connection setup wizard
│   ├── ChannelList.tsx        # Subscribed channel cards
│   ├── AddChannelModal.tsx    # Channel subscription modal
│   └── ...                    # Other YouTube components
│
├── services/                  # Business Logic and API Integration
│   ├── supabase.ts            # [14KB] All database operations
│   ├── gemini.ts              # [31KB] All AI operations
│   ├── transcriptExtractor.ts # Tiered transcript extraction (caption-extractor → Innertube → Apify)
│   ├── digest.ts              # Digest CRUD (profiles, modules, channels, history)
│   └── digestAgents.ts        # Digest AI orchestration (sub-agents + meta-agent)
│
├── contexts/                  # React Context Providers
│   └── AuthContext.tsx        # Supabase auth state management
│
├── utils/                     # Helper Functions
│   └── theme.ts               # Entity type colors, icons, shapes
│
├── CHROME EXTENSION
├── extension/
│   ├── manifest.json          # Chrome extension manifest (V3)
│   ├── src/popup/             # Popup UI (React)
│   ├── src/content/           # Content scripts (YouTube, articles)
│   ├── src/background/        # Service worker
│   └── src/lib/               # Constants, Supabase client
│
└── dist/                      # Production build output
```

---

## Core Concepts

### Knowledge Graph Structure

```
┌─────────────────┐         ┌─────────────────┐
│ knowledge_nodes │────────▶│ knowledge_edges │
│   (Entities)    │◀────────│ (Relationships) │
└────────┬────────┘         └─────────────────┘
         │ source_id
         ▼
┌─────────────────┐
│knowledge_sources│
│  (Raw Content)  │
└─────────────────┘
```

- **Nodes**: Extracted entities (People, Projects, Topics, Goals, etc.)
- **Edges**: Relationships between nodes (leads_to, blocks, mentions, etc.)
- **Sources**: Original content that nodes were extracted from

### Anchors

**Anchors** are special high-priority nodes (flagged with `is_anchor: true`):
- Represent important Projects, Goals, or Topics
- Serve as focal points for organizing the graph
- Have special amber styling in the UI

### Lenses (Graph View Modes)

Defined in `constants.ts`:

| Lens | Filter | Purpose |
|------|--------|---------|
| All | No filter | Holistic view |
| Social | Person, Organization | People relationships |
| Strategic | Goal, Project, Decision | Planning view |
| Operational | Action, Risk, Blocker | Execution view |
| Creative | Topic, Insight, Idea | Ideas view |
| Pathways | All (directional) | Flow visualization |
| AnchorFocus | Selected anchor + neighbors | Isolated context |

### Entity Types

Defined in `utils/theme.ts`:

| Category | Types |
|----------|-------|
| Primary | Project, Topic, Goal, Decision |
| Secondary | Person, Organization, Insight, Action, Risk |
| Tertiary | Question, Blocker, Feedback, Achievement, Lesson, Hypothesis |
| Special | Anchor (priority focal points) |

### Relationship Types

| Polarity | Types |
|----------|-------|
| Positive | leads_to, supports, enables, created, achieved |
| Negative | blocks, contradicts, risks, prevents, challenges |
| Neutral | part_of, relates_to, mentions, connected_to |

---

## Database Schema

### knowledge_sources

```sql
id UUID PRIMARY KEY
title TEXT NOT NULL
content TEXT                    -- Full raw content
source_type TEXT NOT NULL       -- Meeting, YouTube, Note, Research, Document, Anchor
source_url TEXT
metadata JSONB                  -- Tags, custom fields
created_at TIMESTAMPTZ
user_id UUID                    -- RLS: users see only their data
```

### knowledge_nodes

```sql
id UUID PRIMARY KEY
label TEXT NOT NULL             -- Entity name
entity_type TEXT NOT NULL       -- Person, Project, Topic, etc.
description TEXT
confidence FLOAT                -- AI extraction confidence (0-1)
is_anchor BOOLEAN               -- Priority node flag
source TEXT                     -- Human-readable source
source_type TEXT
source_url TEXT
source_id UUID                  -- FK to knowledge_sources
embedding VECTOR(768)           -- pgvector for semantic search
created_at TIMESTAMPTZ
user_id UUID
```

### knowledge_edges

```sql
id UUID PRIMARY KEY
source_node_id UUID             -- FK to knowledge_nodes
target_node_id UUID             -- FK to knowledge_nodes
relation_type TEXT NOT NULL     -- leads_to, blocks, etc.
evidence TEXT                   -- Why this relationship exists
created_at TIMESTAMPTZ
user_id UUID
```

### youtube_playlists

```sql
id UUID PRIMARY KEY
user_id UUID                    -- FK to auth.users (RLS)
playlist_id TEXT NOT NULL       -- YouTube playlist ID (PLxxxx)
playlist_url TEXT NOT NULL
playlist_name TEXT
synapse_code TEXT NOT NULL      -- Generated code (e.g., SYN-7K3M)
auto_process BOOLEAN            -- Auto-process new videos
extraction_mode TEXT             -- comprehensive, strategic, etc.
anchor_emphasis TEXT
linked_anchor_ids UUID[]
custom_instructions TEXT
last_polled_at TIMESTAMPTZ
known_video_count INTEGER
total_videos_ingested INTEGER
is_active BOOLEAN
connection_status TEXT           -- pending, verified, error, disconnected
connection_error TEXT
```

### digest_profiles

```sql
id UUID PRIMARY KEY
user_id UUID                    -- FK to auth.users
name TEXT NOT NULL              -- e.g., "Morning Brief"
description TEXT
frequency TEXT                  -- daily, weekly, monthly
delivery_time TIME              -- When to deliver (user's timezone)
timezone TEXT                   -- IANA timezone
scope JSONB                     -- {"mode":"all_active"} or {"mode":"selected","anchor_ids":[]}
density TEXT                    -- brief, standard, comprehensive
is_active BOOLEAN
last_generated_at TIMESTAMPTZ
```

### digest_modules

```sql
id UUID PRIMARY KEY
digest_profile_id UUID          -- FK to digest_profiles (CASCADE)
user_id UUID
template_id TEXT                -- References config/digestTemplates.ts
custom_name TEXT                -- For custom modules
user_context TEXT               -- Additional user instructions
tools_enabled JSONB             -- ["graph_query", "web_search"]
sort_order INTEGER
is_active BOOLEAN
```

### digest_channels

```sql
id UUID PRIMARY KEY
digest_profile_id UUID          -- FK to digest_profiles (CASCADE)
channel_type TEXT               -- email, telegram, slack
channel_config JSONB            -- {"address":"user@example.com"}
density_override TEXT           -- Optional per-channel density
is_active BOOLEAN
```

### digest_history

```sql
id UUID PRIMARY KEY
digest_profile_id UUID          -- FK to digest_profiles (CASCADE)
user_id UUID
content JSONB                   -- Full DigestOutput JSON
module_outputs JSONB            -- Individual module results
channels_delivered TEXT[]       -- Which channels received it
status TEXT                     -- generating, completed, failed
generation_time_ms INTEGER
```

---

## Services Reference

### Supabase Service (`services/supabase.ts`)

**Authentication:**
- `getSupabase()` - Get configured client
- `getCurrentUserId()` - Get authenticated user ID

**Graph Data:**
- `fetchAnchors()` - Get all anchor nodes
- `fetchExistingNodes()` - Get recent non-anchor nodes
- `fetchRelevantNodes(keywords)` - Keyword search
- `fetchNodeNeighbors(nodeId)` - Get edges for a node
- `semanticSearchNodes(embedding, threshold, count)` - Vector search

**CRUD:**
- `fetchTableData(table, page, pageSize, sort)` - Paginated data
- `insertRows(table, rows)` - Add rows
- `deleteRows(table, ids)` - Remove rows
- `mergeNodes(keepId, discardId)` - Merge duplicates

**Sources:**
- `saveKnowledgeSource(...)` - Save source, returns ID
- `fetchAllSources()` - Get all sources
- `searchKnowledgeSources(query)` - Full-text search

**Embeddings:**
- `fetchNodesWithoutEmbeddings(limit)` - Nodes needing vectors
- `updateNodeEmbedding(nodeId, embedding)` - Store embedding

### Gemini Service (`services/gemini.ts`)

**Extraction:**
- `extractKnowledgeFromText(text, instructions)` - Extract nodes/edges
- `extractKnowledgeFromWeb(url, title)` - Extract from web
- `extractKnowledgeFromFile(file)` - Extract from files
- `performDeepResearch(query, focus, depth)` - Multi-source research

**Entity Processing:**
- `generateEmbedding(text)` - 768-dim vector
- `resolveEntityMatch(newNode, existingNode)` - Check duplicates
- `generateCrossConnections(newNodes, existingNodes, anchors)` - Auto-link

**Graph Querying:**
- `queryGraphRAG(query, mode, nodeId)` - Conversational RAG
- `suggestRelationship(source, target)` - AI-suggested edge

**Utilities:**
- `extractKeywordsFromQuery(query)` - LOCAL keyword extraction (no API)
- `backfillEmbeddings(limit, callback)` - Batch generate embeddings

### Digest Service (`services/digest.ts`)

**Profile CRUD:**
- `fetchDigestProfiles()` - List all user's digest profiles
- `fetchDigestProfile(id)` - Get profile with modules + channels
- `createDigestProfile(data)` - Create new profile
- `updateDigestProfile(id, updates)` - Update profile settings
- `deleteDigestProfile(id)` - Delete profile (cascades)

**Module CRUD:**
- `addDigestModule(data)` - Add module to profile
- `updateDigestModule(id, updates)` - Update module settings
- `deleteDigestModule(id)` - Remove module
- `reorderDigestModules(profileId, moduleIds)` - Reorder modules

**Channel CRUD:**
- `addDigestChannel(data)` - Add delivery channel
- `updateDigestChannel(id, updates)` - Update channel config
- `deleteDigestChannel(id)` - Remove channel

**History:**
- `fetchDigestHistory(profileId?, limit?)` - Get delivery history
- `saveDigestResult(result)` - Store generated digest

### Digest Agents (`services/digestAgents.ts`)

- `generateDigest(profileId, onProgress?)` - Full digest generation orchestration
- `getTimeRange(frequency)` - Calculate reporting period

### Transcript Extractor (`services/transcriptExtractor.ts`)

- `extractTranscript(videoId, videoUrl, apifyApiKey?)` - Tiered extraction with fallback
- `generatePlaylistCode()` - Generate unique SYN-XXXX code
- `extractPlaylistId(url)` - Parse playlist ID from YouTube URL

**Extraction tiers:**
1. `youtube-caption-extractor` (free, fast, ~90% success)
2. Innertube API direct (free, backup)
3. Apify transcript scraper (paid, reliable)
4. Manual fallback (no transcript available)

---

## Key Components

### GraphView (`components/GraphView.tsx`)

136KB - Core D3.js visualization.

**Interaction Modes:** select, pan, scan, link, merge, pin

**Keyboard Shortcuts:**
- Space: Freeze/unfreeze physics
- Escape: Deselect
- Delete: Delete selected
- Z (hold): X-Ray mode

### InjectionHub (`components/InjectionHub.tsx`)

67KB - Multi-source knowledge extraction.

**Workflow:** INPUT → PROCESSING → REVIEW → SAVING → DONE

**Source Types:** Research, YouTube, Meeting, Note, Document, Anchor

### ChatInterface (`components/ChatInterface.tsx`)

19KB - Conversational Graph RAG.

**Query Modes:**
- `chat` - Free-form queries
- `trace` - Node connection tracing
- `contextualize` - Relate node to conversation

---

## Chrome Extension

**Directory:** `extension/`

One-click knowledge capture from YouTube and web articles.

**Key Files:**
- `manifest.json` - Chrome config
- `src/content/youtube.ts` - YouTube transcript extraction
- `src/content/article.ts` - Article extraction
- `src/popup/Popup.tsx` - Main popup UI

**Build:**
```bash
cd extension && npm install && npm run build
```

Load `extension/dist/` as unpacked extension in Chrome.

---

## Environment Variables

### Main App (`.env.local`)

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
GEMINI_API_KEY=AIzaSy...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...  # Optional
```

### Extension (`extension/src/lib/constants.ts`)

Update SUPABASE_URL, SUPABASE_ANON_KEY, SYNAPSE_APP_URL directly in file.

---

## Running Locally

```bash
# Main app
npm install
cp .env.example .env.local   # Add credentials
npm run dev                  # http://localhost:5173
```

**IMPORTANT**: `npm run dev` only runs the Vite frontend server. API endpoints in `/api/*` are **Vercel serverless functions** and will NOT work with just `npm run dev`.

### Full Local Development (with API)

To run both frontend AND API endpoints locally, use Vercel CLI:

```bash
npx vercel login            # One-time authentication
npx vercel dev              # Runs full stack locally
```

### Extension Development

```bash
cd extension
npm install
npm run build
# Load extension/dist/ in Chrome
```

---

## Development & Deployment Workflow

### IMPORTANT: Feature Branch Workflow (MANDATORY)

**NEVER push directly to `main` branch.** All changes must go through feature branches and preview testing first.

### URLs

| Environment | URL | Purpose |
|-------------|-----|---------|
| **Production** | https://second-brain-one-mocha.vercel.app/ | Live site for all users |
| **Preview** | Auto-generated per branch | Testing before merging to production |
| **Vercel Dashboard** | https://vercel.com/joseph-thomas-projects-3897392c/second-brain | Manage deployments |

### Step-by-Step Workflow for New Features

#### Step 1: Create Feature Branch
```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

Use descriptive branch names like:
- `feature/youtube-rescan`
- `fix/login-bug`
- `update/graph-styling`

#### Step 2: Make Changes
- Write code
- Test locally if possible (with `vercel dev` for API endpoints)

#### Step 3: Commit and Push to Feature Branch
```bash
git add <specific-files>
git commit -m "feat: Description of changes"
git push origin feature/your-feature-name
```

#### Step 4: Get Preview URL
Vercel automatically creates a **preview deployment** for the branch. Find it:
1. Check the Vercel dashboard, OR
2. Run: `vercel --prod=false` to get the preview URL

The preview URL format: `https://second-brain-<branch-hash>.vercel.app/`

#### Step 5: Test on Preview URL
- **Provide the preview URL to the user**
- User tests the feature
- User confirms: "This is good, please merge to main"

#### Step 6: Merge to Production (Only After User Approval)
```bash
git checkout main
git pull origin main
git merge feature/your-feature-name
git push origin main
```

Or create a Pull Request on GitHub for more visibility.

#### Step 7: Clean Up
```bash
git branch -d feature/your-feature-name
git push origin --delete feature/your-feature-name
```

### Quick Reference Commands

```bash
# Start new feature
git checkout -b feature/name

# Check current branch
git branch

# Switch branches
git checkout main
git checkout feature/name

# See all branches (including remote)
git branch -a

# Delete local branch
git branch -d feature/name
```

### For AI Agents: CRITICAL RULES

1. **NEVER push to main directly** - Always use feature branches
2. **ALWAYS provide preview URL** to user before merging
3. **WAIT for user confirmation** before merging to main
4. **Use clear commit messages** with prefixes: `feat:`, `fix:`, `update:`, `docs:`
5. **One feature per branch** - Don't mix unrelated changes

---

## Common Tasks

| Task | Files to Modify |
|------|-----------------|
| Add entity type | `utils/theme.ts`, `types.ts` |
| Add relationship type | `services/gemini.ts` |
| Modify graph physics | `components/GraphView.tsx` |
| Change extraction | `services/gemini.ts` |
| Add source type | `components/InjectionHub.tsx` |
| New database query | `services/supabase.ts` |
| Modify chat | `components/ChatInterface.tsx` |
| Add new lens | `constants.ts`, `GraphView.tsx` |
| Add digest template | `config/digestTemplates.ts` |
| Modify digest UI | `components/OrientationCenter.tsx` |
| Modify digest generation | `services/digestAgents.ts`, `api/digest/generate.ts` |
| Add delivery channel | `api/digest/deliver.ts`, `components/OrientationCenter.tsx` |
| Add YouTube playlist feature | `components/youtube/PlaylistList.tsx`, `api/youtube/playlists.ts` |
| Modify transcript extraction | `services/transcriptExtractor.ts` |
| Modify playlist polling | `api/youtube/poll-playlist.ts` |

---

## Gotchas

1. **pgvector Required** - Semantic search needs pgvector extension in Supabase
2. **Gemini Rate Limits** - ~60 requests/minute
3. **Large Graph Performance** - Slows with >10k nodes
4. **GraphView Complexity** - 136KB, understand D3 before modifying
5. **Keyword Search is Local** - `extractKeywordsFromQuery()` has no API call
6. **Extension Credentials** - Must update `extension/src/lib/constants.ts` manually

---

## Keeping This File Updated

Update when you:
- Add new components
- Modify database schema
- Add entity/relationship types
- Add service functions
- Change architecture

**AI Agents: After completing significant work, update this file.**

---

*Last updated: February 2026*
