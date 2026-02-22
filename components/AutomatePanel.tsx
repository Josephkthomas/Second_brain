import React, { useState, useEffect } from 'react';
import { Workflow, Mic, Terminal, Copy, Check } from 'lucide-react';
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

        {/* Raw API Section */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center">
              <Terminal size={14} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Custom / API</h2>
              <p className="text-xs text-slate-500">Send data directly via HTTP for custom integrations</p>
            </div>
          </div>

          <RawApiCard />
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

const RawApiCard: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const endpoint = `${window.location.origin}/api/ingest/raw`;

  const handleCopy = () => {
    navigator.clipboard.writeText(endpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-slate-900/80 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-900/20 border border-emerald-900/40 flex items-center justify-center">
          <Terminal size={18} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Universal Ingest API</p>
          <p className="text-xs text-slate-500">POST structured data to build your graph from any source</p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2">
        <code className="text-[11px] text-emerald-400 font-mono flex-1 truncate">
          POST {endpoint}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
          title="Copy endpoint"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed">
        Send a JSON body with <code className="text-slate-400">title</code>, <code className="text-slate-400">content</code>, and optional <code className="text-slate-400">source_type</code> fields.
        Requires your Supabase auth token in the Authorization header.
      </p>
    </div>
  );
};
