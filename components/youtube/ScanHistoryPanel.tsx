// ScanHistoryPanel - Display YouTube scan history

import React, { useState, useEffect, useCallback } from 'react';
import {
  History, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Clock, Play, Loader2, Video, BarChart2
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface ScanHistoryItem {
  id: string;
  user_id: string;
  channel_id: string | null;
  scan_type: 'manual_scan' | 'auto_poll' | 'process';
  channel_name: string | null;
  channel_youtube_id: string | null;
  videos_found: number;
  videos_added: number;
  videos_skipped: number;
  videos_processed: number;
  videos_failed: number;
  status: 'completed' | 'failed' | 'partial';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  metadata: Record<string, any>;
  created_at: string;
}

const SCAN_TYPE_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}> = {
  manual_scan: {
    label: 'Manual Scan',
    icon: RefreshCw,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  auto_poll: {
    label: 'Auto Poll',
    icon: Clock,
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10',
  },
  process: {
    label: 'Process',
    icon: Play,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
  },
};

const STATUS_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  color: string;
}> = {
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-emerald-400' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-400' },
  partial: { label: 'Partial', icon: AlertTriangle, color: 'text-amber-400' },
};

export default function ScanHistoryPanel() {
  const { session } = useAuth();
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | 'all'>('all');

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/youtube/history?limit=50', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scan history');
      }

      const data = await response.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error('Error fetching scan history:', err);
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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

  // Format duration
  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Filter history
  const filteredHistory = history.filter(item => {
    if (filterType === 'all') return true;
    return item.scan_type === filterType;
  });

  // Group by type for filter buttons
  const typeCounts = history.reduce((acc, item) => {
    acc[item.scan_type] = (acc[item.scan_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Loading scan history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400">
        <XCircle className="w-8 h-8 mb-4" />
        <p>{error}</p>
        <button
          onClick={fetchHistory}
          className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <History className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">No Scan History</p>
        <p className="text-sm mt-1">Scan operations will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filter Buttons */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <BarChart2 className="w-4 h-4 text-slate-500" />
        <button
          onClick={() => setFilterType('all')}
          className={clsx(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            filterType === 'all'
              ? 'bg-slate-700 text-white'
              : 'bg-slate-900 text-slate-500 hover:text-slate-300'
          )}
        >
          All ({history.length})
        </button>
        {Object.entries(typeCounts).map(([type, count]) => {
          const config = SCAN_TYPE_CONFIG[type];
          if (!config) return null;
          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={clsx(
                'px-3 py-1 rounded text-xs font-medium transition-colors',
                filterType === type
                  ? `${config.bgColor} ${config.color}`
                  : 'bg-slate-900 text-slate-500 hover:text-slate-300'
              )}
            >
              {config.label} ({count})
            </button>
          );
        })}

        {/* Refresh Button */}
        <button
          onClick={fetchHistory}
          className="ml-auto p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
          title="Refresh history"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
        {filteredHistory.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            No items match this filter
          </div>
        ) : (
          filteredHistory.map(item => {
            const typeConfig = SCAN_TYPE_CONFIG[item.scan_type] || SCAN_TYPE_CONFIG.manual_scan;
            const statusConfig = STATUS_CONFIG[item.status] || STATUS_CONFIG.completed;
            const TypeIcon = typeConfig.icon;
            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  {/* Type Icon */}
                  <div className={clsx('p-2 rounded-lg', typeConfig.bgColor)}>
                    <TypeIcon className={clsx('w-4 h-4', typeConfig.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={clsx('text-sm font-medium', typeConfig.color)}>
                          {typeConfig.label}
                        </span>
                        {item.channel_name && (
                          <span className="text-sm text-slate-400">
                            - {item.channel_name}
                          </span>
                        )}
                      </div>
                      <span className={clsx('flex items-center gap-1 text-xs', statusConfig.color)}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-slate-400 mb-2">
                      {item.videos_found > 0 && (
                        <span className="flex items-center gap-1">
                          <Video className="w-3 h-3" />
                          {item.videos_found} found
                        </span>
                      )}
                      {item.videos_added > 0 && (
                        <span className="text-emerald-400">
                          +{item.videos_added} added
                        </span>
                      )}
                      {item.videos_skipped > 0 && (
                        <span className="text-slate-500">
                          {item.videos_skipped} skipped
                        </span>
                      )}
                      {item.videos_processed > 0 && (
                        <span className="text-cyan-400">
                          {item.videos_processed} processed
                        </span>
                      )}
                      {item.videos_failed > 0 && (
                        <span className="text-red-400">
                          {item.videos_failed} failed
                        </span>
                      )}
                      {item.duration_ms && (
                        <span className="text-slate-500">
                          {formatDuration(item.duration_ms)}
                        </span>
                      )}
                    </div>

                    {/* Error Message */}
                    {item.error_message && (
                      <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400 mb-2">
                        {item.error_message}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-xs text-slate-500">
                      {formatDate(item.created_at)}
                    </div>
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
