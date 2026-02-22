// Integration Registry
// Adding a new integration = adding one entry here + a setup component + an adapter endpoint.

export type IntegrationCategory = 'meetings' | 'notes' | 'communication' | 'custom';
export type IntegrationStatus = 'live' | 'coming_soon';

export interface IntegrationDefinition {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  iconName: string;        // Lucide icon name
  accentColor: string;     // Tailwind color prefix (e.g. 'indigo')
  webhookBased: boolean;
  requiresApiKey?: boolean;
  apiKeyLabel?: string;
  apiKeyHelp?: string;
  docsUrl?: string;
  defaultConfig: {
    source_type: string;
    extraction_mode: string;
    anchor_emphasis: string;
  };
  setupSteps: string[];
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    slug: 'circleback',
    name: 'Circleback',
    tagline: 'AI Meeting Notes',
    description: 'Auto-ingest meeting notes, transcripts & action items',
    category: 'meetings',
    status: 'live',
    iconName: 'Radio',
    accentColor: 'indigo',
    webhookBased: true,
    defaultConfig: {
      source_type: 'Meeting',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Configure', 'Done'],
  },
  {
    slug: 'otter',
    name: 'Otter.ai',
    tagline: 'Meeting Transcripts',
    description: 'Sync meeting transcripts automatically',
    category: 'meetings',
    status: 'coming_soon',
    iconName: 'Mic',
    accentColor: 'violet',
    webhookBased: true,
    defaultConfig: {
      source_type: 'Meeting',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Configure', 'Done'],
  },
  {
    slug: 'fireflies',
    name: 'Fireflies',
    tagline: 'Meeting Recordings',
    description: 'Import meeting recordings and transcripts',
    category: 'meetings',
    status: 'live',
    iconName: 'Flame',
    accentColor: 'red',
    webhookBased: true,
    requiresApiKey: true,
    apiKeyLabel: 'Fireflies API Key',
    apiKeyHelp: 'Found in Fireflies → Settings → Integrations → Developer. Requires Business plan.',
    docsUrl: 'https://docs.fireflies.ai/graphql-api/webhooks',
    defaultConfig: {
      source_type: 'Meeting',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['API Key', 'Connect', 'Configure', 'Done'],
  },
  {
    slug: 'tldv',
    name: 'tl;dv',
    tagline: 'Meeting Recordings',
    description: 'Sync meeting recordings and transcripts',
    category: 'meetings',
    status: 'live',
    iconName: 'Mic',
    accentColor: 'violet',
    webhookBased: true,
    docsUrl: 'https://intercom.help/tldv/en/articles/11583137-api-and-webhooks',
    defaultConfig: {
      source_type: 'Meeting',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Configure', 'Done'],
  },
  {
    slug: 'meetgeek',
    name: 'MeetGeek',
    tagline: 'Meeting Summaries',
    description: 'Auto-ingest meeting summaries and transcripts',
    category: 'meetings',
    status: 'live',
    iconName: 'Mic',
    accentColor: 'emerald',
    webhookBased: true,
    docsUrl: 'https://docs.meetgeek.ai/api-reference/v1/appendix-webhooks',
    defaultConfig: {
      source_type: 'Meeting',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Configure', 'Done'],
  },
  {
    slug: 'notion',
    name: 'Notion',
    tagline: 'Docs & Wikis',
    description: 'Ingest pages and databases into your graph',
    category: 'notes',
    status: 'coming_soon',
    iconName: 'FileText',
    accentColor: 'slate',
    webhookBased: false,
    defaultConfig: {
      source_type: 'Document',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Authorize', 'Select Pages', 'Done'],
  },
  {
    slug: 'slack',
    name: 'Slack',
    tagline: 'Team Communication',
    description: 'Capture saved messages and channel summaries',
    category: 'communication',
    status: 'coming_soon',
    iconName: 'MessageSquare',
    accentColor: 'pink',
    webhookBased: true,
    defaultConfig: {
      source_type: 'Note',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Configure', 'Done'],
  },
  {
    slug: 'readwise',
    name: 'Readwise',
    tagline: 'Highlights & Articles',
    description: 'Sync book highlights and article annotations',
    category: 'notes',
    status: 'coming_soon',
    iconName: 'BookOpen',
    accentColor: 'amber',
    webhookBased: true,
    defaultConfig: {
      source_type: 'Research',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['API Key', 'Configure', 'Done'],
  },
  {
    slug: 'zapier',
    name: 'Zapier',
    tagline: 'Any App Automation',
    description: 'Connect any app via Zapier automations',
    category: 'custom',
    status: 'coming_soon',
    iconName: 'Zap',
    accentColor: 'orange',
    webhookBased: true,
    defaultConfig: {
      source_type: 'API',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: ['Connect', 'Done'],
  },
  {
    slug: 'raw',
    name: 'Custom / API',
    tagline: 'Universal Ingest API',
    description: 'Send data directly via HTTP for custom integrations',
    category: 'custom',
    status: 'live',
    iconName: 'Terminal',
    accentColor: 'emerald',
    webhookBased: false,
    defaultConfig: {
      source_type: 'API',
      extraction_mode: 'comprehensive',
      anchor_emphasis: 'standard',
    },
    setupSteps: [],
  },
];

export function getIntegration(slug: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find(i => i.slug === slug);
}

export function getIntegrationsByCategory(category: IntegrationCategory): IntegrationDefinition[] {
  return INTEGRATIONS.filter(i => i.category === category);
}
