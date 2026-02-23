import React, { useState, useEffect } from 'react';
import { Workflow, Mic, Terminal, Copy, Check, Youtube, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import { INTEGRATIONS } from '../config/integrations';
import { fetchUserIntegrations } from '../services/integrations';
import type { UserIntegration } from '../types/integrations';
import IntegrationTile from './integrations/IntegrationTile';
import SetupModal from './integrations/SetupModal';
import YouTubeManager from './youtube/YouTubeManager';

const MEETING_SLUGS = ['circleback', 'fireflies', 'tldv', 'meetgeek'];

interface AutomatePanelProps {
  onGraphUpdate?: () => void;
}

export const AutomatePanel: React.FC<AutomatePanelProps> = ({ onGraphUpdate }) => {
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
      <div className="max-w-4xl mx-auto w-full space-y-10">

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

        {/* YouTube Auto-Ingest Section */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <Youtube size={14} className="text-red-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">YouTube Auto-Ingest</h2>
              <p className="text-xs text-slate-500">Subscribe to channels and playlists to automatically capture knowledge from new videos</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
            <YouTubeManager onGraphUpdate={onGraphUpdate} />
          </div>
        </div>

        {/* Custom / API Section */}
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
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
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
    <div className="rounded-xl border border-white/10 bg-slate-900/80 space-y-4 overflow-hidden">
      {/* Endpoint */}
      <div className="p-4 space-y-3">
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
            onClick={() => handleCopy(endpoint, setCopied)}
            className="shrink-0 p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
            title="Copy endpoint"
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Expandable Documentation */}
      <div className="border-t border-white/10">
        <button
          onClick={() => setShowDocs(!showDocs)}
          className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        >
          <BookOpen size={14} className="text-emerald-400" />
          <span className="text-xs font-medium text-slate-300">Getting Started Guide</span>
          {showDocs
            ? <ChevronDown size={14} className="text-slate-500 ml-auto" />
            : <ChevronRight size={14} className="text-slate-500 ml-auto" />
          }
        </button>

        {showDocs && (
          <div className="px-4 pb-4 space-y-4 text-xs">

            {/* Authentication */}
            <div>
              <h4 className="font-semibold text-white mb-1.5">Authentication</h4>
              <p className="text-slate-400 leading-relaxed">
                Include your Supabase access token in the <code className="text-emerald-400 bg-black/30 px-1 py-0.5 rounded">Authorization</code> header.
                You can find this token in your browser&apos;s developer tools under Application &gt; Local Storage &gt; <code className="text-slate-300 bg-black/30 px-1 py-0.5 rounded">sb-*-auth-token</code>.
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
  );
};
