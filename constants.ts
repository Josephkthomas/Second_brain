import { LensType } from './types';

// Derived from the user's provided JWT and prompt
export const SUPABASE_ANON_KEY = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwanVobW9ocm1mcWZidHlsZnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNjQ2MjcsImV4cCI6MjA4Mzc0MDYyN30.tEaGrsLIKAyiHhXKU9m1Y9KNbWqNqhJPib9D8LVmTuU`;

// Provided by user for full access
export const SUPABASE_SERVICE_ROLE_KEY = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwanVobW9ocm1mcWZidHlsZnF2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE2NDYyNywiZXhwIjoyMDgzNzQwNjI3fQ.RHp1-Pid8xfjzK4mepFiTyzu4Pbl76e97vkh14q16S0`;

// Extracted project ref from the JWT payload ("ref": "ipjuhmohrmfqfbtylfqv")
export const SUPABASE_PROJECT_ID = 'ipjuhmohrmfqfbtylfqv';
export const SUPABASE_URL = `https://${SUPABASE_PROJECT_ID}.supabase.co`;

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