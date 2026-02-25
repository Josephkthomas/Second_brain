// QueueHub — Universal Processing Queue
// Merges youtube_ingestion_queue, ingest_queue, and knowledge_sources
// into a single unified view with dropdown filters and cascade delete.

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ListTodo, RefreshCw, Play, Clock, Loader2,
  Filter, Youtube, Mic, FileText, Globe, StickyNote, Zap,
  CheckCircle, AlertCircle, Hourglass, Layers, Database,
  Calendar, ArrowDownAZ,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchUnifiedQueue,
  retryItem,
  deleteItem,
  processQueue,
} from '../services/queue';
import type { UnifiedQueueItem, DeleteOptions, SourceCategory } from '../types/queue';
import QueueItem from './queue/QueueItem';
import DeleteConfirmModal from './queue/DeleteConfirmModal';
import FilterDropdown from './queue/FilterDropdown';
import type { FilterOption } from './queue/FilterDropdown';

interface QueueHubProps {
  onGraphUpdate?: () => void;
  onViewSource?: (sourceId: string) => void;
}

// Icon map for source types (used in dropdown)
const SOURCE_ICONS: Record<string, React.ReactNode> = {
  YouTube:  <Youtube size={14} />,
  Meeting:  <Mic size={14} />,
  Document: <FileText size={14} />,
  Research: <Globe size={14} />,
  Note:     <StickyNote size={14} />,
  API:      <Zap size={14} />,
};

const SOURCE_COLORS: Record<string, string> = {
  YouTube:  'text-red-400',
  Meeting:  'text-purple-400',
  Document: 'text-blue-400',
  Research: 'text-cyan-400',
  Note:     'text-emerald-400',
  API:      'text-violet-400',
};

// Status icons for dropdown
const STATUS_ICONS: Record<string, React.ReactNode> = {
  processing: <Loader2 size={14} />,
  pending:    <Hourglass size={14} />,
  completed:  <CheckCircle size={14} />,
  failed:     <AlertCircle size={14} />,
};

const STATUS_COLORS: Record<string, string> = {
  processing: 'text-cyan-400',
  pending:    'text-amber-400',
  completed:  'text-emerald-400',
  failed:     'text-red-400',
};

type SortMode = 'newest' | 'oldest' | 'most-nodes';

export default function QueueHub({ onGraphUpdate, onViewSource }: QueueHubProps) {
  const { session } = useAuth();
  const [items, setItems] = useState<UnifiedQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter state — empty Set means "all"
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedDateRange, setSelectedDateRange] = useState<Set<string>>(new Set());
  const [selectedDataFilter, setSelectedDataFilter] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<UnifiedQueueItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-refresh interval ref
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchQueue = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const data = await fetchUnifiedQueue(session.access_token);
      setItems(data);
    } catch (err) {
      console.error('Error fetching unified queue:', err);
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-refresh every 10s when active items exist
  useEffect(() => {
    const hasActive = items.some(i => i.status === 'processing' || i.status === 'pending');

    if (hasActive) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(fetchQueue, 10000);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [items, fetchQueue]);

  // ─── Actions ────────────────────────────────────────────────

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchQueue();
    setIsRefreshing(false);
  };

  const handleProcessNow = async () => {
    if (!session?.access_token || isProcessing) return;
    setIsProcessing(true);
    try {
      let hasMore = true;
      while (hasMore) {
        const result = await processQueue(session.access_token);
        hasMore = result.remaining > 0 && result.processed > 0;
        await fetchQueue();
        if (hasMore) await new Promise(r => setTimeout(r, 1000));
      }
      if (onGraphUpdate) onGraphUpdate();
    } catch (err) {
      console.error('Error processing queue:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = async (item: UnifiedQueueItem) => {
    if (!session?.access_token) return;
    setActionLoading(item.id);
    try {
      await retryItem(session.access_token, item);
      await fetchQueue();
    } catch {} finally {
      setActionLoading(null);
    }
  };

  const handleDeleteClick = (item: UnifiedQueueItem) => {
    setDeleteTarget(item);
  };

  const handleDeleteConfirm = async (options: DeleteOptions) => {
    if (!session?.access_token || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteItem(session.access_token, deleteTarget, options);
      setDeleteTarget(null);
      await fetchQueue();
      if (options.deleteNodesAndEdges && onGraphUpdate) onGraphUpdate();
    } catch (err) {
      console.error('Error deleting item:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewInGraph = (sourceId: string) => {
    if (onViewSource) onViewSource(sourceId);
  };

  // ─── Date Helper ────────────────────────────────────────────

  const getDateBucket = (dateStr: string): string => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    if (days < 1) return 'today';
    if (days < 7) return 'week';
    if (days < 30) return 'month';
    return 'older';
  };

  // ─── Filtering & Sorting ───────────────────────────────────

  const filtered = useMemo(() => {
    let result = items.filter(item => {
      // Status filter
      if (selectedStatuses.size > 0) {
        const match = selectedStatuses.has(item.status) ||
          (selectedStatuses.has('failed') && item.status === 'skipped');
        if (!match) return false;
      }

      // Source filter
      if (selectedSources.size > 0 && !selectedSources.has(item.sourceType)) {
        return false;
      }

      // Date range filter
      if (selectedDateRange.size > 0) {
        const bucket = getDateBucket(item.createdAt);
        if (!selectedDateRange.has(bucket)) return false;
      }

      // Data filter (smart filter)
      if (selectedDataFilter.size > 0) {
        if (selectedDataFilter.has('has-nodes') && item.nodesCreated === 0) return false;
        if (selectedDataFilter.has('no-nodes') && item.nodesCreated > 0) return false;
        if (selectedDataFilter.has('has-errors') && !item.errorMessage) return false;
        if (selectedDataFilter.has('retryable') && !item.canRetry) return false;
      }

      return true;
    });

    // Sort
    if (sortMode === 'oldest') {
      result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortMode === 'most-nodes') {
      result = [...result].sort((a, b) => b.nodesCreated - a.nodesCreated);
    }
    // 'newest' is default from service (already sorted desc)

    return result;
  }, [items, selectedStatuses, selectedSources, selectedDateRange, selectedDataFilter, sortMode]);

  // ─── Filter Options (computed from items) ──────────────────

  const statusOptions: FilterOption[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = item.status === 'skipped' ? 'failed' : item.status;
      counts[key] = (counts[key] || 0) + 1;
    }
    return [
      { value: 'processing', label: 'Processing', count: counts['processing'] || 0, icon: STATUS_ICONS.processing, color: STATUS_COLORS.processing },
      { value: 'pending', label: 'Pending', count: counts['pending'] || 0, icon: STATUS_ICONS.pending, color: STATUS_COLORS.pending },
      { value: 'completed', label: 'Completed', count: counts['completed'] || 0, icon: STATUS_ICONS.completed, color: STATUS_COLORS.completed },
      { value: 'failed', label: 'Failed', count: counts['failed'] || 0, icon: STATUS_ICONS.failed, color: STATUS_COLORS.failed },
    ];
  }, [items]);

  const sourceOptions: FilterOption[] = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.sourceType] = (counts[item.sourceType] || 0) + 1;
    }
    // Only show source types that actually exist in the data
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({
        value: type,
        label: type,
        count,
        icon: SOURCE_ICONS[type],
        color: SOURCE_COLORS[type],
      }));
  }, [items]);

  const dateOptions: FilterOption[] = useMemo(() => {
    const counts = { today: 0, week: 0, month: 0, older: 0 };
    for (const item of items) {
      const bucket = getDateBucket(item.createdAt);
      counts[bucket as keyof typeof counts]++;
    }
    return [
      { value: 'today', label: 'Today', count: counts.today },
      { value: 'week', label: 'This Week', count: counts.week },
      { value: 'month', label: 'This Month', count: counts.month },
      { value: 'older', label: 'Older', count: counts.older },
    ];
  }, [items]);

  const dataFilterOptions: FilterOption[] = useMemo(() => {
    return [
      { value: 'has-nodes', label: 'Has extracted data', count: items.filter(i => i.nodesCreated > 0).length, icon: <Database size={14} />, color: 'text-emerald-400' },
      { value: 'no-nodes', label: 'No data yet', count: items.filter(i => i.nodesCreated === 0).length, icon: <Layers size={14} />, color: 'text-slate-400' },
      { value: 'has-errors', label: 'Has errors', count: items.filter(i => !!i.errorMessage).length, icon: <AlertCircle size={14} />, color: 'text-red-400' },
      { value: 'retryable', label: 'Can retry', count: items.filter(i => i.canRetry).length, icon: <RefreshCw size={14} />, color: 'text-amber-400' },
    ];
  }, [items]);

  const pendingCount = items.filter(i => i.status === 'pending').length;

  const activeFilterCount = (selectedStatuses.size > 0 ? 1 : 0) +
    (selectedSources.size > 0 ? 1 : 0) +
    (selectedDateRange.size > 0 ? 1 : 0) +
    (selectedDataFilter.size > 0 ? 1 : 0);

  // ─── Render ─────────────────────────────────────────────────

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
          Track content being processed into your knowledge graph.
        </p>
      </div>

      {/* Actions + Filters Bar */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        {/* Left: Dropdown filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-500" />

          <FilterDropdown
            label="Status"
            options={statusOptions}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
          />

          <FilterDropdown
            label="Sources"
            options={sourceOptions}
            selected={selectedSources}
            onChange={setSelectedSources}
          />

          <FilterDropdown
            label="Date"
            options={dateOptions}
            selected={selectedDateRange}
            onChange={setSelectedDateRange}
            icon={<Calendar size={14} />}
          />

          <FilterDropdown
            label="Data"
            options={dataFilterOptions}
            selected={selectedDataFilter}
            onChange={setSelectedDataFilter}
            icon={<Database size={14} />}
          />

          {/* Sort toggle */}
          <button
            onClick={() => setSortMode(s => s === 'newest' ? 'oldest' : s === 'oldest' ? 'most-nodes' : 'newest')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200 transition-colors"
            title={`Sort: ${sortMode}`}
          >
            <ArrowDownAZ size={14} />
            {sortMode === 'newest' ? 'Newest' : sortMode === 'oldest' ? 'Oldest' : 'Most Nodes'}
          </button>

          {/* Clear filters indicator */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setSelectedStatuses(new Set());
                setSelectedSources(new Set());
                setSelectedDateRange(new Set());
                setSelectedDataFilter(new Set());
              }}
              className="px-2 py-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {filtered.length} of {items.length}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={clsx('w-5 h-5', isRefreshing && 'animate-spin')} />
          </button>
          {pendingCount > 0 && (
            <button
              onClick={handleProcessNow}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {isProcessing ? 'Processing...' : `Process Now (${pendingCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Queue Items */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">
              {items.length === 0
                ? 'Queue is empty'
                : 'No items match your filters'}
            </p>
          </div>
        ) : (
          filtered.map(item => (
            <QueueItem
              key={`${item.origin}-${item.id}`}
              item={item}
              onRetry={handleRetry}
              onDelete={handleDeleteClick}
              onViewInGraph={handleViewInGraph}
              actionLoading={actionLoading}
            />
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}
