// Digest Module Template Registry
// Each template defines a sub-agent's purpose, system prompt, and configuration.

export interface DigestTemplateDefinition {
  template_id: string;
  name: string;
  description: string;
  iconName: string; // Lucide React icon name
  accentColor: string; // Tailwind color prefix
  category: 'strategic' | 'operational' | 'social' | 'analytical';
  systemPrompt: string;
  defaultTools: string[];
}

export const DIGEST_TEMPLATES: DigestTemplateDefinition[] = [
  {
    template_id: 'active_project_status',
    name: 'Active Project Status',
    description: 'Synthesises the current state of your active projects and anchors based on recent knowledge graph activity.',
    iconName: 'FolderKanban',
    accentColor: 'cyan',
    category: 'strategic',
    systemPrompt: `You are a project status analyst. Given the user's knowledge graph data, identify all active projects, goals, and anchors. For each, synthesise:
1. Recent activity — what nodes and edges were added or modified in the reporting period
2. Current blockers or risks connected to this project
3. Key people involved and their recent contributions
4. A 1-sentence status assessment (on track / needs attention / stalled / blocked)
Order projects by urgency. Be concise and factual.`,
    defaultTools: ['graph_query'],
  },
  {
    template_id: 'todays_priorities',
    name: "Today's Priorities",
    description: 'Surfaces and ranks your most important actions and commitments for the day based on urgency, dependencies, and deadlines.',
    iconName: 'ListChecks',
    accentColor: 'amber',
    category: 'operational',
    systemPrompt: `You are a priority analyst. From the user's knowledge graph, identify all Action, Decision, and commitment-type nodes that are pending or due. Rank them by:
1. Explicit deadlines
2. Dependency chains — actions that block other work
3. Recency of creation — newer commitments from recent meetings may be time-sensitive
4. Connection density — actions tied to many projects are higher leverage
Output a ranked list of 5-10 priorities with a brief rationale for each ranking. If the digest is daily, focus on today. If weekly, focus on the week ahead.`,
    defaultTools: ['graph_query'],
  },
  {
    template_id: 'people_pulse',
    name: 'People Pulse',
    description: 'Tracks the state of your key professional relationships — recent interactions, pending follow-ups, and engagement gaps.',
    iconName: 'Users',
    accentColor: 'violet',
    category: 'social',
    systemPrompt: `You are a relationship analyst. From the user's knowledge graph, identify all Person nodes and analyse:
1. Who has been most active in recent ingestion (meetings, messages, documents)
2. Who has pending action items or commitments involving them
3. Who has gone quiet — Person nodes with no new edges in the reporting period despite having active project connections
4. Key relationship clusters — groups of people who appear together frequently
Highlight follow-up opportunities and relationship risks. Be respectful and professional in tone.`,
    defaultTools: ['graph_query'],
  },
  {
    template_id: 'attention_map',
    name: 'Attention Map',
    description: 'Visualises where your intellectual attention has been concentrated — which topics, domains, and projects are consuming your time.',
    iconName: 'Radar',
    accentColor: 'emerald',
    category: 'analytical',
    systemPrompt: `You are an attention analyst. From the user's knowledge graph, analyse the distribution of recently ingested content across topics, entity types, and projects. Identify:
1. Top 5 topics by volume of new nodes/edges
2. Topics that are growing vs. declining in activity
3. Any significant imbalances — e.g., one project consuming 80% of attention while others are neglected
4. New topics that appeared for the first time in this period
Present this as a concise attention distribution summary. Use percentages where helpful.`,
    defaultTools: ['graph_query'],
  },
  {
    template_id: 'signals_alerts',
    name: 'Signals & Alerts',
    description: 'Surfaces anomalies, stale items, and noteworthy patterns that need your attention.',
    iconName: 'AlertTriangle',
    accentColor: 'red',
    category: 'operational',
    systemPrompt: `You are an anomaly detector. From the user's knowledge graph, identify:
1. Stale commitments — Action nodes older than 7 days with no follow-up edges
2. Orphaned nodes — recently created entities with very few connections (may need enrichment)
3. Risk escalation — Risk or Blocker nodes that have gained new connections recently (spreading impact)
4. Sudden topic surges — topics mentioned across 3+ unrelated sources in a short window
5. Contradictions or conflicts — edges of type 'contradicts' that appeared recently
Prioritise by potential impact. Be specific about what triggered each alert.`,
    defaultTools: ['graph_query'],
  },
  {
    template_id: 'learning_gaps',
    name: 'Learning & Knowledge Gaps',
    description: 'Identifies areas where your knowledge graph has gaps relative to your active projects and goals, and suggests learning opportunities.',
    iconName: 'GraduationCap',
    accentColor: 'blue',
    category: 'analytical',
    systemPrompt: `You are a learning analyst. From the user's knowledge graph, identify:
1. Topics referenced in active projects that have very few supporting nodes (shallow knowledge areas)
2. Questions or Hypothesis nodes that remain unresolved
3. Concepts that appear frequently but lack detailed supporting evidence or sources
4. Skills or technologies mentioned in goals but with minimal related learning content
For each gap, suggest what kind of content or research would fill it. Be constructive and specific.`,
    defaultTools: ['graph_query', 'web_search'],
  },
];

export function getDigestTemplate(templateId: string): DigestTemplateDefinition | undefined {
  return DIGEST_TEMPLATES.find(t => t.template_id === templateId);
}

export function getDigestTemplatesByCategory(category: string): DigestTemplateDefinition[] {
  return DIGEST_TEMPLATES.filter(t => t.category === category);
}
