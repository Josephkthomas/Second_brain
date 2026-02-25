import React, { useState } from 'react';
import {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, Clock, BarChart3, ArrowRight, ChevronDown, ChevronUp,
  Mail, Zap, Eye, FileText, Send, Loader2, CheckCircle2, XCircle,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
  Compass, Share2, Info, X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import type { DigestOutput, DigestHistoryEntry, DigestChannel } from '../types/digest';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap, Sparkles,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
  Compass, BarChart3,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

const CHANNEL_ICONS: Record<string, React.ComponentType<any>> = {
  email: Mail,
  telegram: Send,
  slack: Send,
};

const CHANNEL_COLORS: Record<string, string> = {
  email: 'text-blue-400',
  telegram: 'text-blue-400',
  slack: 'text-purple-400',
};

interface Props {
  entry: DigestHistoryEntry;
  channels?: DigestChannel[];
}

type DeliveryState = { status: 'idle' } | { status: 'delivering' } | { status: 'delivered' } | { status: 'error'; message?: string };

export const DigestViewer: React.FC<Props> = ({ entry, channels }) => {
  const output = entry.content as DigestOutput;
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, DeliveryState>>({});
  // Ad-hoc email state
  const [customEmail, setCustomEmail] = useState('');
  const [sendToStatus, setSendToStatus] = useState<Record<string, DeliveryState>>({});
  const [showSpamNotice, setShowSpamNotice] = useState(false);
  const { session } = useAuth();

  if (!output || !output.executive_summary) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No digest content available.
      </div>
    );
  }

  const toggleModule = (id: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const date = new Date(output.generated_at).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const successfulSections = output.sections?.filter(s => !s.content.startsWith('Error')) || [];
  const errorSections = output.sections?.filter(s => s.content.startsWith('Error')) || [];

  const activeChannels = channels?.filter(ch => ch.is_active) || [];
  const userEmail = session?.user?.email;

  // ─── Ad-hoc email send ─────────────────────────────────────
  const handleSendToEmail = async (email: string) => {
    if (!session?.access_token || !email) return;
    const key = email.toLowerCase();
    setSendToStatus(prev => ({ ...prev, [key]: { status: 'delivering' } }));
    try {
      const response = await fetch('/api/digest/deliver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ history_id: entry.id, email }),
      });
      const data = await response.json();
      if (data.success && data.results?.email === 'delivered') {
        setSendToStatus(prev => ({ ...prev, [key]: { status: 'delivered' } }));
        setShowSpamNotice(true);
        setTimeout(() => {
          setSendToStatus(prev => {
            const next = { ...prev };
            if (next[key]?.status === 'delivered') delete next[key];
            return next;
          });
        }, 4000);
      } else {
        const errMsg = data.results?.email || data.error || 'Send failed';
        setSendToStatus(prev => ({ ...prev, [key]: { status: 'error', message: errMsg } }));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      console.error('Send to email error:', errMsg);
      setSendToStatus(prev => ({ ...prev, [key]: { status: 'error', message: errMsg } }));
    }
  };

  // ─── Channel-based delivery ────────────────────────────────
  const handleDeliver = async (channelTypes?: string[]) => {
    if (!session?.access_token) return;
    const targetsToDeliver = channelTypes || activeChannels.map(ch => ch.channel_type);
    for (const ct of targetsToDeliver) {
      setDeliveryStatus(prev => ({ ...prev, [ct]: { status: 'delivering' } }));
    }
    let hasSuccess = false;
    try {
      const response = await fetch('/api/digest/deliver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ history_id: entry.id, channels: channelTypes }),
      });
      const data = await response.json();
      if (data.success && data.results) {
        for (const [ct, result] of Object.entries(data.results)) {
          const isDelivered = (result as string) === 'delivered';
          if (isDelivered) hasSuccess = true;
          setDeliveryStatus(prev => ({
            ...prev,
            [ct]: isDelivered
              ? { status: 'delivered' }
              : { status: 'error', message: result as string },
          }));
        }
      } else {
        const errMsg = data.error || 'Delivery failed';
        console.error('Delivery error:', errMsg);
        for (const ct of targetsToDeliver) {
          setDeliveryStatus(prev => ({ ...prev, [ct]: { status: 'error', message: errMsg } }));
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      console.error('Delivery fetch error:', errMsg);
      for (const ct of targetsToDeliver) {
        setDeliveryStatus(prev => ({ ...prev, [ct]: { status: 'error', message: errMsg } }));
      }
    }
    if (hasSuccess) {
      setTimeout(() => {
        setDeliveryStatus(prev => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key].status === 'delivered') delete next[key];
          }
          return next;
        });
      }, 3000);
    }
  };

  const handleCustomEmailSend = () => {
    const trimmed = customEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    handleSendToEmail(trimmed);
    setCustomEmail('');
  };

  // Helper to render send-to status inline
  const renderSendStatus = (key: string) => {
    const state = sendToStatus[key.toLowerCase()];
    if (!state) return null;
    if (state.status === 'delivering') return <Loader2 size={12} className="text-cyan-400 animate-spin shrink-0" />;
    if (state.status === 'delivered') return <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />;
    if (state.status === 'error') return (
      <span className="text-[10px] text-red-400 truncate max-w-[140px]" title={state.message}>
        {state.message?.slice(0, 30) || 'Failed'}
      </span>
    );
    return null;
  };

  return (
    <div className="space-y-6">
      {/* ─── Email-Style Briefing Header ─── */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-cyan-400" />
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[2px]">Synapse Intelligence Briefing</span>
          </div>
          <p className="text-[11px] text-slate-600">{date}</p>
        </div>

        {/* Share / Deliver Button — always visible */}
        <div className="relative">
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-colors"
          >
            <Share2 size={12} />
            Share
            <ChevronDown size={12} />
          </button>
          {showShareMenu && (
            <div className="absolute right-0 top-full mt-1 w-72 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
              {/* ─── Quick Send Section ─── */}
              <div className="px-3 pt-2.5 pb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Send via email</span>
              </div>

              {/* Send to me */}
              {userEmail && (
                <button
                  onClick={() => handleSendToEmail(userEmail)}
                  disabled={sendToStatus[userEmail.toLowerCase()]?.status === 'delivering'}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors"
                >
                  <Mail size={12} className="text-blue-400 shrink-0" />
                  <span className="text-slate-300 truncate flex-1">Send to me ({userEmail})</span>
                  {renderSendStatus(userEmail)}
                </button>
              )}

              {/* Custom email input */}
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  type="email"
                  value={customEmail}
                  onChange={e => setCustomEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCustomEmailSend()}
                  placeholder="Enter email address..."
                  className="flex-1 px-2 py-1.5 rounded bg-black/30 border border-white/10 text-xs text-slate-300 placeholder:text-slate-600 focus:border-cyan-500/30 focus:outline-none"
                />
                <button
                  onClick={handleCustomEmailSend}
                  disabled={!customEmail.trim()}
                  className="px-2 py-1.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>

              {/* Show status for last custom send */}
              {Object.entries(sendToStatus).filter(([k]) => k !== userEmail?.toLowerCase()).map(([email, state]) => (
                <div key={email} className="px-3 py-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="truncate flex-1">{email}</span>
                  {state.status === 'delivering' && <Loader2 size={10} className="text-cyan-400 animate-spin" />}
                  {state.status === 'delivered' && <span className="text-emerald-400 text-[10px]">Sent</span>}
                  {state.status === 'error' && (
                    <span className="text-red-400 text-[10px] truncate max-w-[120px]" title={state.message}>
                      {state.message?.slice(0, 25) || 'Failed'}
                    </span>
                  )}
                </div>
              ))}

              {/* ─── Configured Channels Section ─── */}
              {activeChannels.length > 0 && (
                <>
                  <div className="border-t border-white/5 mx-3 mt-1" />
                  <div className="px-3 pt-2.5 pb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Configured channels</span>
                  </div>
                  <button
                    onClick={() => { handleDeliver(); setShowShareMenu(false); }}
                    className="w-full px-3 py-2 text-left text-xs font-medium text-white hover:bg-white/5 transition-colors"
                  >
                    Deliver to all channels
                  </button>
                  {activeChannels.map(ch => {
                    const Icon = CHANNEL_ICONS[ch.channel_type] || Send;
                    const color = CHANNEL_COLORS[ch.channel_type] || 'text-slate-400';
                    const state = deliveryStatus[ch.channel_type];
                    const st = state?.status;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => { handleDeliver([ch.channel_type]); setShowShareMenu(false); }}
                        disabled={st === 'delivering'}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-white/5 transition-colors"
                      >
                        {st === 'delivering' ? (
                          <Loader2 size={12} className="text-cyan-400 animate-spin" />
                        ) : st === 'delivered' ? (
                          <CheckCircle2 size={12} className="text-emerald-400" />
                        ) : st === 'error' ? (
                          <XCircle size={12} className="text-red-400" />
                        ) : (
                          <Icon size={12} className={color} />
                        )}
                        <span className="text-slate-300 capitalize flex-1">{ch.channel_type}</span>
                        {st === 'delivered' && <span className="text-[10px] text-emerald-400">Sent</span>}
                        {st === 'error' && (
                          <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={state.status === 'error' ? state.message : ''}>
                            {state.status === 'error' && state.message ? state.message.replace('failed: ', '').slice(0, 25) : 'Failed'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              <div className="h-1" />
            </div>
          )}
        </div>
      </div>

      {/* ─── Spam Notice ─── */}
      {showSpamNotice && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-300">Check your spam folder</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5 leading-relaxed">
              The first email from Synapse may land in spam. Open it and mark as <strong>"Not spam"</strong> to ensure future digests go straight to your inbox.
            </p>
          </div>
          <button onClick={() => setShowSpamNotice(false)} className="p-0.5 hover:bg-white/10 rounded text-amber-400/50 hover:text-amber-400 transition-colors">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ─── Metadata Bar (moved to top) ─── */}
      <div className="flex items-center gap-4 text-[10px] text-slate-500 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/5">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span>{new Date(output.generated_at).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <BarChart3 size={10} />
          <span>{output.metadata?.nodes_scanned || 0} nodes, {output.metadata?.edges_scanned || 0} edges scanned</span>
        </div>
        {entry.generation_time_ms && (
          <span>Generated in {(entry.generation_time_ms / 1000).toFixed(1)}s</span>
        )}
        {entry.channels_delivered?.length > 0 && (
          <div className="ml-auto flex items-center gap-1">
            <CheckCircle2 size={10} className="text-emerald-500" />
            <span className="text-emerald-500">Delivered: {entry.channels_delivered.join(', ')}</span>
          </div>
        )}
      </div>

      {/* ─── Executive Summary (Email View) ─── */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Executive Summary</span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{output.executive_summary}</p>
      </div>

      {/* ─── Module Sections (Rolled-Up Email View) ─── */}
      {successfulSections.map((section, idx) => {
        const Icon = ICON_MAP[section.icon] || Sparkles;
        const moduleKey = section.module_id || `section-${idx}`;
        const isExpanded = expandedModules.has(moduleKey);
        const hasHighlights = section.highlights?.length > 0;
        const isCustom = !(section as any).template_id;

        return (
          <div key={moduleKey} className={clsx("border rounded-lg overflow-hidden", isCustom ? "border-violet-500/15" : "border-white/10")}>
            {/* Module Header */}
            <div className="flex items-center gap-2.5 p-4 bg-white/[0.02] border-b border-white/5">
              <Icon size={16} className={isCustom ? "text-violet-400" : "text-slate-400"} />
              <h3 className="text-sm font-semibold text-white flex-1">{section.module_name}</h3>
              {isCustom && (
                <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Custom
                </span>
              )}
              {!isCustom && hasHighlights && (
                <span className="text-[10px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">
                  {section.highlights.length} highlights
                </span>
              )}
            </div>

            <div className="p-4">
              {isCustom ? (
                /* Custom modules: show full content directly (newsletter-ready) */
                <>
                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                  {section.entities_referenced?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      <span className="text-[10px] text-slate-600 mr-1">Referenced:</span>
                      {section.entities_referenced.map((e, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono">
                          {e.slice(0, 8)}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                /* Template modules: highlights + expandable full analysis */
                <>
                  {hasHighlights ? (
                    <div className="space-y-2">
                      {section.highlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-xs">
                          <span className="text-cyan-500 mt-0.5 shrink-0">&#9670;</span>
                          <span className="text-slate-300 leading-relaxed">{h}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No key highlights for this module.</p>
                  )}

                  {/* Expand/Collapse for Full Agent Output */}
                  <button
                    onClick={() => toggleModule(moduleKey)}
                    className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-cyan-400 transition-colors group"
                  >
                    <FileText size={12} className="group-hover:text-cyan-400" />
                    <span>{isExpanded ? 'Hide' : 'View'} full agent analysis</span>
                    {isExpanded
                      ? <ChevronUp size={12} />
                      : <ChevronDown size={12} />
                    }
                  </button>

                  {/* Full Agent Output (Expanded) */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Eye size={10} className="text-slate-600" />
                        <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wider">Full Agent Output</span>
                      </div>
                      <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap bg-black/20 rounded-lg p-3 border border-white/5 max-h-[400px] overflow-y-auto">
                        {section.content}
                      </div>
                      {section.entities_referenced?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="text-[10px] text-slate-600 mr-1">Referenced:</span>
                          {section.entities_referenced.map((e, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 font-mono">
                              {e.slice(0, 8)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* ─── Error Sections (if any) ─── */}
      {errorSections.length > 0 && (
        <div className="border border-red-500/20 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2.5 p-3 bg-red-500/5 border-b border-red-500/10">
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-xs font-semibold text-red-400">
              {errorSections.length} module{errorSections.length > 1 ? 's' : ''} encountered errors
            </span>
          </div>
          <div className="p-3 space-y-2">
            {errorSections.map((section, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-red-500 shrink-0">&#x2717;</span>
                <div>
                  <span className="text-slate-400 font-medium">{section.module_name}:</span>
                  <span className="text-slate-600 ml-1">{section.content.replace('Error generating analysis: ', '')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Suggested Next Steps ─── */}
      {output.suggested_next_steps?.length > 0 && (
        <div className="border border-white/10 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2.5 p-4 bg-white/[0.02] border-b border-white/5">
            <ArrowRight size={16} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Suggested Next Steps</h3>
          </div>
          <div className="p-4 space-y-3">
            {output.suggested_next_steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded border mt-0.5 shrink-0",
                  PRIORITY_COLORS[step.priority] || PRIORITY_COLORS.medium
                )}>
                  {step.priority?.toUpperCase()}
                </span>
                <div>
                  <p className="text-xs font-medium text-white">{step.action}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{step.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
