import React, { useState, useEffect } from 'react';
import { Workflow, Mic, Terminal, Copy, Check, ChevronDown, ChevronRight, BookOpen, Youtube, Puzzle } from 'lucide-react';
import clsx from 'clsx';
import { INTEGRATIONS } from '../config/integrations';
import { fetchUserIntegrations } from '../services/integrations';
import type { UserIntegration } from '../types/integrations';
import IntegrationTile from './integrations/IntegrationTile';
import SetupModal from './integrations/SetupModal';
import PlaylistHub from './youtube/PlaylistHub';

const MEETING_SLUGS = ['circleback', 'fireflies', 'tldv', 'meetgeek'];

type AutomateTab = 'meetings' | 'youtube' | 'api';

interface AutomatePanelProps {
  onGraphUpdate?: () => void;
  onNavigateToQueue?: () => void;
}

export const AutomatePanel: React.FC<AutomatePanelProps> = ({ onGraphUpdate, onNavigateToQueue }) => {
  const [activeTab, setActiveTab] = useState<AutomateTab>('meetings');
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
      <div className="max-w-4xl mx-auto w-full">

        {/* Center-aligned Header (matching InjectionHub) */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <Workflow className="text-purple-400" />
            Automation Hub
          </h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Connect your tools to automatically pipe content into your knowledge graph.
          </p>
        </div>

        {/* Center-aligned Pill Toggle Bar (matching InjectionHub pattern) */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-slate-900 border border-slate-800 rounded-full p-1 shadow-lg">
            <button
              onClick={() => setActiveTab('meetings')}
              className={clsx(
                "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                activeTab === 'meetings'
                  ? "bg-purple-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Mic size={16} /> Meeting Transcripts
            </button>
            <button
              onClick={() => setActiveTab('youtube')}
              className={clsx(
                "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                activeTab === 'youtube'
                  ? "bg-red-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Youtube size={16} /> YouTube
            </button>
            <button
              onClick={() => setActiveTab('api')}
              className={clsx(
                "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                activeTab === 'api'
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Puzzle size={16} /> Custom Integration
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in">

          {/* Meeting Transcripts — 4 Provider Tiles */}
          {activeTab === 'meetings' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-white mb-1">Connect a Meeting Provider</h2>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Automatically ingest transcripts, notes and action items after every meeting.
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          )}

          {/* YouTube — Playlist Addition */}
          {activeTab === 'youtube' && (
            <div className="animate-in fade-in">
              <PlaylistHub
                onGraphUpdate={onGraphUpdate}
                onNavigateToQueue={onNavigateToQueue}
              />
            </div>
          )}

          {/* Custom Integration — Detailed Overview */}
          {activeTab === 'api' && (
            <div className="animate-in fade-in">
              <CustomIntegrationOverview />
            </div>
          )}
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

/* ─── Custom Integration Overview ─── */

const CustomIntegrationOverview: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showDocs, setShowDocs] = useState(true);
  const endpoint = `${window.location.origin}/api/ingest/raw`;

  const handleCopy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const curlExample = `curl -X POST "${endpoint}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" \\
  -d '{
    "title": "Weekly Team Standup Notes",
    "content": "We discussed the Q1 roadmap...",
    "source_type": "Meeting",
    "source_url": "https://example.com/notes",
    "metadata": { "tags": ["standup", "q1"] }
  }'`;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold text-white mb-1">Build Your Own Integration</h2>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          Use the Universal Ingest API to pipe data from any source into your knowledge graph.
          Works with Zapier, Make, n8n, or any tool that can send HTTP requests.
        </p>
      </div>

      {/* Endpoint Card */}
      <div className="rounded-xl border border-white/10 bg-slate-900/80 overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-900/20 border border-emerald-900/40 flex items-center justify-center">
              <Terminal size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Universal Ingest API</p>
              <p className="text-xs text-slate-500">POST structured data to build your graph from any source</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5">
            <code className="text-xs text-emerald-400 font-mono flex-1 truncate">
              POST {endpoint}
            </code>
            <button
              onClick={() => handleCopy(endpoint, setCopied)}
              className="shrink-0 p-1.5 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
              title="Copy endpoint"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Documentation (expanded by default) */}
        <div className="border-t border-white/10">
          <button
            onClick={() => setShowDocs(!showDocs)}
            className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-white/5 transition-colors"
          >
            <BookOpen size={14} className="text-emerald-400" />
            <span className="text-xs font-medium text-slate-300">Getting Started Guide</span>
            {showDocs
              ? <ChevronDown size={14} className="text-slate-500 ml-auto" />
              : <ChevronRight size={14} className="text-slate-500 ml-auto" />
            }
          </button>

          {showDocs && (
            <div className="px-5 pb-5 space-y-5 text-xs">

              {/* What You Need */}
              <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                <h4 className="font-semibold text-purple-300 mb-2">What You Need</h4>
                <ul className="text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li><span className="text-white font-medium">Supabase Access Token</span> — found in your browser&apos;s dev tools under Application &gt; Local Storage &gt; <code className="text-slate-300 bg-black/30 px-1 py-0.5 rounded">sb-*-auth-token</code></li>
                  <li><span className="text-white font-medium">Content to ingest</span> — any text content: articles, transcripts, notes, reports</li>
                  <li><span className="text-white font-medium">A way to send HTTP requests</span> — curl, Zapier, Make, n8n, Python, JavaScript, etc.</li>
                </ul>
              </div>

              {/* Authentication */}
              <div>
                <h4 className="font-semibold text-white mb-1.5">Authentication</h4>
                <p className="text-slate-400 leading-relaxed">
                  Include your Supabase access token in the <code className="text-emerald-400 bg-black/30 px-1 py-0.5 rounded">Authorization</code> header.
                </p>
                <div className="mt-1.5 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-emerald-400">
                  Authorization: Bearer eyJhbGciOi...
                </div>
              </div>

              {/* Request Body */}
              <div>
                <h4 className="font-semibold text-white mb-1.5">Request Body (JSON)</h4>
                <div className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono text-[11px] leading-relaxed space-y-1">
                  <div>{'{'}</div>
                  <div className="pl-4">
                    <span className="text-emerald-400">"title"</span>: <span className="text-amber-300">"string"</span>
                    <span className="text-slate-500 ml-2">// Required — source title</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-emerald-400">"content"</span>: <span className="text-amber-300">"string"</span>
                    <span className="text-slate-500 ml-2">// Required — full text content</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-emerald-400">"source_type"</span>: <span className="text-amber-300">"string"</span>
                    <span className="text-slate-500 ml-2">// Optional — Meeting, YouTube, Note, Research, Document</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-emerald-400">"source_url"</span>: <span className="text-amber-300">"string"</span>
                    <span className="text-slate-500 ml-2">// Optional — URL of the original source</span>
                  </div>
                  <div className="pl-4">
                    <span className="text-emerald-400">"metadata"</span>: <span className="text-amber-300">{'{ "tags": ["custom", "tags"] }'}</span>
                    <span className="text-slate-500 ml-2">// Optional</span>
                  </div>
                  <div>{'}'}</div>
                </div>
              </div>

              {/* Example Curl */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="font-semibold text-white">Example Request</h4>
                  <button
                    onClick={() => handleCopy(curlExample, setCopiedCurl)}
                    className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-white transition-colors"
                  >
                    {copiedCurl ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                    {copiedCurl ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto whitespace-pre">
{curlExample}
                </pre>
              </div>

              {/* Response */}
              <div>
                <h4 className="font-semibold text-white mb-1.5">Response</h4>
                <p className="text-slate-400 leading-relaxed">
                  On success (200), the API returns the created source with extracted entities:
                </p>
                <div className="mt-1.5 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-300">
                  {'{ "source_id": "uuid", "nodes_created": 12, "edges_created": 8 }'}
                </div>
              </div>

              {/* Tips */}
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                <h4 className="font-semibold text-emerald-300 mb-1">Tips</h4>
                <ul className="text-slate-400 space-y-1 list-disc list-inside leading-relaxed">
                  <li>Use <code className="text-slate-300">source_type</code> to categorize — this affects how AI extracts entities</li>
                  <li>Add <code className="text-slate-300">source_url</code> to link back to the original content</li>
                  <li>Tags in <code className="text-slate-300">metadata</code> are searchable from the Sources panel</li>
                  <li>This endpoint works great with Zapier, Make, n8n, or any webhook tool</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
