import React, { useState } from 'react';
import {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, Clock, BarChart3, ArrowRight, ChevronDown, ChevronUp,
  Mail, Zap, Eye, FileText, Send, Loader2, CheckCircle2, XCircle,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
  Compass,
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
  const [showDeliverMenu, setShowDeliverMenu] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState<Record<string, DeliveryState>>({});
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
        body: JSON.stringify({
          history_id: entry.id,
          channels: channelTypes,
        }),
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

    // Auto-clear only successful deliveries after 3s; errors persist until next attempt
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

        {/* Deliver Button */}
        {activeChannels.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowDeliverMenu(!showDeliverMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-colors"
            >
              <Send size={12} />
              Deliver
              <ChevronDown size={12} />
            </button>
            {showDeliverMenu && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-slate-900 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                <button
                  onClick={() => { handleDeliver(); setShowDeliverMenu(false); }}
                  className="w-full px-3 py-2.5 text-left text-xs font-medium text-white hover:bg-white/5 transition-colors border-b border-white/5"
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
                      onClick={() => { handleDeliver([ch.channel_type]); setShowDeliverMenu(false); }}
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
                      <span className="text-slate-300 capitalize">{ch.channel_type}</span>
                      {st === 'delivered' && <span className="ml-auto text-[10px] text-emerald-400">Sent</span>}
                      {st === 'error' && (
                        <span className="ml-auto text-[10px] text-red-400 truncate max-w-[120px]" title={state.status === 'error' ? state.message : ''}>
                          {state.status === 'error' && state.message ? state.message.slice(0, 30) : 'Failed'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

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

        return (
          <div key={moduleKey} className="border border-white/10 rounded-lg overflow-hidden">
            {/* Module Header */}
            <div className="flex items-center gap-2.5 p-4 bg-white/[0.02] border-b border-white/5">
              <Icon size={16} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-white flex-1">{section.module_name}</h3>
              {hasHighlights && (
                <span className="text-[10px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">
                  {section.highlights.length} highlights
                </span>
              )}
            </div>

            {/* Rolled-Up View: Highlights Only (What the email would show) */}
            <div className="p-4">
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
