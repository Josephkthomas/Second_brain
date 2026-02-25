# PRD: Level 2 Artifact — The Agent Builder Toolkit

## 1. Overview

### Purpose
This is an interactive, AI-powered toolkit that serves as the Level 2 showcase artifact within the Oxygy AI Upskilling website. While Level 1's artifact taught users how to write better prompts, this Level 2 artifact teaches users how to **design a complete AI agent** — covering the decision to build one, its output structure, its system prompt, and its accountability mechanisms.

The tool follows a **4-step framework** that mirrors the real process of building a Level 2 custom AI agent:

1. **Should You Build This?** — Evaluate whether the task warrants a dedicated agent
2. **Design Your Output Format** — Define the structured output (human-readable + JSON)
3. **Get Your Agent Prompt** — Generate a ready-to-copy system prompt incorporating output format
4. **Build Accountability** — Define human-in-the-loop verification checks

All four steps are generated from a single task description input, creating a cohesive, end-to-end experience.

### Where It Sits
- Accessed as a "deep dive" artifact from the **Level 2: Applied Capability** section of the main site
- Opens as its own full page
- A **"← Back to Level 2"** breadcrumb/link sits at the top-left
- Conceptually builds on the Level 1 Prompt Engineering Playground — Step 3 explicitly references back to it

### Target Audience & Goals
- **External clients (showcase):** See the sophistication jump from Level 1 → Level 2. Understanding that AI isn't just about prompts — it's about designing reusable, shareable, accountable tools. This should make Level 2 workshops feel essential.
- **Internal participants (learning hub):** A practical tool to use when planning their own custom GPTs/agents. They can describe any task and walk away with a complete agent design: output format, system prompt, and accountability checks.

### Key Message
*From users to builders — build once, share across the team.*

---

## 2. Content Specification

### 2.1 Page Header

**Breadcrumb:** `← Back to Level 2` — top-left, text link in medium gray `#718096`, left arrow. On hover: Oxygy Teal `#38B2AC`.

**Page Title:**
```
Design Your <u>AI Agent</u>
```
- "AI Agent" receives the Oxygy teal underline decoration (hand-drawn-style underline, text stays dark navy)
- Font: Bold (700), 40–48px, dark navy `#1A202C`

**Subtitle:**
```
A custom AI agent is more than a prompt — it's a reusable tool your whole team
can rely on. Describe a task below, and we'll help you design every layer:
from deciding if you need one, to defining its output, writing its instructions,
and building in the checks that keep humans in control.
```
- Font: Regular (400), 16–18px, medium gray `#4A5568`
- Max-width: 620px
- Line-height: 1.7

### 2.2 Input Section

The input section sits directly below the subtitle, separated by `32px`. It contains two inputs and pre-loaded examples.

#### Section Label
```
Describe the task your agent should handle
```
- Font: Semi-bold (600), 14px, dark navy `#1A202C`

#### Input 1: Task Description (Required)

**Label:** `"What should this agent do?"`
- Font: Semi-bold (600), 13px, `#1A202C`

**Textarea:**
- Width: 100% of content column (max-width `720px`)
- Min-height: `100px`, max-height: `160px` (auto-expands)
- `border: 1px solid #E2E8F0`, `border-radius: 12px`
- Padding: `16px`
- Font: Regular (400), 15px, `#1A202C`
- Placeholder (in `#A0AEC0`): `"e.g., Analyze customer feedback surveys and identify the top themes, sentiment patterns, and actionable recommendations..."`
- On focus: `border-color: #38B2AC`, `box-shadow: 0 0 0 3px rgba(56, 178, 172, 0.1)`

#### Input 2: Input Data Description (Optional but Recommended)

Positioned `16px` below Input 1.

**Label:** `"What data will this agent work with?"` + a small badge: `Recommended` — styled as an inline pill (`background: #E6FFFA`, `color: #38B2AC`, font 11px semi-bold, `border-radius: 10px`, padding `2px 8px`)

**Textarea:**
- Same styling as Input 1 but smaller: min-height `72px`, max-height `120px`
- Placeholder: `"e.g., Excel files containing survey responses with columns for respondent role, department, rating (1-5), and open-text feedback..."`

**Educational callout (below Input 2):**
A small info block that educates users on why input data matters:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 💡 Why does input data matter?                                       │
│                                                                      │
│ The type of data your agent processes determines everything:         │
│ how its output should be structured, what evidence it should cite,   │
│ and what human checks are needed. An agent analyzing survey data     │
│ needs row-level references. One analyzing transcripts needs          │
│ timestamps. Defining your input data helps us design the right       │
│ accountability checks.                                               │
└──────────────────────────────────────────────────────────────────────┘
```

**Callout styling:**
- `background: #F7FAFC`
- `border: 1px solid #E2E8F0`
- `border-left: 3px solid #38B2AC`
- `border-radius: 8px`
- Padding: `14px 16px`
- Text: Regular (400), 13px, `#4A5568`
- "Why does input data matter?" — Semi-bold (600), 13px, `#1A202C`
- The 💡 emoji is optional — can be replaced with a Lucide `info` icon in `#38B2AC`
- Max-width: matches the textareas

#### Pre-loaded Examples

Displayed as **3 clickable pill chips** in a horizontal row above Input 1, with a label: `"Try an example:"`

| # | Example Label | Task Description (populates Input 1) | Input Data (populates Input 2) |
|---|---|---|---|
| 1 | "Survey Analyzer" | "Analyze employee engagement survey results to identify the top themes, sentiment trends by department, and prioritized recommendations for the leadership team" | "Excel spreadsheet with columns: Employee ID, Department, Tenure Band, Question Category, Rating (1-5), Open-Text Response. Approximately 200-500 rows per survey cycle." |
| 2 | "Meeting Summarizer" | "Summarize meeting recordings into structured notes with key decisions, action items, owners, and deadlines — so the team doesn't need to re-watch the recording" | "Auto-generated meeting transcripts from Teams or Zoom, typically 30-60 minutes in length, with speaker labels and timestamps. May include multiple speakers across different roles." |
| 3 | "Proposal Drafter" | "Draft a first-pass client proposal based on project brief inputs, incorporating relevant case studies, methodology descriptions, and team structure recommendations" | "Project brief documents (Word or PDF) containing client background, objectives, scope, timeline, and budget. Plus an internal case study library with past project descriptions and outcomes." |

**Pill chip styling:**
- Same as Level 1 artifact: `background: #F7FAFC`, `border: 1px solid #E2E8F0`, `border-radius: 20px`, padding `6px 14px`, font 13px `#4A5568`
- On hover: `border-color: #38B2AC`, `color: #38B2AC`, `background: #E6FFFA`
- On click: Populates both Input 1 and Input 2 with the corresponding data. Both textareas get a brief highlight flash (`background: #E6FFFA` for `0.3s`, then back to white).

#### CTA Button
```
Design My Agent →
```
- Style: Primary Oxygy teal — `background: #38B2AC`, `color: #FFFFFF`, `border-radius: 24px`
- Padding: `12px 28px`
- Font: Semi-bold (600), 15px
- Positioned below the inputs, right-aligned
- On hover: `background: #319795`
- Disabled state (when Input 1 is empty): `opacity: 0.5`, `cursor: not-allowed`

---

### 2.3 The 4-Step Journey — Progress Stepper

Once the user clicks "Design My Agent," the output section appears below with a **horizontal 4-step progress stepper** at the top.

**Stepper layout:**
```
① Should You Build This?  ——→  ② Design Output Format  ——→  ③ Agent Prompt  ——→  ④ Accountability
```

**Stepper styling:**
- Displayed as 4 nodes connected by horizontal lines
- Each node: a circle (32px diameter) containing the step number
- Below each circle: the step label text
- Connected by a horizontal line (2px height) between circles

**Node states:**
- **Active (current step being viewed):** Circle: `background: #38B2AC`, `color: #FFFFFF`, `font-weight: 700`. Label: `#1A202C`, semi-bold (600).
- **Completed (steps above the current one):** Circle: `background: #38B2AC`, `color: #FFFFFF`, with a small checkmark icon replacing the number. Label: `#38B2AC`, regular (400).
- **Upcoming (steps below the current one):** Circle: `background: #F7FAFC`, `border: 1px solid #E2E8F0`, `color: #A0AEC0`. Label: `#A0AEC0`, regular (400).
- **Connecting lines:** Completed segments use `#38B2AC`, upcoming segments use `#E2E8F0`.

**Interaction:** Clicking on a completed step node scrolls/navigates to that step's content. Clicking on an upcoming step does nothing (steps are presented sequentially on page load). All 4 steps are rendered on the page vertically — the stepper acts as both a visual progress indicator and a navigation aid.

**Step labels:**
1. "Should You Build This?"
2. "Design Output Format"
3. "Agent Prompt"
4. "Accountability"

Font: Regular (400), 12px. Max-width per label: `100px`, centered under each circle. Text wraps to 2 lines if needed.

---

### 2.4 Step 1: Should You Build This?

This step evaluates the user's task against key criteria to determine whether it warrants a dedicated Level 2 agent vs. ad-hoc Level 1 prompting.

#### Section Container
- `background: #FFFFFF`
- `border: 1px solid #E2E8F0`
- `border-radius: 12px`
- Padding: `32px`
- Max-width: `720px`

#### Section Header
**Step label:** `"Step 1"` — font: Semi-bold (600), 12px, `#A0AEC0`, uppercase, letter-spacing `0.05em`
**Title:** `"Should You Build This?"` — font: Bold (700), 24px, `#1A202C`
**Subtitle:** `"Not every task needs a custom agent. Here's our assessment of whether your task is a strong candidate."` — font: Regular (400), 15px, `#4A5568`

#### Agent Readiness Score

A prominent visual score display:

**Score circle:** A large circular progress indicator (120px diameter), centered within the section.
- The circle is a ring/donut (stroke-based, not filled)
- Track: `#E2E8F0` (the unfilled portion)
- Fill: Color depends on score —
  - 80–100%: `#38B2AC` (teal — strong candidate)
  - 50–79%: `#F7E8A4` border with `#C4A934` fill (yellow — moderate candidate)
  - 0–49%: `#F5B8A0` border with `#E57A5A` fill (peach — weak candidate)
- Inside the circle: The percentage number — font: Bold (700), 36px, `#1A202C`
- Below the circle: A one-line verdict — font: Semi-bold (600), 16px, color matches the score ring

**Verdict text examples:**
- 80–100%: `"Strong candidate for a custom agent"`
- 50–79%: `"Could benefit from an agent — with some caveats"`
- 0–49%: `"Better suited to ad-hoc prompting for now"`

#### Criteria Breakdown

Below the score, display a **5-row evaluation table** showing how the task scored on each criterion:

| Criterion | What It Means | Possible Indicators |
|---|---|---|
| **Frequency** | How often is this task performed? | Daily / Weekly / Monthly / Rarely |
| **Consistency** | Does the output need the same structure each time? | High / Medium / Low |
| **Shareability** | Would others on the team use this same tool? | Team-wide / Small group / Just me |
| **Complexity** | Does it require domain expertise or multi-step reasoning? | High / Medium / Low |
| **Standardization Risk** | Would variable outputs cause downstream problems? | Critical / Moderate / Low |

**Table row styling:**
- Each row displays: Criterion name (bold, 14px, `#1A202C`), the AI's assessment for this task (regular, 14px, `#4A5568`), and a small horizontal bar indicator showing the score for that criterion
- Bar indicator: `width: 120px`, `height: 6px`, `border-radius: 3px`, `background-track: #E2E8F0`, `fill: #38B2AC` (proportional to the score)
- Rows separated by `1px solid #F7FAFC` dividers
- Padding: `12px 0` per row

#### Level 1 vs Level 2 Recommendation

Below the criteria table, a **two-column comparison callout**:

**Left column: "Level 1: Ad-Hoc Prompting"**
- Small icon: Lucide `MessageSquare` in `#A0AEC0`
- 2–3 bullet points explaining when Level 1 is sufficient (generated by the AI based on the task)
- Example: "The task is infrequent enough that writing a fresh prompt each time is acceptable"

**Right column: "Level 2: Custom Agent"**
- Small icon: Lucide `Bot` in `#38B2AC`
- 2–3 bullet points explaining why Level 2 is recommended (generated by the AI based on the task)
- Example: "Multiple team members need consistent outputs from the same type of analysis"

**Comparison callout styling:**
- Two columns side by side, each `48%` width with `4%` gap
- Each column: `background: #F7FAFC`, `border-radius: 8px`, padding `16px`
- The recommended option gets a `border: 2px solid #38B2AC` and a small `"Recommended"` pill badge at the top (`background: #38B2AC`, `color: #FFFFFF`, font 11px semi-bold, `border-radius: 10px`, padding `2px 8px`)
- The non-recommended option gets `border: 1px solid #E2E8F0`

---

### 2.5 Step 2: Design Your Output Format

This step shows the user what their agent's output should look like — in both human-readable and JSON formats.

#### Section Container
- Same container styling as Step 1
- Top margin: `32px` from Step 1

#### Section Header
**Step label:** `"Step 2"` — same styling as Step 1
**Title:** `"Design Your Output Format"` — font: Bold (700), 24px, `#1A202C`
**Subtitle:**
```
A great agent doesn't just give good answers — it gives them in the same structure
every time. This is what makes it shareable: your teammates get consistent,
predictable outputs they can actually use.
```
- Font: Regular (400), 15px, `#4A5568`

#### Shareability Callout

A highlighted educational callout emphasizing the shareability principle:

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔗 Build once, share across the team                                 │
│                                                                      │
│ The power of a Level 2 agent isn't just that it works for you —      │
│ it's that it works the same way for everyone on your team.           │
│ Standardized output formats mean no one has to guess what the        │
│ agent will produce. The JSON template below ensures that every       │
│ time this agent runs, the result follows the same structure —        │
│ making it reliable enough to hand off, delegate, and scale.         │
└──────────────────────────────────────────────────────────────────────┘
```

**Callout styling:**
- `background: #C3D0F5` at 20% opacity (very light lavender tint)
- `border: 1px solid #C3D0F5`
- `border-left: 4px solid #5B6DC2` (dark lavender accent — Level 2's accent color)
- `border-radius: 8px`
- Padding: `16px 20px`
- Title ("Build once, share across the team"): Semi-bold (600), 14px, `#1A202C`
- Body text: Regular (400), 13px, `#4A5568`

#### Two-Panel Output Display

A **side-by-side layout** showing the same output in two formats:

**Left Panel: "Human View"**
- Header: `"What your team sees"` — Semi-bold (600), 13px, `#1A202C`. Small Lucide `Eye` icon (16px, `#718096`) inline.
- Content: A beautifully formatted representation of the agent's output, displayed as a styled card/document preview. The content is generated by the AI based on the task description.
- Styling:
  - `background: #FFFFFF`
  - `border: 1px solid #E2E8F0`
  - `border-radius: 10px`
  - Padding: `20px`
  - The output is rendered with proper formatting: bold headings, regular body text, nested lists where appropriate
  - Font: Headings: Semi-bold (600), 14px, `#1A202C`. Body: Regular (400), 13px, `#4A5568`. Line-height: 1.6.
  - Max-height: `400px`, scrollable with `overflow-y: auto` if content exceeds this

**Right Panel: "Code View"**
- Header: `"The JSON template"` — Semi-bold (600), 13px, `#1A202C`. Small Lucide `Code` icon (16px, `#718096`) inline. Plus a small info badge: `"Why JSON?"` — clickable, triggers a tooltip (see below).
- Content: The corresponding JSON structure, syntax-highlighted
- Styling:
  - `background: #1A202C` (dark navy — code block aesthetic)
  - `border-radius: 10px`
  - Padding: `20px`
  - Font: Monospace (`JetBrains Mono` from Google Fonts, fallback: `Fira Code`, `Consolas`, `monospace`), 13px, line-height 1.6
  - **Syntax highlighting colors:**
    - Keys: `#38B2AC` (teal)
    - Strings: `#A8F0E0` (mint)
    - Brackets/braces: `#718096` (gray)
    - Booleans/numbers: `#FBE8A6` (pale yellow)
    - Comments (if any): `#A0AEC0` (medium gray)
  - Max-height: `400px`, scrollable
  - A small **"Copy JSON"** button fixed at the top-right corner of this panel:
    - `background: rgba(255,255,255,0.1)`, `border: 1px solid rgba(255,255,255,0.2)`, `border-radius: 6px`
    - Text: `"Copy"` — font: 12px, `#FFFFFF`
    - Lucide `Copy` icon (14px, `#FFFFFF`) inline
    - On click: Copies the raw JSON to clipboard. Button text changes to `"Copied ✓"` for 2 seconds.

**Panel layout:**
- Two columns, each `48%` width with `4%` gap
- Equal height (taller panel determines the height of the shorter one, with internal scroll)
- On mobile (<768px): Stack vertically, full width each, `16px` gap

**"Why JSON?" Tooltip:**
Triggered by clicking the `"Why JSON?"` badge on the Code View panel header.

Content:
```
JSON (JavaScript Object Notation) is a structured data format that both
humans and machines can read. When you define your agent's output as a
JSON template:

• The agent produces the exact same structure every time — no variation
• Other tools and workflows can automatically read and process the output
• Your team can build dashboards, reports, or automations on top of it
• It eliminates the "I got a different format this time" problem entirely

Think of it as the blueprint that turns a creative AI response into a
reliable, repeatable business tool.
```

**Tooltip styling:**
- Appears as a popover below or beside the badge
- `background: #1A202C`, `color: #FFFFFF`, `border-radius: 8px`
- Padding: `16px 20px`
- Max-width: `320px`
- Font: Regular (400), 13px, line-height 1.6
- Bullet points use `•` character, not styled list items
- Close on clicking outside or pressing Escape
- Subtle fade-in animation (`opacity 0 → 1`, `0.15s`)

---

### 2.6 Step 3: Get Your Agent Prompt

This step provides a ready-to-use system prompt that incorporates Level 1 best practices AND the JSON output format defined in Step 2.

#### Section Container
- Same container styling as Steps 1 and 2
- Top margin: `32px` from Step 2

#### Section Header
**Step label:** `"Step 3"` — same styling
**Title:** `"Your Agent Prompt"` — font: Bold (700), 24px, `#1A202C`
**Subtitle:**
```
This system prompt incorporates everything: the role, context, task definition,
output format (including the JSON template from Step 2), and quality guidelines.
Copy it directly into your Custom GPT, Claude Project, or Copilot Agent.
```
- Font: Regular (400), 15px, `#4A5568`

#### Level 1 Cross-Reference

A small callout linking back to the Level 1 artifact:

```
🔗 This prompt follows the Prompt Blueprint framework from Level 1.
   Want to learn more about structured prompting? → Visit the Prompt Engineering Playground
```

**Styling:**
- Inline text, not a boxed callout — keeps it lightweight
- "Visit the Prompt Engineering Playground" is a teal text link (`#38B2AC`, underline on hover)
- Font: Regular (400), 13px, `#718096`. The link text is `#38B2AC`.
- The `→` is a Lucide `ArrowRight` icon (12px, inline)

#### Prompt Display — Collapsed Default State

By default, the full prompt is **collapsed** and only the copy action is visible:

**Collapsed view:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ 📋 Your system prompt is ready                                       │
│                                                                      │
│ [Copy System Prompt]          [▼ View Full Prompt]                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Container styling (collapsed):**
- `background: #F7FAFC`
- `border: 1px solid #E2E8F0`
- `border-radius: 10px`
- Padding: `20px 24px`
- Display: flex, `justify-content: space-between`, `align-items: center`

**"Copy System Prompt" button:**
- Primary teal pill: `background: #38B2AC`, `color: #FFFFFF`, `border-radius: 24px`, padding `10px 22px`
- Lucide `Copy` icon (16px, white) inline before text
- Font: Semi-bold (600), 14px
- On click: Copies the full system prompt to clipboard. Shows the same toast notification as Level 1 artifact (`"System prompt copied to clipboard ✓"`)

**"View Full Prompt" toggle:**
- Text link style: Regular (400), 14px, `#718096`
- Lucide `ChevronDown` icon (16px, inline after text)
- On hover: `color: #38B2AC`
- On click: Expands the container to show the full prompt

#### Prompt Display — Expanded State

When expanded, the container grows to show the full system prompt:

**Container styling (expanded):**
- Same background/border as collapsed
- The "View Full Prompt" toggle text changes to `"▲ Hide Full Prompt"` (Lucide `ChevronUp` icon)
- Content area appears below the action buttons with a smooth expand animation (`max-height: 0 → auto`, `0.3s ease`)

**Prompt content:**
- Displayed inside a code-style block within the container
- `background: #FFFFFF`
- `border: 1px solid #E2E8F0`
- `border-radius: 8px`
- Padding: `16px 20px`
- Font: Regular (400), 14px, `#2D3748`, line-height 1.7
- The prompt text uses **color-coded inline highlights** to show which parts correspond to each Prompt Blueprint section (same colors as Level 1 artifact):
  - Role section text: background tint of Lavender `#C3D0F5` at 30% opacity
  - Context section text: background tint of Pale Yellow `#FBE8A6` at 30% opacity
  - Task section text: background tint of Teal `#38B2AC` at 15% opacity
  - Format section text (including the JSON template): background tint of Mint `#A8F0E0` at 30% opacity
  - Steps section text: background tint of Peach `#FBCEB1` at 30% opacity
  - Quality checks section text: background tint of Ice Blue `#E6FFFA` at 50% opacity
- Each highlighted section has a small inline pill label at its start (e.g., `ROLE`, `CONTEXT`, `OUTPUT FORMAT`) — same styling as the Level 1 artifact output blocks but inline rather than block-level
- Max-height: `500px`, scrollable with `overflow-y: auto`

---

### 2.7 Step 4: Build Accountability

This step provides specific human-in-the-loop checks tailored to the task and input data type.

#### Section Container
- Same container styling as previous steps
- Top margin: `32px` from Step 3

#### Section Header
**Step label:** `"Step 4"` — same styling
**Title:** `"Human-in-the-Loop Checks"` — font: Bold (700), 24px, `#1A202C`
**Subtitle:**
```
AI agents are powerful, but they need guardrails. These checks ensure that
every output can be verified, traced back to its source, and validated by
a human before it's acted on. The specific checks depend on what kind of
data your agent is working with.
```
- Font: Regular (400), 15px, `#4A5568`

#### Accountability Checks Display

The AI generates a set of 3–5 specific human-in-the-loop checks based on the task and input data type. Each check is displayed as a **left-bordered card**:

**Card layout:**
- Cards are stacked vertically with `12px` gap between them
- Each card: `background: #FFFFFF`, `border: 1px solid #E2E8F0`, `border-left: 4px solid #38B2AC`, `border-radius: 8px`
- Padding: `16px 20px`

**Card content structure:**

```
┌─ ────────────────────────────────────────────────────────────────────┐
│ │ CHECK NAME                                          [Risk badge]  │
│ │                                                                   │
│ │ What to verify                                                    │
│ │ A 1-2 sentence description of what the human should check.        │
│ │                                                                   │
│ │ Why this matters                                                  │
│ │ A 1-2 sentence explanation of the risk if this isn't checked.     │
│ │                                                                   │
│ │ Add this to your prompt                                           │
│ │ ┌─────────────────────────────────────────────────────────────┐   │
│ │ │ "For each theme identified, list the specific row numbers   │   │
│ │ │ from the dataset that support this theme..."                │   │
│ │ └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Card element styling:**

- **Check name:** Bold (700), 16px, `#1A202C`
- **Risk badge:** A small pill indicating severity — positioned top-right of the card
  - `Critical`: `background: #FFF5F5`, `color: #C53030`, `border: 1px solid #FC8181`
  - `Important`: `background: #FFFFF0`, `color: #B7791F`, `border: 1px solid #F6E05E`
  - `Recommended`: `background: #E6FFFA`, `color: #2C7A7B`, `border: 1px solid #81E6D9`
  - Font: Semi-bold (600), 11px, `border-radius: 10px`, padding `2px 8px`
- **Sub-section labels** ("What to verify", "Why this matters", "Add this to your prompt"): Semi-bold (600), 12px, `#A0AEC0`, uppercase, letter-spacing `0.04em`. Margin-top `12px` for each sub-section.
- **Sub-section body text:** Regular (400), 14px, `#4A5568`, line-height 1.6
- **"Add this to your prompt" code block:** The prompt instruction is displayed in a lightly styled inline code block:
  - `background: #F7FAFC`
  - `border: 1px solid #E2E8F0`
  - `border-radius: 6px`
  - Padding: `10px 14px`
  - Font: Monospace, 13px, `#2D3748`
  - A small `"Copy"` button (text link style, `#38B2AC`, 12px) at the top-right of this code block

#### "Already Included" Indicator

Since the system prompt in Step 3 should already incorporate these accountability checks, each card should have a small status indicator:

```
✓ Included in your agent prompt (Step 3)
```
- Positioned at the bottom of each card
- Font: Regular (400), 12px, `#38B2AC`
- Lucide `Check` icon (14px, `#38B2AC`) inline before text
- This reinforces that Steps 2, 3, and 4 are interconnected — the prompt already includes the output format AND the accountability instructions

---

## 3. Layout & Structure

### 3.1 Overall Page Layout
- Single column, centered
- Max-width: `800px` for the outer container
- Content column max-width: `720px` for inputs, outputs, and step content
- Horizontal padding: `24px` mobile, `48px` tablet, auto-centered on desktop
- Background: `#FFFFFF` throughout (no alternating section backgrounds)

### 3.2 Vertical Flow
1. Breadcrumb (top-left)
2. Page Title + Subtitle — `32px` below breadcrumb
3. Input Section (task description + data description + examples) — `32px` below subtitle
4. CTA Button — `16px` below inputs
5. *--- Output section appears here after CTA click ---*
6. Progress Stepper — `48px` below CTA, appears with output
7. Step 1: Should You Build This? — `24px` below stepper
8. Step 2: Design Output Format — `32px` below Step 1
9. Step 3: Agent Prompt — `32px` below Step 2
10. Step 4: Accountability — `32px` below Step 3
11. Final Action Bar — `32px` below Step 4

### 3.3 Final Action Bar

At the very bottom of the output section, a horizontal bar with two actions:

**Left:** `"Start Over"` — secondary bordered pill button. Scrolls to top, clears all inputs and outputs.

**Right:** `"Explore Level 3: Systemic Integration →"` — text link in `#38B2AC` with arrow. Links to the Level 3 section of the main site. This creates a natural progression pathway.

---

## 4. Interactions & Animations

### 4.1 Output Reveal
When the user clicks "Design My Agent →":
1. CTA button enters loading state: text becomes `"Designing..."`, spinner appears, button becomes non-clickable
2. The progress stepper and Step 1 container appear with a smooth slide-down + fade-in (`0.4s ease`)
3. Step 1 content populates — the score circle animates from 0% to its final value (a fill animation, `1s ease-out`)
4. Steps 2, 3, and 4 appear sequentially with a stagger of `0.3s` each, sliding up from below and fading in
5. The progress stepper updates as each step appears (connecting lines fill in teal progressively)

### 4.2 Stepper Navigation
- Clicking a completed step smoothly scrolls to that step's container (`scroll-behavior: smooth`, with `80px` offset for the sticky stepper if applicable)
- On desktop, consider making the progress stepper **sticky** at the top of the viewport once the user scrolls past it (sticky position with `top: 16px`, slight background blur `backdrop-filter: blur(8px)`, and a subtle bottom shadow when stuck)

### 4.3 Step 3 Expand/Collapse
- Toggling the prompt view animates with `max-height` transition (`0.3s ease`)
- The chevron icon rotates 180° when toggling

### 4.4 Skeleton Loading
While the API is processing, each step container shows a skeleton placeholder:
- Step 1: A circle placeholder (for the score) + 5 horizontal bar placeholders (for the criteria)
- Step 2: Two side-by-side rectangular placeholders (for the two panels)
- Step 3: A single rectangular placeholder
- Step 4: 3–4 card-shaped placeholders stacked vertically

All skeletons use the shimmer animation pattern from the Level 1 artifact (`background: #F7FAFC`, animated gradient sweep, `1.5s` infinite loop).

### 4.5 Copy Interactions
All copy buttons follow the same pattern:
- On click: Copy to clipboard → button text changes to `"Copied ✓"` for 2 seconds → toast notification appears at bottom-center of viewport
- Toast: `background: #1A202C`, `color: #FFFFFF`, `border-radius: 8px`, padding `10px 20px`, auto-dismiss after `2.5s`

---

## 5. Visual Design Specification

### 5.1 Color Usage Summary

| Element | Color | Hex |
|---|---|---|
| Page background | White | `#FFFFFF` |
| Step containers background | White | `#FFFFFF` |
| Step container border | Light gray | `#E2E8F0` |
| Primary accent / CTAs | Oxygy Teal | `#38B2AC` |
| Headings | Dark Navy | `#1A202C` |
| Body text | Medium charcoal | `#4A5568` |
| Helper/secondary text | Medium gray | `#718096` |
| Muted labels | Light gray | `#A0AEC0` |
| Code block background | Dark Navy | `#1A202C` |
| Callout backgrounds | Light gray | `#F7FAFC` |
| Level 2 accent (shareability callout) | Lavender | `#C3D0F5` |
| Accountability card left border | Teal | `#38B2AC` |
| Score ring (high) | Teal | `#38B2AC` |
| Score ring (medium) | Gold | `#C4A934` |
| Score ring (low) | Peach/coral | `#E57A5A` |

### 5.2 Typography Summary

| Element | Weight | Size | Color |
|---|---|---|---|
| Page title | 700 | 40–48px | `#1A202C` |
| Page subtitle | 400 | 16–18px | `#4A5568` |
| Step label (e.g., "Step 1") | 600 | 12px | `#A0AEC0` |
| Step title | 700 | 24px | `#1A202C` |
| Step subtitle | 400 | 15px | `#4A5568` |
| Input labels | 600 | 13px | `#1A202C` |
| Input text | 400 | 15px | `#1A202C` |
| Callout title | 600 | 14px | `#1A202C` |
| Callout body | 400 | 13px | `#4A5568` |
| Code/JSON | 400 (mono) | 13px | Various (syntax) |
| Button primary | 600 | 14–15px | `#FFFFFF` |
| Card check name | 700 | 16px | `#1A202C` |
| Card body text | 400 | 14px | `#4A5568` |

### 5.3 Font Families
- **Primary:** DM Sans (Google Fonts) — all headings, body, UI text
- **Monospace:** JetBrains Mono (Google Fonts) — JSON code blocks, prompt code blocks. Fallbacks: Fira Code, Consolas, monospace.

---

## 6. Responsive Behavior

### 6.1 Desktop (1200px+)
- All elements as described above
- Step 2 two-panel layout: side by side, each `48%` width
- Step 1 comparison columns: side by side, each `48%` width
- Progress stepper: horizontal, full width within container
- Sticky stepper on scroll

### 6.2 Tablet (768–1199px)
- Same as desktop — single-column content fits comfortably
- Horizontal padding reduces to `32px`
- Sticky stepper remains functional

### 6.3 Mobile (<768px)
- Horizontal padding: `16px`
- Page title scales to `32–36px`
- Step 2 panels: Stack vertically (Human View on top, Code View below), full width, `16px` gap
- Step 1 comparison columns: Stack vertically, full width, `12px` gap
- Progress stepper: Remains horizontal but step labels truncate or use abbreviated names:
  1. "Build?" 2. "Output" 3. "Prompt" 4. "Checks"
  - Circle size reduces to `28px`, label font to `10px`
- Accountability cards: Full width, same structure
- Final action bar buttons: Stack vertically, full width, `8px` gap
- Pre-loaded example pills: Wrap to multiple lines

---

## 7. AI Agent Specification — Gemini API Backend

### 7.1 API Configuration
- Same Gemini API setup as Level 1 artifact
- Model: `gemini-2.0-flash` or `gemini-2.5-pro` (configurable via env variable)
- API key stored server-side, called via backend proxy endpoint (e.g., `/api/design-agent`)

### 7.2 System Prompt for the AI Agent

The following system prompt is sent with every Gemini API call for this page:

```
You are the Oxygy Agent Design Advisor — an expert in helping people design
effective, reusable, and accountable AI agents for professional use.

You will receive a description of a task that a user wants to build an AI agent
for, and optionally a description of the input data that agent will process.

You must respond with a JSON object containing exactly 4 sections that correspond
to the 4 steps of the Agent Builder Toolkit:

SECTION 1: AGENT READINESS ASSESSMENT
Evaluate the task against 5 criteria to determine if it warrants a custom agent:
- Frequency: How often is this task likely performed? (Score 0-100)
- Consistency: Does the output need the same structure each time? (Score 0-100)
- Shareability: Would others on the team benefit from this same tool? (Score 0-100)
- Complexity: Does it require domain expertise or multi-step reasoning? (Score 0-100)
- Standardization Risk: Would variable outputs cause downstream problems? (Score 0-100)

Calculate an overall score (weighted average — Frequency 20%, Consistency 25%,
Shareability 20%, Complexity 15%, Standardization Risk 20%).

Provide a verdict, a rationale paragraph, and specific bullet points for why
Level 1 ad-hoc prompting might suffice vs. why a Level 2 custom agent is recommended.

SECTION 2: OUTPUT FORMAT DESIGN
Based on the task, design a structured output format in two representations:
a) A human-readable version — formatted as clean, professional output that a team
   member would want to read. Use clear headings, sections, and structure.
b) A JSON template — the exact JSON schema that the agent should produce. Include
   all fields, nested objects, arrays where appropriate, and use descriptive key names.
   Add brief comments (as string values) explaining what each field should contain.

The JSON template should be comprehensive and production-ready. Think about what
fields someone would need to: track the output over time, compare outputs across
different runs, feed the output into a dashboard or report, and share with colleagues.

SECTION 3: SYSTEM PROMPT
Generate a complete, ready-to-use system prompt for this agent that incorporates:
- A clear role definition
- Context about the task and domain
- Explicit task instructions
- The JSON output format from Section 2 (embedded in the prompt)
- Step-by-step processing instructions
- Quality checks and constraints
- Human-in-the-loop requirements from Section 4

The prompt should be professional, detailed, and immediately usable in ChatGPT
Custom GPT Builder, Claude Projects, or Microsoft Copilot Agents.

Mark each section of the prompt with labels: [ROLE], [CONTEXT], [TASK],
[OUTPUT FORMAT], [STEPS], [QUALITY CHECKS] — so the frontend can apply
color-coding to match the Prompt Blueprint framework from Level 1.

SECTION 4: HUMAN-IN-THE-LOOP CHECKS
Based on the task AND the input data type, generate 3-5 specific accountability
checks. Each check must include:
- name: A short, clear name for the check
- severity: "critical", "important", or "recommended"
- what_to_verify: 1-2 sentences on what the human should review
- why_it_matters: 1-2 sentences on the risk if this isn't checked
- prompt_instruction: The exact text to add to the agent's prompt to enforce this check

Tailor the checks to the specific data type:
- For survey data: Include row-level references, response counts, confidence indicators
- For transcripts: Include timestamps, speaker attribution, context preservation
- For documents: Include page/section references, source citations, cross-referencing
- For financial data: Include calculation verification, source cell references, assumption flagging
- For general tasks: Include reasoning trails, alternative perspectives, confidence levels

RESPONSE FORMAT:
You must respond with the following JSON structure ONLY — no markdown, no extra text:

{
  "readiness": {
    "overall_score": 85,
    "verdict": "Strong candidate for a custom agent",
    "rationale": "This task is performed frequently...",
    "criteria": {
      "frequency": { "score": 90, "assessment": "Weekly or more frequent task" },
      "consistency": { "score": 85, "assessment": "Output structure must be consistent for team use" },
      "shareability": { "score": 80, "assessment": "Multiple team members would benefit" },
      "complexity": { "score": 75, "assessment": "Requires domain knowledge in..." },
      "standardization_risk": { "score": 90, "assessment": "Variable outputs would cause..." }
    },
    "level1_points": [
      "Point about when ad-hoc prompting would suffice"
    ],
    "level2_points": [
      "Point about why a custom agent is recommended"
    ]
  },
  "output_format": {
    "human_readable": "The formatted, human-readable output example as a string with newlines",
    "json_template": {
      "example": "The actual JSON template object goes here as a nested object"
    }
  },
  "system_prompt": "The full system prompt text with [ROLE], [CONTEXT], [TASK], [OUTPUT FORMAT], [STEPS], [QUALITY CHECKS] section markers",
  "accountability": [
    {
      "name": "Source Row References",
      "severity": "critical",
      "what_to_verify": "Description of what to check...",
      "why_it_matters": "Description of the risk...",
      "prompt_instruction": "The exact prompt text to add..."
    }
  ]
}
```

### 7.3 Input Assembly

The frontend sends the following to the backend endpoint:

```json
{
  "task_description": "The user's task description from Input 1",
  "input_data_description": "The user's input data description from Input 2, or 'Not specified' if left blank"
}
```

### 7.4 Response Parsing

The frontend should:
1. Parse the JSON response
2. Map `readiness` → Step 1, `output_format` → Step 2, `system_prompt` → Step 3, `accountability` → Step 4
3. For the `system_prompt` field, parse the `[ROLE]`, `[CONTEXT]`, etc. markers to apply color-coded highlighting
4. For the `output_format.json_template`, render it with proper JSON syntax highlighting
5. Handle the `output_format.human_readable` string by rendering newlines as line breaks and preserving any basic formatting

### 7.5 Error Handling
- Same error handling patterns as Level 1 artifact
- Client-side rate limit: 1 request per 8 seconds (this call is heavier than Level 1)
- Timeout: 20 seconds (this generates more content than Level 1)
- Error message: `"Something went wrong designing your agent. Please try again."` — displayed in a red-tinted box (`background: #FFF5F5`, `border: 1px solid #FC8181`, `color: #C53030`, `border-radius: 8px`, padding `12px 16px`)

---

## 8. Developer Notes

### 8.1 Technical Architecture
- Same architecture as Level 1 artifact: React component with backend API proxy
- Gemini API call goes through a serverless function — never expose the API key to the frontend
- This page shares the same API key and backend infrastructure as Level 1

### 8.2 JSON Display
- Use a JSON syntax highlighting library (e.g., `react-json-view`, `prism-react-renderer`, or a simple custom highlighter)
- Ensure the JSON is properly formatted with indentation (2 spaces)
- The JSON template from the AI may be nested — handle arbitrary depth

### 8.3 Score Circle Animation
- Use SVG for the circular progress indicator
- The `stroke-dasharray` and `stroke-dashoffset` properties can animate the fill
- Transition: `stroke-dashoffset 1s ease-out`

### 8.4 Sticky Stepper
- Use `position: sticky` with `top: 16px`
- Add `backdrop-filter: blur(8px)` and a slight `background: rgba(255,255,255,0.9)` when stuck
- Detect the "stuck" state using an `IntersectionObserver` on a sentinel element above the stepper
- On mobile, the stepper may not need to be sticky (the page sections are shorter)

### 8.5 Prompt Color-Coding (Step 3)
- The AI returns the system prompt with `[ROLE]`, `[CONTEXT]`, `[TASK]`, `[OUTPUT FORMAT]`, `[STEPS]`, `[QUALITY CHECKS]` markers
- The frontend should parse these markers and wrap each section in a `<span>` with the appropriate background color
- Replace the markers themselves with small inline pill labels
- Color mapping:
  - `[ROLE]` → Lavender `#C3D0F5` at 30%
  - `[CONTEXT]` → Pale Yellow `#FBE8A6` at 30%
  - `[TASK]` → Teal `#38B2AC` at 15%
  - `[OUTPUT FORMAT]` → Mint `#A8F0E0` at 30%
  - `[STEPS]` → Peach `#FBCEB1` at 30%
  - `[QUALITY CHECKS]` → Ice Blue `#E6FFFA` at 50%

### 8.6 Accessibility
- Score circle must have `role="img"` with `aria-label="Agent readiness score: 85 percent"`
- All interactive elements keyboard accessible
- Collapsible prompt section uses proper `aria-expanded` attribute
- Risk severity badges should not rely on color alone — the text label provides the information
- Tooltips accessible via keyboard focus
- Progress stepper uses `role="navigation"` with `aria-label="Agent design steps"`

### 8.7 Performance
- Page should load and be interactive within 2 seconds
- The Gemini API call for this page is heavier (4 sections of content) — expect 3–8 seconds response time
- Skeleton loaders keep the experience smooth during the wait
- Pre-loaded examples are hardcoded in the frontend

### 8.8 Dependencies
- Google Gemini API (shared with Level 1)
- Lucide Icons
- DM Sans + JetBrains Mono from Google Fonts
- JSON syntax highlighting (library or custom)
- SVG for the score circle
- IntersectionObserver (browser-native) for sticky stepper detection

### 8.9 Environment Variables
```
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```
(Same variables as Level 1 — shared configuration)
