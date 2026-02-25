# PRD: YouTube Watch History HTML Import Pipeline

## Synapse — Bulk Knowledge Graph Ingestion from Google Takeout

**Version:** 1.0  
**Status:** Draft  
**Author:** Joseph (product), Claude (spec)  
**Date:** February 17, 2026

---

## 1. Problem Statement

Synapse currently ingests YouTube content one video at a time — the channel auto-ingestion pipeline fetches a transcript, extracts entities and edges, and cross-references with the existing graph. This produces deep, high-fidelity knowledge from individual pieces of content.

But users accumulate thousands of videos over years. The patterns that emerge across an entire watch history — recurring topics, cross-domain concept bridges, knowledge source relationships, interest trajectories — are invisible to a one-at-a-time pipeline. A user who watches 260 Matthew Berman videos and 194 Nikhil Kamath videos has an implicit knowledge graph connecting AI tooling to Indian entrepreneurship that no single video extraction will ever surface.

This feature treats the user's **complete YouTube watch history as a single knowledge corpus** and extracts the graph that lives in the aggregate — then weaves it into whatever already exists in Synapse.

---

## 2. Scope & Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Extraction source | Video titles + channel names only | No transcript fetching — speed and cost at 50K+ videos |
| Clustering method | Channel-based → YouTube API tag-enriched → temporal fallback | Quality of extraction scales directly with batch coherence |
| Entity resolution | Match AND enrich existing nodes | Watch history adds context that improves existing entities |
| Anchor integration | Yes — user selects anchors pre-processing | Consistent with existing YouTube pipeline UX |
| Incremental imports | Delta detection on re-import | Prevents duplicate processing on updated exports |
| WatchGraph integration | None (separate app) | Keep systems decoupled for now |
| Processing model | Client-side orchestration with per-batch API calls | Avoids Vercel function timeouts |

---

## 3. Google Takeout HTML Format

### 3.1 File Structure

Google Takeout exports watch history as a single HTML file. Each video entry is a `div` with class `content-cell` containing:

```html
<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">
  Watched <a href="https://www.youtube.com/watch?v=VIDEO_ID">Video Title</a><br>
  <a href="https://www.youtube.com/channel/UC...">Channel Name</a><br>
  Jan 15, 2026, 9:50:09 AM GMT
</div>
```

Titles and channel names contain HTML entities (`&#39;`, `&amp;`, etc.) that must be decoded.

### 3.2 Entry Classification

| Type | Detection | Action |
|---|---|---|
| Standard video | Has video `<a>` + channel `<a>` + timestamp | Parse fully |
| Deleted video | "video that has been removed" | Skip |
| Ad | Contains "From Google Ads" | Filter out |
| Short | URL contains `/shorts/` or title is a raw URL | Flag, user decides |
| Story/Post | Non-video content | Skip |

### 3.3 Parsed Entry Schema

```typescript
interface WatchHistoryEntry {
  video_title: string;       // HTML-decoded
  video_url: string;
  video_id: string;          // Extracted from watch?v=XXX
  channel_name: string;      // HTML-decoded
  channel_url: string;
  channel_id: string;        // Extracted from /channel/UCxxxx
  timestamp: Date;           // Parsed from "Mon DD, YYYY, HH:MM:SS AM/PM GMT"
  is_short: boolean;
  is_ad: boolean;
  is_deleted: boolean;
}
```

---

## 4. Pipeline Architecture

### 4.1 Stage Overview

```
 STAGE 1        STAGE 2         STAGE 3          STAGE 4         STAGE 5          STAGE 6
┌────────┐   ┌───────────┐   ┌────────────┐   ┌───────────┐   ┌────────────┐   ┌──────────┐
│ PARSE  │──▶│  CLEAN &  │──▶│  CLUSTER   │──▶│  EXTRACT  │──▶│  RESOLVE   │──▶│  SAVE &  │
│  HTML  │   │  FILTER   │   │  & BATCH   │   │ PER BATCH │   │  & MERGE   │   │ CONNECT  │
└────────┘   └───────────┘   └────────────┘   └───────────┘   └────────────┘   └──────────┘
 Client        Client          Client +          Server          Server           Server
                               YT API
```

### 4.2 Execution Model

**Client-side orchestration.** The client parses the HTML, builds clusters, and then sends batches one at a time to a server endpoint. This avoids Vercel function timeouts and gives the user real-time progress feedback.

```
Client                                Server
  │                                      │
  │  1. Parse HTML locally               │
  │  2. Deduplicate entries              │
  │  3. Fetch channel tags (YT API)     │
  │  4. Build clusters                   │
  │                                      │
  │  for each batch:                     │
  │  ──── POST /api/youtube/extract-batch ──▶│
  │  ◀──── { nodes, edges, summary } ────│
  │                                      │
  │  After all batches:                  │
  │  ──── POST /api/youtube/finalize-import ─▶│
  │       (merged entities, options)      │  merge, resolve, save
  │  ◀──── { results summary } ──────────│
  │                                      │
```

---

## 5. Stage 1 — HTML Parsing (Client-Side)

### 5.1 Why Client-Side

The HTML file can be 50–200MB for heavy users. Parsing it in the browser avoids uploading raw HTML to the server. Only the structured entry array (much smaller) gets sent downstream.

### 5.2 Parser: `utils/watchHistoryParser.ts`

The parser uses regex to match each `content-cell` div, then extracts the video link, channel link, and timestamp from within. It:

1. Matches all `content-cell` divs with `mdl-typography--body-1` class
2. Checks for deleted/ad/story patterns and skips them
3. Extracts video URL + title from the first `<a>` tag after "Watched"
4. Extracts channel URL + name from the second `<a>` tag
5. Extracts the timestamp from the last line of text (after final `<br>`)
6. Decodes all HTML entities in titles and channel names
7. Flags potential Shorts based on URL pattern or title being a raw URL

### 5.3 Output

```typescript
interface ParsedWatchHistory {
  entries: WatchHistoryEntry[];
  metadata: {
    totalParsed: number;
    dateRange: { earliest: Date; latest: Date };
    uniqueChannels: number;
    uniqueVideos: number;
    skippedAds: number;
    skippedDeleted: number;
    skippedShorts: number;
  };
}
```

---

## 6. Stage 2 — Cleaning & Filtering (Client-Side)

### 6.1 Deduplication

Videos watched multiple times collapse into a single entry:

```typescript
interface DeduplicatedEntry extends Omit<WatchHistoryEntry, 'timestamp'> {
  view_count: number;
  first_watched: Date;
  last_watched: Date;
  timestamps: Date[];
}
```

Deduplication key is `video_id`. For each duplicate, increment `view_count` and track all timestamps. This preserves repeat-watching signals (your "Chicken Dum Biryani Recipe" at 18 views, "3:15 (Breathe)" at 29 views) which the extraction prompt uses to weight entity importance.

### 6.2 User Filters (Pre-Processing Review UI)

Before processing begins, the user sees a summary and can adjust:

| Filter | Default | Description |
|---|---|---|
| Include Shorts | Off | Whether to process detected YouTube Shorts |
| Date range | Full range | Narrow to specific window |
| Minimum view count | 1 | Only include videos watched N+ times |
| Channel blocklist | Empty | Exclude specific channels from processing |
| Minimum channel frequency | 1 | Only include channels with N+ total videos |

### 6.3 Anchor Selection

Same pattern as the existing YouTube pipeline. The user can select from their existing anchor nodes. Selected anchors get injected into every batch extraction prompt. The user also selects anchor emphasis level: passive, standard, or aggressive.

---

## 7. Stage 3 — Clustering & Batching (Client + YouTube API)

This is the most important stage for extraction quality. The goal is to produce batches where every video title in the batch shares thematic context, so Gemini can extract rich, connected knowledge rather than a scatter of unrelated entities.

### 7.1 Three-Tier Clustering

**Tier 1: Channel-Based Clusters**

Any channel with 10+ unique videos after dedup becomes its own batch (or multiple batches if it exceeds 100 titles). These are the highest-quality batches because a single channel's content is almost always thematically coherent.

For a dataset like yours (~16,487 unique channels), the top ~200-300 channels would qualify, covering roughly 60-70% of all videos.

**Tier 2: YouTube API Tag-Enriched Thematic Clusters**

For channels with fewer than 10 videos (the long tail), the pipeline:

1. Collects all unique channel IDs from the remaining entries
2. Calls the YouTube Data API `channels.list` endpoint with `part=topicDetails,snippet` (up to 50 channel IDs per request)
3. Extracts `topicCategories` (Wikidata-based taxonomy like "Technology", "Sports", "Entertainment") and channel `keywords` from the snippet
4. Groups channels by their primary topic category
5. Within each topic group, forms batches of 50-100 video titles

**API call math:** ~16,000 remaining channels / 50 per request = ~320 API calls at 1 quota unit each = 320 units (well within the 10,000/day default quota).

**What the API returns per channel:**

```json
{
  "topicDetails": {
    "topicCategories": [
      "https://en.wikipedia.org/wiki/Technology",
      "https://en.wikipedia.org/wiki/Artificial_intelligence"
    ]
  },
  "snippet": {
    "title": "Matthew Berman",
    "description": "...",
    "tags": ["AI", "machine learning", "ChatGPT"]  // Not always present
  }
}
```

The Wikidata topic categories serve as the primary clustering signal. Channels that share a topic category get grouped together. If a channel has multiple categories, it gets assigned to its first (primary) category.

**Fallback for channels with no topic data:** Some channels have no topic categories in the API response. These fall through to Tier 3.

**Side benefit:** The fetched channel metadata (topic categories, descriptions) gets stored as enrichment data and injected into the extraction prompts, giving Gemini more context than just titles.

**Tier 3: Temporal Fallback**

Any videos not clustered by Tier 1 or Tier 2 get grouped by calendar quarter. These produce lower-quality extraction but ensure 100% coverage.

### 7.2 Batch Schema

```typescript
interface VideoBatch {
  batch_id: string;
  batch_type: 'channel' | 'thematic' | 'temporal';
  label: string;                      // e.g., "Matthew Berman (AI)" or "Q2 2024 — Technology"
  entries: DeduplicatedEntry[];
  total_views: number;                // Sum of view_counts
  channel_names: string[];            // Unique channels in batch
  channel_tags: string[];             // Aggregated from YouTube API (Tier 2)
  date_range: { start: Date; end: Date };
}
```

### 7.3 Scale Estimate

For a ~51K video / ~30K unique dataset:

| Tier | Batches | Coverage | Quality |
|---|---|---|---|
| Channel-based | ~50-80 | ~60-70% of videos | Highest |
| Tag-enriched thematic | ~30-50 | ~25-35% of videos | High |
| Temporal fallback | ~5-15 | ~5-10% of videos | Moderate |
| **Total** | **~85-145** | **100%** | |

---

## 8. Stage 4 — Entity & Edge Extraction (Server-Side, Per Batch)

### 8.1 Endpoint: `POST /api/youtube/extract-batch`

Each batch is sent individually. The endpoint receives the batch, builds a specialized prompt, calls Gemini, and returns extracted nodes and edges.

### 8.2 Extraction Prompt Design

The prompt is fundamentally different from the existing transcript-based extraction. The AI is analyzing **a list of titles and channels**, not prose. It must infer entities and relationships from naming patterns, channel context, and viewing frequency.

Key prompt sections:

**Batch Context Block**
```
Batch: "Matthew Berman — AI/Technology" (channel-based)
Videos: 214 unique (260 total views)
Channel Tags: AI, machine learning, ChatGPT, language models
Date Range: Dec 2023 → Jan 2026
```

**Video List**
```
- "Claude 3.5 Sonnet is HERE - BEATS GPT-4o!" (Mar 2024) [watched 2x]
- "I Built an AI Agent That Does My Work" (Jul 2024)
- "Claude Code Just Changed Everything" (Jan 2025) [watched 3x]
...
```

**Extraction Instructions**

The prompt asks for entities that represent the **knowledge substance** of the viewing pattern:

- **Person**: Named individuals (creators, experts, public figures)
- **Topic**: Subject areas the user is learning about
- **Organization**: Companies, teams, institutions
- **Product/Technology**: Tools, platforms, frameworks
- **Concept**: Abstract ideas, theories, frameworks
- **Channel**: The YouTube channel itself as a knowledge source node
- **Skill**: Skills the user appears to be developing
- **Interest**: Identifiable interest clusters

**Edge instructions emphasize five relationship categories:**

1. **Knowledge source edges**: Channel X `teaches` Topic Y, Person X `discusses` Concept Y
2. **Thematic bridges**: Concept X `applies_to` Topic Y (cross-domain connections)
3. **Temporal evolution**: Topic X `evolved_into` Topic Y
4. **Repeat-watching significance**: entities from 3x+ viewed videos get flagged and weighted
5. **Standard semantic edges**: `part_of`, `enables`, `relates_to`, `created_by`, `competes_with`

**Anchor injection** (if user selected anchors):
```
Priority Anchors — find connections to these:
- "WatchGraph" (Project): Personal analytics dashboard for YouTube data
- "AI Automation" (Topic): Building automated workflows with AI
```

### 8.3 Output Schema Per Batch

```typescript
interface BatchExtractionResult {
  nodes: {
    label: string;
    type: string;
    description: string;
    confidence: number;
    tags: string[];
    evidence: string;          // Which video titles support this
    view_weight: number;       // Total views across related videos
  }[];
  edges: {
    source: string;            // Exact node label
    target: string;            // Exact node label
    relation: string;
    evidence: string;
    weight: number;
  }[];
  batch_summary: string;       // 2-3 sentence narrative
}
```

### 8.4 Rate Limiting & Error Handling

- 1-2 second delay between batch API calls (client-side, between fetch calls)
- Retry failed batches up to 2 times with exponential backoff
- If a batch fails all retries, log it and continue — don't block the entire import
- Track which batches succeeded/failed for the summary screen

---

## 9. Stage 5 — Cross-Batch Merge & Entity Resolution (Server-Side)

### 9.1 Endpoint: `POST /api/youtube/finalize-import`

After all batches are extracted, the client sends the aggregated results to a finalization endpoint that handles merging, resolution, and persistence.

### 9.2 Cross-Batch Entity Merging

Entities extracted from different batches will overlap. "AI", "ChatGPT", "Claude" might each appear in 10+ batches. Merging logic:

1. **Normalize labels** — case-insensitive matching (`"claude code"` and `"Claude Code"` merge)
2. **Take highest confidence** from any batch
3. **Union all tags** from all batches
4. **Sum view weights** across batches
5. **Track batch count** — entities appearing in more batches represent more pervasive interests
6. **Keep the longest/richest description**

```typescript
interface MergedEntity {
  label: string;                // Original casing preserved
  type: string;
  description: string;
  confidence: number;
  tags: string[];
  total_view_weight: number;
  source_batches: string[];
  batch_count: number;          // Higher = more pervasive interest
}
```

Edges also get merged — same source→target→relation deduplicates, with evidence concatenated and weight taking the max.

### 9.3 Resolution Against Existing Graph

This is the core value step. The merged watch history entities get compared against everything in `knowledge_nodes`:

**Step 1: Fetch existing graph context**
```sql
-- Recent non-anchor nodes (up to 500)
SELECT id, label, entity_type, description, tags
FROM knowledge_nodes
WHERE user_id = $1
ORDER BY created_at DESC LIMIT 500;

-- All user anchors
SELECT id, label, description, entity_type
FROM knowledge_nodes
WHERE user_id = $1 AND is_anchor = true;
```

**Step 2: Label matching**

Build a case-insensitive lookup map from existing node labels to their IDs. For each merged entity, check if it already exists.

**Step 3: Classification**

Each merged entity becomes one of:
- **Matched** — label matches an existing node → create edges to it AND enrich it
- **New** — no match → insert as a new node

**Step 4: Enrichment of matched nodes**

When a watch history entity matches an existing node, update the existing node:

```typescript
// Enrichment update for matched nodes
await supabase
  .from('knowledge_nodes')
  .update({
    description: enrichedDescription,   // Append watch history context
    tags: mergedTags,                   // Union of existing + watch history tags
    confidence: Math.max(existing.confidence, merged.confidence),
    // Store watch history metadata in a JSONB field or append to description
  })
  .eq('id', existingNodeId);
```

The enriched description appends context like: *"Referenced across 34 content clusters in YouTube watch history spanning Nov 2023–Jan 2026, with 847 total video views related to this entity."*

**Step 5: Cross-connections for new nodes**

New nodes that don't match anything existing get cross-referenced using the existing `generateCrossConnections` function from `services/gemini.ts`. This is the same AI-powered cross-referencing the YouTube channel pipeline already uses — it sends the new node labels alongside existing node labels to Gemini and asks it to identify meaningful connections.

---

## 10. Stage 6 — Edge Creation & Persistence (Server-Side)

### 10.1 Three Layers of Edges

This is the payoff of the entire pipeline. Three distinct categories of edges get created:

**Layer 1: Internal Edges (Within Watch History)**

Edges between entities that were both extracted from the watch history. These represent the knowledge structure of the user's content consumption.

Examples:
- `Matthew Berman` → teaches → `AI Agent Building`
- `Claude Code` → part_of → `AI Development Tools`
- `n8n` → enables → `AI Automation`
- `Alex Hormozi` → discusses → `SaaS Customer Acquisition`

**Layer 2: Cross-Reference Edges (Watch History → Existing Graph)**

Edges from newly created watch history nodes to nodes that already existed in Synapse from other sources (meetings, web research, notes, documents). These are created by the `generateCrossConnections` function.

Examples (assuming existing graph has nodes from meeting notes and research):
- `SaaS Building` (watch history) → depends_on → `Product-Market Fit` (existing from meeting)
- `AI Agents` (watch history) → relates_to → `Synapse Architecture` (existing from notes)
- `Nikhil Kamath` (watch history) → discusses → `Indian Startup Ecosystem` (existing from research)

**Layer 3: Enrichment Edges (Between Existing Nodes, Revealed by Watch History)**

The highest-value category. When the watch history reveals that two *already-existing* nodes are connected in ways the graph didn't previously capture. These emerge when both the source and target of a watch-history edge map to existing nodes that weren't previously linked.

Example: The graph already has "Performance Optimization" (from a meeting note) and "MMA Training Periodization" (from a research article), but they're not connected. The watch history extraction produces an edge `Performance Optimization` → applies_to → `Training Periodization` because the user watches both concepts across multiple channels. On resolution, both map to existing nodes, and a new edge gets created between them that didn't exist before.

### 10.2 Edge Insertion Logic

```typescript
interface EdgeInsertionResult {
  internal: number;      // Layer 1 count
  crossReference: number; // Layer 2 count
  enrichment: number;    // Layer 3 count
  skippedDuplicate: number;
}
```

Before inserting any edge, check for existing edges with the same `source_node_id` + `target_node_id` + `relation_type` to avoid duplicates. This is critical for incremental imports.

All watch history edges get a standard `weight` of 0.5-0.8 (lower than transcript-derived edges which are typically 1.0, reflecting the lower certainty of title-only extraction) and evidence text that traces back to the watch history source.

### 10.3 Knowledge Source Entry

A single `knowledge_sources` row for the entire import:

```typescript
{
  title: "YouTube Watch History Import (Nov 2023 → Jan 2026)",
  content: null,  // Too large to store raw HTML; store summary instead
  source_type: 'WatchHistory',
  metadata: {
    import_type: 'google_takeout',
    total_entries: 51787,
    unique_videos: 30421,
    unique_channels: 16487,
    date_range: { earliest: '2023-11-08', latest: '2026-01-15' },
    batches_processed: 94,
    skipped: { ads: 342, deleted: 1204, shorts: 3200 },
    processing_duration_ms: 272000,
    filters_applied: { includeShorts: false, minViewCount: 1 },
  }
}
```

### 10.4 Embedding Backfill

After all nodes are inserted, queue them for embedding generation using the existing `backfillEmbeddings` utility. This runs asynchronously and doesn't block the import completion.

---

## 11. Incremental Import (Delta Detection)

### 11.1 How It Works

On each import, the pipeline stores a fingerprint of what was processed. On re-import, it computes the delta.

**Fingerprint storage:** The `knowledge_sources.metadata` for a WatchHistory import includes a `processed_video_ids` array (or a hash set stored in a dedicated column/table if the array is too large).

**Simpler approach for V1:** Store a `last_import_latest_timestamp` in the source metadata. On re-import, only process entries with timestamps newer than this value. This doesn't handle retroactive history additions (Google sometimes backfills) but covers the primary use case of "I exported again 3 months later."

### 11.2 Delta Processing

```typescript
// On re-import
const previousImport = await getLatestWatchHistorySource(userId);
if (previousImport) {
  const cutoff = new Date(previousImport.metadata.date_range.latest);
  entries = entries.filter(e => e.timestamp > cutoff);
  addLog(`Incremental import: ${entries.length} new entries since ${cutoff.toLocaleDateString()}`);
}
```

The delta entries go through the same full pipeline (clean → cluster → extract → resolve → save), but with the additional benefit that the existing graph now includes all the nodes from the previous import, so cross-referencing is richer.

---

## 12. Watch History-Specific Edge Types

In addition to Synapse's standard relationship types, this pipeline introduces consumption-pattern edges:

| Edge Type | Meaning | Example |
|---|---|---|
| `teaches` | Channel/Person is a knowledge source for a Topic | Matthew Berman → teaches → LLM Comparison |
| `discusses` | Entity covers/analyzes another entity | Alex Hormozi → discusses → SaaS Pricing |
| `applies_to` | Cross-domain concept transfer | Optimization → applies_to → MMA Training |
| `evolved_into` | Interest trajectory over time | ChatGPT → evolved_into → AI Agents |
| `consumes_alongside` | Frequently co-viewed in same sessions | NBA Highlights → consumes_alongside → MMA Analysis |
| `discovered_via` | How user likely found a topic | JRE Clips → discovered_via → Lex Fridman |
| `bridges` | Entity connecting separate domains | Performance Optimization → bridges → [MMA, AI, Business] |
| `ritual_content` | High-repeat-view behavioral pattern | Deep Sleep Music → ritual_content → Sleep Routine |
| `created_by` | Attribution | Claude Code → created_by → Anthropic |
| `competes_with` | Alternative or rival entities | ChatGPT → competes_with → Claude |

These supplement the existing edge types (`leads_to`, `supports`, `blocks`, `depends_on`, `part_of`, `mentions`, `relates_to`, `enables`) — they don't replace them.

---

## 13. Frontend Integration

### 13.1 InjectionHub — New Source Type

Add `WatchHistory` to the source type grid in `InjectionHub.tsx`:

```typescript
{
  type: 'WatchHistory',
  icon: Youtube,        // Or a custom history icon
  label: 'Watch History',
  description: 'Import Google Takeout YouTube watch history',
  accept: '.html',
}
```

### 13.2 New Workflow Steps

The standard InjectionHub workflow is: `input → processing → review → saving → done`

For WatchHistory, this becomes:

```
input → parsing → review-import → clustering → processing-batches → finalizing → done
```

| Step | What Happens | User Sees |
|---|---|---|
| `input` | User selects file | Standard file upload UI |
| `parsing` | Client parses HTML | "Parsing watch history... 51,787 entries found" |
| `review-import` | User reviews stats + sets filters + selects anchors | Pre-processing summary screen (see 13.3) |
| `clustering` | Client fetches YT API tags + builds batches | "Enriching channel data... Building 94 batches..." |
| `processing-batches` | Client sends batches one by one | Batch progress bar with per-batch status |
| `finalizing` | Server merges + resolves + saves | "Merging entities... Cross-referencing... Saving..." |
| `done` | Results summary | Completion screen with edge counts |

### 13.3 Review-Import Screen

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Watch History Import                                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  51,787 videos parsed from watch-history.html                │
│  Date range: Nov 8, 2023 → Jan 15, 2026                     │
│  16,487 unique channels · 30,421 unique videos               │
│                                                              │
│  Filtered out: 342 ads · 1,204 deleted · 3,200 shorts       │
│                                                              │
│  ┌─ Filters ──────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ☐ Include Shorts (3,200 detected)                     │  │
│  │  Minimum views: [ 1 ▾ ]                                │  │
│  │  Date range: [ Nov 2023 ] → [ Jan 2026 ]               │  │
│  │  Min channel frequency: [ 1 ▾ ]                        │  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Anchors (optional) ──────────────────────────────────┐  │
│  │  ☐ WatchGraph         ☐ AI Automation                 │  │
│  │  ☐ SaaS Building      ☐ Knowledge Management          │  │
│  │                                                        │  │
│  │  Emphasis: ( ) Passive  (•) Standard  ( ) Aggressive   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Top Channels:                                               │
│  1. Inspiredbyhoops (569 views)  2. Matthew Berman (260)     │
│  3. ESPN (260)  4. The Sigma Life (206)  5. ESPN MMA (204)   │
│                                                              │
│  Estimated: ~94 batches · ~$0.15 · ~4 min processing        │
│                                                              │
│  [ Cancel ]                            [ Start Import → ]   │
└─────────────────────────────────────────────────────────────┘
```

### 13.4 Batch Progress Screen

```
┌─────────────────────────────────────────────────────────────┐
│  ⚡ Processing Watch History                                 │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ████████████████████░░░░░░░░░░  67/94 batches              │
│                                                              │
│  Current: "Nikhil Kamath — Business/Entrepreneurship"        │
│  Status: Extracting entities...                              │
│                                                              │
│  Running totals:                                             │
│  · 1,247 entities extracted                                  │
│  · 2,891 edges identified                                    │
│  · 3 batches failed (will retry)                             │
│                                                              │
│  Elapsed: 2m 48s · Est. remaining: 1m 22s                    │
│                                                              │
│  Recent batches:                                             │
│  ✓ Matthew Berman (AI) — 34 nodes, 52 edges                 │
│  ✓ Inspiredbyhoops (Basketball) — 28 nodes, 41 edges        │
│  ✓ Q1 2024 Technology — 19 nodes, 27 edges                  │
│  ⟳ Nikhil Kamath (Business) — extracting...                 │
│  ○ ESPN MMA (Sports) — pending                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 13.5 Completion Screen

```
┌─────────────────────────────────────────────────────────────┐
│  ✅ Watch History Import Complete                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Processed 51,787 videos across 94 batches in 4m 12s         │
│                                                              │
│  🧠 Knowledge Extracted                                      │
│  · 847 new entities added to your graph                      │
│  · 312 existing entities enriched with watch history context │
│                                                              │
│  🔗 Connections Created                                      │
│  · 1,204 internal edges (within watch history)               │
│  · 486 cross-reference edges (linked to existing graph)      │
│  · 93 enrichment edges (new connections between existing)    │
│  · Total: 1,783 new connections                              │
│                                                              │
│  📈 Most Pervasive Entities (by batch coverage)              │
│  1. AI/Machine Learning — 34 of 94 batches                   │
│  2. Entrepreneurship — 18 of 94 batches                      │
│  3. NBA Basketball — 12 of 94 batches                        │
│  4. Indian Business Ecosystem — 9 of 94 batches              │
│  5. MMA/Combat Sports — 8 of 94 batches                      │
│                                                              │
│  [ View in Graph → ]          [ Import Another ]             │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. API Endpoints

### 14.1 `POST /api/youtube/extract-batch`

Extracts entities and edges from a single batch.

**Request:**
```typescript
{
  batch: VideoBatch;
  options: {
    extractionMode: ExtractionMode;
    anchorEmphasis: AnchorEmphasis;
    linkedAnchorIds: string[];
  };
}
```

**Response:**
```typescript
{
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
  batch_summary: string;
}
```

### 14.2 `POST /api/youtube/finalize-import`

Merges all batch results, resolves against existing graph, and persists everything.

**Request:**
```typescript
{
  batchResults: {
    batch_id: string;
    nodes: ExtractedNode[];
    edges: ExtractedEdge[];
    summary: string;
  }[];
  metadata: ParsedWatchHistory['metadata'];
  options: {
    extractionMode: ExtractionMode;
    anchorEmphasis: AnchorEmphasis;
    linkedAnchorIds: string[];
    includeShorts: boolean;
    minViewCount: number;
  };
  previousImportTimestamp?: string;  // For delta detection
}
```

**Response:**
```typescript
{
  success: boolean;
  sourceId: string;
  nodesCreated: number;
  nodesEnriched: number;
  edges: {
    internal: number;
    crossReference: number;
    enrichment: number;
  };
  batchesProcessed: number;
  batchesFailed: number;
  processingDurationMs: number;
  topEntities: { label: string; batchCount: number }[];
}
```

---

## 15. File Structure

```
Second_brain/
├── utils/
│   └── watchHistoryParser.ts           # HTML parser + deduplication
│
├── types/
│   └── watchHistory.ts                 # All TypeScript interfaces
│
├── api/youtube/
│   ├── extract-batch.ts                # Single batch extraction endpoint
│   └── finalize-import.ts              # Merge + resolve + save endpoint
│
├── components/
│   ├── InjectionHub.tsx                # Modified: new WatchHistory source type
│   └── watchHistory/
│       ├── WatchHistoryReview.tsx       # Pre-processing review screen
│       ├── WatchHistoryProgress.tsx     # Batch progress screen
│       └── WatchHistoryComplete.tsx     # Results summary screen
│
└── services/
    └── youtubeDataApi.ts               # YouTube Data API client for channel tags
```

---

## 16. Cost & Performance

### 16.1 YouTube Data API

| Operation | Calls | Quota Cost | Total |
|---|---|---|---|
| `channels.list` (50 IDs per call) | ~330 | 1 unit each | 330 units |
| Daily quota | | | 10,000 units |

No concern for a single import. Monitor if running alongside existing channel pipeline.

### 16.2 Gemini API

| Metric | Estimate |
|---|---|
| Batches | ~85-145 |
| Tokens per batch (input) | ~2,000-3,000 |
| Tokens per batch (output) | ~2,000-4,000 |
| Total tokens | ~400K-800K |
| Cost (Gemini 2.0 Flash) | ~$0.10-0.25 |
| Cost (Gemini 1.5 Pro, if needed) | ~$1.00-2.50 |
| Finalization cross-reference call | ~50K tokens |
| **Total estimated cost** | **~$0.15-0.30** |

### 16.3 Processing Time

| Stage | Duration |
|---|---|
| HTML parsing (client) | 2-5 seconds |
| Deduplication (client) | <1 second |
| YouTube API tag fetch | 30-60 seconds (parallelized) |
| Clustering (client) | <1 second |
| Batch extraction (85-145 calls with 1.5s delay) | 2-4 minutes |
| Finalization (merge + resolve + save) | 10-30 seconds |
| **Total** | **~3-6 minutes** |

---

## 17. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| File is not Google Takeout HTML | Check for `content-cell` class presence; show error if missing |
| File is extremely large (500MB+) | Stream-parse with chunked regex; show memory warning above 200MB |
| YouTube Data API quota exceeded | Fall back to Tier 3 temporal clustering for unmatched channels |
| YouTube Data API key not configured | Skip Tier 2 entirely; use Tier 1 + Tier 3 only with a warning |
| Gemini rate limit hit | Exponential backoff; increase delay between batches |
| Individual batch extraction fails | Retry 2x; if still fails, skip and log; don't block import |
| All batches fail | Abort with clear error; don't save partial results |
| User re-imports same file | Delta detection filters to only new entries; if no new entries, show "nothing new to process" |
| HTML format changes (Google updates Takeout) | Parser should be defensive; log unparseable entries rather than crash |

---

## 18. Future Enhancements (Out of Scope for V1)

| Enhancement | Description |
|---|---|
| Semantic clustering with embeddings | Generate embeddings for video titles and cluster by similarity (more accurate than API tags) |
| Transcript enrichment for top videos | Optionally fetch transcripts for the top 50 most-viewed videos and run deep extraction |
| WatchGraph integration | Shared raw entries table so WatchGraph can query from Supabase |
| Scheduled re-imports | Auto-import on a schedule if user provides a Google Takeout link |
| Multi-platform import | Extend parser to handle Spotify, Netflix, podcast app exports |
| Interest timeline visualization | Dedicated graph lens that shows how watch history entities evolved over time |
