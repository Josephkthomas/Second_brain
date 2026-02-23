import React from 'react';
import {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, Clock, BarChart3, ArrowRight,
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
  if (!output || !output.executive_summary) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No digest content available.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-violet-500/10 border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-cyan-400" />
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Executive Summary</span>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed">{output.executive_summary}</p>
      </div>

      {/* Module Sections */}
      {output.sections?.map((section, idx) => {
        const Icon = ICON_MAP[section.icon] || Sparkles;
        return (
          <div key={section.module_id || idx} className="border border-white/10 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 bg-white/[0.02] border-b border-white/5">
              <Icon size={16} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-white">{section.module_name}</h3>
            </div>
            <div className="p-4">
              {/* Highlights */}
              {section.highlights?.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {section.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-cyan-500 mt-0.5">•</span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Full Content */}
              <div className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">
                {section.content}
              </div>
            </div>
          </div>
        );
      })}

      {/* Suggested Next Steps */}
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

      {/* Metadata Footer */}
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
