sy# Synapse Video Series — Remotion Production Guide

## Updated Constraints & Decisions

| Decision | Choice |
|----------|--------|
| **Video tool** | Remotion (separate repo, local preview via Remotion Studio) |
| **UI approach** | Code-generated UI frames in Remotion that match the app's patterns — NO screenshots or screen recordings |
| **Brand assets** | Placeholders for now (logo, wordmark) — to be swapped later |
| **Sample data** | Fictional but realistic dataset included below |
| **Music** | Trustworthy, understated tone — not hype. Think "informed confidence" |
| **Narration** | Voice-over + on-screen text captions |
| **Length** | ~60 seconds per video |
| **Platforms** | YouTube, Twitter/X, LinkedIn, Product Hunt |
| **Style** | Clean, informative. Problem → Solution narrative |
| **Narrative modes** | Problem-Solution + Feature Tour hybrid |
| **Project isolation** | Separate Remotion project — does NOT live inside the Synapse repo |

---

## Design System Reference (for Remotion Recreation)

The Claude Code agent building the Remotion project needs to faithfully recreate Synapse's visual language. Here is the complete design reference:

### Colors (Tailwind Custom Config)

```typescript
const SYNAPSE_COLORS = {
  // Backgrounds
  'cyber-black': '#02040a',    // App root background
  'cyber-dark': '#0b101b',     // Secondary background
  'cyber-slate': '#161e2e',    // Card/panel backgrounds

  // Primary accents
  'cyber-cyan': '#06b6d4',     // Primary brand color — nodes, buttons, active states
  'cyber-neon': '#22d3ee',     // Lighter cyan for hover/glow effects
  'cyber-purple': '#8b5cf6',   // Pathways lens, secondary accent
  'cyber-pink': '#ec4899',     // Rarely used, accent only

  // Functional
  'amber-400': '#fbbf24',      // Anchors, warnings, special nodes
  'amber-500': '#f59e0b',      // Anchor emphasis
  'emerald-500': '#10b981',    // Success, "system online" indicator
  'red-500': '#ef4444',        // YouTube, errors, negative edges
  'indigo-500': '#6366f1',     // Source log accent

  // Text
  'white': '#ffffff',           // Primary headings
  'slate-200': '#e2e8f0',      // Body text
  'slate-400': '#94a3b8',      // Secondary text, labels
  'slate-500': '#64748b',      // Tertiary text, placeholders
  'slate-600': '#475569',      // Disabled/muted

  // Borders & surfaces
  'white/10': 'rgba(255,255,255,0.1)',   // Standard border
  'white/5': 'rgba(255,255,255,0.05)',   // Subtle border
  'cyber-cyan/10': 'rgba(6,182,212,0.1)', // Cyan tinted surface
  'cyber-cyan/30': 'rgba(6,182,212,0.3)', // Cyan border active
};
```

### Typography

```typescript
const SYNAPSE_FONTS = {
  heading: 'Rajdhani, sans-serif',  // Headings, UI labels — geometric, techy
  mono: 'JetBrains Mono, monospace', // Timestamps, system status, code-like elements
  body: 'Rajdhani, sans-serif',      // Body text (same as heading in current app)
};
```

### UI Patterns to Recreate

**Card/Panel style:**
```
bg-cyber-slate/90 backdrop-blur-md border border-white/10 rounded-lg shadow-xl
```

**Glowing active button (cyan):**
```
bg-cyber-cyan/10 text-cyber-cyan border-cyber-cyan/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]
```

**Anchor glow (amber):**
```
bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]
```

**Primary CTA button:**
```
bg-cyber-cyan hover:bg-cyan-400 text-black font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]
```

**System status indicator:**
```
<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> System Online
```

### Graph Node Visual Rules

| Entity Type | Color | Size (relative) |
|-------------|-------|-----------------|
| Project | `#06b6d4` (cyan) | Large |
| Topic | `#06b6d4` (cyan) | Medium |
| Goal | `#06b6d4` (cyan) | Medium-Large |
| Decision | `#06b6d4` (cyan) | Medium |
| Person | `#8b5cf6` (purple) | Medium |
| Organization | `#8b5cf6` (purple) | Medium |
| Insight | `#22d3ee` (neon) | Small-Medium |
| Action | `#10b981` (emerald) | Small |
| Risk | `#ef4444` (red) | Small-Medium |
| Anchor (special) | `#f59e0b` (amber) | Large + glow |

### Edge Visual Rules

| Polarity | Color | Style |
|----------|-------|-------|
| Positive (`leads_to`, `supports`, `enables`) | `#10b981` (emerald) | Solid, animated particles flow forward |
| Negative (`blocks`, `contradicts`, `risks`) | `#ef4444` (red) | Dashed |
| Neutral (`relates_to`, `part_of`, `mentions`) | `#64748b` (slate-500) | Thin, subtle |

---

## Sample Dataset

This fictional dataset should be used across all four videos. It tells the story of **"Priya Sharma"** — a product manager at a mid-stage AI company who uses Synapse to manage her knowledge across meetings, content consumption, and strategic planning.

### Anchors

```typescript
const ANCHORS = [
  {
    id: 'anchor-1',
    label: 'AI Agent Architecture',
    entity_type: 'Topic',
    description: 'Building reliable, composable AI agent systems for enterprise use cases',
    is_anchor: true,
    anchor_strength: 5,
  },
  {
    id: 'anchor-2',
    label: 'Q1 Product Roadmap',
    entity_type: 'Project',
    description: 'Planning and executing the Q1 feature set for the core platform',
    is_anchor: true,
    anchor_strength: 4,
  },
  {
    id: 'anchor-3',
    label: 'Personal Knowledge Management',
    entity_type: 'Topic',
    description: 'Tools, systems, and practices for organizing personal knowledge effectively',
    is_anchor: true,
    anchor_strength: 3,
  },
];
```

### Nodes (40 total — enough for a rich-looking graph)

```typescript
const NODES = [
  // People
  { id: 'n1', label: 'Priya Sharma', entity_type: 'Person', description: 'Product Manager at NovaMind AI' },
  { id: 'n2', label: 'James Chen', entity_type: 'Person', description: 'CTO at NovaMind AI' },
  { id: 'n3', label: 'Andrej Karpathy', entity_type: 'Person', description: 'AI researcher and educator' },
  { id: 'n4', label: 'Sarah Kim', entity_type: 'Person', description: 'Head of Design at NovaMind AI' },
  { id: 'n5', label: 'Dr. Fei-Fei Li', entity_type: 'Person', description: 'Stanford AI Lab, computer vision pioneer' },

  // Organizations
  { id: 'n6', label: 'NovaMind AI', entity_type: 'Organization', description: 'AI-first enterprise platform company' },
  { id: 'n7', label: 'Anthropic', entity_type: 'Organization', description: 'AI safety research company' },
  { id: 'n8', label: 'Stanford HAI', entity_type: 'Organization', description: 'Stanford Human-Centered AI Institute' },

  // Topics (connected to anchors)
  { id: 'n9', label: 'Tool Use in LLMs', entity_type: 'Topic', description: 'How language models interact with external tools and APIs' },
  { id: 'n10', label: 'RAG Systems', entity_type: 'Topic', description: 'Retrieval-Augmented Generation for grounding LLM outputs' },
  { id: 'n11', label: 'Memory in AI Agents', entity_type: 'Topic', description: 'Short-term and long-term memory architectures for agents' },
  { id: 'n12', label: 'Prompt Engineering', entity_type: 'Topic', description: 'Techniques for effective LLM prompting' },
  { id: 'n13', label: 'Data Sovereignty', entity_type: 'Topic', description: 'User ownership and control of personal data' },
  { id: 'n14', label: 'Knowledge Graphs', entity_type: 'Topic', description: 'Graph-based knowledge representation and querying' },

  // Projects
  { id: 'n15', label: 'Agent Orchestration Layer', entity_type: 'Project', description: 'Building the multi-agent coordination system' },
  { id: 'n16', label: 'Enterprise RAG Pipeline', entity_type: 'Project', description: 'Production RAG system for enterprise clients' },

  // Goals
  { id: 'n17', label: 'Ship Agent v2 by March', entity_type: 'Goal', description: 'Release the next-gen agent platform by end of Q1' },
  { id: 'n18', label: 'Reduce hallucination rate to <5%', entity_type: 'Goal', description: 'Improve factual accuracy of RAG outputs' },

  // Decisions
  { id: 'n19', label: 'Use Claude for orchestration', entity_type: 'Decision', description: 'Chose Claude API as primary LLM for agent orchestration' },
  { id: 'n20', label: 'PostgreSQL over Neo4j', entity_type: 'Decision', description: 'Selected pgvector + PostgreSQL over dedicated graph DB' },

  // Insights
  { id: 'n21', label: 'Chunking strategy matters more than model size', entity_type: 'Insight', description: 'RAG quality depends more on retrieval quality than LLM capability' },
  { id: 'n22', label: 'Users dont organize — tools must', entity_type: 'Insight', description: 'Knowledge management adoption fails when it requires manual effort' },
  { id: 'n23', label: 'Graph structure reveals hidden connections', entity_type: 'Insight', description: 'Relationships between entities surface patterns invisible in flat notes' },

  // Actions
  { id: 'n24', label: 'Benchmark retrieval accuracy', entity_type: 'Action', description: 'Run evaluation suite on current RAG pipeline' },
  { id: 'n25', label: 'Interview 10 beta users', entity_type: 'Action', description: 'Gather feedback on agent UX and knowledge capture flow' },

  // Risks
  { id: 'n26', label: 'API rate limits at scale', entity_type: 'Risk', description: 'LLM API costs and rate limits could block enterprise adoption' },
  { id: 'n27', label: 'Data privacy compliance', entity_type: 'Risk', description: 'GDPR and SOC2 requirements for handling user data' },

  // Concepts
  { id: 'n28', label: 'Compound Knowledge', entity_type: 'Concept', description: 'Knowledge value grows non-linearly as connections increase' },
  { id: 'n29', label: 'Second Brain', entity_type: 'Concept', description: 'External system that augments human memory and cognition' },
  { id: 'n30', label: 'Semantic Search', entity_type: 'Concept', description: 'Finding information by meaning rather than keywords' },

  // Technologies
  { id: 'n31', label: 'pgvector', entity_type: 'Technology', description: 'PostgreSQL extension for vector similarity search' },
  { id: 'n32', label: 'LangGraph', entity_type: 'Technology', description: 'Framework for building stateful multi-agent applications' },
  { id: 'n33', label: 'Supabase', entity_type: 'Technology', description: 'Open-source Firebase alternative with PostgreSQL backend' },

  // Products
  { id: 'n34', label: 'Claude API', entity_type: 'Product', description: 'Anthropic conversational AI API' },
  { id: 'n35', label: 'Notion', entity_type: 'Product', description: 'Workspace tool — represents the "old way" of knowledge management' },

  // Questions
  { id: 'n36', label: 'Can agents self-improve via feedback loops?', entity_type: 'Question', description: 'Open research question on agent learning' },
  { id: 'n37', label: 'What is the right granularity for knowledge nodes?', entity_type: 'Question', description: 'Balancing detail vs noise in extraction' },

  // Metrics
  { id: 'n38', label: '73% retrieval accuracy', entity_type: 'Metric', description: 'Current RAG pipeline benchmark score' },
  { id: 'n39', label: '2,400 nodes ingested', entity_type: 'Metric', description: 'Total knowledge graph size after 3 months' },

  // Takeaway
  { id: 'n40', label: 'Structure enables serendipity', entity_type: 'Takeaway', description: 'Structured knowledge surfaces unexpected connections that flat notes cannot' },
];
```

### Edges (50 relationships)

```typescript
const EDGES = [
  // People → Organizations
  { source: 'n1', target: 'n6', relation: 'works_at' },
  { source: 'n2', target: 'n6', relation: 'works_at' },
  { source: 'n4', target: 'n6', relation: 'works_at' },
  { source: 'n5', target: 'n8', relation: 'works_at' },

  // People → Topics/Projects
  { source: 'n3', target: 'n9', relation: 'authored' },
  { source: 'n3', target: 'n12', relation: 'authored' },
  { source: 'n2', target: 'n15', relation: 'leads_to' },
  { source: 'n1', target: 'n16', relation: 'leads_to' },
  { source: 'n5', target: 'n14', relation: 'mentions' },

  // Anchor connections
  { source: 'anchor-1', target: 'n9', relation: 'relates_to' },
  { source: 'anchor-1', target: 'n11', relation: 'relates_to' },
  { source: 'anchor-1', target: 'n15', relation: 'part_of' },
  { source: 'anchor-1', target: 'n32', relation: 'enables' },
  { source: 'anchor-2', target: 'n17', relation: 'leads_to' },
  { source: 'anchor-2', target: 'n15', relation: 'part_of' },
  { source: 'anchor-2', target: 'n16', relation: 'part_of' },
  { source: 'anchor-3', target: 'n14', relation: 'relates_to' },
  { source: 'anchor-3', target: 'n29', relation: 'relates_to' },
  { source: 'anchor-3', target: 'n13', relation: 'supports' },

  // Topic → Topic
  { source: 'n9', target: 'n10', relation: 'relates_to' },
  { source: 'n10', target: 'n30', relation: 'enables' },
  { source: 'n11', target: 'n9', relation: 'supports' },
  { source: 'n14', target: 'n30', relation: 'enables' },
  { source: 'n12', target: 'n9', relation: 'supports' },
  { source: 'n13', target: 'n29', relation: 'supports' },

  // Projects → Goals
  { source: 'n15', target: 'n17', relation: 'leads_to' },
  { source: 'n16', target: 'n18', relation: 'leads_to' },

  // Decisions → Projects/Technologies
  { source: 'n19', target: 'n34', relation: 'mentions' },
  { source: 'n19', target: 'n15', relation: 'enables' },
  { source: 'n20', target: 'n31', relation: 'mentions' },
  { source: 'n20', target: 'n33', relation: 'mentions' },
  { source: 'n20', target: 'n16', relation: 'enables' },

  // Risks → Goals (blocking)
  { source: 'n26', target: 'n17', relation: 'blocks' },
  { source: 'n27', target: 'n17', relation: 'risks' },

  // Insights → Concepts
  { source: 'n21', target: 'n10', relation: 'relates_to' },
  { source: 'n22', target: 'n29', relation: 'supports' },
  { source: 'n23', target: 'n14', relation: 'supports' },
  { source: 'n23', target: 'n28', relation: 'leads_to' },

  // Actions → Goals
  { source: 'n24', target: 'n18', relation: 'supports' },
  { source: 'n25', target: 'n17', relation: 'supports' },

  // Concepts → Concepts
  { source: 'n28', target: 'n14', relation: 'depends_on' },
  { source: 'n29', target: 'n13', relation: 'relates_to' },

  // Technologies → Projects
  { source: 'n31', target: 'n16', relation: 'enables' },
  { source: 'n32', target: 'n15', relation: 'enables' },
  { source: 'n33', target: 'n16', relation: 'enables' },
  { source: 'n34', target: 'n15', relation: 'enables' },

  // Products → Concepts (contrast)
  { source: 'n35', target: 'n29', relation: 'relates_to' },

  // Questions → Topics
  { source: 'n36', target: 'n11', relation: 'relates_to' },
  { source: 'n37', target: 'n14', relation: 'relates_to' },

  // Metrics → Projects
  { source: 'n38', target: 'n16', relation: 'mentions' },

  // Takeaway → Insight
  { source: 'n40', target: 'n23', relation: 'supports' },
];
```

### Sample YouTube Channels (for Video 3 automation demo)

```typescript
const YOUTUBE_CHANNELS = [
  {
    channel_name: 'AI Explained',
    channel_url: 'https://youtube.com/@aiexplained',
    auto_ingest: true,
    extraction_mode: 'comprehensive',
    linked_anchors: ['AI Agent Architecture'],
    total_videos_ingested: 12,
  },
  {
    channel_name: 'Lenny\'s Podcast',
    channel_url: 'https://youtube.com/@lennyspodcast',
    auto_ingest: true,
    extraction_mode: 'strategic',
    linked_anchors: ['Q1 Product Roadmap'],
    total_videos_ingested: 8,
  },
  {
    channel_name: 'Tiago Forte',
    channel_url: 'https://youtube.com/@tiagoforte',
    auto_ingest: false,
    extraction_mode: 'actionable',
    linked_anchors: ['Personal Knowledge Management'],
    total_videos_ingested: 3,
  },
];
```

### Sample Sources (for ingestion demos)

```typescript
const SOURCES = [
  { title: 'Q1 Planning Standup — Jan 14', source_type: 'Meeting', nodes_created: 18, edges_created: 24 },
  { title: 'Andrej Karpathy — State of GPT', source_type: 'YouTube', nodes_created: 22, edges_created: 31 },
  { title: 'RAG Best Practices — Anthropic Blog', source_type: 'Research', nodes_created: 14, edges_created: 19 },
  { title: 'Enterprise AI Adoption Report Q4', source_type: 'Document', nodes_created: 27, edges_created: 35 },
  { title: 'Weekly Product Sync — Jan 21', source_type: 'Meeting', nodes_created: 11, edges_created: 15 },
];
```

---

## Video Scripts (60 Seconds Each)

Each video below is structured as a **timed sequence of scenes** for Remotion composition. Every scene specifies what the viewer sees, what the voice-over says, and what on-screen text appears.

---

## Video 1 — "They Have Your Data. Why Don't You?"

**Duration:** 60 seconds
**Narrative:** Problem → Solution
**Hook:** Data asymmetry between platforms and users

### Scene Breakdown

#### Scene 1: The Problem (0:00–0:15)

**Visual:** Dark background. Familiar platform logos fade in one by one — Google, YouTube, Meta, Spotify, Slack — each with a subtle data-stream particle effect flowing FROM a small user silhouette icon TOWARD the logos. The streams are cool gray. The logos glow slightly. The user icon stays dim.

**Voice-over:**
> "Google knows what you search. YouTube knows what you watch. Spotify knows how you feel. They turn your data into billions. What do you get back?"

**On-screen text** (appears at "What do you get back?"):
> YOUR DATA MAKES THEM RICH.
> WHAT DOES IT DO FOR YOU?

**Remotion notes:**
- Animate logos with staggered `spring()` fade-in
- Data stream particles: small dots moving along curved bezier paths from user to logos
- User icon: simple circle with a subtle pulse — represents anonymity
- Text: `Rajdhani` font, uppercase, tracking-widest, fade-in from bottom

---

#### Scene 2: The Flip (0:15–0:30)

**Visual:** The data streams REVERSE direction — now flowing FROM the platform logos back TOWARD the center. But instead of the dim user icon, a knowledge graph starts forming. Nodes appear one by one (cyan dots), edges connect between them (thin lines). The logos fade to 30% opacity as the graph becomes the focal point. The graph should match the Synapse visual style — dark background, cyan nodes, amber anchor in the center.

**Voice-over:**
> "What if that same data — your meetings, your videos, your research — actually worked for you? Structured. Connected. Yours."

**On-screen text** (appears at "Yours."):
> SAME DATA. YOUR PURPOSE.

**Remotion notes:**
- Reverse particle direction with `interpolate()` on progress
- Graph nodes: use the sample dataset, position with a force-like layout (pre-computed positions are fine)
- Anchor node (amber, larger, glowing) appears in the center last — "AI Agent Architecture"
- Edge lines animate in with `stroke-dashoffset` technique

---

#### Scene 3: The Product (0:30–0:48)

**Visual:** Full Synapse interface recreation. Show the graph view with the sample dataset — 40 nodes, edges, the SYNAPSE BOARD header in the top left, the lens selector below it. Animate the graph gently rotating / breathing (nodes slightly moving). Then show a quick lens switch: the graph filters from "All" to "Strategic" — some nodes fade out, only Goals, Projects, and Decisions remain. Then back to "All."

**Voice-over:**
> "This is Synapse. A personal knowledge graph that captures what you learn, maps how it connects, and grows smarter the more you use it. Switch lenses to see your knowledge from different angles — strategic, social, creative."

**On-screen text** (lower-third label, subtle):
> SYNAPSE — Personal Knowledge Graph

**Remotion notes:**
- Recreate the core GraphView layout in Remotion:
  - Dark `#02040a` background with subtle dot grid
  - Top-left panel: "SYNAPSE BOARD" header with BrainCircuit icon and "System Online" indicator
  - Lens selector bar below with pill buttons (All, Social, Strategic, Operational, Creative)
  - Left toolbar with mode icons (Select, Pan, Scan, Link, Merge, Pin)
- Graph: render nodes as circles with entity-type colors, edges as lines with polarity colors
- Lens transition: fade out non-matching nodes using opacity interpolation
- Keep animation subtle — gentle force simulation drift, not chaotic

---

#### Scene 4: The CTA (0:48–0:60)

**Visual:** Graph zooms out slowly, becoming a dense beautiful cluster. The Synapse logo (placeholder) fades in center-screen above the graph. Tagline appears below.

**Voice-over:**
> "Your data. Your graph. Your advantage. Synapse — now in beta."

**On-screen text:**
> [SYNAPSE LOGO PLACEHOLDER]
> Own Your Intelligence
> synapse.app — Join the Beta

**Remotion notes:**
- Logo: use a placeholder `<div>` with "SYNAPSE" in Rajdhani Bold + BrainCircuit icon, styled like the app header
- Tagline: `bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent` matching the landing page
- Gentle ambient particles in background
- Final 2 seconds: hold on the end card

---

## Video 2 — "Inside the Graph"

**Duration:** 60 seconds
**Narrative:** Feature Tour — node types, edge types, lenses
**Hook:** What does structured knowledge actually look like?

### Scene Breakdown

#### Scene 1: The Graph Reveal (0:00–0:12)

**Visual:** Start on black. A single node appears center-screen (cyan, label: "AI Agent Architecture" — the anchor, amber glow). Then connected nodes animate in one at a time — "Tool Use in LLMs", "RAG Systems", "Memory in AI Agents" — each with an edge connecting back to the anchor. Continue until ~15 nodes are visible, forming a small constellation.

**Voice-over:**
> "Every concept you encounter, every person you meet, every decision you make — becomes a node. And every connection between them becomes visible."

**On-screen text** (subtle label at bottom):
> NODES = WHAT YOU KNOW. EDGES = HOW IT CONNECTS.

**Remotion notes:**
- Staggered node appearance: `sequence()` with 400ms delay between each
- Each node: colored circle + label text (Rajdhani, 12px, white)
- Edges animate in with the target node — `stroke-dasharray` draw-in effect
- Anchor node has amber glow: `box-shadow: 0 0 20px rgba(245,158,11,0.4)`

---

#### Scene 2: Node Types (0:12–0:28)

**Visual:** The graph is now populated with all 40 sample nodes. A "spotlight" effect highlights groups of nodes by type. First, all Person nodes pulse purple — a label appears: "People." Then Organization nodes pulse. Then Topic nodes (cyan), Goal nodes, Risk nodes (red pulse), Decision nodes. Each highlight lasts ~2 seconds.

**Voice-over:**
> "Synapse understands what kind of knowledge each piece is. People. Organizations. Topics. Goals. Risks. Decisions. Actions. Insights. Each type has meaning — and Synapse uses that meaning to help you think."

**On-screen text** (changes with each highlight):
> PERSON → TOPIC → GOAL → RISK → DECISION → INSIGHT

**Remotion notes:**
- "Spotlight" effect: dim all nodes to 20% opacity, then brighten the highlighted type to 100% + slight scale-up
- Type label appears as a large centered word, Rajdhani Bold, uppercase, matching the node color
- Cycle through 6 types in ~16 seconds (2.5s each)
- Keep edges visible but very dim during spotlight

---

#### Scene 3: Edge Semantics (0:28–0:40)

**Visual:** Zoom into a cluster showing: "Agent Orchestration Layer" (Project) → connected to "Ship Agent v2 by March" (Goal) via `leads_to` (green edge), and "API rate limits at scale" (Risk) → connected to the same Goal via `blocks` (red dashed edge). Animate particles flowing along the green edge (forward direction) and a static red dashed line for the blocking relationship.

**Voice-over:**
> "Edges aren't just lines — they carry meaning. 'Leads to.' 'Supports.' 'Blocks.' You can see what's driving your goals forward and what's standing in the way."

**On-screen text** (small labels next to edges):
> leads_to → (green)
> blocks → (red, dashed)

**Remotion notes:**
- Zoom: use `scale()` transform on the graph container, centering on the cluster
- Particle flow on positive edge: small cyan dots moving along the path
- Red dashed edge: CSS `stroke-dasharray: 8 4`
- Keep surrounding nodes visible but at lower opacity

---

#### Scene 4: Lenses + CTA (0:40–0:60)

**Visual:** Pull back to full graph. Show the lens selector bar. Animate through 3 lens switches:
1. "All" (full graph)
2. "Strategic" (only Goals, Projects, Decisions visible — others fade to 10% opacity)
3. "Creative" (only Topics, Insights, Ideas visible)
Then zoom out to end card.

**Voice-over:**
> "Switch lenses to change your perspective. Strategic view for planning. Creative view for ideas. Same knowledge — different angles. Synapse. Your intelligence, structured."

**On-screen text** (end card):
> [SYNAPSE LOGO PLACEHOLDER]
> Own Your Intelligence

**Remotion notes:**
- Lens selector: recreate the pill-button bar from the app
- Active lens gets the cyan glow style
- Fade transitions: nodes not in the active lens filter to `opacity: 0.1` over 500ms
- Final zoom-out: scale from 1.0 to 0.85 with the graph becoming a beautiful dense cluster behind the end card

---

## Video 3 — "Feed Your Brain"

**Duration:** 60 seconds
**Narrative:** Problem-Solution + Feature Tour — ingestion + anchors
**Hook:** You consume content every day but capture none of it

### Scene Breakdown

#### Scene 1: The Consumption Problem (0:00–0:10)

**Visual:** Icons representing content sources appear in a chaotic scatter — YouTube play button, document icon, meeting/video-call icon, article/globe icon, note/sticky-note icon. They float around aimlessly, disconnected. A counter in the corner ticks up: "347 videos watched... 89 articles read... 52 meetings attended..." The text is dim, almost sad.

**Voice-over:**
> "Last year, you consumed thousands of pieces of content. Podcasts. Articles. Meetings. How much do you actually remember?"

**On-screen text:**
> 347 VIDEOS. 89 ARTICLES. 52 MEETINGS.
> HOW MUCH DID YOU KEEP?

**Remotion notes:**
- Source icons: use Lucide icon shapes (Youtube, FileText, Users, Globe, StickyNote) as simple SVGs
- Float animation: gentle random drift with `Math.sin()` offsets
- Counter: JetBrains Mono font, animate with `interpolate()` counting up
- Color: all icons in `slate-500` (dim, lifeless)

---

#### Scene 2: Ingestion Hub Overview (0:10–0:25)

**Visual:** The floating icons suddenly get pulled toward a central interface — the Ingestion Hub. Recreate the hub UI showing the source type selector: Research, YouTube, Meeting, Note, Document. One by one, each source type lights up as it's mentioned. Then show a simplified extraction flow: content goes in on the left → AI processing indicator in the middle (spinning BrainCircuit icon) → nodes and edges emerge on the right.

**Voice-over:**
> "Synapse ingests it all. YouTube videos, meeting transcripts, research papers, documents — even handwritten notes via OCR. AI extracts the knowledge automatically. People, topics, decisions, risks — all mapped and connected."

**On-screen text** (flow diagram labels):
> CONTENT → AI EXTRACTION → KNOWLEDGE GRAPH

**Remotion notes:**
- Ingestion Hub: recreate the source-type selector as a row of icon buttons matching the app's style
- Each button: icon + label in a `bg-slate-950 border border-slate-700 rounded-lg` card
- Extraction flow animation: content blob slides in from left, passes through a glowing processing zone, and splits into colored node dots on the right
- Processing indicator: `BrainCircuit` icon with cyan glow + `animate-spin`

---

#### Scene 3: Anchors — The Core Concept (0:25–0:42)

**Visual:** A single amber node appears center-screen, larger than the others, pulsing with a warm glow. Label: "AI Agent Architecture." From the edges of the screen, new nodes (from a "YouTube video" extraction) fly in — "Tool Use in LLMs", "RAG Systems", "LangGraph". As each arrives, an edge automatically connects it to the anchor if relevant. Non-relevant nodes drift to the periphery without connections to the anchor.

**Voice-over:**
> "But here's what makes it personal: Anchors. An anchor is your north star — a goal, a topic, a project you care about right now. Every piece of content you ingest gets cross-referenced against your anchors. Relevant connections form automatically."

**On-screen text** (appears near anchor):
> ANCHOR: YOUR FOCUS. YOUR FILTER.

**Remotion notes:**
- Anchor node: large circle with amber fill, `shadow-[0_0_25px_rgba(245,158,11,0.4)]`, label in bold
- New nodes fly in from random edge positions using `spring()` animations
- Edge creation: when a node "connects" to the anchor, an edge line draws in with a brief flash of amber along the connection
- Non-relevant nodes: smaller, dimmer, drift to edges without edge connections

---

#### Scene 4: YouTube Automation + CTA (0:42–0:60)

**Visual:** Show a simplified YouTube Manager panel. Three channel cards — "AI Explained", "Lenny's Podcast", "Tiago Forte" — each with a YouTube red icon, a green "Auto-Ingest: ON" toggle, and linked anchor tags (small amber pills). Animate a new video appearing in the queue: thumbnail → "Processing..." → green checkmark + "12 nodes, 18 edges extracted." Then zoom out to end card.

**Voice-over:**
> "And with YouTube automation, subscribe to channels, link them to anchors, and every new video gets ingested automatically. No manual work. Your graph grows while you sleep. Synapse. Feed your brain."

**On-screen text** (end card):
> [SYNAPSE LOGO PLACEHOLDER]
> Own Your Intelligence

**Remotion notes:**
- Channel cards: `bg-slate-900 border border-slate-800 rounded-xl` style
- YouTube icon: red `#ef4444`
- Auto-ingest toggle: green pill toggle matching the app pattern
- Anchor tags: small amber pills with label text
- Queue item animation: slide in from bottom, status changes from "pending" → "extracting" → "completed" with icon transitions
- Processing spinner: cyan border-top spinner matching the app's loading pattern

---

## Video 4 — "Ask Your Brain"

**Duration:** 60 seconds
**Narrative:** Feature Tour + Vision
**Hook:** What happens when your knowledge graph talks back?

### Scene Breakdown

#### Scene 1: The Question (0:00–0:10)

**Visual:** The full graph is visible, gently breathing. A chat input bar appears at the bottom of the screen (recreating the ChatInterface style). A cursor types: "What are the main risks to shipping Agent v2?" The text appears character by character.

**Voice-over:**
> "You've been building your knowledge graph for months. Now, ask it a question."

**On-screen text:** The typed query itself serves as the text.

**Remotion notes:**
- Graph in background at 60% opacity, slightly blurred
- Chat input bar: `bg-cyber-slate/90 border border-white/10 rounded-xl` at bottom
- Typing animation: use `interpolate()` to reveal characters over 3 seconds
- Cursor blink: standard CSS cursor animation

---

#### Scene 2: The Answer (0:10–0:25)

**Visual:** The graph responds. Two Risk nodes ("API rate limits at scale" and "Data privacy compliance") light up red and grow slightly. Edges from these nodes to "Ship Agent v2 by March" (Goal) highlight with red dashed lines. The chat area shows a response appearing:

> "Based on your knowledge graph, two primary risks threaten the Agent v2 timeline: (1) API rate limits at scale — this blocks the March shipping goal directly, and (2) Data privacy compliance — GDPR and SOC2 requirements add scope..."

**Voice-over:**
> "Synapse doesn't search the internet. It searches your graph — your meetings, your research, your decisions — and synthesizes an answer from what you actually know."

**On-screen text:** The chat response serves as the text.

**Remotion notes:**
- Node highlight: Risk nodes scale from 1.0 to 1.3 with red glow
- Edge highlight: red edges pulse with increased opacity
- Chat response: text appears line-by-line with a subtle fade-in, JetBrains Mono for the response
- Split layout: graph on left (60%), chat on right (40%)

---

#### Scene 3: Compound Knowledge (0:25–0:42)

**Visual:** Time-lapse of the graph growing. Start with 5 nodes. Animate new nodes appearing in bursts (representing ingestion events) — 10, 20, 40 nodes. As density increases, cross-connections start forming between clusters that weren't originally related. Highlight one specific "surprise connection": a line lights up between "Chunking strategy matters more than model size" (Insight from a research paper) and "Enterprise RAG Pipeline" (Project from a meeting) — they were ingested weeks apart but the graph found the connection.

**Voice-over:**
> "And here's the magic: compound knowledge. After weeks of use, connections you never planned start appearing. An insight from a podcast connects to a risk from a meeting. The graph finds patterns you can't."

**On-screen text:**
> 100 NODES = A NOTEBOOK
> 1,000 NODES = A BRAIN

**Remotion notes:**
- Time-lapse: use `Sequence` components with increasing node counts at each stage
- "Burst" effect: nodes appear in groups of 5-8 with a brief flash
- Surprise connection: specific edge draws in slowly with an amber glow + brief particle effect
- Text: large, centered, Rajdhani Bold, fade in with the growth stages

---

#### Scene 4: Vision + CTA (0:42–0:60)

**Visual:** The fully grown graph (40+ nodes) rotates gently. The nodes begin to subtly pulse in sync, like a heartbeat — suggesting the graph is alive. Text overlays build:

1. "Your meetings → structured"
2. "Your videos → connected"
3. "Your research → queryable"
4. "Your knowledge → yours"

Each line appears and fades, building to the final end card.

**Voice-over:**
> "Your meetings, structured. Your videos, connected. Your research, queryable. Your knowledge — finally yours. Synapse. Own your intelligence."

**On-screen text** (end card):
> [SYNAPSE LOGO PLACEHOLDER]
> Own Your Intelligence
> synapse.app — Join the Beta

**Remotion notes:**
- Heartbeat pulse: all nodes briefly scale to 1.05 and back in a synchronized rhythm
- Text overlay lines: appear centered, large white text, each visible for 2.5s with fade transitions
- End card: same as Video 1 — logo placeholder, tagline, URL
- Hold final frame for 3 seconds

---

## Technical Notes for Claude Code Agent

### Remotion Project Setup

- Create as a **standalone Remotion project** (NOT inside the Synapse repo)
- Use `npx create-video@latest` to bootstrap
- Preview via `npx remotion studio` (localhost)
- The agent has access to the Synapse codebase for reference but should not modify it

### Shared Components to Build

These reusable Remotion components should be created once and shared across all 4 videos:

1. **`<SynapseGraph />`** — The core graph renderer using the sample dataset. Accepts props for: which nodes to show, highlight filters, opacity overrides, animation state.
2. **`<SynapseNode />`** — Individual node circle with label, entity-type coloring, optional glow.
3. **`<SynapseEdge />`** — Edge line between two nodes with polarity coloring, optional particle flow animation, optional dash pattern.
4. **`<AnchorNode />`** — Special node variant with amber glow and larger size.
5. **`<SynapsePanel />`** — Recreates the `bg-cyber-slate/90 backdrop-blur-md border border-white/10 rounded-lg` card pattern.
6. **`<LensSelector />`** — The pill-button row matching the app's lens UI.
7. **`<ChatInput />`** — Chat input bar matching the ChatInterface style.
8. **`<EndCard />`** — Logo placeholder + tagline + URL, reused in all videos.
9. **`<TypewriterText />`** — Animated text reveal for voice-over captions.
10. **`<SourceIcon />`** — Lucide-based icons for each source type (YouTube, Meeting, Document, Note, Research).

### Graph Layout

Pre-compute node positions rather than running a live force simulation in Remotion. Use a simple force-directed layout algorithm (or manual positioning) to place the 40 sample nodes + 3 anchors in aesthetically pleasing positions. Store as a static `positions.ts` file.

### Music Direction

- Genre: Ambient electronic, minimal
- Mood: Trustworthy, calm confidence — NOT hype, NOT corporate
- Think: Tycho "Awake", Jon Hopkins "Immunity" ambient tracks, or Boards of Canada
- Volume: sits underneath narration at ~20% volume, swells slightly during transitions
- If using royalty-free: Artlist or Epidemic Sound "ambient technology" category
- Music should feel like "someone smart explaining something important" not "startup trying to sell you something"

### Voice-Over Direction

- Tone: Calm, direct, informed. Not a radio voice. Think "smart friend explaining something they built" not "ad narrator."
- Pace: Conversational but efficient — 60 seconds is tight, every word counts
- Delivery: Slight pauses before key phrases ("...actually worked for you?", "...yours.")
- Recording: Clean audio, no background noise, slight room reverb is okay for warmth

### Platform Export Specs

| Platform | Resolution | Aspect Ratio | Duration | Notes |
|----------|-----------|--------------|----------|-------|
| YouTube | 1920×1080 | 16:9 | 60s | Primary format |
| LinkedIn | 1920×1080 | 16:9 | 60s | Same as YouTube + captions burned in |
| Twitter/X | 1920×1080 | 16:9 | 60s | Same — Twitter supports 16:9 up to 2:20 |
| Product Hunt | 1920×1080 | 16:9 | 60s | Used in product page gallery |
| Short-form cut | 1080×1920 | 9:16 | 30s | Reels/Shorts version — crop and condense (future) |
