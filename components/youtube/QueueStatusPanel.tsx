// QueueStatusPanel - Display YouTube video processing queue

import React, { useState } from 'react';
import {
  Clock, CheckCircle, XCircle, Loader2, RotateCcw,
  Trash2, ExternalLink, AlertCircle, Filter, Play
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubeQueueItem, YouTubeQueueStatus } from '../../types/youtube';

interface QueueStatusPanelProps {
  items: YouTubeQueueItem[];
  onRefresh: () => void;
  onGraphUpdate?: () => void;
}

const STATUS_CONFIG: Record<YouTubeQueueStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}> = {
  pending: { label: 'Pending', color: 'text-amber-400', bgColor: 'bg-amber-500/10', icon: Clock },
  fetching_transcript: { label: 'Fetching Transcript', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', icon: Loader2 },
  extracting: { label: 'Extracting Knowledge', color: 'text-indigo-400', bgColor: 'bg-indigo-500/10', icon: Loader2 },
  completed: { label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10', icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-slate-400', bgColor: 'bg-slate-500/10', icon: XCircle },
};

export default function QueueStatusPanel({ items, onRefresh, onGraphUpdate }: QueueStatusPanelProps) {
  const { session } = useAuth();
  const [statusFilter, setStatusFilter] = useState<YouTubeQueueStatus | 'all'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Filter items
  const filteredItems = items.filter(item => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  // Group by status for summary
  const statusCounts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Process queue now
  const handleProcessNow = async () => {
    if (!session?.access_token || isProcessingQueue) return;

    try {
      setIsProcessingQueue(true);

      const response = await fetch('/api/youtube/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Processing failed');
      }

      const result = await response.json();
      console.log('[QueueStatusPanel] Process result:', result);

      // Refresh queue list
      onRefresh();

      // Refresh the graph to show new nodes and edges
      if (result.completed > 0 && onGraphUpdate) {
        console.log('[QueueStatusPanel] Triggering graph refresh after successful processing');
        onGraphUpdate();
      }
    } catch (err) {
      console.error('Error processing queue:', err);
    } finally {
      setIsProcessingQueue(false);
    }
  };

  // Retry failed item
  const handleRetry = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;

    try {
      setActionLoading(itemId);

      const response = await fetch('/api/youtube/queue', {
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

      onRefresh();
    } catch (err) {
      console.error('Error retrying item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Skip item
  const handleSkip = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;

    try {
      setActionLoading(itemId);

      const response = await fetch('/api/youtube/queue', {
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

      onRefresh();
    } catch (err) {
      console.error('Error skipping item:', err);
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

      const response = await fetch('/api/youtube/queue', {
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

      onRefresh();
    } catch (err) {
      console.error('Error deleting item:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // Format date
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

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <Clock className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Queue is Empty</p>
        <p className="text-sm mt-1">New videos from your channels will appear here</p>
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
          const config = STATUS_CONFIG[status as YouTubeQueueStatus];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status as YouTubeQueueStatus)}
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
            className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessingQueue ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Process Now
              </>
            )}
          </button>
        )}
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
        {filteredItems.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            No items match this filter
          </div>
        ) : (
          filteredItems.map(item => {
            const config = STATUS_CONFIG[item.status];
            const StatusIcon = config.icon;
            const isLoading = actionLoading === item.id;
            const isProcessing = item.status === 'fetching_transcript' || item.status === 'extracting';

            return (
              <div
                key={item.id}
                className={clsx(
                  'bg-slate-900 border rounded-lg p-4 transition-all',
                  isProcessing ? 'border-cyan-500/30' : 'border-slate-800'
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Thumbnail */}
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.video_title || 'Video'}
                      className="w-24 h-14 rounded object-cover bg-slate-800 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-14 rounded bg-slate-800 flex-shrink-0" />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="flex items-start gap-2 mb-1">
                      <a
                        href={item.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white font-medium hover:text-red-400 transition-colors line-clamp-1 flex items-center gap-1"
                      >
                        {item.video_title || 'Untitled Video'}
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={clsx('flex items-center gap-1 text-xs font-medium', config.color)}>
                        <StatusIcon className={clsx('w-3 h-3', isProcessing && 'animate-spin')} />
                        {config.label}
                      </span>
                      {item.published_at && (
                        <span className="text-xs text-slate-500">
                          Published: {formatDate(item.published_at)}
                        </span>
                      )}
                    </div>

                    {/* Error Message */}
                    {item.status === 'failed' && item.error_message && (
                      <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 mb-2">
                        <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{item.error_message}</span>
                      </div>
                    )}

                    {/* Stats for completed */}
                    {item.status === 'completed' && (
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{item.nodes_created} nodes</span>
                        <span>{item.edges_created} edges</span>
                        {item.completed_at && (
                          <span>Completed: {formatDate(item.completed_at)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Retry for failed */}
                    {item.status === 'failed' && item.retry_count < item.max_retries && (
                      <button
                        onClick={() => handleRetry(item.id)}
                        disabled={isLoading}
                        className="p-2 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                        title="Retry"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Skip for pending */}
                    {item.status === 'pending' && (
                      <button
                        onClick={() => handleSkip(item.id)}
                        disabled={isLoading}
                        className="p-2 text-slate-400 hover:bg-slate-800 rounded transition-colors"
                        title="Skip"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Delete for completed/failed/skipped */}
                    {(item.status === 'completed' || item.status === 'failed' || item.status === 'skipped') && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isLoading}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove from queue"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
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
