// ApiSettingsPanel - API endpoint documentation, code snippets, and test request builder

import React, { useState } from 'react';
import {
  Copy, CheckCircle, Zap, Code, Terminal, Send, Loader2,
  AlertTriangle, ChevronDown, ChevronRight, Key, Globe
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';

const ENDPOINT_URL = 'https://second-brain-one-mocha.vercel.app/api/ingest';

const SOURCE_TYPES = [
  'Meeting', 'YouTube', 'Note', 'Research', 'Document',
  'Podcast', 'Email', 'Chat', 'Article', 'API'
];

const EXTRACTION_MODES = [
  { value: 'comprehensive', label: 'Comprehensive', desc: 'Extract all entities and relationships' },
  { value: 'strategic', label: 'Strategic', desc: 'Goals, Decisions, Insights' },
  { value: 'actionable', label: 'Actionable', desc: 'Actions, Goals, Blockers' },
  { value: 'relational', label: 'Relational', desc: 'Emphasize connections' },
];

type SnippetTab = 'curl' | 'python' | 'javascript';

function generateSnippets(token: string) {
  const maskedToken = token ? `${token.slice(0, 20)}...` : 'YOUR_JWT_TOKEN';

  return {
    curl: `curl -X POST ${ENDPOINT_URL} \\
  -H "Authorization: Bearer ${maskedToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Meeting Notes - Weekly Standup",
    "content": "Discussion about Q1 roadmap priorities...",
    "source_type": "Meeting",
    "extraction_mode": "comprehensive",
    "custom_instructions": "Focus on action items and decisions"
  }'`,

    python: `import requests

response = requests.post(
    "${ENDPOINT_URL}",
    headers={
        "Authorization": "Bearer ${maskedToken}",
        "Content-Type": "application/json"
    },
    json={
        "title": "Meeting Notes - Weekly Standup",
        "content": "Discussion about Q1 roadmap priorities...",
        "source_type": "Meeting",
        "extraction_mode": "comprehensive",
        "custom_instructions": "Focus on action items and decisions"
    }
)
print(response.json())  # {"id": "...", "status": "pending"}`,

    javascript: `const response = await fetch("${ENDPOINT_URL}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${maskedToken}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    title: "Meeting Notes - Weekly Standup",
    content: "Discussion about Q1 roadmap priorities...",
    source_type: "Meeting",
    extraction_mode: "comprehensive",
    custom_instructions: "Focus on action items and decisions"
  })
});
const data = await response.json();
console.log(data); // { id: "...", status: "pending" }`,
  };
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all',
        copied
          ? 'bg-emerald-500/20 text-emerald-400'
          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
      )}
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {label || (copied ? 'Copied!' : 'Copy')}
    </button>
  );
}

export default function ApiSettingsPanel() {
  const { session } = useAuth();
  const jwt = session?.access_token || '';

  const [snippetTab, setSnippetTab] = useState<SnippetTab>('curl');
  const [expandedSections, setExpandedSections] = useState({
    endpoint: true,
    auth: true,
    snippets: true,
    test: true,
  });

  // Test request state
  const [testTitle, setTestTitle] = useState('Test Ingestion');
  const [testContent, setTestContent] = useState('');
  const [testSourceType, setTestSourceType] = useState('API');
  const [testExtractionMode, setTestExtractionMode] = useState('comprehensive');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; data: any } | null>(null);

  const snippets = generateSnippets(jwt);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Send test request
  const handleTestRequest = async () => {
    if (!jwt || testLoading) return;

    if (!testContent.trim() || testContent.trim().length < 10) {
      setTestResult({ success: false, data: { error: 'Content must be at least 10 characters' } });
      return;
    }

    try {
      setTestLoading(true);
      setTestResult(null);

      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          title: testTitle.trim() || 'Test Ingestion',
          content: testContent.trim(),
          source_type: testSourceType,
          extraction_mode: testExtractionMode,
        }),
      });

      const data = await response.json();
      setTestResult({ success: response.ok, data });
    } catch (err) {
      setTestResult({
        success: false,
        data: { error: err instanceof Error ? err.message : 'Request failed' }
      });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      {/* Section: Endpoint URL */}
      <div className="rounded-lg border border-white/5 overflow-hidden">
        <button
          onClick={() => toggleSection('endpoint')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
        >
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-200">Endpoint URL</span>
          {expandedSections.endpoint ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />}
        </button>
        {expandedSections.endpoint && (
          <div className="px-4 py-3 border-t border-white/5">
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-950 border border-white/10 rounded text-cyan-400 font-mono text-sm truncate">
                POST {ENDPOINT_URL}
              </code>
              <CopyButton text={ENDPOINT_URL} />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Send a POST request with JSON body containing <code className="text-cyan-400/70">title</code> and <code className="text-cyan-400/70">content</code> fields.
              Returns <code className="text-emerald-400/70">202 Accepted</code> with a queue ID.
            </p>
          </div>
        )}
      </div>

      {/* Section: Authentication */}
      <div className="rounded-lg border border-white/5 overflow-hidden">
        <button
          onClick={() => toggleSection('auth')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
        >
          <Key className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-slate-200">Authentication</span>
          {expandedSections.auth ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />}
        </button>
        {expandedSections.auth && (
          <div className="px-4 py-3 border-t border-white/5 space-y-3">
            <p className="text-xs text-slate-400">
              Include your JWT token in the <code className="text-cyan-400/70">Authorization</code> header:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-slate-950 border border-white/10 rounded text-slate-400 font-mono text-xs truncate">
                Authorization: Bearer {jwt ? `${jwt.slice(0, 30)}...` : 'YOUR_TOKEN'}
              </code>
              {jwt && <CopyButton text={jwt} label="Copy Token" />}
            </div>
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/10 rounded">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-400/80">
                <p className="font-medium">JWT tokens expire periodically.</p>
                <p className="mt-1 text-amber-400/60">
                  For long-running automations, refresh the token by re-authenticating.
                  Copy a fresh token from this panel before running scripts.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section: Code Snippets */}
      <div className="rounded-lg border border-white/5 overflow-hidden">
        <button
          onClick={() => toggleSection('snippets')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
        >
          <Code className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-200">Code Snippets</span>
          {expandedSections.snippets ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />}
        </button>
        {expandedSections.snippets && (
          <div className="px-4 py-3 border-t border-white/5 space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 rounded p-1">
              {([
                { key: 'curl' as SnippetTab, label: 'curl', icon: Terminal },
                { key: 'python' as SnippetTab, label: 'Python', icon: Code },
                { key: 'javascript' as SnippetTab, label: 'JavaScript', icon: Code },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSnippetTab(tab.key)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                    snippetTab === tab.key
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  )}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Snippet */}
            <div className="relative">
              <pre className="p-3 bg-slate-950 border border-white/10 rounded text-xs text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap">
                {snippets[snippetTab]}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={snippets[snippetTab]} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section: Test Request */}
      <div className="rounded-lg border border-white/5 overflow-hidden">
        <button
          onClick={() => toggleSection('test')}
          className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
        >
          <Send className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">Test Request</span>
          {expandedSections.test ? <ChevronDown className="w-4 h-4 text-slate-500 ml-auto" /> : <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />}
        </button>
        {expandedSections.test && (
          <div className="px-4 py-3 border-t border-white/5 space-y-3">
            {/* Title */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Title</label>
              <input
                type="text"
                value={testTitle}
                onChange={e => setTestTitle(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30"
                placeholder="My content title"
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Content</label>
              <textarea
                value={testContent}
                onChange={e => setTestContent(e.target.value)}
                rows={5}
                className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/30 resize-y font-mono"
                placeholder="Paste your raw text content here (min 10 characters)..."
              />
            </div>

            {/* Options row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Source Type</label>
                <select
                  value={testSourceType}
                  onChange={e => setTestSourceType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500/30"
                >
                  {SOURCE_TYPES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Extraction Mode</label>
                <select
                  value={testExtractionMode}
                  onChange={e => setTestExtractionMode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded text-sm text-slate-200 focus:outline-none focus:border-cyan-500/30"
                >
                  {EXTRACTION_MODES.map(mode => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Send button */}
            <button
              onClick={handleTestRequest}
              disabled={testLoading || !jwt}
              className={clsx(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded text-sm font-bold transition-all',
                testLoading || !jwt
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md'
              )}
            >
              {testLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Test Request
                </>
              )}
            </button>

            {/* Result */}
            {testResult && (
              <div className={clsx(
                'p-3 rounded border text-xs font-mono',
                testResult.success
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/5 border-red-500/20 text-red-400'
              )}>
                <div className="flex items-center gap-2 mb-1">
                  {testResult.success ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  <span className="font-bold">
                    {testResult.success ? '202 Accepted' : 'Error'}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}

            {!jwt && (
              <p className="text-xs text-amber-400/70 text-center">
                Sign in to send test requests
              </p>
            )}
          </div>
        )}
      </div>

      {/* Payload Reference */}
      <div className="rounded-lg border border-white/5 overflow-hidden">
        <div className="px-4 py-3 bg-slate-900/50">
          <span className="text-sm font-semibold text-slate-200">Payload Reference</span>
        </div>
        <div className="px-4 py-3 border-t border-white/5">
          <pre className="p-3 bg-slate-950 border border-white/10 rounded text-xs text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap">
{`{
  "title": "string",           // Required
  "content": "string",         // Required, min 10 chars, max 500KB
  "source_type": "string",     // Optional (default: "API")
  "source_url": "string",      // Optional
  "extraction_mode": "string", // Optional (default: "comprehensive")
  "anchor_emphasis": "string", // Optional (default: "standard")
  "linked_anchor_ids": ["uuid"],// Optional
  "custom_instructions": "string", // Optional
  "priority": 1-10,            // Optional (default: 5)
  "metadata": {}               // Optional (arbitrary JSON)
}`}
          </pre>
        </div>
      </div>
    </div>
  );
}
