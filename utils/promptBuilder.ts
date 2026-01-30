// Centralized Prompt Builder for Extraction
// PRD 3: Composes system prompts from multiple context layers

import type { ExtractionMode, AnchorEmphasis } from '../types/extraction';
import type { AnchorNode } from '../types';
import type { UserProfile } from '../services/supabase';
import { buildProfileContext } from './profileContext';
import { buildAnchorContextWithEmphasis, hasAnchors } from './anchorContext';
import { getExtractionMode } from '../config/extractionModes';

export interface PromptBuilderConfig {
  mode: ExtractionMode;
  anchorEmphasis: AnchorEmphasis;
  profile?: UserProfile | null;
  anchors?: AnchorNode[];
  selectedAnchorIds?: string[]; // Filter anchors to only these IDs
  userGuidance?: string;
  contextHeader?: string; // Additional context like source type, title, etc.
}

/**
 * Base extraction instructions (mode-agnostic)
 * This is the core knowledge graph extraction prompt
 */
const BASE_EXTRACTION_INSTRUCTIONS = `
# Role: Elite Knowledge Graph Engineer
You are an advanced AI system designed to exhaustively mine unstructured text and structure it into a high-fidelity Knowledge Graph.
Your goal is **Total Information Capture** within the specified extraction mode.

## Entity Ontology
Use these standardized entity types:
- **Person**: Individual people mentioned by name
- **Organization**: Companies, institutions, groups, agencies
- **Team**: Work groups, project teams, departments
- **Topic**: Subject areas, domains of knowledge, themes
- **Project**: Initiatives, efforts with defined goals
- **Goal**: Objectives, targets, desired outcomes
- **Action**: Tasks, todos, action items, next steps
- **Risk**: Potential problems, threats, concerns
- **Blocker**: Obstacles preventing progress
- **Decision**: Choices made, commitments, resolutions
- **Insight**: Key learnings, realizations, discoveries
- **Question**: Open questions, areas of uncertainty
- **Idea**: Proposals, suggestions, creative thoughts
- **Concept**: Abstract ideas, frameworks, theories, models
- **Takeaway**: Key points, summary conclusions
- **Lesson**: Learnings from experience
- **Document**: Files, papers, resources, references
- **Event**: Meetings, conferences, occurrences, milestones
- **Location**: Physical or virtual places
- **Technology**: Tools, platforms, technical systems
- **Product**: Software, services, offerings
- **Metric**: Measurements, KPIs, data points
- **Hypothesis**: Assumptions to test, theories to validate

## Relationship Types
Use these to connect entities:
- **leads_to**: Causal relationship (A causes or enables B)
- **supports**: Reinforcement (A helps or supports B)
- **blocks**: Prevention (A prevents or hinders B)
- **depends_on**: Dependency (A requires B)
- **part_of**: Composition (A is contained within B)
- **authored**: Creation (Person created Document/Idea)
- **mentions**: Reference (A references or discusses B)
- **conflicts_with**: Opposition (A contradicts B)
- **relates_to**: General connection (use when more specific type doesn't fit)
- **enables**: Facilitation (A makes B possible)
- **owns**: Ownership/responsibility (Person/Org owns Project/Product)

## Core Extraction Rules
1. **Specificity**: Use specific labels. "Q3 Budget Review" not "Budget". "Sarah Chen" not "Person".
2. **Normalization**: Normalize entity names consistently across the document.
3. **Evidence**: Include quotes or evidence for important entities and relationships.
4. **Tags**: Generate 2-4 search keywords per entity for retrieval.
5. **Confidence**: Rate confidence 0.0-1.0 based on how explicit the information is.
6. **No Duplicates**: If an entity appears multiple times, consolidate into one entry.
`.trim();

/**
 * Builds complete system prompt for extraction
 * Combines all context layers in proper order (most general to most specific)
 */
export function buildExtractionPrompt(config: PromptBuilderConfig): string {
  const sections: string[] = [];

  // 1. Base instructions (always first - most general)
  sections.push(BASE_EXTRACTION_INSTRUCTIONS);

  // 2. Extraction mode (defines extraction behavior)
  const modeConfig = getExtractionMode(config.mode);
  if (modeConfig) {
    sections.push(`\n${modeConfig.promptAddition}`);
  }

  // 3. User profile context (who is the user)
  if (config.profile) {
    const profileContext = buildProfileContext(config.profile);
    if (profileContext) {
      sections.push(profileContext);
    }
  }

  // 4. Anchor context (what are user's focal points)
  if (config.anchors && hasAnchors(config.anchors)) {
    // Filter to selected anchors if specified
    let relevantAnchors = config.anchors;
    if (config.selectedAnchorIds && config.selectedAnchorIds.length > 0) {
      relevantAnchors = config.anchors.filter(a =>
        config.selectedAnchorIds!.includes(a.id)
      );
    }

    if (hasAnchors(relevantAnchors)) {
      const anchorContext = buildAnchorContextWithEmphasis(
        relevantAnchors,
        config.anchorEmphasis
      );
      if (anchorContext) {
        sections.push(anchorContext);
      }
    }
  }

  // 5. Context header (source type, title, URL)
  if (config.contextHeader && config.contextHeader.trim()) {
    sections.push(`\n## Source Context\n${config.contextHeader.trim()}`);
  }

  // 6. User-specific guidance for this source (highest priority, most specific)
  if (config.userGuidance && config.userGuidance.trim()) {
    sections.push(`
## User Custom Instructions (PRIORITY)
The user has provided specific guidance for this extraction. Follow these instructions carefully:

${config.userGuidance.trim()}
    `.trim());
  }

  return sections.join('\n\n');
}

/**
 * Validates prompt length and warns if approaching limits
 */
export interface PromptValidation {
  valid: boolean;
  charCount: number;
  estimatedTokens: number;
  warning?: string;
}

export function validatePromptLength(prompt: string): PromptValidation {
  const charCount = prompt.length;
  // Rough estimate: 1 token ~ 4 characters for English text
  const estimatedTokens = Math.ceil(charCount / 4);

  // Gemini 1.5 Pro has ~1M token context, but system prompt should stay reasonable
  // Warn if system prompt alone exceeds 10k tokens (~40k chars)
  const MAX_RECOMMENDED_TOKENS = 10000;
  const MAX_RECOMMENDED_CHARS = MAX_RECOMMENDED_TOKENS * 4;

  return {
    valid: charCount < MAX_RECOMMENDED_CHARS,
    charCount,
    estimatedTokens,
    warning: charCount >= MAX_RECOMMENDED_CHARS
      ? `System prompt is very long (${estimatedTokens} estimated tokens). Consider simplifying user guidance or reducing anchor count.`
      : undefined
  };
}

/**
 * Builds a simplified prompt preview for UI display
 * Shows which sections are included without full content
 */
export function buildPromptPreviewSummary(config: PromptBuilderConfig): string[] {
  const sections: string[] = ['Base Extraction Instructions'];

  const modeConfig = getExtractionMode(config.mode);
  sections.push(`Extraction Mode: ${modeConfig.name}`);

  if (config.profile) {
    sections.push('User Profile Context');
  }

  if (config.anchors && hasAnchors(config.anchors)) {
    let anchorCount = config.anchors.length;
    if (config.selectedAnchorIds && config.selectedAnchorIds.length > 0) {
      anchorCount = config.selectedAnchorIds.length;
    }
    sections.push(`Anchor Context (${anchorCount} anchors, ${config.anchorEmphasis} emphasis)`);
  }

  if (config.contextHeader) {
    sections.push('Source Metadata');
  }

  if (config.userGuidance) {
    sections.push('Custom User Instructions');
  }

  return sections;
}

/**
 * Gets the base extraction instructions (for reference/debugging)
 */
export function getBaseInstructions(): string {
  return BASE_EXTRACTION_INSTRUCTIONS;
}
