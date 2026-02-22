import React, { useState, useEffect } from 'react';
import { History, Youtube, Mic, FileText, StickyNote, Globe, RefreshCw, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { fetchHistory, HistoryItem } from '../services/history';
import { getSupabase } from '../services/supabase';
import clsx from 'clsx';

export const HistoryPanel: React.FC = () => {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed' | 'failed'>('all');

  useEffect(() => {
    loadHistory();

    const supabase = getSupabase();
    const channel = supabase
      .channel('history_updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ingest_queue'
      }, () => loadHistory())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadHistory = async () => {
    const data = await fetchHistory(100);
    setItems(data);
    setLoading(false);
  };

  const isPendingStatus = (s: string) =>
    s === 'pending' || s === 'processing' || s === 'extracting' || s === 'cross_connecting' || s === 'embedding';

  const filtered = filter === 'all'
    ? items
    : filter === 'pending'
    ? items.filter(i => isPendingStatus(i.status))
    : items.filter(i => i.status === filter);

  const pendingCount = items.filter(i => isPendingStatus(i.status)).length;
  const failedCount = items.filter(i => i.status === 'failed').length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200">

      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <History className="text-cyan-400" size={20} />
              History
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Every piece of knowledge ingested into Synapse — manual and automated.
            </p>
          </div>
          <button
            onClick={loadHistory}
            className="p-2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mt-4">
          {([
            { key: 'all' as const, label: 'All', count: items.length },
            { key: 'pending' as const, label: 'In Queue', count: pendingCount },
            { key: 'completed' as const, label: 'Completed', count: items.filter(i => i.status === 'completed').length },
            { key: 'failed' as const, label: 'Failed', count: failedCount },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === tab.key
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={clsx(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  tab.key === 'pending' && tab.count > 0 ? 'bg-amber-500/20 text-amber-400' :
                  tab.key === 'failed' && tab.count > 0 ? 'bg-red-500/20 text-red-400' :
                  'bg-slate-700 text-slate-400'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="animate-spin text-slate-500" size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600">
            <History size={24} className="mb-2" />
            <p className="text-sm">No items yet</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(item => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const HistoryRow: React.FC<{ item: HistoryItem }> = ({ item }) => {
  const isCompleted = item.status === 'completed';
  const isPending = item.status === 'pending' || item.status === 'processing' || item.status === 'extracting' || item.status === 'cross_connecting' || item.status === 'embedding';
  const isFailed = item.status === 'failed';

  return (
    <div className={clsx(
      'flex items-center gap-3 px-6 py-3.5 hover:bg-slate-900/40 transition-colors',
      isPending && 'opacity-70'
    )}>
      {/* Source type icon */}
      <div className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
        isCompleted && 'bg-slate-800 border-white/10',
        isPending && 'bg-amber-900/20 border-amber-500/20',
        isFailed && 'bg-red-900/20 border-red-500/20',
      )}>
        <SourceIcon type={item.source_type} size={14} completed={isCompleted} />
      </div>

      {/* Title + metadata */}
      <div className="flex-1 min-w-0">
        <p className={clsx(
          'text-sm font-medium truncate',
          isCompleted ? 'text-white' : isPending ? 'text-amber-200' : 'text-red-300'
        )}>
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-500 capitalize">
            {item.ingestion_method === 'manual' ? item.source_type : item.ingestion_method.replace('_webhook', '')}
          </span>
          <span className="text-slate-700">&middot;</span>
          <span className="text-[10px] text-slate-500">
            {new Date(item.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </span>
          {isFailed && item.error_message && (
            <>
              <span className="text-slate-700">&middot;</span>
              <span className="text-[10px] text-red-400 truncate max-w-[200px]">
                {item.error_message}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right side: nodes/edges or status */}
      <div className="shrink-0 text-right">
        {isCompleted && (item.nodes_created !== undefined) && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-400 font-medium">
              +{item.nodes_created} nodes
            </span>
            <span className="text-[10px] text-slate-500">
              {item.edges_created} edges
            </span>
          </div>
        )}
        {isPending && (
          <div className="flex items-center gap-1.5">
            {item.status !== 'pending' ? (
              <Loader2 size={12} className="animate-spin text-amber-400" />
            ) : (
              <Clock size={12} className="text-amber-400" />
            )}
            <span className="text-[10px] text-amber-400 capitalize">{item.status.replace('_', ' ')}</span>
          </div>
        )}
        {isFailed && (
          <AlertCircle size={14} className="text-red-400" />
        )}
      </div>
    </div>
  );
};

const SourceIcon: React.FC<{ type: string; size: number; completed: boolean }> = ({ type, size, completed }) => {
  const color = completed ? 'text-slate-400' : 'text-amber-400';
  switch (type?.toLowerCase()) {
    case 'youtube':    return <Youtube size={size} className="text-red-400" />;
    case 'meeting':    return <Mic size={size} className={completed ? 'text-purple-400' : 'text-amber-400'} />;
    case 'document':   return <FileText size={size} className={color} />;
    case 'note':       return <StickyNote size={size} className={completed ? 'text-emerald-400' : 'text-amber-400'} />;
    case 'research':   return <Globe size={size} className={completed ? 'text-cyan-400' : 'text-amber-400'} />;
    default:           return <FileText size={size} className={color} />;
  }
};
