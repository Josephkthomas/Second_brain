import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Search, Youtube, Users, FileText, Globe, 
  StickyNote, ChevronRight, X, Clock, ExternalLink, Filter,
  PlayCircle
} from 'lucide-react';
import { fetchAllSources } from '../services/supabase';
import clsx from 'clsx';

interface SourceLogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (sourceId: string | null) => void;
  activeSource: string | null;
}

export const SourceLog: React.FC<SourceLogProps> = ({ 
  isOpen, 
  onClose, 
  onSelectSource,
  activeSource
}) => {
  const [sources, setSources] = useState<{ id: string, title: string, source_type: string, source_url?: string, metadata?: any, created_at: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen]);

  const loadSources = async () => {
    setLoading(true);
    const data = await fetchAllSources();
    setSources(data);
    setLoading(false);
  };

  const filteredSources = sources.filter(s => {
    const matchesSearch = s.title.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'All' || s.source_type.toLowerCase() === filterType.toLowerCase();
    return matchesSearch && matchesType;
  });

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

  const activeSourceTitle = sources.find(s => s.id === activeSource)?.title;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={clsx(
          "fixed inset-0 bg-black/80 backdrop-blur-sm z-40 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={clsx(
        "fixed top-0 left-0 bottom-0 w-96 bg-cyber-black/95 border-r border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-50 transform transition-transform duration-300 flex flex-col font-sans",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-cyber-dark to-transparent">
            <div className="flex items-center gap-3 text-white">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <BookOpen size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold tracking-wide">Source Handbook</h2>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">Ingested Knowledge Base</p>
                </div>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
            
            {/* Search & Filter */}
            <div className="p-4 border-b border-white/10 space-y-3 bg-cyber-slate/30">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                    <input 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search sources..."
                        className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:border-indigo-500 focus:outline-none"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                    {['All', 'YouTube', 'Meeting', 'Research', 'Note', 'Document'].map(type => (
                        <button
                            key={type}
                            onClick={() => setFilterType(type)}
                            className={clsx(
                                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border transition-all",
                                filterType === type 
                                    ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50" 
                                    : "bg-transparent text-slate-500 border-transparent hover:bg-white/5"
                            )}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                {activeSource && (
                    <div className="mb-4 p-3 bg-indigo-900/20 border border-indigo-500/50 rounded-lg flex items-center justify-between animate-in fade-in">
                        <div className="flex items-center gap-2 text-indigo-300">
                            <Filter size={14} />
                            <span className="text-xs font-bold">Filtered by: <span className="text-white">{activeSourceTitle}</span></span>
                        </div>
                        <button onClick={() => onSelectSource(null)} className="text-[10px] text-indigo-400 hover:text-white underline">
                            Clear Filter
                        </button>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-10 text-slate-500 text-xs animate-pulse">Scanning Archives...</div>
                ) : filteredSources.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">No sources found matching criteria.</div>
                ) : (
                    filteredSources.map((source) => {
                        const Icon = getSourceIcon(source.source_type);
                        const colorClass = getSourceColor(source.source_type);
                        const isActive = activeSource === source.id;
                        const thumbnail = source.metadata?.thumbnailUrl;

                        return (
                            <div 
                                key={source.id} 
                                className={clsx(
                                    "relative rounded-xl border transition-all group overflow-hidden",
                                    isActive 
                                        ? "bg-indigo-900/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                                        : "bg-cyber-slate border-white/5 hover:border-white/10 hover:bg-white/5"
                                )}
                            >
                                <button 
                                    onClick={() => onSelectSource(isActive ? null : source.id)}
                                    className="w-full text-left p-0 flex flex-col z-10 relative"
                                >
                                    {/* Thumbnail Preview */}
                                    {thumbnail && (
                                        <div className="w-full h-32 overflow-hidden relative">
                                            <img src={thumbnail} alt={source.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                                            <div className="absolute bottom-2 left-2 flex items-center gap-2">
                                                <div className={clsx("p-1 rounded bg-black/60 backdrop-blur-sm", colorClass)}>
                                                    <Icon size={14} />
                                                </div>
                                                <span className="text-[10px] text-white font-bold bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                                                    {source.source_type}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-4 w-full">
                                        {!thumbnail && (
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={clsx("text-[10px] font-bold uppercase tracking-wider px-1.5 rounded border", colorClass)}>
                                                    {source.source_type}
                                                </span>
                                                <div className={clsx("p-1.5 rounded-lg shrink-0", colorClass)}>
                                                    <Icon size={16} />
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="flex justify-between items-start">
                                            <h3 className={clsx("text-sm font-bold truncate mb-1 pr-2", isActive ? "text-indigo-300" : "text-white")}>
                                                {source.title || "Untitled Source"}
                                            </h3>
                                            <span className="text-[9px] text-slate-500 font-mono shrink-0 pt-0.5">
                                                {new Date(source.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        
                                        {/* Metadata Preview */}
                                        {source.metadata && source.metadata.query && (
                                            <div className="text-[10px] text-slate-500 italic mb-2 truncate">
                                                Query: "{source.metadata.query}"
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                                {isActive ? "Isolating Graph Nodes..." : "Click to Filter Graph"}
                                            </div>
                                            {isActive && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>}
                                        </div>
                                    </div>
                                </button>

                                {source.source_url && (
                                    <a 
                                        href={source.source_url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className={clsx(
                                            "absolute right-2 p-1.5 text-slate-400 hover:text-white z-20 transition-colors bg-black/40 backdrop-blur-sm rounded-full",
                                            thumbnail ? "top-2" : "bottom-12"
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                        title="Open Original Source"
                                    >
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>
                        )
                    })
                )}
            </div>
        </div>
      </div>
    </>
  );
};