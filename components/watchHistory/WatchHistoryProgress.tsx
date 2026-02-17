// WatchHistoryProgress — Batch processing progress screen
// PRD Section 13.4: Batch Progress Screen

import React from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import type { WatchHistoryProcessingProgress } from '../../types/watchHistory';

interface WatchHistoryProgressProps {
  progress: WatchHistoryProcessingProgress;
}

export default function WatchHistoryProgress({ progress }: WatchHistoryProgressProps) {
  const {
    currentBatchIndex,
    totalBatches,
    currentBatchLabel,
    nodesExtracted,
    edgesExtracted,
    batchesFailed,
    startTime,
    completedBatches,
  } = progress;

  const elapsed = Date.now() - startTime;
  const elapsedStr = formatDuration(elapsed);

  // Estimate remaining time
  const batchesDone = completedBatches.length;
  const avgBatchTime = batchesDone > 0 ? elapsed / batchesDone : 0;
  const remaining = avgBatchTime * (totalBatches - batchesDone);
  const remainingStr = batchesDone > 0 ? formatDuration(remaining) : '...';

  const progressPercent = totalBatches > 0 ? (batchesDone / totalBatches) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-900/30 rounded-lg">
            <Zap size={20} className="text-orange-400 animate-pulse" />
          </div>
          <h3 className="text-lg font-bold text-white">Processing Watch History</h3>
        </div>

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>{batchesDone}/{totalBatches} batches</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-600 to-orange-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Current batch */}
        {currentBatchIndex < totalBatches && (
          <div className="text-sm text-slate-400">
            <span className="text-slate-500">Current:</span>{' '}
            <span className="text-white">{currentBatchLabel}</span>
            <span className="ml-2 text-slate-500">
              <Loader2 size={12} className="inline animate-spin" /> Extracting...
            </span>
          </div>
        )}
      </div>

      {/* Running Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Entities" value={nodesExtracted} color="text-cyan-400" />
        <StatCard label="Edges" value={edgesExtracted} color="text-emerald-400" />
        <StatCard label="Failed" value={batchesFailed} color={batchesFailed > 0 ? 'text-red-400' : 'text-slate-500'} />
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <div className="flex items-center gap-1 text-xs text-slate-500 mb-1">
            <Clock size={10} />
            <span>Time</span>
          </div>
          <div className="text-sm font-mono text-slate-300">{elapsedStr}</div>
          <div className="text-xs text-slate-600">Est. remaining: {remainingStr}</div>
        </div>
      </div>

      {/* Recent Batches */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Recent Batches</h4>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {/* Current batch (if processing) */}
          {currentBatchIndex < totalBatches && (
            <BatchRow
              label={currentBatchLabel}
              status="processing"
            />
          )}

          {/* Completed batches (most recent first) */}
          {[...completedBatches].reverse().slice(0, 8).map((batch) => (
            <BatchRow
              key={batch.batch_id}
              label={batch.label}
              status={batch.status}
              nodes={batch.nodes}
              edges={batch.edges}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function BatchRow({
  label,
  status,
  nodes,
  edges,
}: {
  label: string;
  status: 'completed' | 'failed' | 'processing';
  nodes?: number;
  edges?: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {status === 'completed' && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
      {status === 'failed' && <XCircle size={14} className="text-red-400 flex-shrink-0" />}
      {status === 'processing' && <Loader2 size={14} className="text-orange-400 animate-spin flex-shrink-0" />}
      <span className="text-slate-300 truncate flex-1">{label}</span>
      {nodes !== undefined && (
        <span className="text-xs text-slate-500">
          {nodes} nodes, {edges} edges
        </span>
      )}
      {status === 'processing' && (
        <span className="text-xs text-orange-400">extracting...</span>
      )}
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
