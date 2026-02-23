import React, { useState } from 'react';
import {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, Clock, BarChart3, ArrowRight, ChevronDown, ChevronUp,
  Mail, Zap, Eye, FileText,
} from 'lucide-react';
import clsx from 'clsx';
import type { DigestOutput, DigestHistoryEntry } from '../types/digest';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap, Sparkles,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-400 bg-red-500/10 border-red-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

interface Props {
  entry: DigestHistoryEntry;
}

export const DigestViewer: React.FC<Props> = ({ entry }) => {
  const output = entry.content as DigestOutput;
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

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

  return (
    <div className="space-y-6">
      {/* ─── Email-Style Briefing Header ─── */}
      <div className="text-center pb-4 border-b border-white/5">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Zap size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[2px]">Synapse Intelligence Briefing</span>
        </div>
        <p className="text-[11px] text-slate-600">{date}</p>
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

      {/* ─── Metadata Footer ─── */}
      <div className="flex items-center gap-4 text-[10px] text-slate-600 pt-2 border-t border-white/5">
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
      </div>
    </div>
  );
};
