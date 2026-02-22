import React, { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, CheckCircle, Loader2, Zap, Trash2, RefreshCw, AlertCircle } from 'lucide-react';
import { createUserIntegration, buildWebhookUrl, deleteUserIntegration, regenerateWebhookToken } from '../../../services/integrations';
import type { IntegrationDefinition } from '../../../config/integrations';
import type { UserIntegration } from '../../../types/integrations';

interface CirclebackSetupProps {
  integration: IntegrationDefinition;
  userIntegration?: UserIntegration;
  onSuccess: () => void;
  onDisconnect: () => void;
}

type Step = 1 | 2 | 3;

export default function CirclebackSetup({
  integration,
  userIntegration,
  onSuccess,
  onDisconnect,
}: CirclebackSetupProps) {
  const isConnected = userIntegration?.status === 'active';
  const [step, setStep] = useState<Step>(isConnected ? 3 : 1);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && userIntegration?.webhook_token) {
      setWebhookUrl(buildWebhookUrl('circleback', userIntegration.webhook_token));
    }
  }, [isConnected, userIntegration]);

  const handleGenerateUrl = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await createUserIntegration(
        'circleback',
        integration.defaultConfig,
        true
      );
      if (data?.webhook_token) {
        setWebhookUrl(buildWebhookUrl('circleback', data.webhook_token));
        setStep(2);
      } else {
        const msg = error?.message || error?.toString() || 'Unknown error creating integration';
        console.error('Failed to create integration:', error);
        setErrorMsg(msg);
      }
    } catch (err: any) {
      console.error('Integration creation threw:', err);
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
    if (token) {
      setWebhookUrl(buildWebhookUrl('circleback', token));
    }
    setRegenerating(false);
  };

  // ── CONNECTED STATE ────────────────────────────────────────
  if (isConnected && step === 3 && userIntegration) {
    return (
      <div className="space-y-4">
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

        {/* Webhook URL */}
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Your webhook URL</p>
          <div className="flex items-center gap-2 p-3 bg-slate-800 border border-white/10 rounded-lg">
            <code className="text-xs text-cyan-400 flex-1 truncate">{webhookUrl}</code>
            <button onClick={handleCopy} className="text-slate-400 hover:text-white shrink-0 transition-colors">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-1">
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
            Regenerate URL
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            <Trash2 size={12} />
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
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
            Synapse will create a unique URL for your account. Any meeting Circleback sends to this URL
            will be automatically ingested into your knowledge graph.
          </p>
        </div>

        <button
          onClick={handleGenerateUrl}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
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

  // ── STEP 2: Configure in Circleback ────────────────────────
  if (step === 2) {
    return (
      <div className="space-y-5">
        <StepIndicator current={2} total={3} />

        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Add this URL to Circleback</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Copy your webhook URL below, then follow these steps in Circleback:
          </p>
        </div>

        {/* Webhook URL */}
        <div className="flex items-center gap-2 p-3 bg-slate-800 border border-cyan-500/30 rounded-lg">
          <code className="text-xs text-cyan-400 flex-1 truncate">{webhookUrl}</code>
          <button onClick={handleCopy} className="text-slate-400 hover:text-white shrink-0 transition-colors">
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Instructions */}
        <ol className="space-y-2.5">
          {[
            'Open Circleback and go to Automations',
            'Click Create Automation',
            'Add any conditions (e.g. meetings over 5 minutes)',
            'Select "Send webhook request"',
            'Paste your URL above into the endpoint field',
            'Toggle ON: Notes, Action Items, Transcript, Attendees',
            'Click Done, name your automation, then Create',
          ].map((instruction, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-700 text-slate-400 flex items-center justify-center text-[10px] font-bold mt-0.5">
                {i + 1}
              </span>
              {instruction}
            </li>
          ))}
        </ol>

        <a
          href="https://app.circleback.ai/automations"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          <ExternalLink size={12} />
          Open Circleback Automations
        </a>

        <button
          onClick={() => setStep(3)}
          className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          I've set it up in Circleback &rarr;
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
          In Circleback, go back to your automation and click "Send test request".
          Then come back here — your Circleback tile will turn green once we receive it.
        </p>
      </div>

      <div className="p-4 bg-slate-800/50 border border-white/5 rounded-xl space-y-2">
        <p className="text-xs text-slate-400 font-medium">What happens next</p>
        {[
          'Circleback fires the webhook after each meeting',
          'Synapse receives the transcript, notes & action items',
          'Gemini extracts entities and relationships',
          'New nodes and edges appear in your graph automatically',
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1 h-1 rounded-full bg-cyan-500 shrink-0" />
            {item}
          </div>
        ))}
      </div>

      <button
        onClick={onSuccess}
        className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Done &mdash; show my integrations
      </button>
    </div>
  );
}

// Step progress indicator
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
