// QueueHub — Standalone processing queue with detailed step-by-step progress
// Displayed as a top-level panel accessible from the main nav bar

import React, { useState, useEffect, useCallback } from 'react';
import {
  ListTodo, RefreshCw, Play, Filter, Clock, CheckCircle, XCircle,
  Loader2, ExternalLink, AlertCircle, Trash2, RotateCcw, Youtube, ListVideo
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import type { YouTubeQueueItem, YouTubeQueueStatus } from '../types/youtube';

interface QueueHubProps {
  onGraphUpdate?: () => void;
}

const STATUS_LABELS: Record<YouTubeQueueStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-amber-400' },
  fetching_transcript: { label: 'Processing', color: 'text-cyan-400' },
  extracting: { label: 'Processing', color: 'text-indigo-400' },
  completed: { label: 'Completed', color: 'text-emerald-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
  skipped: { label: 'Skipped', color: 'text-slate-400' },
};

// 5-step progress model
function getSteps(item: YouTubeQueueItem): Array<{ label: string; status: 'done' | 'active' | 'pending' }> {
  const step = (item.processing_step || '').toLowerCase();

  if (item.status === 'pending') {
    return [
      { label: 'Video received', status: 'done' },
      { label: 'Extracting transcript', status: 'pending' },
      { label: 'Analyzing transcript', status: 'pending' },
      { label: 'Extracting nodes & edges', status: 'pending' },
      { label: 'Saving to knowledge graph', status: 'pending' },
    ];
  }

  if (item.status === 'fetching_transcript') {
    return [
      { label: 'Video received', status: 'done' },
      { label: 'Extracting transcript', status: 'active' },
      { label: 'Analyzing transcript', status: 'pending' },
      { label: 'Extracting nodes & edges', status: 'pending' },
      { label: 'Saving to knowledge graph', status: 'pending' },
    ];
  }

  if (item.status === 'extracting') {
    const hasCrossRef = step.includes('cross-referenc');
    const hasExtracted = step.includes('extracted');

    return [
      { label: 'Video received', status: 'done' },
      { label: 'Extracting transcript', status: 'done' },
      { label: 'Analyzing transcript', status: hasCrossRef || hasExtracted ? 'done' : 'active' },
      { label: 'Extracting nodes & edges', status: hasCrossRef ? 'done' : hasExtracted ? 'active' : 'pending' },
      { label: 'Saving to knowledge graph', status: hasCrossRef ? 'active' : 'pending' },
    ];
  }

  if (item.status === 'completed') {
    return [
      { label: 'Video received', status: 'done' },
      { label: 'Extracting transcript', status: 'done' },
      { label: 'Analyzing transcript', status: 'done' },
      { label: 'Extracting nodes & edges', status: 'done' },
      { label: 'Saving to knowledge graph', status: 'done' },
    ];
  }

  // failed / skipped — show what was done
  return [
    { label: 'Video received', status: 'done' },
    { label: 'Extracting transcript', status: item.status === 'failed' && !step ? 'active' : 'done' },
    { label: 'Analyzing transcript', status: 'pending' },
    { label: 'Extracting nodes & edges', status: 'pending' },
    { label: 'Saving to knowledge graph', status: 'pending' },
  ];
}

type FilterType = 'all' | 'processing' | 'pending' | 'completed' | 'failed';

export default function QueueHub({ onGraphUpdate }: QueueHubProps) {
  const { session } = useAuth();
  const [items, setItems] = useState<YouTubeQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/youtube/queue?limit=100', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) setItems(data.items || []);
    } catch (err) {
      console.error('Error fetching queue:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchQueue();
    setIsRefreshing(false);
  };

  // Process all pending
  const handleProcessNow = async () => {
    if (!session?.access_token || isProcessing) return;
    setIsProcessing(true);
    try {
      let hasMore = true;
      while (hasMore) {
        const res = await fetch('/api/youtube/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ process_all: true }),
        });
        const result = await res.json();
        hasMore = (result.remaining || 0) > 0 && (result.processed || 0) > 0;
        await fetchQueue();
        if (hasMore) await new Promise(r => setTimeout(r, 1000));
      }
      if (onGraphUpdate) onGraphUpdate();
    } catch (err) {
      console.error('Error processing:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Retry failed
  const handleRetry = async (id: string) => {
    if (!session?.access_token) return;
    setActionLoading(id);
    try {
      await fetch('/api/youtube/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id, action: 'retry' }),
      });
      await fetchQueue();
    } catch {} finally { setActionLoading(null); }
  };

  // Delete item
  const handleDelete = async (id: string) => {
    if (!session?.access_token) return;
    setActionLoading(id);
    try {
      await fetch('/api/youtube/queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      await fetchQueue();
    } catch {} finally { setActionLoading(null); }
  };

  // Filter
  const filtered = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'processing') return item.status === 'fetching_transcript' || item.status === 'extracting';
    if (filter === 'pending') return item.status === 'pending';
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'failed') return item.status === 'failed' || item.status === 'skipped';
    return true;
  });

  const counts = {
    all: items.length,
    processing: items.filter(i => i.status === 'fetching_transcript' || i.status === 'extracting').length,
    pending: items.filter(i => i.status === 'pending').length,
    completed: items.filter(i => i.status === 'completed').length,
    failed: items.filter(i => i.status === 'failed' || i.status === 'skipped').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-3" /> Loading queue...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Center-aligned Header */}
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
          <ListTodo className="text-amber-400" />
          Processing Queue
        </h1>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          Track the status of videos being processed into your knowledge graph.
        </p>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-slate-400">{items.length} total items</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={clsx('w-5 h-5', isRefreshing && 'animate-spin')} />
          </button>
          {counts.pending > 0 && (
            <button
              onClick={handleProcessNow}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isProcessing ? 'Processing...' : `Process Now (${counts.pending})`}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-500" />
        {(['all', 'processing', 'pending', 'completed', 'failed'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              'px-3 py-1 rounded text-xs font-medium transition-colors capitalize',
              filter === f ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-500 hover:text-slate-300'
            )}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Queue Items */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{items.length === 0 ? 'Queue is empty' : 'No items match this filter'}</p>
          </div>
        ) : (
          filtered.map(item => {
            const isActive = item.status === 'fetching_transcript' || item.status === 'extracting';
            const steps = getSteps(item);
            const showSteps = item.status !== 'skipped';

            return (
              <div
                key={item.id}
                className={clsx(
                  'bg-slate-900 border rounded-lg p-4 transition-all',
                  isActive ? 'border-cyan-500/30' : 'border-slate-800'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="w-28 h-16 rounded object-cover bg-slate-800 flex-shrink-0" />
                  ) : (
                    <div className="w-28 h-16 rounded bg-slate-800 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <a
                      href={item.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white text-sm font-medium hover:text-red-400 transition-colors line-clamp-1 flex items-center gap-1"
                    >
                      {item.video_title || 'Untitled Video'}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>

                    {/* Source tag */}
                    <div className="flex items-center gap-2 mt-1 mb-2">
                      {item.youtube_playlists?.playlist_name ? (
                        <span className="flex items-center gap-1 text-[11px] text-purple-400">
                          <ListVideo className="w-3 h-3" /> {item.youtube_playlists.playlist_name}
                        </span>
                      ) : item.youtube_channels?.channel_name ? (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Youtube className="w-3 h-3" /> {item.youtube_channels.channel_name}
                        </span>
                      ) : null}
                    </div>

                    {/* 5-step progress */}
                    {showSteps && (
                      <div className="space-y-1">
                        {steps.map((s, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {s.status === 'done' ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            ) : s.status === 'active' ? (
                              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />
                            )}
                            <span className={clsx(
                              'text-[11px]',
                              s.status === 'done' ? 'text-emerald-300' :
                              s.status === 'active' ? 'text-cyan-300' :
                              'text-slate-500'
                            )}>
                              {s.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Error message */}
                    {item.status === 'failed' && item.error_message && (
                      <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{item.error_message}</span>
                      </div>
                    )}

                    {/* Completed stats */}
                    {item.status === 'completed' && (
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                        <span>{item.nodes_created} nodes</span>
                        <span>{item.edges_created} edges</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    {item.status === 'failed' && item.retry_count < item.max_retries && (
                      <button
                        onClick={() => handleRetry(item.id)}
                        disabled={actionLoading === item.id}
                        className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                        title="Retry"
                      >
                        {actionLoading === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                      </button>
                    )}
                    {(item.status === 'completed' || item.status === 'failed' || item.status === 'skipped') && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={actionLoading === item.id}
                        className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove"
                      >
                        {actionLoading === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
