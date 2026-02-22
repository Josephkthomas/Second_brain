// IngestQueuePanel - Display Universal Ingest processing queue

import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle, XCircle, Loader2, RotateCcw,
  Trash2, Filter, Play, AlertCircle, Network, GitMerge,
  FileText, Mic, Globe, StickyNote, Newspaper, Mail, MessageSquare, Zap
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import type { IngestQueueItem, IngestQueueStatus } from '../types/ingest';

interface IngestQueuePanelProps {
  onGraphUpdate?: () => void;
}

const STATUS_CONFIG: Record<IngestQueueStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
  animate?: boolean;
}> = {
  pending: { label: 'Pending', color: 'text-amber-400', bgColor: 'bg-amber-500/10', icon: Clock },
  extracting: { label: 'Extracting', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', icon: Loader2, animate: true },
  cross_connecting: { label: 'Cross-Connecting', color: 'text-indigo-400', bgColor: 'bg-indigo-500/10', icon: GitMerge, animate: true },
  embedding: { label: 'Embedding', color: 'text-purple-400', bgColor: 'bg-purple-500/10', icon: Network, animate: true },
  completed: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10', icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-slate-400', bgColor: 'bg-slate-500/10', icon: XCircle },
};

const SOURCE_TYPE_ICONS: Record<string, React.ElementType> = {
  Meeting: Mic,
  YouTube: Globe,
  Note: StickyNote,
  Research: Globe,
  Document: FileText,
  Podcast: Mic,
  Email: Mail,
  Chat: MessageSquare,
  Article: Newspaper,
  API: Zap,
};

export default function IngestQueuePanel({ onGraphUpdate }: IngestQueuePanelProps) {
  const { session } = useAuth();
  const [items, setItems] = useState<IngestQueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<IngestQueueStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{ processed: number; remaining: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch queue items
  const fetchQueue = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const response = await fetch('/api/ingest?limit=100', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('[IngestQueue] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  // Poll every 10 seconds
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  // Filter items
  const filteredItems = items.filter(item => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  // Status counts
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Process queue now
  const handleProcessNow = async () => {
    if (!session?.access_token || isProcessingQueue) return;

    try {
      setIsProcessingQueue(true);
      setProcessingProgress({ processed: 0, remaining: statusCounts.pending || 0 });

      let totalProcessed = 0;
      let totalCompleted = 0;
      let hasMoreItems = true;

      while (hasMoreItems) {
        const response = await fetch('/api/ingest/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ process_all: true }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Processing failed');
        }

        const result = await response.json();
        totalProcessed += result.processed || 0;
        totalCompleted += result.completed || 0;

        setProcessingProgress({
          processed: totalProcessed,
          remaining: result.remaining || 0,
        });

        hasMoreItems = (result.remaining || 0) > 0 && (result.processed || 0) > 0;
        fetchQueue();

        if (hasMoreItems) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (totalCompleted > 0 && onGraphUpdate) {
        onGraphUpdate();
      }
    } catch (err) {
      console.error('[IngestQueue] Process error:', err);
    } finally {
      setIsProcessingQueue(false);
      setProcessingProgress(null);
    }
  };

  // Retry failed item
  const handleRetry = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;

    try {
      setActionLoading(itemId);
      const response = await fetch('/api/ingest/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: itemId, action: 'retry' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to retry');
      }
      fetchQueue();
    } catch (err) {
      console.error('[IngestQueue] Retry error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Skip item
  const handleSkip = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;

    try {
      setActionLoading(itemId);
      const response = await fetch('/api/ingest/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: itemId, action: 'skip' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to skip');
      }
      fetchQueue();
    } catch (err) {
      console.error('[IngestQueue] Skip error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Delete item
  const handleDelete = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;
    if (!confirm('Delete this item from the queue?')) return;

    try {
      setActionLoading(itemId);
      const response = await fetch('/api/ingest/queue', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: itemId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete');
      }
      fetchQueue();
    } catch (err) {
      console.error('[IngestQueue] Delete error:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin mb-3 text-cyan-400" />
        <p className="text-sm">Loading queue...</p>
      </div>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Zap className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Ingest Queue is Empty</p>
        <p className="text-sm mt-1">Content submitted via the API will appear here</p>
        <p className="text-xs mt-3 text-slate-600">Use the API Settings tab to get started</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Status Filter & Process Now */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-slate-500" />
        <button
          onClick={() => setStatusFilter('all')}
          className={clsx(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            statusFilter === 'all'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-900 text-slate-500 hover:text-slate-300'
          )}
        >
          All ({items.length})
        </button>
        {Object.entries(statusCounts).map(([status, count]) => {
          const config = STATUS_CONFIG[status as IngestQueueStatus];
          if (!config) return null;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status as IngestQueueStatus)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium transition-colors',
                statusFilter === status
                  ? `${config.bgColor} ${config.color}`
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
              )}
            >
              {config.label} ({count})
            </button>
          );
        })}

        {/* Process Now Button */}
        {(statusCounts.pending || 0) > 0 && (
          <button
            onClick={handleProcessNow}
            disabled={isProcessingQueue}
            className={clsx(
              'ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-bold transition-all',
              isProcessingQueue
                ? 'bg-emerald-900/30 text-emerald-400/50 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md'
            )}
          >
            {isProcessingQueue ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing{processingProgress ? ` (${processingProgress.processed} done, ${processingProgress.remaining} left)` : '...'}
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Process Now ({statusCounts.pending})
              </>
            )}
          </button>
        )}
      </div>

      {/* Queue Items */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredItems.map(item => {
          const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
          const StatusIcon = statusConfig.icon;
          const SourceIcon = SOURCE_TYPE_ICONS[item.source_type] || Zap;
          const isActive = ['extracting', 'cross_connecting', 'embedding'].includes(item.status);

          return (
            <div
              key={item.id}
              className={clsx(
                'p-3 rounded-lg border transition-all',
                isActive
                  ? 'bg-slate-900/80 border-cyan-500/20'
                  : 'bg-slate-900/50 border-white/5 hover:border-white/10'
              )}
            >
              {/* Header Row */}
              <div className="flex items-start gap-3">
                {/* Source type icon */}
                <div className={clsx('mt-0.5 p-1.5 rounded', statusConfig.bgColor)}>
                  <SourceIcon className={clsx('w-4 h-4', statusConfig.color)} />
                </div>

                {/* Title & metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200 truncate">
                      {item.title}
                    </span>
                    <span className="text-xs text-slate-600 shrink-0">
                      {formatTimeAgo(item.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    {/* Status badge */}
                    <span className={clsx(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
                      statusConfig.bgColor, statusConfig.color
                    )}>
                      <StatusIcon className={clsx('w-3 h-3', statusConfig.animate && 'animate-spin')} />
                      {statusConfig.label}
                    </span>

                    {/* Source type */}
                    <span className="text-xs text-slate-600">
                      {item.source_type}
                    </span>

                    {/* Extraction mode */}
                    <span className="text-xs text-slate-700">
                      {item.extraction_mode}
                    </span>

                    {/* Results (completed) */}
                    {item.status === 'completed' && (item.nodes_created > 0 || item.edges_created > 0) && (
                      <span className="text-xs text-emerald-500/70">
                        {item.nodes_created} nodes, {item.edges_created} edges
                      </span>
                    )}
                  </div>

                  {/* Error message (failed) */}
                  {item.status === 'failed' && item.error_message && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400/80">
                      <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{item.error_message}</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  {item.status === 'failed' && item.retry_count < item.max_retries && (
                    <button
                      onClick={() => handleRetry(item.id)}
                      disabled={actionLoading === item.id}
                      className="p-1.5 rounded hover:bg-slate-800 text-amber-400 hover:text-amber-300 transition-colors"
                      title="Retry"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                  {item.status === 'pending' && (
                    <button
                      onClick={() => handleSkip(item.id)}
                      disabled={actionLoading === item.id}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                      title="Skip"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {['completed', 'failed', 'skipped'].includes(item.status) && (
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={actionLoading === item.id}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-600 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
