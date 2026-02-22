import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Search, Youtube, Users, FileText, Globe,
  StickyNote, Tag, Hash, ChevronLeft, ChevronDown, ChevronUp, Circle
} from 'lucide-react';
import { fetchSourcesWithStats, fetchNodesBySourceId, fetchEdgesBySourceId, type SourceWithStats, type SourceNode, type SourceEdge } from '../services/sources';
import { getEntityConfig } from '../utils/theme';
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

  // Inline detail expansion state
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [detailNodes, setDetailNodes] = useState<SourceNode[]>([]);
  const [detailEdges, setDetailEdges] = useState<SourceEdge[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<'nodes' | 'edges'>('nodes');

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

  // Collapse detail when source deselected
  useEffect(() => {
    if (!selectedSourceId) {
      setExpandedSourceId(null);
    }
  }, [selectedSourceId]);

  const handleToggleDetails = async (sourceId: string) => {
    if (expandedSourceId === sourceId) {
      setExpandedSourceId(null);
      return;
    }
    setExpandedSourceId(sourceId);
    setDetailTab('nodes');
    setDetailLoading(true);
    const [nodeData, edgeData] = await Promise.all([
      fetchNodesBySourceId(sourceId),
      fetchEdgesBySourceId(sourceId),
    ]);
    setDetailNodes(nodeData);
    setDetailEdges(edgeData);
    setDetailLoading(false);
  };

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
            const isExpanded = expandedSourceId === source.id;

            return (
              <div key={source.id}>
                {/* Source Card */}
                <button
                  onClick={() => onSelectSource(isSelected ? null : source.id)}
                  className={clsx(
                    'w-full text-left p-2.5 rounded-lg border transition-all group',
                    isSelected
                      ? 'bg-indigo-900/10 border-indigo-500/30 border-l-2 border-l-indigo-400'
                      : 'bg-transparent border-white/5 hover:bg-white/5 hover:border-white/10'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className={clsx('p-1 rounded shrink-0 mt-0.5', colorClass)}>
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx('text-[11px] font-medium truncate', isSelected ? 'text-indigo-300' : 'text-white')}>
                        {source.title || 'Untitled'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-500">
                          {new Date(source.created_at).toLocaleDateString()}
                        </span>
                        {source.node_count > 0 && (
                          <span className={clsx(
                            'text-[9px] font-medium px-1 rounded',
                            isSelected ? 'text-indigo-400 bg-indigo-900/30' : 'text-slate-400 bg-slate-800'
                          )}>
                            {source.node_count} nodes
                          </span>
                        )}
                        {source.edge_count > 0 && (
                          <span className={clsx(
                            'text-[9px] font-medium px-1 rounded',
                            isSelected ? 'text-indigo-400 bg-indigo-900/30' : 'text-slate-400 bg-slate-800'
                          )}>
                            {source.edge_count} edges
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

                {/* View Source Details toggle (only when selected) */}
                {isSelected && (
                  <div className="mt-1 ml-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleToggleDetails(source.id); }}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[10px] font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                      {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                      <span>{isExpanded ? 'Hide details' : 'View source details'}</span>
                      {!isExpanded && (
                        <span className="ml-auto text-[9px] text-slate-600">
                          {source.node_count}N / {source.edge_count}E
                        </span>
                      )}
                    </button>

                    {/* Expanded inline detail panel */}
                    {isExpanded && (
                      <div className="mt-1 border border-white/5 rounded-lg bg-black/30 overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-white/5">
                          <button
                            onClick={() => setDetailTab('nodes')}
                            className={clsx(
                              'flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors',
                              detailTab === 'nodes'
                                ? 'text-indigo-400 border-b border-indigo-400'
                                : 'text-slate-500 hover:text-slate-300'
                            )}
                          >
                            Nodes ({detailNodes.length})
                          </button>
                          <button
                            onClick={() => setDetailTab('edges')}
                            className={clsx(
                              'flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors',
                              detailTab === 'edges'
                                ? 'text-indigo-400 border-b border-indigo-400'
                                : 'text-slate-500 hover:text-slate-300'
                            )}
                          >
                            Edges ({detailEdges.length})
                          </button>
                        </div>

                        {/* Content */}
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                          {detailLoading ? (
                            <div className="text-center py-6 text-slate-500 text-[10px] animate-pulse">Loading...</div>
                          ) : detailTab === 'nodes' ? (
                            <div className="p-1.5 space-y-0.5">
                              {detailNodes.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 text-[10px]">No nodes found.</div>
                              ) : (
                                detailNodes.map(node => {
                                  const config = getEntityConfig(node.entity_type);
                                  return (
                                    <div
                                      key={node.id}
                                      className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 transition-colors"
                                    >
                                      <Circle
                                        size={7}
                                        fill={config.color}
                                        stroke={config.color}
                                        className="shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-white truncate">{node.label}</p>
                                        <span className="text-[8px] text-slate-500">{node.entity_type}</span>
                                      </div>
                                      {node.confidence != null && (
                                        <span className="text-[8px] text-slate-600 shrink-0">
                                          {Math.round(node.confidence * 100)}%
                                        </span>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          ) : (
                            <div className="p-1.5 space-y-0.5">
                              {detailEdges.length === 0 ? (
                                <div className="text-center py-4 text-slate-500 text-[10px]">No edges found.</div>
                              ) : (
                                detailEdges.map(edge => (
                                  <div
                                    key={edge.id}
                                    className="p-1.5 rounded hover:bg-white/5 transition-colors"
                                  >
                                    <div className="flex items-center gap-1 text-[9px]">
                                      <span className="text-white truncate max-w-[80px]">{edge.source_label}</span>
                                      <span className="text-slate-600 shrink-0">→</span>
                                      <span className="text-indigo-400 text-[8px] font-medium shrink-0">
                                        {edge.relation_type.replace(/_/g, ' ')}
                                      </span>
                                      <span className="text-slate-600 shrink-0">→</span>
                                      <span className="text-white truncate max-w-[80px]">{edge.target_label}</span>
                                    </div>
                                    {edge.evidence && (
                                      <p className="text-[8px] text-slate-500 mt-0.5 truncate">{edge.evidence}</p>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
