import React, { useState, useEffect } from 'react';
import { Database, Search, Loader2, Settings, Lock, Unlock, X, Table, Key, Terminal, Eye, AlertCircle, Copy, Check } from 'lucide-react';
import { COMMON_TABLES } from '../constants';
import { discoverTables, setAdminKey, getAdminKey } from '../services/supabase';
import clsx from 'clsx';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentTable: string;
  onSelectTable: (table: string) => void;
  recentTables: string[];
  onDiscoveredTables: (tables: string[]) => void;
}

const REQUIRED_SQL = `
-- SYNAPSE CONFIGURATION PROTOCOL (Standard + Vector Support)

-- 1. Initialize Raw Sources (The "Subconscious" Storage)
create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  source_type text,
  source_url text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Ensure metadata column exists (migration support)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'knowledge_sources' and column_name = 'metadata') then
    alter table knowledge_sources add column metadata jsonb default '{}'::jsonb;
  end if;
end $$;

-- 2. Initialize Neural Nodes
create table if not exists knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  entity_type text not null,
  description text,
  confidence float,
  is_anchor boolean default false,
  source text,
  source_type text,
  source_url text,
  source_id uuid references knowledge_sources(id) on delete set null,
  tags text[],
  user_tags text[], -- New: User defined project tags
  quote text,
  created_at timestamptz default now()
);

-- Ensure columns exist (migration support)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'knowledge_nodes' and column_name = 'source_id') then
    alter table knowledge_nodes add column source_id uuid references knowledge_sources(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'knowledge_nodes' and column_name = 'user_tags') then
    alter table knowledge_nodes add column user_tags text[];
  end if;
end $$;

-- 3. Initialize Synaptic Edges
create table if not exists knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid references knowledge_nodes(id) on delete cascade,
  target_node_id uuid references knowledge_nodes(id) on delete cascade,
  relation_type text,
  evidence text,
  weight float default 1.0,
  created_at timestamptz default now()
);

-- 4. Add Full Text Search to Sources if not exists
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'knowledge_sources' and column_name = 'fts') then
    alter table knowledge_sources add column fts tsvector generated always as (to_tsvector('english', content || ' ' || coalesce(title, ''))) stored;
    create index if not exists knowledge_sources_fts_idx on knowledge_sources using gin (fts);
  end if;
end $$;

-- 5. Enable Vector Extension (for Semantic Search)
create extension if not exists vector;

-- 6. Add Embedding Column to Nodes
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'knowledge_nodes' and column_name = 'embedding') then
    alter table knowledge_nodes add column embedding vector(768);
  end if;
end $$;

-- 7. Create Match Function for Semantic Search
create or replace function match_nodes (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  label text,
  entity_type text,
  description text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    knowledge_nodes.id,
    knowledge_nodes.label,
    knowledge_nodes.entity_type,
    knowledge_nodes.description,
    1 - (knowledge_nodes.embedding <=> query_embedding) as similarity
  from knowledge_nodes
  where 1 - (knowledge_nodes.embedding <=> query_embedding) > match_threshold
  order by knowledge_nodes.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 8. Override Security Protocols (Dev Mode)
alter table knowledge_nodes enable row level security;
alter table knowledge_edges enable row level security;
alter table knowledge_sources enable row level security;

-- Drop existing policies to prevent conflicts
drop policy if exists "Public Access Nodes" on knowledge_nodes;
drop policy if exists "Public Access Edges" on knowledge_edges;
drop policy if exists "Public Access Sources" on knowledge_sources;

create policy "Public Access Nodes" on knowledge_nodes for all using (true) with check (true);
create policy "Public Access Edges" on knowledge_edges for all using (true) with check (true);
create policy "Public Access Sources" on knowledge_sources for all using (true) with check (true);
`.trim();

export const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen,
  onClose,
  currentTable, 
  onSelectTable, 
  recentTables, 
  onDiscoveredTables
}) => {
  const [customTable, setCustomTable] = useState('');
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  
  // Settings / Admin Key State
  const [keyInput, setKeyInput] = useState('');
  const [hasAdminKey, setHasAdminKey] = useState(!!getAdminKey());
  const [viewSettings, setViewSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadTables = async () => {
    setIsDiscovering(true);
    try {
      const tables = await discoverTables();
      if (tables.length > 0) {
        setDiscoveredTables(tables);
        onDiscoveredTables(tables);
      }
    } finally {
      setIsDiscovering(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
        loadTables();
    }
  }, [isOpen, hasAdminKey]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTable.trim()) {
      onSelectTable(customTable.trim());
      setCustomTable('');
      onClose(); // Auto close on select
    }
  };

  const handleSaveKey = () => {
    if (keyInput.trim()) {
      setAdminKey(keyInput.trim());
      setHasAdminKey(true);
      setKeyInput('');
    }
  };

  const handleClearKey = () => {
    setAdminKey(null);
    setHasAdminKey(!!getAdminKey());
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(REQUIRED_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const availableTables = Array.from(new Set([...recentTables, ...discoveredTables, ...COMMON_TABLES]));

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
        "fixed top-0 left-0 bottom-0 w-80 bg-cyber-black/95 border-r border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-50 transform transition-transform duration-300 flex flex-col font-sans",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-cyber-dark to-transparent">
            <div className="flex items-center gap-3 text-cyber-cyan">
                <Database size={24} />
                <h2 className="text-xl font-bold tracking-widest uppercase">Data Vault</h2>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            
            {!viewSettings ? (
                <>
                    {/* Search */}
                    <div className="mb-6 relative group">
                        <form onSubmit={handleCustomSubmit}>
                            <input
                            type="text"
                            value={customTable}
                            onChange={(e) => setCustomTable(e.target.value)}
                            placeholder="SEARCH PROTOCOLS..."
                            className="w-full bg-cyber-slate border border-white/10 rounded p-3 pl-10 text-sm text-cyan-100 placeholder-slate-600 focus:outline-none focus:border-cyber-cyan focus:ring-1 focus:ring-cyber-cyan transition-all font-mono"
                            />
                            <Search className="absolute left-3 top-3.5 text-slate-500 group-focus-within:text-cyber-cyan transition-colors" size={14} />
                        </form>
                    </div>

                    {/* Table List */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-1">
                            <span>Available Schemas</span>
                            {isDiscovering && <Loader2 size={10} className="animate-spin" />}
                        </div>
                        
                        {availableTables.map((table) => (
                            <button
                                key={table}
                                onClick={() => { onSelectTable(table); onClose(); }}
                                className={clsx(
                                    "w-full text-left flex items-center justify-between px-4 py-3 rounded border transition-all group",
                                    currentTable === table
                                        ? "bg-cyber-cyan/10 border-cyber-cyan text-cyber-cyan shadow-[0_0_10px_rgba(34,211,238,0.1)]"
                                        : "bg-transparent border-transparent hover:bg-white/5 hover:border-white/10 text-slate-400 hover:text-slate-200"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Table size={14} className={currentTable === table ? "opacity-100" : "opacity-50"} />
                                    <span className="font-mono text-xs">{table}</span>
                                </div>
                                {currentTable === table && <Eye size={12} />}
                            </button>
                        ))}
                    </div>

                    {availableTables.length === 0 && !isDiscovering && (
                        <div className="p-4 border border-dashed border-slate-800 rounded text-center">
                            <AlertCircle className="mx-auto mb-2 text-slate-600" size={20}/>
                            <p className="text-xs text-slate-500">No signals detected.</p>
                        </div>
                    )}
                </>
            ) : (
                <div className="animate-in slide-in-from-left-4 fade-in">
                     <button onClick={() => setViewSettings(false)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white mb-6">
                        <X size={12} /> Back to Tables
                     </button>
                     
                     <div className="mb-8">
                         <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                             <Key size={16} className="text-cyber-purple"/> ADMIN ACCESS
                         </h3>
                         <div className="bg-cyber-slate p-4 rounded border border-white/5 space-y-3">
                             <p className="text-[10px] text-slate-500">
                                 Inject Service Role Key to bypass Row Level Security.
                             </p>
                             <input
                                type="password"
                                value={keyInput}
                                onChange={(e) => setKeyInput(e.target.value)}
                                placeholder={hasAdminKey ? "ACCESS GRANTED" : "Paste JWT Token..."}
                                className="w-full bg-black border border-white/10 rounded p-2 text-xs font-mono text-white focus:border-cyber-purple outline-none"
                             />
                             <div className="flex justify-between">
                                 {localStorage.getItem('supabase_admin_key') && (
                                     <button onClick={handleClearKey} className="text-[10px] text-red-500 hover:text-red-400">REVOKE KEY</button>
                                 )}
                                 <button onClick={handleSaveKey} disabled={!keyInput} className="bg-cyber-purple/20 text-cyber-purple border border-cyber-purple/50 px-3 py-1 rounded text-[10px] font-bold hover:bg-cyber-purple/30 disabled:opacity-50">
                                     AUTHENTICATE
                                 </button>
                             </div>
                         </div>
                     </div>

                     <div>
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                             <Terminal size={16} className="text-emerald-500"/> SYSTEM CONFIG
                         </h3>
                         <div className="relative group">
                            <pre className="text-[9px] font-mono text-emerald-500/80 bg-black p-4 rounded border border-white/10 overflow-x-auto h-48 custom-scrollbar">
                                {REQUIRED_SQL}
                            </pre>
                            <button 
                                onClick={handleCopySql}
                                className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 p-1.5 rounded text-white transition-colors"
                            >
                                {copied ? <Check size={12} /> : <Copy size={12}/>}
                            </button>
                         </div>
                     </div>
                </div>
            )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-cyber-slate">
            <button 
                onClick={() => setViewSettings(!viewSettings)}
                className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-cyber-cyan transition-colors"
            >
                <div className="flex items-center gap-2">
                    {hasAdminKey ? <Unlock size={12} className="text-emerald-500" /> : <Lock size={12} />}
                    <span className="font-mono">{hasAdminKey ? 'ROOT ACCESS' : 'GUEST MODE'}</span>
                </div>
                <Settings size={12} />
            </button>
        </div>

      </div>
    </>
  );
};