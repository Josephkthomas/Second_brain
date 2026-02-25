import { LensType } from './types';

// Supabase credentials - loaded from environment variables
// Set these in .env.local for local development or in your deployment platform
export const SUPABASE_URL = process.env.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const COMMON_TABLES: string[] = ['knowledge_nodes', 'knowledge_edges'];

export const LENS_CONFIG: Record<LensType, { label: string; types: string[]; description: string }> = {
  'All': {
    label: 'Holistic View',
    types: [],
    description: 'Full graph with all connections visible.'
  },
  'Social': {
    label: 'Stakeholders',
    types: ['Person', 'Organization', 'Team'],
    description: 'People, teams, and organisations.'
  },
  'Strategic': {
    label: 'Strategy & Decisions',
    types: ['Anchor', 'Goal', 'Project', 'Decision', 'Insight', 'Hypothesis'],
    description: 'Goals, projects, and key decisions.'
  },
  'Operational': {
    label: 'Risks & Actions',
    types: ['Action', 'Risk', 'Blocker', 'Question'],
    description: 'Actions, blockers, and open risks.'
  },
  'Creative': {
    label: 'Ideas & Topics',
    types: ['Topic', 'Idea', 'Concept', 'Takeaway', 'Lesson'],
    description: 'Concepts, ideas, and takeaways.'
  },
  'Pathways': {
    label: 'Connection Flows',
    types: [],
    description: 'Directional influence and dependencies.'
  },
  'AnchorFocus': {
    label: 'Anchor Focus',
    types: [],
    description: 'Isolate one anchor and its context.'
  }
};