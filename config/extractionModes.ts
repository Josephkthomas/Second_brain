// Extraction Mode Configurations
// PRD 3: Four predefined extraction modes optimized for different use cases

import type { ExtractionModeConfig, ExtractionMode } from '../types/extraction';

/**
 * Four extraction modes with distinct optimization strategies
 */
export const EXTRACTION_MODES: Record<ExtractionMode, ExtractionModeConfig> = {
  comprehensive: {
    id: 'comprehensive',
    name: 'Comprehensive',
    description: 'Extract all entities and relationships. Best for research, documentation, and content you want to fully capture.',
    icon: 'Database',
    promptAddition: `
EXTRACTION MODE: Comprehensive

Extract ALL relevant entities and relationships from this content. Be thorough and detailed:
- Capture both major and minor entities
- Include granular details and nuances
- Create relationships for all meaningful connections
- Don't worry about overwhelming detail - completeness is the goal
- Extract supporting details, examples, and context
- Include quotes and evidence for important claims
    `.trim(),
    entityFocus: 'All entity types: People, Organizations, Topics, Concepts, Technologies, Goals, Actions, Decisions, Insights, Questions, etc.',
    relationshipFocus: 'All relationship types, including nuanced and indirect connections',
    useCases: [
      'Academic research papers',
      'Detailed meeting notes',
      'Technical documentation',
      'Book summaries',
      'Content you want to reference extensively later'
    ]
  },

  strategic: {
    id: 'strategic',
    name: 'Strategic',
    description: 'Focus on high-level concepts, decisions, and strategic insights. Best for executive summaries and strategic planning.',
    icon: 'TrendingUp',
    promptAddition: `
EXTRACTION MODE: Strategic

Focus on HIGH-LEVEL concepts, strategic insights, and key decisions:
- Prioritize: Goals, Decisions, Insights, Risks, Opportunities, Strategic Initiatives
- Extract only major entities and themes (skip minor details)
- Emphasize relationships that show strategic connections and implications
- Capture "big picture" concepts over granular details
- Focus on what matters for decision-making and planning
- Identify key stakeholders and their positions
    `.trim(),
    entityFocus: 'Goals, Decisions, Insights, Risks, Opportunities, Organizations, Key People, Strategic Concepts',
    relationshipFocus: 'Causal relationships (leads_to, enables, blocks), strategic dependencies',
    useCases: [
      'Executive meeting notes',
      'Strategic planning documents',
      'Business case studies',
      'Market analysis',
      'Quarterly review summaries'
    ]
  },

  actionable: {
    id: 'actionable',
    name: 'Actionable',
    description: 'Prioritize actions, goals, blockers, and decisions. Best for project management and task-oriented content.',
    icon: 'CheckSquare',
    promptAddition: `
EXTRACTION MODE: Actionable

Focus on ACTIONABLE elements and implementation details:
- Prioritize: Actions, Goals, Blockers, Decisions, Deadlines, Metrics
- Extract concrete next steps and deliverables
- Identify dependencies and blockers
- Capture who is responsible for what (ownership)
- Focus on "what needs to happen" over abstract concepts
- Include timelines and success criteria where mentioned
- Link actions to their outcomes and dependencies
    `.trim(),
    entityFocus: 'Actions, Goals, Blockers, Decisions, People (as owners), Projects, Metrics, Deadlines',
    relationshipFocus: 'Dependencies (depends_on, blocks), ownership (authored, leads), enablement (enables)',
    useCases: [
      'Project planning meetings',
      'Sprint retrospectives',
      'Action item lists',
      'Implementation plans',
      'Team standup notes'
    ]
  },

  relational: {
    id: 'relational',
    name: 'Relational',
    description: 'Emphasize connections and relationships over entities. Best for discovering patterns and building context.',
    icon: 'Network',
    promptAddition: `
EXTRACTION MODE: Relational

Focus on CONNECTIONS and RELATIONSHIPS between concepts:
- Prioritize identifying how entities relate to each other
- Extract entities only when they're part of meaningful relationships
- Emphasize relationship types: supports, conflicts_with, leads_to, part_of, etc.
- Look for patterns, clusters, and themes in how concepts connect
- Capture both direct and indirect relationships
- Focus on building a rich, interconnected graph
- Identify bridges between different domains or topics
    `.trim(),
    entityFocus: 'Entities that have multiple connections (Topics, Concepts, People, Projects)',
    relationshipFocus: 'ALL relationship types with emphasis on discovering non-obvious connections',
    useCases: [
      'Brainstorming sessions',
      'Connecting disparate research',
      'Building conceptual frameworks',
      'Identifying patterns across sources',
      'Exploring interdisciplinary connections'
    ]
  }
};

/**
 * Get extraction mode configuration by ID
 */
export function getExtractionMode(modeId: ExtractionMode): ExtractionModeConfig {
  return EXTRACTION_MODES[modeId] || EXTRACTION_MODES.comprehensive;
}

/**
 * Get all extraction modes as an array
 */
export function getAllExtractionModes(): ExtractionModeConfig[] {
  return Object.values(EXTRACTION_MODES);
}

/**
 * Validate if a string is a valid extraction mode
 */
export function isValidExtractionMode(mode: string): mode is ExtractionMode {
  return mode in EXTRACTION_MODES;
}
