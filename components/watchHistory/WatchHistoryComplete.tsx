// WatchHistoryComplete — Results summary screen
// PRD Section 13.5: Completion Screen

import React from 'react';
import { CheckCircle2, Sparkles, Link as LinkIcon, TrendingUp, BarChart3 } from 'lucide-react';
import type { FinalizeImportResponse } from '../../types/watchHistory';

interface WatchHistoryCompleteProps {
  result: FinalizeImportResponse;
  totalVideos: number;
  onViewGraph: () => void;
  onImportAnother: () => void;
}

export default function WatchHistoryComplete({
  result,
  totalVideos,
  onViewGraph,
  onImportAnother,
}: WatchHistoryCompleteProps) {
  const totalEdges = result.edges.internal + result.edges.crossReference + result.edges.enrichment;
  const durationStr = formatDuration(result.processingDurationMs);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Success Header */}
      <div className="bg-slate-900 border border-emerald-900/50 rounded-xl p-6 text-center">
        <div className="flex justify-center mb-3">
          <div className="p-3 bg-emerald-900/30 rounded-full">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
        </div>
        <h3 className="text-xl font-bold text-white mb-1">Watch History Import Complete</h3>
        <p className="text-sm text-slate-400">
          Processed {totalVideos.toLocaleString()} videos across {result.batchesProcessed} batches in {durationStr}
        </p>
      </div>

      {/* Knowledge Stats */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={16} className="text-cyan-400" />
          <h4 className="text-sm font-bold text-slate-300 uppercase">Knowledge Extracted</h4>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-cyan-400">{result.nodesCreated}</div>
            <div className="text-xs text-slate-500">New entities added</div>
          </div>
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-amber-400">{result.nodesEnriched}</div>
            <div className="text-xs text-slate-500">Existing entities enriched</div>
          </div>
        </div>
      </div>

      {/* Edge Stats */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <LinkIcon size={16} className="text-emerald-400" />
          <h4 className="text-sm font-bold text-slate-300 uppercase">Connections Created</h4>
        </div>
        <div className="space-y-2">
          <EdgeRow label="Internal edges (within watch history)" count={result.edges.internal} color="text-slate-300" />
          <EdgeRow label="Cross-reference edges (linked to existing graph)" count={result.edges.crossReference} color="text-cyan-400" />
          <EdgeRow label="Enrichment edges (new links between existing nodes)" count={result.edges.enrichment} color="text-amber-400" />
          <div className="border-t border-slate-800 pt-2 mt-2">
            <EdgeRow label="Total new connections" count={totalEdges} color="text-white" bold />
          </div>
        </div>
      </div>

      {/* Top Entities */}
      {result.topEntities.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-purple-400" />
            <h4 className="text-sm font-bold text-slate-300 uppercase">Most Pervasive Entities</h4>
          </div>
          <div className="space-y-2">
            {result.topEntities.slice(0, 8).map((entity, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-mono w-5 text-xs">{i + 1}.</span>
                  <span className="text-slate-200">{entity.label}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {entity.batchCount} of {result.batchesProcessed} batches
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4 pt-2">
        <button
          onClick={onViewGraph}
          className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(6,182,212,0.2)]"
        >
          View in Graph →
        </button>
        <button
          onClick={onImportAnother}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg transition-colors border border-slate-700"
        >
          Import Another
        </button>
      </div>
    </div>
  );
}

function EdgeRow({
  label,
  count,
  color,
  bold = false,
}: {
  label: string;
  count: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${color} ${bold ? 'font-bold' : ''}`}>
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}
