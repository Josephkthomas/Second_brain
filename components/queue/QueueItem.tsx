// QueueItem — Unified card component for a single queue item
// ~140px height, thumbnail/badge left, content center, actions right

import React from 'react';
import {
  ExternalLink, RotateCcw, Trash2, Eye, Loader2, AlertCircle,
  ListVideo, Youtube, Clock,
} from 'lucide-react';
import clsx from 'clsx';
import type { UnifiedQueueItem } from '../../types/queue';
import SourceBadge from './SourceBadge';
import ProcessingStages from './ProcessingStages';

interface QueueItemProps {
  item: UnifiedQueueItem;
  onRetry: (item: UnifiedQueueItem) => void;
  onDelete: (item: UnifiedQueueItem) => void;
  onViewInGraph?: (sourceId: string) => void;
  actionLoading: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  processing: { label: 'Processing', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  completed: { label: 'Completed', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  skipped: { label: 'Skipped', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

export default function QueueItem({
  item,
  onRetry,
  onDelete,
  onViewInGraph,
  actionLoading,
}: QueueItemProps) {
  const isActive = item.status === 'processing';
  const pill = STATUS_PILL[item.status] || STATUS_PILL.pending;
  const loading = actionLoading === item.id;

  return (
    <div
      className={clsx(
        'bg-slate-900/60 border rounded-xl p-4 flex gap-4 transition-all',
        isActive ? 'border-cyan-500/30' : 'border-white/10'
      )}
    >
      {/* Left: Thumbnail / Source Badge */}
      <SourceBadge sourceType={item.sourceType} thumbnailUrl={item.thumbnailUrl} />

      {/* Center: Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        {/* Row 1: Title */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            {item.videoUrl ? (
              <a
                href={item.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white hover:text-red-400 transition-colors line-clamp-1 flex items-center gap-1"
              >
                {item.title}
                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
              </a>
            ) : (
              <p className="text-sm font-semibold text-white line-clamp-1">{item.title}</p>
            )}
          </div>
        </div>

        {/* Row 2: Source tag + status pill + time */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* YouTube channel/playlist tag */}
          {item.youtubePlaylistName && (
            <span className="flex items-center gap-1 text-[11px] text-purple-400">
              <ListVideo className="w-3 h-3" /> {item.youtubePlaylistName}
            </span>
          )}
          {!item.youtubePlaylistName && item.youtubeChannelName && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Youtube className="w-3 h-3" /> {item.youtubeChannelName}
            </span>
          )}

          {/* Status pill */}
          <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-medium border', pill.cls)}>
            {pill.label}
          </span>

          {/* Time */}
          <span className="flex items-center gap-1 text-[10px] text-slate-600">
            <Clock className="w-2.5 h-2.5" /> {timeAgo(item.createdAt)}
          </span>
        </div>

        {/* Row 3: Processing stages */}
        {item.status !== 'skipped' && (
          <div className="mt-2">
            <ProcessingStages stages={item.stages} />
          </div>
        )}

        {/* Row 4: Error message (failed items) */}
        {item.status === 'failed' && item.errorMessage && (
          <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{item.errorMessage}</span>
          </div>
        )}

        {/* Row 4 alt: Completion metadata */}
        {item.status === 'completed' && (item.nodesCreated > 0 || item.edgesCreated > 0) && (
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400 flex-wrap">
            <span>
              <b className="text-cyan-400">{item.nodesCreated}</b> nodes
            </span>
            <span className="text-slate-700">·</span>
            <span>
              <b className="text-cyan-400">{item.edgesCreated}</b> edges
            </span>
            {item.topEntityTypes.length > 0 && (
              <>
                <span className="text-slate-700 mx-0.5">│</span>
                {item.topEntityTypes.map((et, i) => (
                  <span key={et.type}>
                    {et.type} ({et.count}){i < item.topEntityTypes.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex flex-col gap-1 flex-shrink-0 items-end justify-start">
        {/* Retry (failed, retries remaining) */}
        {item.canRetry && (
          <button
            onClick={() => onRetry(item)}
            disabled={loading}
            className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
            title="Retry"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>
        )}

        {/* View in Graph (completed with sourceId) */}
        {item.status === 'completed' && item.sourceId && onViewInGraph && (
          <button
            onClick={() => onViewInGraph(item.sourceId!)}
            className="p-1.5 text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
            title="View in Graph"
          >
            <Eye className="w-4 h-4" />
          </button>
        )}

        {/* Delete — always available */}
        <button
          onClick={() => onDelete(item)}
          disabled={loading}
          className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title={item.status === 'processing' ? 'Force Delete' : 'Delete'}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
