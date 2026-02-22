import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Youtube, Users, FileText, Globe,
  StickyNote, X, Tag, Hash, ChevronLeft
} from 'lucide-react';
import { fetchSourcesWithStats, type SourceWithStats } from '../services/sources';
import clsx from 'clsx';

interface SourcesSidebarProps {
  isOpen: boolean;
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
  onClose: () => void;
}

const getSourceIcon = (type: string) => {
  switch (type.toLowerCase()) {
    case 'youtube': return Youtube;
    case 'meeting': return Users;
    case 'research': return Globe;
    case 'note': return StickyNote;
    default: return FileText;
  }
};

const getSourceColor = (type: string) => {
  switch (type.toLowerCase()) {
    case 'youtube': return 'text-red-400 bg-red-900/20 border-red-900/50';
    case 'meeting': return 'text-purple-400 bg-purple-900/20 border-purple-900/50';
    case 'research': return 'text-cyan-400 bg-cyan-900/20 border-cyan-900/50';
    case 'note': return 'text-emerald-400 bg-emerald-900/20 border-emerald-900/50';
    default: return 'text-slate-400 bg-slate-800 border-slate-700';
  }
};

export const SourcesSidebar: React.FC<SourcesSidebarProps> = ({
  isOpen,
  selectedSourceId,
  onSelectSource,
  onClose,
}) => {
  const [sources, setSources] = useState<SourceWithStats[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allTags = React.useMemo(() => {
    const tagSet = new Set<string>();
    sources.forEach(s => {
      const tags = s.metadata?.tags;
      if (Array.isArray(tags)) {
        tags.forEach((t: string) => tagSet.add(t));
      }
    });
    return Array.from(tagSet).sort();
  }, [sources]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    const data = await fetchSourcesWithStats();
    setSources(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen, loadSources]);

  const filteredSources = sources.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || s.source_type.toLowerCase() === filterType.toLowerCase();
    const matchesTag = !filterTag || (Array.isArray(s.metadata?.tags) && s.metadata.tags.includes(filterTag));
    return matchesSearch && matchesType && matchesTag;
  });

  return (
    <div
      className={clsx(
        'h-full bg-cyber-black/95 border-r border-white/10 flex flex-col transition-all duration-300 overflow-hidden',
        isOpen ? 'w-[280px] min-w-[280px]' : 'w-0 min-w-0'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-white">
          <BookOpen size={16} className="text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider">Sources</h2>
          <span className="text-[10px] text-slate-500 ml-1">({filteredSources.length})</span>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Search & Filters */}
      <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 text-slate-500" size={12} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources..."
            className="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 pl-7 pr-3 text-[11px] text-white focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
          {['All', 'YouTube', 'Meeting', 'Research', 'Note', 'Document'].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={clsx(
                'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all',
                filterType === type
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/50'
                  : 'bg-transparent text-slate-500 border-transparent hover:bg-white/5'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="pt-1.5 border-t border-white/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Tag size={10} className="text-slate-500" />
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Tags</span>
              {filterTag && (
                <button onClick={() => setFilterTag(null)} className="ml-auto text-[9px] text-cyan-400 hover:text-white">
                  Clear
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {allTags.slice(0, 8).map(tag => (
                <button
                  key={tag}
                  onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[9px] font-medium border transition-all flex items-center gap-0.5',
                    filterTag === tag
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50'
                      : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-700'
                  )}
                >
                  <Hash size={8} />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Source List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {loading ? (
          <div className="text-center py-10 text-slate-500 text-[10px] animate-pulse">Loading sources...</div>
        ) : filteredSources.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-[10px]">No sources found.</div>
        ) : (
          filteredSources.map(source => {
            const Icon = getSourceIcon(source.source_type);
            const colorClass = getSourceColor(source.source_type);
            const isSelected = selectedSourceId === source.id;

            return (
              <button
                key={source.id}
                onClick={() => onSelectSource(isSelected ? null : source.id)}
                className={clsx(
                  'w-full text-left p-2.5 rounded-lg border transition-all group',
                  isSelected
                    ? 'bg-amber-900/10 border-amber-500/40 border-l-2 border-l-amber-400'
                    : 'bg-transparent border-white/5 hover:bg-white/5 hover:border-white/10'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={clsx('p-1 rounded shrink-0 mt-0.5', colorClass)}>
                    <Icon size={12} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-[11px] font-medium truncate', isSelected ? 'text-amber-300' : 'text-white')}>
                      {source.title || 'Untitled'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-slate-500">
                        {new Date(source.created_at).toLocaleDateString()}
                      </span>
                      {source.node_count > 0 && (
                        <span className={clsx(
                          'text-[9px] font-medium px-1 rounded',
                          isSelected ? 'text-amber-400 bg-amber-900/30' : 'text-slate-400 bg-slate-800'
                        )}>
                          {source.node_count} nodes
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {source.metadata?.tags && Array.isArray(source.metadata.tags) && source.metadata.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-1.5 ml-6">
                    {source.metadata.tags.slice(0, 3).map((tag: string) => (
                      <span key={tag} className="px-1 py-0 rounded text-[8px] font-medium bg-cyan-900/30 text-cyan-500 border border-cyan-800/50">
                        {tag}
                      </span>
                    ))}
                    {source.metadata.tags.length > 3 && (
                      <span className="text-[8px] text-slate-500">+{source.metadata.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
