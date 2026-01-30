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
    description: 'Displays the entire knowledge graph. Best for initial exploration and seeing all connections.' 
  },
  'Social': { 
    label: 'Stakeholders', 
    types: ['Person', 'Organization', 'Team'], 
    description: 'Filters for People and Organizations. Best for understanding team structure and key players.' 
  },
  'Strategic': { 
    label: 'Strategy & Decisions', 
    types: ['Anchor', 'Goal', 'Project', 'Decision', 'Insight', 'Hypothesis'], 
    description: 'Filters for high-level Goals and Projects. Best for planning and decision tracking.' 
  },
  'Operational': { 
    label: 'Risks & Actions', 
    types: ['Action', 'Risk', 'Blocker', 'Question'], 
    description: 'Filters for immediate Actions and Blockers. Best for project management and day-to-day ops.' 
  },
  'Creative': { 
    label: 'Ideas & Topics', 
    types: ['Topic', 'Idea', 'Concept', 'Takeaway', 'Lesson'], 
    description: 'Filters for Concepts and Topics. Best for brainstorming, learning, and linking ideas.' 
  },
  'Pathways': { 
    label: 'Connection Flows', 
    types: [], 
    description: 'Visualizes the direction of influence (Synaptic Flow). Best for tracing cause-and-effect or dependencies.' 
  }, 
  'AnchorFocus': { 
    label: 'Anchor Focus', 
    types: [], 
    description: 'Isolates a specific Goal or Project and its immediate context. Best for deep-diving into one specific area.' 
  } 
};