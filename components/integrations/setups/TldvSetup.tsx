import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, ExternalLink, CheckCircle, Loader2, Zap, Trash2, RefreshCw, AlertCircle, Clock, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { createUserIntegration, buildWebhookUrl, deleteUserIntegration, regenerateWebhookToken } from '../../../services/integrations';
import type { IntegrationDefinition } from '../../../config/integrations';
import type { UserIntegration } from '../../../types/integrations';

interface ActivityItem {
  id: string;
  title: string;
  status: string;
  source_type: string;
  nodes_created: number;
  edges_created: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TldvSetupProps {
  integration: IntegrationDefinition;
  userIntegration?: UserIntegration;
  onSuccess: () => void;
  onDisconnect: () => void;
}

type Step = 0 | 1 | 2 | 3;

export default function TldvSetup({
  integration,
  userIntegration,
  onSuccess,
  onDisconnect,
}: TldvSetupProps) {
  const { session } = useAuth();
  const isConnected = userIntegration?.status === 'active';
  const [step, setStep] = useState<Step>(isConnected ? 3 : 0);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (isConnected && userIntegration?.webhook_token) {
      setWebhookUrl(buildWebhookUrl('tldv', userIntegration.webhook_token));
    }
  }, [isConnected, userIntegration]);

  const fetchActivity = useCallback(async () => {
    if (!session?.access_token || !isConnected) return;
    setActivityLoading(true);
    try {
      const response = await fetch('/api/ingest?limit=50', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (response.ok) {
        const data = await response.json();
        const items = (data.items || []).filter(
          (item: any) => item.metadata?.ingestion_method === 'tldv_webhook'
        );
        setActivityItems(items);
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
    setActivityLoading(false);
  }, [session?.access_token, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchActivity();
      const interval = setInterval(fetchActivity, 15000);
      return () => clearInterval(interval);
    }
  }, [isConnected, fetchActivity]);

  const handleGenerateUrl = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await createUserIntegration(
        'tldv',
        integration.defaultConfig,
        true
      );
      if (data?.webhook_token) {
        setWebhookUrl(buildWebhookUrl('tldv', data.webhook_token));
        setStep(2);
      } else {
        const msg = error?.message || error?.toString() || 'Unknown error creating integration';
        setErrorMsg(msg);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected error');
    }
    setLoading(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    if (!userIntegration) return;
    setDisconnecting(true);
    await deleteUserIntegration(userIntegration.id);
    setDisconnecting(false);
    onDisconnect();
  };

  const handleRegenerate = async () => {
    if (!userIntegration) return;
    setRegenerating(true);
    const { token } = await regenerateWebhookToken(userIntegration.id);
    if (token) setWebhookUrl(buildWebhookUrl('tldv', token));
    setRegenerating(false);
  };

  // ── CONNECTED STATE ────────────────────────────────────────
  if (isConnected && step === 3 && userIntegration) {
    const STATUS_COLORS: Record<string, string> = {
      pending: 'text-amber-400', extracting: 'text-cyan-400',
      cross_connecting: 'text-indigo-400', embedding: 'text-purple-400',
      completed: 'text-emerald-400', failed: 'text-red-400',
    };

    return (
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl">
          <CheckCircle className="text-emerald-400 shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-emerald-400">Connected</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {userIntegration.total_items_ingested} meetings ingested
              {userIntegration.last_received_at && (
                <> &middot; Last received {new Date(userIntegration.last_received_at).toLocaleDateString()}</>
              )}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs text-slate-500 mb-1.5">Your webhook URL</p>
          <div className="flex items-center gap-2 p-3 bg-slate-800 border border-white/10 rounded-lg">
            <code className="text-xs text-cyan-400 flex-1 truncate">{webhookUrl}</code>
            <button onClick={handleCopy} className="text-slate-400 hover:text-white shrink-0 transition-colors">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recent Activity</p>
            <button onClick={fetchActivity} className="text-slate-500 hover:text-white transition-colors">
              <RefreshCw size={12} className={activityLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          {activityItems.length === 0 && !activityLoading ? (
            <div className="p-4 bg-slate-800/50 border border-white/5 rounded-xl text-center">
              <AlertTriangle size={16} className="text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No meetings received yet.</p>
              <p className="text-[10px] text-slate-500 mt-1">Wait for your next meeting to finish in tl;dv.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {activityItems.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 bg-slate-800/50 border border-white/5 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium ${STATUS_COLORS[item.status] || 'text-slate-400'}`}>
                        {item.status === 'completed' ? `${item.nodes_created} nodes, ${item.edges_created} edges` : item.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-600">{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                    {item.error_message && <p className="text-[10px] text-red-400 mt-0.5 truncate">{item.error_message}</p>}
                  </div>
                  {item.status === 'completed' && <CheckCircle size={14} className="text-emerald-400 shrink-0" />}
                  {['extracting', 'cross_connecting', 'embedding'].includes(item.status) && <Loader2 size={14} className="text-cyan-400 shrink-0 animate-spin" />}
                  {item.status === 'pending' && <Clock size={14} className="text-amber-400 shrink-0" />}
                  {item.status === 'failed' && <AlertCircle size={14} className="text-red-400 shrink-0" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button onClick={handleRegenerate} disabled={regenerating} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} /> Regenerate URL
          </button>
          <button onClick={handleDisconnect} disabled={disconnecting} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors">
            <Trash2 size={12} /> {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 0: Overview ──────────────────────────────────────
  if (step === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">{integration.name}</h3>
          <p className="text-xs text-slate-400 leading-relaxed">{integration.description}</p>
        </div>

        <div className="p-4 bg-slate-800/50 border border-white/5 rounded-xl space-y-2.5">
          <p className="text-xs text-slate-400 font-medium">Setup steps</p>
          {[
            'Generate a unique webhook URL for your account',
            'Add the URL to tl;dv Webhook Settings',
            'Verify the connection after your next meeting',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                {i + 1}
              </span>
              {item}
            </div>
          ))}
        </div>

        <button
          onClick={() => setStep(1)}
          className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Get started
        </button>
      </div>
    );
  }

  // ── STEP 1: Generate URL ───────────────────────────────────
  if (step === 1) {
    return (
      <div className="space-y-5">
        <StepIndicator current={1} total={3} />
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Generate your webhook URL</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Synapse will create a unique URL for your account. Any meeting tl;dv sends to this URL
            will be automatically ingested into your knowledge graph.
          </p>
        </div>
        <button onClick={handleGenerateUrl} disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
          {loading ? 'Generating...' : 'Generate my webhook URL'}
        </button>
        {errorMsg && (
          <div className="flex items-start gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{errorMsg}</p>
          </div>
        )}
      </div>
    );
  }

  // ── STEP 2: Configure in tl;dv ────────────────────────────
  if (step === 2) {
    return (
      <div className="space-y-5">
        <StepIndicator current={2} total={3} />
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Add this URL to tl;dv</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Copy your webhook URL below, then follow these steps in tl;dv:
          </p>
        </div>
        <div className="flex items-center gap-2 p-3 bg-slate-800 border border-cyan-500/30 rounded-lg">
          <code className="text-xs text-cyan-400 flex-1 truncate">{webhookUrl}</code>
          <button onClick={handleCopy} className="text-slate-400 hover:text-white shrink-0 transition-colors">
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
        <ol className="space-y-2.5">
          {[
            'Open tl;dv and go to Settings → Webhooks',
            'Click "Configure new Webhook"',
            'Set Event Action to "TranscriptReady"',
            'Paste your webhook URL into the Endpoint URL field',
            'Click Save',
          ].map((instruction, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
              {instruction}
            </li>
          ))}
        </ol>
        <a href="https://app.tldv.io/settings/webhooks" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors">
          <ExternalLink size={12} /> Open tl;dv Webhook Settings
        </a>
        <button onClick={() => setStep(3)} className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors">
          I've set it up in tl;dv &rarr;
        </button>
      </div>
    );
  }

  // ── STEP 3: Verify ─────────────────────────────────────────
  return (
    <div className="space-y-5">
      <StepIndicator current={3} total={3} />
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Verify the connection</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Join or record a meeting in tl;dv. Once the transcript is ready,
          tl;dv will fire the webhook and your tile will turn green.
        </p>
      </div>
      <div className="p-4 bg-slate-800/50 border border-white/5 rounded-xl space-y-2">
        <p className="text-xs text-slate-400 font-medium">What happens next</p>
        {[
          'tl;dv fires the webhook when a transcript is ready',
          'Synapse receives the full transcript',
          'Gemini extracts entities and relationships',
          'New nodes and edges appear in your graph automatically',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
            {item}
          </div>
        ))}
      </div>
      <button onClick={onSuccess} className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors">
        Done &mdash; show my integrations
      </button>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <React.Fragment key={n}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
            n < current ? 'bg-emerald-500 text-white' :
            n === current ? 'bg-cyan-500 text-white' :
            'bg-slate-700 text-slate-500'
          }`}>
            {n < current ? <Check size={10} /> : n}
          </div>
          {n < total && (
            <div className={`flex-1 h-px transition-colors ${n < current ? 'bg-emerald-500/50' : 'bg-slate-700'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
