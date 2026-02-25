// QueueStatusPanel - Display YouTube video processing queue

import React, { useState, useEffect, useRef } from 'react';
import {
  Clock, CheckCircle, XCircle, Loader2, RotateCcw,
  Trash2, ExternalLink, AlertCircle, Filter, Play, Youtube, ListVideo, RefreshCw
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
  const [processingProgress, setProcessingProgress] = useState<{ processed: number; remaining: number; currentVideo?: string } | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasActiveItems = items.some(
    i => i.status === 'fetching_transcript' || i.status === 'extracting'
  );

  // Auto-poll while items are actively processing
  useEffect(() => {
    if (hasActiveItems || isProcessingQueue) {
      pollIntervalRef.current = setInterval(() => {
        onRefresh();
      }, 5000); // Refresh every 5 seconds
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [hasActiveItems, isProcessingQueue, onRefresh]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

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

  // Process queue now - processes ALL pending videos one at a time
  const handleProcessNow = async () => {
    if (!session?.access_token || isProcessingQueue) return;

    try {
      setIsProcessingQueue(true);
      setProcessingError(null);
      const totalPending = statusCounts.pending || 0;
      setProcessingProgress({ processed: 0, remaining: totalPending });

      let totalProcessed = 0;
      let totalCompleted = 0;
      let totalFailed = 0;
      let hasMoreItems = true;
      let consecutiveErrors = 0;

      // Loop: process 1 video per API call until all done
      while (hasMoreItems) {
        try {
          const response = await fetch('/api/youtube/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ process_all: true }),
          });

          if (!response.ok) {
            // Try to read error body — FUNCTION_INVOCATION_FAILED returns HTML, not JSON
            let errMsg: string;
            try {
              const data = await response.json();
              errMsg = data.error || `Server error ${response.status}`;
            } catch {
              errMsg = `Server error ${response.status} (function may have crashed)`;
            }
            consecutiveErrors++;

            if (consecutiveErrors >= 3) {
              setProcessingError(`Processing stopped after 3 errors: ${errMsg}`);
              break;
            }

            setProcessingError(`Error (attempt ${consecutiveErrors}/3): ${errMsg}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            continue;
          }

          consecutiveErrors = 0;
          const result = await response.json();
          console.log('[Queue] Process response:', JSON.stringify(result));

          // If API returned 0 processed but we expect pending items, show diagnostic
          if ((result.processed || 0) === 0 && totalProcessed === 0) {
            const diag = result.diagnostics;
            if (diag) {
              const counts = diag.status_counts || {};
              const parts = Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ');
              setProcessingError(`No items were processed. Queue status: ${parts || 'empty'}. Try refreshing the page.`);
            } else {
              setProcessingError('No items were processed. The server may not have found pending items.');
            }
            break;
          }

          totalProcessed += result.processed || 0;
          totalCompleted += result.completed || 0;
          totalFailed += result.failed || 0;

          // Update progress
          setProcessingProgress({
            processed: totalProcessed,
            remaining: result.remaining || 0,
          });

          // Continue if there are more items AND we actually processed something
          hasMoreItems = (result.remaining || 0) > 0 && (result.processed || 0) > 0;

          // Refresh list after each video completes
          onRefresh();

          // Brief delay between items
          if (hasMoreItems) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          consecutiveErrors++;
          const errMsg = err instanceof Error ? err.message : 'Network error';

          if (consecutiveErrors >= 3) {
            setProcessingError(`Processing stopped: ${errMsg}`);
            break;
          }

          setProcessingError(`Temporary error (retrying): ${errMsg}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Final refresh
      onRefresh();

      if (totalCompleted > 0) {
        setProcessingError(null); // Clear transient errors on success
      }

      // Show completion summary if there were failures
      if (totalFailed > 0 && !processingError) {
        setProcessingError(`Completed with issues: ${totalCompleted} succeeded, ${totalFailed} failed. Check failed items for details.`);
      }

      // Refresh the graph to show new nodes and edges
      if (totalCompleted > 0 && onGraphUpdate) {
        onGraphUpdate();
      }
    } catch (err) {
      setProcessingError(err instanceof Error ? err.message : 'Processing failed');
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

  // Reset stuck item (fetching_transcript or extracting → pending)
  const handleReset = async (itemId: string) => {
    if (!session?.access_token || actionLoading) return;

    try {
      setActionLoading(itemId);

      const response = await fetch('/api/youtube/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: itemId, action: 'reset' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset');
      }

      onRefresh();
    } catch (err) {
      console.error('Error resetting item:', err);
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

  // Check if item appears stuck (in processing state for > 10 min)
  const isStuck = (item: YouTubeQueueItem) => {
    if (item.status !== 'fetching_transcript' && item.status !== 'extracting') return false;
    if (!item.started_at) return false;
    return Date.now() - new Date(item.started_at).getTime() > 10 * 60 * 1000;
  };

  // Build progress steps for actively processing items
  function getProgressSteps(item: YouTubeQueueItem): Array<{ label: string; detail: string; status: 'active' | 'done' | 'pending' }> {
    const step = item.processing_step || '';

    if (item.status === 'fetching_transcript') {
      return [
        { label: 'Fetching Transcript', detail: step || 'Connecting to YouTube...', status: 'active' },
        { label: 'Extracting Knowledge', detail: 'Waiting...', status: 'pending' },
        { label: 'Cross-Referencing Graph', detail: 'Waiting...', status: 'pending' },
      ];
    }

    if (item.status === 'extracting') {
      const isCrossRef = step.toLowerCase().includes('cross-referenc');
      return [
        { label: 'Fetching Transcript', detail: 'Done', status: 'done' },
        {
          label: 'Extracting Knowledge',
          detail: isCrossRef ? 'Done' : (step || 'Running AI extraction...'),
          status: isCrossRef ? 'done' : 'active',
        },
        {
          label: 'Cross-Referencing Graph',
          detail: isCrossRef ? step : 'Waiting...',
          status: isCrossRef ? 'active' : 'pending',
        },
      ];
    }

    return [];
  }

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
                {processingProgress
                  ? `Processing... (${processingProgress.processed} done, ${processingProgress.remaining} left)`
                  : 'Starting...'}
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Process Now ({statusCounts.pending})
              </>
            )}
          </button>
        )}
      </div>

      {/* Processing error banner */}
      {processingError && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-300 flex-1">{processingError}</span>
          <button
            onClick={() => setProcessingError(null)}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active processing banner */}
      {(hasActiveItems || isProcessingQueue) && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
          <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />
          <span className="text-xs text-cyan-300">
            {isProcessingQueue
              ? `Processing videos... ${processingProgress ? `(${processingProgress.processed} of ${processingProgress.processed + processingProgress.remaining})` : ''}`
              : 'Videos are being processed. Auto-refreshing every 5s.'}
          </span>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="ml-auto flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3 h-3', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      )}

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
            const stuck = isStuck(item);

            return (
              <div
                key={item.id}
                className={clsx(
                  'bg-slate-900 border rounded-lg p-4 transition-all',
                  stuck ? 'border-amber-500/40' : isProcessing ? 'border-cyan-500/30' : 'border-slate-800'
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

                    {/* Source tag + status */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {/* Source tag */}
                      {item.youtube_playlists?.playlist_name ? (
                        <span className="flex items-center gap-1 text-xs text-purple-400">
                          <ListVideo className="w-3 h-3" />
                          {item.youtube_playlists.playlist_name}
                        </span>
                      ) : item.youtube_channels?.channel_name ? (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Youtube className="w-3 h-3" />
                          {item.youtube_channels.channel_name}
                        </span>
                      ) : null}

                      {/* Status badge */}
                      {!isProcessing && (
                        <span className={clsx('flex items-center gap-1 text-xs font-medium', config.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      )}
                      {item.published_at && (
                        <span className="text-xs text-slate-500">
                          Published: {formatDate(item.published_at)}
                        </span>
                      )}
                    </div>

                    {/* Stuck warning */}
                    {stuck && (
                      <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400 mb-2">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        <span>This item appears stuck. Click Reset to retry.</span>
                      </div>
                    )}

                    {/* Live progress steps for active items */}
                    {isProcessing && !stuck && (
                      <div className="space-y-1.5 mb-2">
                        {getProgressSteps(item).map(step => (
                          <div key={step.label} className="flex items-start gap-2">
                            <div className="mt-0.5 flex-shrink-0">
                              {step.status === 'done' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              ) : step.status === 'active' ? (
                                <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                              )}
                            </div>
                            <div>
                              <div className={clsx(
                                'text-xs font-medium',
                                step.status === 'done' ? 'text-emerald-300' :
                                step.status === 'active' ? 'text-cyan-300' :
                                'text-slate-500'
                              )}>
                                {step.label}
                              </div>
                              {step.detail && (
                                <div className="text-[10px] text-slate-500">{step.detail}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

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
                    {/* Reset for stuck items (fetching_transcript or extracting) */}
                    {(item.status === 'fetching_transcript' || item.status === 'extracting') && (
                      <button
                        onClick={() => handleReset(item.id)}
                        disabled={isLoading}
                        className="p-2 text-amber-400 hover:bg-amber-500/10 rounded transition-colors"
                        title="Reset stuck item"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                    )}

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
