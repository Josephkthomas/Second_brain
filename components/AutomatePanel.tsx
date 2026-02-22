import React, { useState, useEffect } from 'react';
import { Workflow, Mic, Youtube, ChevronRight } from 'lucide-react';
import { INTEGRATIONS } from '../config/integrations';
import { fetchUserIntegrations } from '../services/integrations';
import type { UserIntegration } from '../types/integrations';
import IntegrationTile from './integrations/IntegrationTile';
import SetupModal from './integrations/SetupModal';

const MEETING_SLUGS = ['circleback', 'fireflies', 'tldv', 'meetgeek'];

export const AutomatePanel: React.FC = () => {
  const [userIntegrations, setUserIntegrations] = useState<UserIntegration[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadIntegrations = async () => {
    const data = await fetchUserIntegrations();
    setUserIntegrations(data);
    setLoading(false);
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const getUserIntegration = (slug: string) =>
    userIntegrations.find(ui => ui.integration_slug === slug);

  const selectedIntegration = selectedSlug
    ? INTEGRATIONS.find(i => i.slug === selectedSlug)
    : null;

  const meetingIntegrations = INTEGRATIONS.filter(i => MEETING_SLUGS.includes(i.slug));

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Workflow className="text-cyan-400" size={22} />
            Automate
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 max-w-lg">
            Connect your tools to automatically pipe content into your knowledge graph.
            Set it up once — your graph updates itself.
          </p>
        </div>

        {/* Meeting Transcripts Section */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
              <Mic size={14} className="text-slate-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Meeting Transcripts</h2>
              <p className="text-xs text-slate-500">Automatically ingest transcripts, notes and action items after every meeting</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {meetingIntegrations.map(integration => (
              <IntegrationTile
                key={integration.slug}
                integration={integration}
                userIntegration={getUserIntegration(integration.slug)}
                onClick={() => setSelectedSlug(integration.slug)}
              />
            ))}
          </div>
        </div>

        {/* Video & Content Section */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
              <Youtube size={14} className="text-slate-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Video & Content</h2>
              <p className="text-xs text-slate-500">Subscribe to YouTube channels and auto-ingest new videos</p>
            </div>
          </div>

          <YouTubeAutomationCard />
        </div>
      </div>

      {/* Setup modal */}
      {selectedIntegration && (
        <SetupModal
          integration={selectedIntegration}
          userIntegration={getUserIntegration(selectedIntegration.slug)}
          onClose={() => setSelectedSlug(null)}
          onSuccess={() => {
            loadIntegrations();
            setSelectedSlug(null);
          }}
        />
      )}
    </div>
  );
};

const YouTubeAutomationCard: React.FC = () => (
  <button className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-slate-900/80 hover:bg-slate-800/80 hover:border-white/20 transition-all text-left group">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-red-900/20 border border-red-900/40 flex items-center justify-center">
        <Youtube size={18} className="text-red-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-white">YouTube Channels</p>
        <p className="text-xs text-slate-500">Subscribe to channels and auto-ingest new videos</p>
      </div>
    </div>
    <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
  </button>
);
