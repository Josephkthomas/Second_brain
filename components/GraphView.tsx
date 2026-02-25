import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  RefreshCw, ZoomIn, ZoomOut, X, 
  Anchor, Trophy, Rocket, Brain,
  Info, Scan,
  Zap, Activity, GitMerge, CheckCircle2, AlertTriangle, ArrowRightLeft,
  Cpu, ExternalLink, PlayCircle, Youtube, Database, Share2, Quote, Tag,
  MousePointer2, Magnet, Loader2, Link as LinkIcon,
  Waves, Grid, Network, MessageSquare, Edit3, Save, Trash2, Plus, ArrowRight,
  Search, Move, Sparkles, Hand, Cable, ChevronRight, Layers, Copy, Pin, CheckSquare, Square,
  Keyboard, Command, CornerDownLeft, Filter, User, Bot
} from 'lucide-react';
import { fetchTableData, deleteRows, insertRows, mergeNodes, getCurrentUserId, fetchExistingNodes, fetchRelevantNodes, semanticSearchNodesExtended, getSupabase } from '../services/supabase';
import { generateCrossConnections, suggestRelationship, generateEmbedding, connectAnchorToKnowledgeEnhanced, ConnectionCandidate, BatchScanProgress } from '../services/gemini';
import { promoteToAnchor, demoteFromAnchor } from '../services/anchorService';
import AnchorScanReviewModal from './AnchorScanReviewModal';
import { GraphConfig, GraphNode, GraphLink, LensType } from '../types';
import { LENS_CONFIG } from '../constants';
import { getEntityConfig, ENTITY_THEME } from '../utils/theme';
import clsx from 'clsx';

interface GraphViewProps {
  discoveredTables: string[];
  refreshTrigger?: number;
  activeLens: LensType;
  onLensChange: (lens: LensType) => void;
  onTraceNode?: (node: GraphNode) => void;
  focusNodeId?: string | null;
  focusSource?: string | null;
  onClearSourceFilter?: () => void;
}

const SCHEMA_CONFIG: GraphConfig = {
  nodeTable: 'knowledge_nodes',
  edgeTable: 'knowledge_edges',
  nodeIdCol: 'id',
  nodeLabelCol: 'label',
  nodeTypeCol: 'entity_type',
  edgeSourceCol: 'source_node_id',
  edgeTargetCol: 'target_node_id',
};

// --- EDGE SEMANTICS ---
const REL_SEMANTICS = {
  positive: [
    'leads_to', 'leads to', 'supports', 'authored', 'defines', 'depends_on', 'depends on', 
    'generated', 'achieved', 'enables', 'created', 'produced'
  ],
  negative: [
    'blocks', 'contradicts', 'risks', 'conflicts', 'conflicts_with', 'prevents', 'inhibits', 'challenges'
  ],
  neutral: [
    'part_of', 'part of', 'relates_to', 'relates to', 'mentions', 'owns', 'connected_to', 
    'implicit_tag_match', 'associated_with'
  ]
};

type FlowType = 'positive' | 'negative' | 'neutral';
type InteractionMode = 'select' | 'pan' | 'scan' | 'link' | 'merge' | 'pin';

const MODE_CONFIG: Record<InteractionMode, { label: string; description: string; icon: any }> = {
    select: { label: 'Select', description: 'Click to view, drag to move.', icon: MousePointer2 },
    pan: { label: 'Pan', description: 'Drag canvas. Nodes are locked.', icon: Hand },
    scan: { label: 'Scan', description: 'Hover to X-Ray connections.', icon: Scan },
    link: { label: 'Link', description: 'Drag between nodes to connect.', icon: Cable },
    merge: { label: 'Merge', description: 'Combine two nodes into one.', icon: GitMerge },
    pin: { label: 'Pin', description: 'Drag nodes to lock them in place.', icon: Pin },
};

const SHORTCUTS = [
    { key: 'Space', label: 'Freeze Physics', category: 'View' },
    { key: 'Shift+Drag', label: 'Lasso Select', category: 'Select' },
    { key: 'Cmd+K', label: 'Omnibar', category: 'Nav' },
    { key: 'Alt+Click', label: 'Neural Trace', category: 'AI' },
    { key: 'Cmd+Drag', label: 'Quick Link', category: 'Edit' },
    { key: 'Dbl Click', label: 'Drill Down', category: 'Nav' },
    { key: 'Z (Hold)', label: 'X-Ray Mode', category: 'View' },
    { key: '1-6', label: 'Switch Lens', category: 'View' },
    { key: 'C', label: 'Center View', category: 'View' },
    { key: 'Backspace', label: 'Delete Node', category: 'Edit' },
];

const SPOTLIGHT_RADIUS = 150; // Radius for the "Flashlight" effect

const findShortestPath = (startId: string, endId: string, links: GraphLink[]): Set<string> => {
    const adj = new Map<string, string[]>();
    links.forEach(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        if (!adj.has(s)) adj.set(s, []);
        if (!adj.has(t)) adj.set(t, []);
        adj.get(s)!.push(t);
        adj.get(t)!.push(s);
    });

    const queue: { id: string, path: string[] }[] = [{ id: startId, path: [startId] }];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        if (id === endId) return new Set(path);

        const neighbors = adj.get(id) || [];
        for (const n of neighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, path: [...path, n] });
            }
        }
    }
    return new Set();
};

interface SmartLinkerHUDProps {
  source: GraphNode;
  target: GraphNode;
  onClose: () => void;
  onSuccess: () => void;
}

const SmartLinkerHUD: React.FC<SmartLinkerHUDProps> = ({ source, target, onClose, onSuccess }) => {
  const [relation, setRelation] = useState('');
  const [evidence, setEvidence] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const analyze = async () => {
      setAnalyzing(true);
      try {
        const suggestion = await suggestRelationship(
           { label: source.label, type: source.type, description: String(source.data.description || '') },
           { label: target.label, type: target.type, description: String(target.data.description || '') }
        );
        if (mounted) {
          setRelation(suggestion.relation);
          setEvidence(suggestion.evidence);
        }
      } catch (e) {
        // quiet fail
      } finally {
        if (mounted) setAnalyzing(false);
      }
    };
    analyze();
    return () => { mounted = false; };
  }, [source, target]);

  const handleSave = async () => {
    if (!relation) return;
    setSaving(true);
    await insertRows('knowledge_edges', [{
       source_node_id: source.id,
       target_node_id: target.id,
       relation_type: relation,
       evidence: evidence || 'Manual Link',
       weight: 1
    }]);
    setSaving(false);
    onSuccess();
  };

  return (
    <div className="absolute top-32 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-cyan-500/50 p-5 rounded-xl shadow-2xl w-96 animate-in slide-in-from-top-4 backdrop-blur-md">
       <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2">
             <Cable size={18} className="text-cyan-400"/> New Connection
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18}/></button>
       </div>
       
       <div className="flex items-center justify-between gap-2 mb-6 bg-black/40 p-3 rounded-lg border border-white/5">
           <div className="text-xs text-center flex-1">
              <div className="font-bold text-slate-300 truncate">{source.label}</div>
              <div className="text-[9px] text-slate-500 uppercase">{source.type}</div>
           </div>
           <div className="text-slate-600"><ArrowRight size={14}/></div>
           <div className="text-xs text-center flex-1">
              <div className="font-bold text-slate-300 truncate">{target.label}</div>
              <div className="text-[9px] text-slate-500 uppercase">{target.type}</div>
           </div>
       </div>

       <div className="space-y-3 mb-6">
          <div>
             <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Relation Type</label>
             <div className="relative">
                <input 
                  value={relation}
                  onChange={e => setRelation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  placeholder="e.g. relates_to, blocks, supports..."
                  autoFocus
                />
                {analyzing && <Loader2 size={12} className="absolute right-3 top-2.5 animate-spin text-cyan-500"/>}
             </div>
          </div>
          <div>
             <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Evidence / Context</label>
             <textarea 
                  value={evidence}
                  onChange={e => setEvidence(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none resize-none h-16"
                  placeholder="Why are these connected?"
             />
          </div>
       </div>

       <button 
         onClick={handleSave}
         disabled={saving || !relation}
         className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
       >
          {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
          Confirm Connection
       </button>
    </div>
  )
}

interface MergeNodeHUDProps {
    source: GraphNode;
    target: GraphNode;
    onClose: () => void;
    onSuccess: () => void;
}

const MergeNodeHUD: React.FC<MergeNodeHUDProps> = ({ source, target, onClose, onSuccess }) => {
    const [merging, setMerging] = useState(false);

    const handleMerge = async (keep: GraphNode, discard: GraphNode) => {
        setMerging(true);
        try {
            const { error } = await mergeNodes(keep.id, discard.id);
            if (error) throw error;
            onSuccess();
        } catch (e) {
            console.error("Merge failed", e);
            setMerging(false);
        }
    };

    return (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-purple-500/50 p-6 rounded-xl shadow-2xl w-[500px] animate-in slide-in-from-top-4 backdrop-blur-md">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="bg-purple-500/10 p-2 rounded-lg text-purple-400">
                        <GitMerge size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold">Merge Nodes</h3>
                        <p className="text-xs text-slate-400">Select which node to KEEP. The other will be deleted.</p>
                    </div>
                </div>
                <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={18}/></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Source Card */}
                <div className="border border-slate-700 bg-slate-950/50 rounded-lg p-4 flex flex-col items-center hover:border-emerald-500/50 transition-colors group">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-emerald-400">Source</div>
                    <div className="font-bold text-white text-lg mb-1">{source.label}</div>
                    <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{source.type}</span>
                    <p className="text-xs text-slate-400 mt-3 text-center line-clamp-2">{String(source.data.description || "No description")}</p>
                    
                    <button 
                        onClick={() => handleMerge(source, target)}
                        disabled={merging}
                        className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex items-center justify-center gap-2"
                    >
                        {merging ? <Loader2 className="animate-spin" size={14}/> : <CheckCircle2 size={14} />}
                        Keep This
                    </button>
                </div>

                {/* Target Card */}
                <div className="border border-slate-700 bg-slate-950/50 rounded-lg p-4 flex flex-col items-center hover:border-emerald-500/50 transition-colors group">
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-emerald-400">Target</div>
                    <div className="font-bold text-white text-lg mb-1">{target.label}</div>
                    <span className="text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{target.type}</span>
                    <p className="text-xs text-slate-400 mt-3 text-center line-clamp-2">{String(target.data.description || "No description")}</p>
                    
                    <button 
                        onClick={() => handleMerge(target, source)}
                        disabled={merging}
                        className="mt-4 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex items-center justify-center gap-2"
                    >
                        {merging ? <Loader2 className="animate-spin" size={14}/> : <CheckCircle2 size={14} />}
                        Keep This
                    </button>
                </div>
            </div>
            
            <div className="mt-4 text-[10px] text-center text-slate-500">
                <AlertTriangle size={12} className="inline mr-1 text-amber-500"/>
                Warning: The discarded node will be permanently deleted and its connections re-routed.
            </div>
        </div>
    )
};

interface SuggestedEdge {
    id: string; // temp id
    source: string; // label
    target: string; // label
    sourceId: string;
    targetId: string;
    relation: string;
    evidence: string;
}

interface EnrichmentModalProps {
    orphans: GraphNode[];
    onClose: () => void;
    onSuccess: () => void;
}

const EnrichmentModal: React.FC<EnrichmentModalProps> = ({ orphans, onClose, onSuccess }) => {
    const [step, setStep] = useState<'select' | 'processing' | 'review'>('select');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(orphans.map(n => n.id)));
    const [analyzing, setAnalyzing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [suggestions, setSuggestions] = useState<SuggestedEdge[]>([]);
    const [saving, setSaving] = useState(false);

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === orphans.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(orphans.map(n => n.id)));
    };

    const handleAnalyze = async () => {
        setStep('processing');
        setAnalyzing(true);
        const selectedOrphans = orphans.filter(n => selectedIds.has(n.id));
        const tempSuggestions: SuggestedEdge[] = [];

        try {
            // Fetch context nodes (non-orphans)
            const existingNodes = await fetchTableData('knowledge_nodes', 1, 100); 
            const contextNodes = (existingNodes.data || []).filter((n: any) => !selectedIds.has(n.id));

            // Process in batches
            const batchSize = 5;
            let processed = 0;

            for (let i = 0; i < selectedOrphans.length; i += batchSize) {
                const batch = selectedOrphans.slice(i, i + batchSize);
                
                const edges = await generateCrossConnections(
                    batch.map(n => ({ label: n.label, type: n.type, description: String(n.data.description || '') })),
                    contextNodes.map((n: any) => ({ label: n.label, entity_type: n.entity_type }))
                );

                if (edges.length > 0) {
                     // Resolve IDs
                    edges.forEach(e => {
                        const sourceNode = batch.find(n => n.label === e.source);
                        const targetNode = contextNodes.find((n: any) => n.label === e.target);
                        if (sourceNode && targetNode) {
                            tempSuggestions.push({
                                id: Math.random().toString(36),
                                source: e.source,
                                target: e.target,
                                sourceId: sourceNode.id,
                                targetId: targetNode.id,
                                relation: e.relation,
                                evidence: e.evidence
                            });
                        }
                    });
                }
                
                processed += batch.length;
                setProgress(processed / selectedOrphans.length);
            }
            setSuggestions(tempSuggestions);
            setStep('review');

        } catch (e) {
            console.error(e);
            alert("Analysis failed.");
            setStep('select');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleCommit = async () => {
        if (suggestions.length === 0) return;
        setSaving(true);
        try {
            const dbEdges = suggestions.map(s => ({
                source_node_id: s.sourceId,
                target_node_id: s.targetId,
                relation_type: s.relation,
                evidence: s.evidence,
                weight: 1
            }));
            await insertRows('knowledge_edges', dbEdges);
            onSuccess();
        } catch (e) {
            alert("Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const removeSuggestion = (id: string) => {
        setSuggestions(prev => prev.filter(s => s.id !== id));
    };

    const updateSuggestion = (id: string, field: 'relation' | 'evidence', value: string) => {
        setSuggestions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className={clsx("bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col transition-all overflow-hidden", step === 'review' ? "w-full max-w-4xl max-h-[85vh]" : "max-w-xl w-full max-h-[80vh]")}>
                
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-950">
                    <div className="flex items-center gap-4">
                        <div className="bg-emerald-500/10 p-3 rounded-full text-emerald-500">
                            {step === 'select' ? <Magnet size={24} /> : (step === 'review' ? <GitMerge size={24}/> : <Sparkles size={24} className="animate-spin"/>)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {step === 'select' ? 'Graph Enrichment' : (step === 'processing' ? 'Analyzing Topology' : 'Review Connections')}
                            </h2>
                            <p className="text-slate-400 text-sm">
                                {step === 'select' ? `Found ${orphans.length} isolated nodes to analyze.` : (step === 'processing' ? 'Finding semantic bridges...' : `AI found ${suggestions.length} potential connections.`)}
                            </p>
                        </div>
                    </div>
                    {step !== 'processing' && (
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-slate-500 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-900/50">
                    
                    {step === 'select' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedIds.size} Selected</span>
                                <button onClick={toggleAll} className="text-xs flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300">
                                    {selectedIds.size === orphans.length ? <CheckSquare size={14}/> : <Square size={14}/>}
                                    {selectedIds.size === orphans.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="space-y-3">
                                {orphans.map(node => {
                                    const isSelected = selectedIds.has(node.id);
                                    const { color, icon: Icon } = getEntityConfig(node.type);
                                    return (
                                        <div 
                                            key={node.id} 
                                            onClick={() => toggleSelection(node.id)}
                                            className={clsx(
                                                "flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all group",
                                                isSelected 
                                                    ? "bg-slate-800/80 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                                                    : "bg-slate-950/30 border-slate-800 hover:bg-slate-800"
                                            )}
                                        >
                                            <div className={clsx("mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0", isSelected ? "bg-cyan-600 border-cyan-500 text-white" : "border-slate-600 bg-slate-900")}>
                                                {isSelected && <CheckSquare size={14} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Icon size={16} style={{ color }} />
                                                    <span className={clsx("font-bold text-sm", isSelected ? "text-white" : "text-slate-300")}>{node.label}</span>
                                                    <span className="text-[10px] uppercase bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-500">{node.type}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mb-2 text-[10px] text-slate-500">
                                                    {node.data.source_type && (
                                                        <span className="flex items-center gap-1">
                                                            {node.data.source_type === 'YouTube' ? <Youtube size={10}/> : <Database size={10}/>}
                                                            {node.data.source_type}
                                                        </span>
                                                    )}
                                                    {node.data.created_at && (
                                                        <span>• {new Date(node.data.created_at).toLocaleDateString()}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                                    {String(node.data.description || "No description provided.")}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="flex flex-col items-center justify-center h-full py-12">
                            <div className="relative w-24 h-24 mb-8">
                                <div className="absolute inset-0 border-4 border-slate-800 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
                                <Sparkles className="absolute inset-0 m-auto text-cyan-400 animate-pulse" size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Analyzing Topology</h3>
                            <p className="text-slate-400 text-sm mb-6">Scanning {selectedIds.size} isolated nodes against the knowledge graph...</p>
                            <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress * 100}%` }}></div>
                            </div>
                        </div>
                    )}

                    {step === 'review' && (
                        <div className="space-y-4">
                            {suggestions.length === 0 ? (
                                <div className="text-center py-20 text-slate-500">
                                    <Network size={48} className="mx-auto mb-4 opacity-20"/>
                                    <p>No obvious connections found for the selected nodes.</p>
                                    <button onClick={() => setStep('select')} className="text-cyan-400 text-sm hover:underline mt-2">Try different nodes</button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {suggestions.map((s) => (
                                        <div key={s.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 group hover:border-slate-600 transition-colors relative">
                                            <button 
                                                onClick={() => removeSuggestion(s.id)}
                                                className="absolute top-2 right-2 p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-950/20 rounded opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </button>

                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                                                    <span className="text-sm font-bold text-white truncate" title={s.source}>{s.source}</span>
                                                </div>
                                                
                                                <div className="flex flex-col items-center flex-1">
                                                    <input 
                                                        value={s.relation}
                                                        onChange={(e) => updateSuggestion(s.id, 'relation', e.target.value)}
                                                        className="text-[10px] font-bold text-center uppercase text-indigo-400 bg-indigo-950/30 border border-indigo-500/30 rounded px-2 py-1 w-full focus:border-indigo-400 outline-none"
                                                    />
                                                    <ArrowRight size={12} className="text-slate-600 mt-1"/>
                                                </div>

                                                <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
                                                    <span className="text-sm font-bold text-white truncate text-right" title={s.target}>{s.target}</span>
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                                </div>
                                            </div>

                                            <div className="relative">
                                                <textarea 
                                                    value={s.evidence}
                                                    onChange={(e) => updateSuggestion(s.id, 'evidence', e.target.value)}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-400 focus:text-slate-200 focus:border-slate-600 outline-none resize-none h-16"
                                                />
                                                <Quote size={12} className="absolute top-2 right-2 text-slate-700 pointer-events-none"/>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-white/10 bg-slate-950 flex justify-between items-center">
                    {step === 'review' ? (
                        <button onClick={() => setStep('select')} className="px-4 py-2 text-slate-500 hover:text-white text-sm">Back to Selection</button>
                    ) : (
                        <div>
                            {step === 'select' && <span className="text-xs text-slate-500 italic">Select at least 1 node</span>}
                        </div>
                    )}

                    <div className="flex gap-3">
                        {step === 'select' && (
                            <button 
                                onClick={handleAnalyze} 
                                disabled={selectedIds.size === 0}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={16}/> Analyze Selected
                            </button>
                        )}
                        
                        {step === 'review' && suggestions.length > 0 && (
                            <button 
                                onClick={handleCommit}
                                disabled={saving}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.2)] disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle2 size={16}/>}
                                Commit {suggestions.length} Connections
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
};

interface ConnectionEditorModalProps {
    currentNode: GraphNode;
    allNodes: GraphNode[];
    allEdges: GraphLink[];
    onClose: () => void;
    onUpdate: () => void;
    onEnterLinkerMode: () => void;
    onEnterMergeMode: () => void;
}

const ConnectionEditorModal: React.FC<ConnectionEditorModalProps> = ({ currentNode, allNodes, allEdges, onClose, onUpdate, onEnterLinkerMode, onEnterMergeMode }) => {
    const [connectedEdges, setConnectedEdges] = useState<GraphLink[]>([]);
    
    useEffect(() => {
        const edges = allEdges.filter(e => {
            const sId = typeof e.source === 'object' ? (e.source as any).id : e.source;
            const tId = typeof e.target === 'object' ? (e.target as any).id : e.target;
            return sId === currentNode.id || tId === currentNode.id;
        });
        setConnectedEdges(edges);
    }, [currentNode, allEdges]);

    const handleDelete = async (edgeId?: string) => {
        if (!edgeId) return;
        if (!confirm("Remove this connection?")) return;
        await deleteRows('knowledge_edges', [edgeId]);
        onUpdate();
    };

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-950/50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                             <Edit3 size={18} />
                         </div>
                         <div>
                             <h3 className="text-white font-bold">Edit Connections</h3>
                             <p className="text-xs text-slate-500">Managing relationships for <span className="text-white">{currentNode.label}</span></p>
                         </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20}/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                    {connectedEdges.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                            <Network size={32} className="mx-auto mb-2 opacity-20"/>
                            <p>No connections found.</p>
                        </div>
                    ) : (
                        connectedEdges.map(edge => {
                             const sId = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
                             const tId = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;
                             const isOutgoing = sId === currentNode.id;
                             const otherId = isOutgoing ? tId : sId;
                             const otherNode = allNodes.find(n => n.id === otherId);
                             
                             if (!otherNode) return null;

                             return (
                                 <div key={edge.id} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center justify-between group hover:border-slate-600 transition-colors">
                                     <div className="flex items-center gap-3">
                                         <div className={clsx("flex items-center gap-2 text-xs font-bold uppercase px-2 py-1 rounded border", isOutgoing ? "bg-cyan-900/20 border-cyan-900/50 text-cyan-400" : "bg-purple-900/20 border-purple-900/50 text-purple-400")}>
                                             {isOutgoing ? <ArrowRight size={12}/> : <ArrowRight size={12} className="rotate-180"/>}
                                             {isOutgoing ? "Outgoing" : "Incoming"}
                                         </div>
                                         <div className="flex flex-col">
                                             <div className="flex items-center gap-2">
                                                 <span className="text-sm font-bold text-slate-200">{otherNode.label}</span>
                                                 <span className="text-[10px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">{otherNode.type}</span>
                                             </div>
                                             <div className="flex items-center gap-2 text-xs text-slate-500">
                                                 <span className="font-mono text-indigo-400">{edge.type}</span>
                                                 {edge.data?.evidence && <span className="italic truncate max-w-[200px]">- "{edge.data.evidence}"</span>}
                                             </div>
                                         </div>
                                     </div>
                                     <button 
                                        onClick={() => handleDelete(edge.id)}
                                        className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                                     >
                                         <Trash2 size={16} />
                                     </button>
                                 </div>
                             )
                        })
                    )}
                </div>

                <div className="p-4 border-t border-white/10 bg-slate-950/50 rounded-b-xl flex justify-between items-center gap-3">
                    <span className="text-xs text-slate-500">{connectedEdges.length} connections</span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={onEnterMergeMode}
                            className="bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 transition-all"
                        >
                            <GitMerge size={16} /> Merge with...
                        </button>
                        <button 
                            onClick={onEnterLinkerMode}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded text-sm font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(8,145,178,0.2)]"
                        >
                            <Plus size={16} /> Add New Connection
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

export const GraphView: React.FC<GraphViewProps> = ({ 
    discoveredTables, 
    refreshTrigger = 0, 
    activeLens, 
    onLensChange, 
    onTraceNode, 
    focusNodeId,
    focusSource,
    onClearSourceFilter,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, any> | null>(null);
  
  const [config, setConfig] = useState<GraphConfig>(SCHEMA_CONFIG);
  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] }>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImplicit, setShowImplicit] = useState(true); 
  const [isMissingTables, setIsMissingTables] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // View States
  const [focusedAnchorId, setFocusedAnchorId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [xRayMode, setXRayMode] = useState(false);
  
  // New: Tag Filtering
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [showTagMenu, setShowTagMenu] = useState(false);

  // Synaptic Mode & Flow Lenses
  const [edgeMode, setEdgeMode] = useState<'standard' | 'synaptic'>('synaptic');
  const [activeFlowLens, setActiveFlowLens] = useState<FlowType | null>(null);

  // Interaction Modes
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [showModeMenu, setShowModeMenu] = useState(false);

  // Lasso & Pathfinding State
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [pathfindingPath, setPathfindingPath] = useState<Set<string>>(new Set());

  // Enrichment / Orphan / Editing States
  const [orphans, setOrphans] = useState<GraphNode[]>([]);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: GraphNode } | null>(null);

  // Anchor Rescan State (for scanning existing anchors for new connections)
  const [isRescanScanning, setIsRescanScanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState<BatchScanProgress | null>(null);
  const [rescanConnections, setRescanConnections] = useState<ConnectionCandidate[]>([]);
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [rescanAnchorNode, setRescanAnchorNode] = useState<GraphNode | null>(null);
  const [rescanStatusMessage, setRescanStatusMessage] = useState('');

  // Omnibar State
  const [omnibarOpen, setOmnibarOpen] = useState(false);
  const [omnibarQuery, setOmnibarQuery] = useState('');

  // --- LINKER MODE STATE ---
  const [linkerMode, setLinkerMode] = useState<{
    active: boolean;
    source: GraphNode | null;
    target: GraphNode | null;
    mousePos: { x: number; y: number } | null;
  }>({ active: false, source: null, target: null, mousePos: null });

  // --- ACTIONS & HELPERS ---
  const focusCameraOn = (node: GraphNode) => {
      if (!svgRef.current || !zoomRef.current || !node.x || !node.y) return;
      const width = containerRef.current?.clientWidth || 1000;
      const height = containerRef.current?.clientHeight || 800;
      
      const scale = 2;
      const x = -node.x * scale + width / 2;
      const y = -node.y * scale + height / 2;
      
      d3.select(svgRef.current).transition().duration(750)
        .call(zoomRef.current.transform, d3.zoomIdentity.translate(x, y).scale(scale));
  };

  const resetCamera = () => {
      if (!svgRef.current || !zoomRef.current) return;
      const width = containerRef.current?.clientWidth || 1000;
      const height = containerRef.current?.clientHeight || 800;
      
      d3.select(svgRef.current).transition().duration(750)
        .call(zoomRef.current.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.8));
  };

  const enterAnchorMode = (anchorId: string) => {
      onLensChange('AnchorFocus');
      setFocusedAnchorId(anchorId);
  };

  const exitAnchorMode = () => {
      onLensChange('All');
      setFocusedAnchorId(null);
  };

  // Rescan anchor for new connections
  const handleRescanAnchor = async (anchor: GraphNode) => {
    setRescanAnchorNode(anchor);
    setIsRescanScanning(true);
    setRescanStatusMessage('Generating embedding...');
    setRescanProgress({
      phase: 'semantic_search',
      totalBatches: 1,
      currentBatch: 1,
      nodesProcessed: 0,
      totalNodes: 200,
      connectionsFound: 0
    });

    try {
      // Step 1: Get or generate embedding for anchor
      const embeddingText = `${anchor.label}: ${anchor.data.description || ''}`;
      let embedding: number[] = anchor.data.embedding || [];

      if (!embedding || embedding.length === 0) {
        embedding = await generateEmbedding(embeddingText);
        // Save embedding to database
        if (embedding.length > 0) {
          const supabase = getSupabase();
          await supabase.from('knowledge_nodes').update({ embedding }).eq('id', anchor.id);
          console.log('[Anchor Rescan] Generated and saved embedding');
        }
      }

      setRescanStatusMessage('Searching database for related knowledge...');

      // Step 2: HYBRID RETRIEVAL - semantic + keyword + recent
      const nodeMap = new Map<string, { id: string; label: string; entity_type: string; description?: string; similarity_score?: number }>();

      // Semantic search
      if (embedding && embedding.length > 0) {
        const semanticResults = await semanticSearchNodesExtended(embedding, 0.15, 150);
        semanticResults.forEach(n => {
          if (n.id !== anchor.id) { // Exclude the anchor itself
            nodeMap.set(n.id, {
              id: n.id,
              label: n.label,
              entity_type: n.entity_type,
              description: n.description,
              similarity_score: n.similarity
            });
          }
        });
        console.log(`[Anchor Rescan] Semantic search found ${semanticResults.length} nodes`);
      }

      // Keyword search
      const anchorText = `${anchor.label} ${anchor.data.description || ''}`;
      const keywords = anchorText
        .toLowerCase()
        .split(/[\s,.\-_:;()]+/)
        .filter(word => word.length > 3)
        .filter(word => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been'].includes(word));

      if (keywords.length > 0) {
        const keywordResults = await fetchRelevantNodes(keywords.slice(0, 10));
        keywordResults.forEach(n => {
          if (n.id !== anchor.id && !nodeMap.has(n.id)) {
            nodeMap.set(n.id, {
              id: n.id,
              label: n.label,
              entity_type: n.entity_type,
              description: n.description,
              similarity_score: 0.5
            });
          }
        });
        console.log(`[Anchor Rescan] Keyword search found ${keywordResults.length} additional nodes`);
      }

      // Recent nodes as fallback
      if (nodeMap.size < 50) {
        const recentNodes = await fetchExistingNodes();
        recentNodes.forEach(n => {
          if (n.id !== anchor.id && !nodeMap.has(n.id)) {
            nodeMap.set(n.id, {
              id: n.id,
              label: n.label,
              entity_type: n.entity_type,
              description: n.description,
              similarity_score: 0.3
            });
          }
        });
        console.log(`[Anchor Rescan] Added ${recentNodes.length} recent nodes as supplement`);
      }

      // Convert and sort
      let nodesToAnalyze = Array.from(nodeMap.values())
        .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
        .slice(0, 200);

      console.log(`[Anchor Rescan] Total nodes to analyze: ${nodesToAnalyze.length}`);

      if (nodesToAnalyze.length === 0) {
        setIsRescanScanning(false);
        setRescanProgress(null);
        setRescanStatusMessage('');
        return;
      }

      // Step 3: AI Analysis
      setRescanStatusMessage('Analyzing connections with AI...');
      setRescanProgress({
        phase: 'ai_analysis',
        totalBatches: 1,
        currentBatch: 1,
        nodesProcessed: 0,
        totalNodes: nodesToAnalyze.length,
        connectionsFound: 0
      });

      const connections = await connectAnchorToKnowledgeEnhanced(
        { label: anchor.label, type: anchor.type, description: anchor.data.description },
        nodesToAnalyze
      );

      console.log(`[Anchor Rescan] AI found ${connections.length} connections`);

      // Show review modal
      setRescanConnections(connections);
      setShowRescanModal(true);
      setIsRescanScanning(false);
      setRescanProgress(null);
      setRescanStatusMessage('');

    } catch (err: any) {
      console.error('[Anchor Rescan] Error:', err);
      setError(err.message || 'Rescan failed');
      setIsRescanScanning(false);
      setRescanProgress(null);
      setRescanStatusMessage('');
    }
  };

  // Confirm selected connections from rescan
  const handleConfirmRescanConnections = async (selectedConnections: ConnectionCandidate[]) => {
    const anchor = rescanAnchorNode;
    if (!anchor) return;

    setShowRescanModal(false);

    try {
      const supabase = getSupabase();
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');

      if (selectedConnections.length > 0) {
        const edgesToInsert = selectedConnections.map(c => ({
          source_node_id: anchor.id,
          target_node_id: c.target_node_id,
          relation_type: c.relation.toLowerCase().replace(/\s+/g, '_'),
          evidence: c.evidence,
          weight: c.confidence,
          user_id: userId,
        }));

        await supabase.from('knowledge_edges').insert(edgesToInsert);
        console.log(`[Anchor Rescan] Saved ${selectedConnections.length} connections`);

        // Refresh graph to show new connections
        loadGraphData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save connections');
    } finally {
      setRescanAnchorNode(null);
      setRescanConnections([]);
    }
  };

  // Cancel rescan review
  const handleCancelRescan = () => {
    setShowRescanModal(false);
    setRescanConnections([]);
    setRescanAnchorNode(null);
    setRescanProgress(null);
  };

  const availableAnchors = useMemo(() => {
     return graphData.nodes.filter(n => n.type === 'Anchor' || n.data.is_anchor);
  }, [graphData.nodes]);

  // Extract unique tags for filter menu
  const { aiTags, userTags } = useMemo(() => {
      const ai = new Set<string>();
      const user = new Set<string>();
      
      graphData.nodes.forEach(n => {
          if (n.data.tags && Array.isArray(n.data.tags)) {
              (n.data.tags as any[]).forEach((t: any) => ai.add(String(t)));
          }
          if (n.data.user_tags && Array.isArray(n.data.user_tags)) {
              (n.data.user_tags as any[]).forEach((t: any) => user.add(String(t)));
          }
      });
      return { 
          aiTags: Array.from(ai).sort(), 
          userTags: Array.from(user).sort() 
      };
  }, [graphData.nodes]);

  // Sync internal flow state with parent lens prop
  useEffect(() => {
    if (activeLens !== 'Pathways') {
        setActiveFlowLens(null);
    }
    if (activeLens !== 'AnchorFocus') {
        setFocusedAnchorId(null);
    }
  }, [activeLens]);

  // Handle Focus Request from Parent
  useEffect(() => {
    if (focusNodeId && graphData.nodes.length > 0) {
        const node = graphData.nodes.find(n => n.id === focusNodeId);
        if (node) {
            setSelectedNode({ ...node });
            focusCameraOn(node);
        }
    }
  }, [focusNodeId, graphData.nodes]);

  // Sync Interaction Mode with Linker State
  useEffect(() => {
      if (interactionMode === 'link' || interactionMode === 'merge') {
          setLinkerMode(prev => ({ ...prev, active: true }));
          // Reset internal state to avoid stale references
          setLinkerMode(prev => ({ active: true, source: null, target: null, mousePos: null }));
      } else {
          setLinkerMode({ active: false, source: null, target: null, mousePos: null });
      }
  }, [interactionMode]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

          switch(e.key) {
              case ' ':
                  e.preventDefault();
                  setIsPaused(prev => !prev);
                  break;
              case 'c':
              case 'C':
                  resetCamera();
                  break;
              case 'z':
              case 'Z':
                  setXRayMode(true);
                  break;
              case 'Backspace':
              case 'Delete':
                  if (selectedNode) {
                      handleDeleteNode(selectedNode);
                  }
                  break;
              case 'k':
                  if (e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      setOmnibarOpen(prev => !prev);
                  }
                  break;
              case '1': onLensChange('All'); break;
              case '2': onLensChange('Social'); break;
              case '3': onLensChange('Strategic'); break;
              case '4': onLensChange('Operational'); break;
              case '5': onLensChange('Creative'); break;
              case '6': onLensChange('Pathways'); break;
          }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
          if (e.key === 'z' || e.key === 'Z') {
              setXRayMode(false);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
      };
  }, [selectedNode, graphData]);

  const loadGraphData = async () => {
    setLoading(true);
    setError(null);
    setIsMissingTables(false);

    try {
      const { data: nodesData, error: nodesError } = await fetchTableData(config.nodeTable, 1, 2000);
      
      if (nodesError) {
        const msg = nodesError.message || JSON.stringify(nodesError);
        if (msg.includes('does not exist') || nodesError.code === '42P01') {
          setIsMissingTables(true);
          throw new Error("Tables not found"); 
        }
        throw new Error(`Failed to fetch nodes: ${msg}`);
      }
      
      const { data: edgesData, error: edgesError } = await fetchTableData(config.edgeTable, 1, 5000);
      if (edgesError) {
        const msg = edgesError.message || JSON.stringify(edgesError);
        throw new Error(`Failed to fetch edges: ${msg}`);
      }

      if (!nodesData) throw new Error("No data returned from database.");

      const nodes: GraphNode[] = nodesData.map(row => {
        const id = String(row[config.nodeIdCol]);
        const existingNode = graphData.nodes.find(n => n.id === id);
        
        return {
            id,
            label: String(row[config.nodeLabelCol] || row[config.nodeIdCol]),
            type: String(row[config.nodeTypeCol] || 'default'),
            data: row,
            val: 1, 
            x: existingNode ? existingNode.x : Math.random() * 800 - 400,
            y: existingNode ? existingNode.y : Math.random() * 600 - 300,
            fx: existingNode ? existingNode.fx : null,
            fy: existingNode ? existingNode.fy : null,
            // Capture source_id for filtering
            source_id: row['source_id'],
            user_tags: row['user_tags'] || []
        };
      });

      const nodeMap = new Set(nodes.map(n => n.id));

      const rawLinks = edgesData || [];
      const links: GraphLink[] = rawLinks
        .filter(row => {
          const source = String(row[config.edgeSourceCol]);
          const target = String(row[config.edgeTargetCol]);
          return nodeMap.has(source) && nodeMap.has(target);
        })
        .map(row => ({
          id: row['id'], 
          source: String(row[config.edgeSourceCol]),
          target: String(row[config.edgeTargetCol]),
          type: row['relation_type'] || 'connected_to',
          data: row
        }));

      const implicitLinks: GraphLink[] = [];
      if (showImplicit) {
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
             const n1 = nodes[i];
             const n2 = nodes[j];
             const tags1 = n1.data.tags || [];
             const tags2 = n2.data.tags || [];
             if (Array.isArray(tags1) && Array.isArray(tags2)) {
               const shared = tags1.filter((t: string) => tags2.includes(t));
               if (shared.length > 0) {
                 implicitLinks.push({
                   source: n1.id,
                   target: n2.id,
                   type: 'implicit_tag_match',
                   data: { evidence: `Shared Tags: ${shared.join(', ')}` }
                 });
               }
             }
          }
        }
      }

      const allLinks = [...links, ...implicitLinks];

      const degreeCount = new Map<string, number>();
      allLinks.forEach(l => {
        const s = typeof l.source === 'object' ? (l.source as any).id : l.source;
        const t = typeof l.target === 'object' ? (l.target as any).id : l.target;
        
        degreeCount.set(s, (degreeCount.get(s) || 0) + 1);
        degreeCount.set(t, (degreeCount.get(t) || 0) + 1);
      });

      nodes.forEach(n => {
        n.val = degreeCount.get(n.id) || 0;
      });

      setGraphData({ nodes, links: allLinks });
      
      const isolated = nodes.filter(n => (degreeCount.get(n.id) || 0) === 0);
      setOrphans(isolated);

    } catch (err: any) {
      if (err.message !== "Tables not found") {
        console.error(err);
        setError(err.message || "Failed to load graph data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraphData();
  }, [config.nodeTable, config.edgeTable, showImplicit, refreshTrigger]);

  const isAnchorNode = (d: GraphNode) => d.type === 'Anchor' || d.data.is_anchor === true;
  
  const getAnchorDetails = (d: GraphNode) => {
    if (!isAnchorNode(d)) return null;
    const desc = d.data.description || '';
    if (desc.includes('[Type: Project]')) return { type: 'Project', color: '#3b82f6', icon: '🚀' }; 
    if (desc.includes('[Type: Goal]')) return { type: 'Goal', color: '#eab308', icon: '🏆' }; 
    if (desc.includes('[Type: Topic]')) return { type: 'Topic', color: '#22c55e', icon: '🧠' }; 
    return { type: 'Anchor', color: '#f59e0b', icon: '⚓' }; 
  };

  const getSourceStyle = (d: GraphNode) => {
    const sourceType = (d.data.source_type || '').toLowerCase();
    if (sourceType === 'youtube') return { stroke: '#ef4444', label: 'YouTube Source' }; 
    if (sourceType === 'meeting') return { stroke: '#06b6d4', label: 'Meeting Source' }; 
    if (sourceType === 'note') return { stroke: '#10b981', label: 'Note Source' }; 
    return { stroke: getEntityConfig(d.type).color, label: 'Manual/Unknown' }; 
  };

  const getLinkCategory = (type: string | undefined): FlowType | 'unknown' => {
      const t = (type || '').toLowerCase();
      if (REL_SEMANTICS.negative.some(k => t.includes(k))) return 'negative';
      if (REL_SEMANTICS.positive.some(k => t.includes(k))) return 'positive';
      if (t === 'implicit_tag_match' || REL_SEMANTICS.neutral.some(k => t.includes(k))) return 'neutral';
      return 'neutral';
  };

  const getEdgeColor = (type: string | undefined) => {
      if (edgeMode === 'standard') {
        return type === 'implicit_tag_match' ? "#64748b" : "#475569";
      }
      
      const cat = getLinkCategory(type);
      if (cat === 'negative') return "#ef4444"; 
      if (cat === 'positive') return "#06b6d4"; 
      return "#475569"; 
  };

  const togglePin = (node: GraphNode) => {
      if (node.fx != null) {
          node.fx = null;
          node.fy = null;
      } else {
          node.fx = node.x;
          node.fy = node.y;
      }
      if (svgRef.current) {
          const nodeGroup = d3.select(svgRef.current).selectAll(".node-group").filter((d: any) => d.id === node.id);
          nodeGroup.select(".pin-indicator").attr("opacity", node.fx != null ? 1 : 0);
      }
      setSelectedNode(prev => prev && prev.id === node.id ? { ...node } : prev);
  };

  const handleDeleteNode = async (node: GraphNode) => {
      if (confirm(`Delete node "${node.label}"? This cannot be undone.`)) {
          await deleteRows('knowledge_nodes', [node.id]);
          loadGraphData();
          setSelectedNode(null);
      }
  };

  const handleToggleAnchor = async (node: GraphNode) => {
    const isCurrentlyAnchor = node.data?.is_anchor || node.type === 'Anchor';
    if (isCurrentlyAnchor) {
      const { error } = await demoteFromAnchor(node.id);
      if (!error) {
        loadGraphData();
        setSelectedNode(null);
      }
    } else {
      const { error } = await promoteToAnchor(node.id);
      if (!error) {
        loadGraphData();
        setSelectedNode(null);
      }
    }
    setContextMenu(null);
  };

  const { visibilityMap, depthMap } = useMemo(() => {
     const visMap = new Map<string, 'focus' | 'context' | 'hidden'>();
     const depMap = new Map<string, number>(); 
     
     // 1. Tag Filtering (Highest Priority Filter)
     if (activeTagFilter) {
         graphData.nodes.forEach(n => {
             const hasTag = (n.data.tags?.includes(activeTagFilter)) || (n.data.user_tags?.includes(activeTagFilter));
             if (hasTag) {
                 visMap.set(n.id, 'focus');
                 depMap.set(n.id, 0);
             } else {
                 visMap.set(n.id, 'context');
             }
         });
         return { visibilityMap: visMap, depthMap: depMap };
     }

     if (focusSource) {
         graphData.nodes.forEach(n => {
             const matchesSourceId = n.source_id === focusSource;
             if (matchesSourceId) {
                 visMap.set(n.id, 'focus');
                 depMap.set(n.id, 0);
             } else {
                 visMap.set(n.id, 'context'); 
             }
         });
         return { visibilityMap: visMap, depthMap: depMap };
     }

     if (activeLens === 'Pathways' && activeFlowLens) {
        graphData.nodes.forEach(n => visMap.set(n.id, 'hidden'));
        graphData.links.forEach(link => {
           const type = link.type;
           const cat = getLinkCategory(type);
           if (cat === activeFlowLens) {
               const sId = typeof link.source === 'object' ? (link.source as any).id : link.source;
               const tId = typeof link.target === 'object' ? (link.target as any).id : link.target;
               visMap.set(sId, 'focus');
               visMap.set(tId, 'focus');
           }
        });
        return { visibilityMap: visMap, depthMap: depMap };
     } else if (activeLens === 'Pathways' && !activeFlowLens) {
        graphData.nodes.forEach(n => visMap.set(n.id, 'context'));
        return { visibilityMap: visMap, depthMap: depMap };
     }

     if (activeLens === 'AnchorFocus' && focusedAnchorId) {
        const MAX_DEPTH = 3;
        const queue: { id: string, depth: number }[] = [{ id: focusedAnchorId, depth: 0 }];
        const visited = new Set<string>();
        visited.add(focusedAnchorId);
        
        visMap.set(focusedAnchorId, 'focus');
        depMap.set(focusedAnchorId, 0);

        const adj = new Map<string, string[]>();
        graphData.links.forEach(link => {
           const sId = typeof link.source === 'object' ? (link.source as any).id : link.source;
           const tId = typeof link.target === 'object' ? (link.target as any).id : link.target;
           if (!adj.has(sId)) adj.set(sId, []);
           if (!adj.has(tId)) adj.set(tId, []);
           adj.get(sId)!.push(tId);
           adj.get(tId)!.push(sId);
        });

        while (queue.length > 0) {
           const { id, depth } = queue.shift()!;
           if (depth >= MAX_DEPTH) continue;

           const neighbors = adj.get(id) || [];
           for (const neighborId of neighbors) {
              if (!visited.has(neighborId)) {
                 visited.add(neighborId);
                 const newDepth = depth + 1;
                 const status = newDepth <= 1 ? 'focus' : 'context';
                 visMap.set(neighborId, status);
                 depMap.set(neighborId, newDepth);
                 queue.push({ id: neighborId, depth: newDepth });
              }
           }
        }
        return { visibilityMap: visMap, depthMap: depMap };
     }

     if (activeLens !== 'All' && activeLens !== 'Pathways') {
        const config = LENS_CONFIG[activeLens];
        const focusIds = new Set(
            graphData.nodes
               .filter(n => config.types.includes(n.type) || (activeLens === 'Strategic' && isAnchorNode(n)))
               .map(n => n.id)
        );

        graphData.nodes.forEach(n => {
            if (focusIds.has(n.id)) {
                visMap.set(n.id, 'focus');
            }
        });

        graphData.links.forEach(link => {
           const sId = typeof link.source === 'object' ? (link.source as any).id : link.source;
           const tId = typeof link.target === 'object' ? (link.target as any).id : link.target;
           const sStatus = visMap.get(sId);
           const tStatus = visMap.get(tId);
           if (sStatus === 'focus' && !tStatus) visMap.set(tId, 'context');
           if (tStatus === 'focus' && !sStatus) visMap.set(sId, 'context');
        });
        return { visibilityMap: visMap, depthMap: depMap };
     }

     graphData.nodes.forEach(n => visMap.set(n.id, 'focus'));
     return { visibilityMap: visMap, depthMap: depMap };

  }, [graphData, activeLens, focusedAnchorId, activeFlowLens, focusSource, activeTagFilter]);

  const getLensStatus = (node: GraphNode | { id: string }): 'focus' | 'context' | 'hidden' | undefined => {
      return visibilityMap.get(node.id);
  };

  const getDepth = (node: GraphNode | { id: string }): number | undefined => {
      return depthMap.get(node.id);
  };

  const handleZoom = (factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    (d3.select(svgRef.current).transition().duration(300) as any).call(zoomRef.current.scaleBy, factor);
  };

  const isYouTubeNode = (node: GraphNode | null) => {
    if (!node?.data?.source_type) return false;
    return String(node.data.source_type).toLowerCase() === 'youtube';
  };

  const getAnchorIconComponent = (node: GraphNode) => {
     const details = getAnchorDetails(node);
     if (!details) return Anchor;
     if (details.type === 'Goal') return Trophy;
     if (details.type === 'Project') return Rocket;
     if (details.type === 'Topic') return Brain;
     return Anchor;
  };

  const CurrentModeIcon = MODE_CONFIG[interactionMode].icon;

  const filteredNodes = useMemo(() => {
     if (!omnibarQuery) return [];
     return graphData.nodes.filter(n => n.label.toLowerCase().includes(omnibarQuery.toLowerCase())).slice(0, 10);
  }, [omnibarQuery, graphData.nodes]);

  // Re-run D3 simulation effect
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const width = containerRef.current?.clientWidth || 1000;
    const height = containerRef.current?.clientHeight || 800;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .style("background-color", "transparent");

    const defs = svg.append("defs");
    
    // Standard Glow
    const filter = defs.append("filter").attr("id", "glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "coloredBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Subtle glow for source-focused nodes
    const goldFilter = defs.append("filter").attr("id", "gold-glow");
    goldFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "coloredBlur");
    const goldMerge = goldFilter.append("feMerge");
    goldMerge.append("feMergeNode").attr("in", "coloredBlur");
    goldMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Subtle pulse ring animation for source-focused nodes
    defs.append("style").text(`
      @keyframes pulse-ring {
        0% { r: 0; opacity: 0.3; stroke-width: 1.5; }
        100% { r: 22; opacity: 0; stroke-width: 0.3; }
      }
      .pulse-ring { animation: pulse-ring 3s ease-out infinite; }
      .pulse-ring-delayed { animation: pulse-ring 3s ease-out 1.5s infinite; }
    `);

    defs.selectAll("marker")
      .data(["end"])
      .join("marker")
      .attr("id", "arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20) 
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#64748b");

    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, any>()
      .scaleExtent([0.1, 8])
      .filter((event: any) => {
         return !event.shiftKey && !event.ctrlKey && !event.metaKey;
      })
      .on("zoom", (event: any) => {
          g.attr("transform", event.transform.toString());
      });
    
    zoomRef.current = zoom;
    svg.call(zoom);
    // Initial centering
    // svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.8));

    svg.on("mousedown", (event: any) => {
        if (event.shiftKey) {
            const [x, y] = d3.pointer(event);
            setSelectionRect({ x, y, width: 0, height: 0 });
            setSelectedNodes(new Set()); 
        } 
        else if (event.detail === 2) {
            exitAnchorMode();
            resetCamera();
        }
    });

    // GENERAL MOUSEMOVE (Includes Selection Rect & Spotlight Logic)
    svg.on("mousemove", (event: any) => {
        // 1. Selection Rect Logic
        if (selectionRect && event.shiftKey) {
            const [currX, currY] = d3.pointer(event);
            setSelectionRect(prev => {
                if(!prev) return null;
                return {
                    x: prev.x,
                    y: prev.y,
                    width: currX - prev.x,
                    height: currY - prev.y
                };
            });
        }

        // 2. Spotlight Logic for Filtered Context (tag filter only — source filter uses static dimming)
        if (!focusSource && activeTagFilter) {
            const transform = d3.zoomTransform(svg.node() as Element);
            const [px, py] = d3.pointer(event);
            const gx = transform.invertX(px);
            const gy = transform.invertY(py);

            // Update Nodes opacity based on spotlight
            node.attr("opacity", (d: any) => {
                const status = getLensStatus(d);
                if (status === 'focus') return 1;
                if (status === 'hidden') return 0.02;

                // Check distance for Context nodes
                const dist = Math.hypot(d.x - gx, d.y - gy);
                return dist < SPOTLIGHT_RADIUS ? 1 : 0.2;
            });

            // Update Text Labels based on spotlight
            node.select("text")
                .attr("opacity", (d: any) => {
                    const status = getLensStatus(d);
                    if (status === 'focus') return 1;

                    const dist = Math.hypot(d.x - gx, d.y - gy);
                    return dist < SPOTLIGHT_RADIUS ? 1 : 0.2;
                });

            // Update Links based on spotlight
            linkVisible.attr("stroke-opacity", (d: any) => {
                 const sStatus = getLensStatus(d.source);
                 const tStatus = getLensStatus(d.target);

                 // If both are focused, keep high opacity
                 if (sStatus === 'focus' && tStatus === 'focus') return 1;

                 // If either node is in spotlight, increase opacity
                 const sDist = Math.hypot(d.source.x - gx, d.source.y - gy);
                 const tDist = Math.hypot(d.target.x - gx, d.target.y - gy);

                 if (sDist < SPOTLIGHT_RADIUS || tDist < SPOTLIGHT_RADIUS) return 0.6;

                 return 0.1;
            });
        }
    });

    svg.on("mouseup", () => {
        if (selectionRect) {
            const transform = d3.zoomTransform(svg.node()!);
            
            const rx = selectionRect.width < 0 ? selectionRect.x + selectionRect.width : selectionRect.x;
            const ry = selectionRect.height < 0 ? selectionRect.y + selectionRect.height : selectionRect.y;
            const rw = Math.abs(selectionRect.width);
            const rh = Math.abs(selectionRect.height);

            const nodesInSelection: string[] = [];
            
            graphData.nodes.forEach(n => {
               if (n.x !== undefined && n.y !== undefined) {
                   const screenX = transform.applyX(n.x);
                   const screenY = transform.applyY(n.y);
                   
                   if (screenX >= rx && screenX <= rx + rw && screenY >= ry && screenY <= ry + rh) {
                       nodesInSelection.push(n.id);
                   }
               }
            });

            setSelectedNodes(new Set(nodesInSelection));
            setSelectionRect(null); 
        }
    });

    // Handle background click to deselect
    svg.on("click", () => {
        if (!linkerMode.active) {
            setSelectedNode(null);
            setSelectedEdge(null);
            setPathfindingPath(new Set());
            setSelectedNodes(new Set());
        }
    });

    const maxDegree = d3.max(graphData.nodes, d => d.val) || 1;
    const radiusScale = d3.scaleSqrt().domain([0, maxDegree]).range([5, 25]); 

    const simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength((d: any) => {
         const status = getLensStatus(d as GraphNode);
         if (status === 'hidden') return -10; 
         
         const isAnchor = isAnchorNode(d as GraphNode);
         const base = -300 - (radiusScale(d.val || 0) * 10);
         
         if (activeLens === 'AnchorFocus') {
             if (d.id === focusedAnchorId) return -1000; 
             return -500;
         }
         return isAnchor ? base * 4 : base; 
      }))
      .force("collide", d3.forceCollide().radius((d: any) => {
         const isAnchor = isAnchorNode(d as GraphNode);
         return (isAnchor ? 50 : radiusScale(d.val || 0)) + 15;
      }))
      .force("center", d3.forceCenter(0, 0).strength(0.05));

    if (isPaused) simulation.stop();

    const linkGroup = g.append("g").attr("class", "links");
    
    const linkVisible = linkGroup.selectAll("line")
      .data(graphData.links)
      .join("line")
      .attr("stroke", d => {
          const s = typeof d.source === 'object' ? (d.source as any).id : d.source;
          const t = typeof d.target === 'object' ? (d.target as any).id : d.target;
          
          if (focusSource || activeTagFilter) {
            const sNode = graphData.nodes.find(n => n.id === s);
            const tNode = graphData.nodes.find(n => n.id === t);
            if (sNode && tNode && getLensStatus(sNode) === 'focus' && getLensStatus(tNode) === 'focus') {
                return "#818cf8"; // Soft indigo for focused edges
            }
          }

          if (pathfindingPath.has(s) && pathfindingPath.has(t)) return "#fde047"; 
          return getEdgeColor(d.type);
      })
      .attr("stroke-width", d => {
          const s = typeof d.source === 'object' ? (d.source as any).id : d.source;
          const t = typeof d.target === 'object' ? (d.target as any).id : d.target;
          
          if (focusSource || activeTagFilter) {
            const sNode = graphData.nodes.find(n => n.id === s);
            const tNode = graphData.nodes.find(n => n.id === t);
            if (sNode && tNode && getLensStatus(sNode) === 'focus' && getLensStatus(tNode) === 'focus') {
                return 2; // Slightly thicker for filtered connection
            }
          }

          if (pathfindingPath.has(s) && pathfindingPath.has(t)) return 3;
          return d.type === 'implicit_tag_match' ? 1 : 1.5;
      })
      .attr("stroke-opacity", (d: any) => {
         const sStatus = getLensStatus(d.source);
         const tStatus = getLensStatus(d.target);
         
         if (focusSource || activeTagFilter) {
             if (sStatus === 'focus' && tStatus === 'focus') return 1;
             if (focusSource) return 0.25; // Clearly visible for non-focused edges in source mode
             return 0.12; // Softly dimmed for non-focused edges in tag mode
         }

         if (pathfindingPath.size > 0) {
             const s = d.source.id;
             const t = d.target.id;
             return (pathfindingPath.has(s) && pathfindingPath.has(t)) ? 1 : 0.05;
         }

         if (activeLens === 'Pathways' && activeFlowLens) {
            const cat = getLinkCategory(d.type);
            if (cat !== activeFlowLens) return 0.05; 
            return 0.8; 
         }

         if (sStatus === 'hidden' || tStatus === 'hidden') return 0.02;
         const sDepth = getDepth(d.source);
         const tDepth = getDepth(d.target);
         if (activeLens === 'AnchorFocus') {
             if (sDepth === 0 || tDepth === 0) return 0.8;
             if (sDepth === 1 || tDepth === 1) return 0.5;
             return 0.15; 
         }
         if (sStatus === 'focus' && tStatus === 'focus') return 0.8;
         return 0.3; 
      })
      .attr("stroke-dasharray", d => d.type === 'implicit_tag_match' ? "4,4" : "none")
      .attr("marker-end", d => d.type === 'implicit_tag_match' ? null : "url(#arrow)")
      .style("filter", d => {
          if (focusSource || activeTagFilter) {
            const s = typeof d.source === 'object' ? (d.source as any).id : d.source;
            const t = typeof d.target === 'object' ? (d.target as any).id : d.target;
            const sNode = graphData.nodes.find(n => n.id === s);
            const tNode = graphData.nodes.find(n => n.id === t);
            if (sNode && tNode && getLensStatus(sNode) === 'focus' && getLensStatus(tNode) === 'focus') {
                return "url(#glow)";
            }
          }
          return null;
      });

    const particleGroup = g.append("g").attr("class", "particles");
    let particles: d3.Selection<SVGCircleElement, GraphLink, SVGGElement, unknown>;

    if (edgeMode === 'synaptic') {
        const flowLinks = graphData.links.filter(l => {
           const t = (l.type || '').toLowerCase();
           const cat = getLinkCategory(l.type);
           const sStatus = getLensStatus(l.source as GraphNode);
           const tStatus = getLensStatus(l.target as GraphNode);
           if (sStatus === 'hidden' || tStatus === 'hidden') return false;
           // Hide particles in filtered mode unless on focussed edges
           if ((focusSource || activeTagFilter) && (sStatus !== 'focus' || tStatus !== 'focus')) return false;

           if (t === 'implicit_tag_match') return false;
           if (activeLens === 'Pathways' && activeFlowLens) {
               return cat === activeFlowLens;
           }
           return cat === 'positive' || cat === 'negative';
        });

        particles = particleGroup.selectAll<SVGCircleElement, GraphLink, SVGGElement, unknown>("circle")
           .data(flowLinks)
           .join("circle")
           .attr("r", 2.5)
           .attr("fill", d => {
              const cat = getLinkCategory(d.type);
              return cat === 'negative' ? "#f87171" : "#67e8f9"; 
           })
           .attr("filter", "url(#glow)");
    } else {
        particleGroup.selectAll("*").remove();
    }

    const ghostLineGroup = g.append("g").attr("class", "ghost-line-layer");
    let ghostLine = ghostLineGroup.append("line")
       .attr("stroke", "#06b6d4")
       .attr("stroke-width", 2)
       .attr("stroke-dasharray", "5,5")
       .attr("opacity", 0)
       .attr("pointer-events", "none");

    // Pulse ring layer for source-focused nodes
    const pulseRingGroup = g.append("g").attr("class", "pulse-ring-layer").attr("pointer-events", "none");
    if (focusSource) {
      const focusedNodes = graphData.nodes.filter(n => n.source_id === focusSource);
      focusedNodes.forEach(n => {
        const grp = pulseRingGroup.append("g").attr("data-node-id", n.id);
        grp.append("circle")
          .attr("fill", "none")
          .attr("stroke", "#818cf8")
          .attr("stroke-opacity", 0.4)
          .attr("class", "pulse-ring");
        grp.append("circle")
          .attr("fill", "none")
          .attr("stroke", "#818cf8")
          .attr("stroke-opacity", 0.25)
          .attr("class", "pulse-ring-delayed");
      });
    }

    // REFACTORED DRAG BEHAVIOR to allow clicks in specific modes
    const drag = (simulation: d3.Simulation<GraphNode, undefined>) => {
        const dragstarted = (event: any, d: any) => {
            if (!event.active && !isPaused) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        };
        const dragged = (event: any, d: any) => {
            d.fx = event.x; d.fy = event.y;
        };
        const dragended = (event: any, d: any) => {
            if (!event.active && !isPaused) simulation.alphaTarget(0);
            if (interactionMode !== 'pin') {
                d.fx = null; d.fy = null;
            }
        };

        return d3.drag<SVGGElement, GraphNode>()
            .filter((event) => {
                // Prevent drag start for modes that require clicking
                if (interactionMode === 'scan' || interactionMode === 'link' || interactionMode === 'merge') {
                    return false;
                }
                // Prevent node drag if panning canvas
                if (interactionMode === 'pan') return false;
                
                return !event.ctrlKey && !event.button;
            })
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    };

    const node = g.append("g")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g")
      .call(drag(simulation) as any)
      .on("contextmenu", (event, d) => {
          event.preventDefault();
          event.stopPropagation();
          setContextMenu({ x: event.clientX, y: event.clientY, node: d });
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        
        if (event.altKey) {
            if (onTraceNode) onTraceNode(d);
            return;
        }

        if (event.shiftKey) {
            const newSelected = new Set(selectedNodes);
            if (newSelected.has(d.id)) {
                newSelected.delete(d.id);
            } else {
                newSelected.add(d.id);
                if (newSelected.size === 2) {
                    const ids = Array.from(newSelected);
                    const path = findShortestPath(ids[0], ids[1], graphData.links);
                    if (path.size > 0) {
                        setPathfindingPath(path);
                    } else {
                        setTimeout(() => setPathfindingPath(new Set()), 500);
                    }
                } else if (newSelected.size > 2) {
                    setPathfindingPath(new Set()); 
                } else {
                    setPathfindingPath(new Set()); 
                }
            }
            setSelectedNodes(newSelected);
            return;
        }

        // 1. LINK / MERGE MODES
        if (interactionMode === 'link' || interactionMode === 'merge') {
            if (!linkerMode.source) {
                setLinkerMode(prev => ({ ...prev, source: d }));
                focusCameraOn(d); // Confirm source visually
            } else if (d.id !== linkerMode.source.id) {
                setLinkerMode(prev => ({ ...prev, target: d }));
            }
            return;
        }

        // 2. PIN MODE
        if (interactionMode === 'pin') {
            togglePin(d);
            return;
        }

        // 3. SCAN / SELECT MODE
        setSelectedEdge(null);
        setSelectedNode(d);
        setPathfindingPath(new Set()); 
        setSelectedNodes(new Set()); 
        focusCameraOn(d); // Always zoom to focus on click
      })
      .on("dblclick", (event, d: GraphNode) => {
        event.stopPropagation();
        enterAnchorMode(d.id);
      })
      .on("mouseover", (event, d) => {
          if (interactionMode === 'scan') {
              node.attr("opacity", 0.1);
              linkVisible.attr("stroke-opacity", 0.05);
              d3.select(event.currentTarget as any).attr("opacity", 1);
              const neighborIds = new Set<string>();
              graphData.links.forEach((l: any) => {
                  if (l.source.id === d.id) neighborIds.add(l.target.id);
                  else if (l.target.id === d.id) neighborIds.add(l.source.id);
              });
              node.filter((n: any) => neighborIds.has(n.id)).attr("opacity", 1);
              linkVisible.filter((l: any) => l.source.id === d.id || l.target.id === d.id)
                .attr("stroke-opacity", 1).attr("stroke", "#22d3ee").attr("stroke-width", 2);
          }
      })
      .on("mouseout", (event, d) => {
          if (interactionMode === 'scan') {
              node.attr("opacity", (n: any) => getLensStatus(n) === 'hidden' ? 0.05 : (getLensStatus(n) === 'context' ? 0.2 : 1));
              linkVisible.attr("stroke-opacity", (l: any) => getLensStatus(l.source) === 'hidden' || getLensStatus(l.target) === 'hidden' ? 0.02 : 0.3)
                .attr("stroke", (l) => getEdgeColor(l.type)).attr("stroke-width", (l) => l.type === 'implicit_tag_match' ? 1 : 1.5);
          }
      })
      .attr("opacity", (d: any) => {
         if (xRayMode) return 1;
         
         if (pathfindingPath.size > 0 && !pathfindingPath.has(d.id)) return 0.1;

         const status = getLensStatus(d);
         const depth = getDepth(d);

         if (status === 'hidden') return 0.05;
         if (activeLens === 'AnchorFocus') {
            if (depth === 0) return 1; 
            if (depth === 1) return 0.9; 
            if (depth === 2) return 0.5; 
            if (depth === 3) return 0.3; 
         }
         
         // In Source Filter Mode or Tag Filter, context nodes are dimmed but visible
         if (focusSource && status === 'context') return 0.5;
         if (activeTagFilter && status === 'context') return 0.35;
         if (status === 'context') return 0.2;
         return 1;
      }) 
      // Ensure all nodes are interactive, even if dimmed context nodes in filter mode
      .attr("pointer-events", (d: any) => {
        const status = getLensStatus(d);
        // Only disable if explicitly hidden (lens filter), but in source filter we use 'context' instead of 'hidden'
        return status === 'hidden' ? 'none' : 'all';
      })
      .attr("class", "node-group");

    node.each(function(d: GraphNode) {
      const config = getEntityConfig(d.type);
      const isAnchor = isAnchorNode(d);
      const anchorDetails = getAnchorDetails(d);
      const sourceStyle = getSourceStyle(d);
      const sel = d3.select(this);
      const status = getLensStatus(d);
      
      const isFocusedAnchor = d.id === focusedAnchorId;
      const baseRadius = radiusScale(d.val || 0);
      const radius = isAnchor ? (isFocusedAnchor ? 40 : 30) : baseRadius; 
      
      let color = isAnchor && anchorDetails ? anchorDetails.color : config.color;
      let strokeColor = color;
      let filter = "url(#glow)";
      let strokeWidth = isAnchor ? 3 : 0;

      // Highlight source-filtered focus nodes with subtle indigo border (keep entity color)
      if ((focusSource || activeTagFilter) && status === 'focus') {
         strokeColor = "#818cf8"; // Soft indigo stroke
         filter = "url(#glow)";
         strokeWidth = 2.5;
      }

      const inPath = pathfindingPath.has(d.id);
      const inSelection = selectedNodes.has(d.id);

      if (inPath || inSelection) {
          sel.append("circle")
             .attr("r", radius + 8)
             .attr("fill", "none")
             .attr("stroke", inPath ? "#fde047" : "#22d3ee") 
             .attr("stroke-width", 2)
             .attr("stroke-dasharray", "4,4")
             .attr("class", "selection-halo animate-spin-slow");
      }

      if (isAnchor && anchorDetails) {
         const halo = sel.append("circle")
          .attr("r", radius + (isFocusedAnchor ? 12 : 8))
          .attr("fill", "none")
          .attr("stroke", color) 
          .attr("stroke-width", isFocusedAnchor ? 4 : 2)
          .attr("stroke-opacity", 0.6)
          .style("filter", filter);

         if (anchorDetails.type === 'Topic') {
            halo.attr("stroke-dasharray", "4, 4");
         } else if (anchorDetails.type === 'Goal') {
             sel.append("circle")
               .attr("r", radius + (isFocusedAnchor ? 20 : 14))
               .attr("fill", "none")
               .attr("stroke", color)
               .attr("stroke-width", 1)
               .attr("stroke-opacity", 0.4)
               .attr("stroke-dasharray", "2, 2");
         }
      }

      if (!isAnchor) {
         sel.append("circle")
           .attr("r", radius + 4)
           .attr("fill", "none")
           .attr("stroke", (focusSource || activeTagFilter) && status === 'focus' ? "#818cf8" : sourceStyle.stroke)
           .attr("stroke-width", (focusSource || activeTagFilter) && status === 'focus' ? 1.5 : 2)
           .attr("stroke-opacity", (focusSource || activeTagFilter) && status === 'focus' ? 0.6 : 0.8);
      }

      sel.append("circle")
        .attr("r", radius)
        .attr("fill", isAnchor ? "#0f172a" : color)
        .attr("stroke", strokeColor) 
        .attr("stroke-width", strokeWidth) 
        .style("filter", filter);

      if (isAnchor && anchorDetails) {
         sel.append("text")
           .text(anchorDetails.icon)
           .attr("text-anchor", "middle")
           .attr("dy", ".35em")
           .attr("font-size", radius * 1.2)
           .style("pointer-events", "none")
           .style("user-select", "none");
      }

      sel.append("text")
        .text("📌")
        .attr("class", "pin-indicator")
        .attr("x", -radius - 2)
        .attr("y", -radius - 2)
        .attr("font-size", "14px")
        .attr("opacity", d.fx != null ? 1 : 0)
        .style("pointer-events", "none")
        .style("text-shadow", "0 2px 4px black");
    });

    node.append("text")
      .text((d: GraphNode) => d.label)
      .attr("x", (d: GraphNode) => {
          const isFocusedAnchor = d.id === focusedAnchorId;
          const r = radiusScale(d.val || 0);
          return (isAnchorNode(d) ? (isFocusedAnchor ? 55 : 40) : r) + 8;
      })
      .attr("y", 4)
      .attr("font-family", "monospace")
      .attr("font-size", (d: GraphNode) => isAnchorNode(d) ? (d.id === focusedAnchorId ? "16px" : "14px") : "10px") 
      .attr("font-weight", (d: GraphNode) => isAnchorNode(d) ? "bold" : "normal")
      .attr("fill", (d: GraphNode) => {
        if ((focusSource || activeTagFilter) && getLensStatus(d) === 'focus') return "#e2e8f0"; // Clean white for focused labels
        const anchorDetails = getAnchorDetails(d);
        return anchorDetails ? anchorDetails.color : "#e2e8f0";
      })
      .style("pointer-events", "none")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,1)")
      // Hide labels for context nodes in Filter Mode by default
      .attr("opacity", (d: GraphNode) => {
          if (xRayMode) return 1;
          const status = getLensStatus(d);
          if (focusSource && status === 'context') return 0.5;
          if (activeTagFilter && status === 'context') return 0.3;
          return 1;
      });

    svg.on("mousemove.linker", (event: any) => {
        if ((linkerMode.active) && linkerMode.source && !linkerMode.target) {
            const [mx, my] = d3.pointer(event, g.node() as any);
            ghostLine
                .attr("x1", linkerMode.source.x!)
                .attr("y1", linkerMode.source.y!)
                .attr("x2", mx)
                .attr("y2", my)
                .attr("stroke", interactionMode === 'merge' ? "#a855f7" : "#06b6d4")
                .attr("opacity", 1);
        }
    });

    simulation.on("tick", () => {
      linkVisible
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      
      if (edgeMode === 'synaptic' && particles) {
         const time = Date.now() / 1000;
         particles
            .attr("cx", (d: any) => {
               const cat = getLinkCategory(d.type);
               const offset = (time * (cat === 'negative' ? 0.5 : 1.5)) % 1; 
               return d.source.x + (d.target.x - d.source.x) * offset;
            })
            .attr("cy", (d: any) => {
               const cat = getLinkCategory(d.type);
               const offset = (time * (cat === 'negative' ? 0.5 : 1.5)) % 1;
               return d.source.y + (d.target.y - d.source.y) * offset;
            });
      }

      node.attr("transform", d => `translate(${d.x},${d.y})`);

      // Update pulse ring positions
      pulseRingGroup.selectAll<SVGGElement, unknown>("g").each(function() {
        const grp = d3.select(this);
        const nodeId = grp.attr("data-node-id");
        const n = graphData.nodes.find(nd => nd.id === nodeId);
        if (n && n.x != null && n.y != null) {
          grp.attr("transform", `translate(${n.x},${n.y})`);
        }
      });

      if (linkerMode.active && linkerMode.source) {
          if (linkerMode.target) {
              ghostLine
                .attr("x1", linkerMode.source.x!)
                .attr("y1", linkerMode.source.y!)
                .attr("x2", linkerMode.target.x!)
                .attr("y2", linkerMode.target.y!)
                .attr("stroke", interactionMode === 'merge' ? "#a855f7" : "#06b6d4")
                .attr("opacity", 1);
          } else {
              ghostLine
                .attr("x1", linkerMode.source.x!)
                .attr("y1", linkerMode.source.y!);
          }
      } else {
          ghostLine.attr("opacity", 0);
      }
    });

    return () => { simulation.stop(); };
  }, [graphData, activeLens, focusedAnchorId, edgeMode, activeFlowLens, linkerMode, interactionMode, xRayMode, pathfindingPath, selectedNodes, isPaused, focusSource, activeTagFilter]);

  // ... [drag function - kept same] ...
  const drag = (simulation: d3.Simulation<GraphNode, undefined>) => {
        const dragstarted = (event: any, d: any) => {
            if (!event.active && !isPaused) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        };
        const dragged = (event: any, d: any) => {
            d.fx = event.x; d.fy = event.y;
        };
        const dragended = (event: any, d: any) => {
            if (!event.active && !isPaused) simulation.alphaTarget(0);
            if (interactionMode !== 'pin') {
                d.fx = null; d.fy = null;
            }
        };

        return d3.drag<SVGGElement, GraphNode>()
            .filter((event) => {
                // Prevent drag start for modes that require clicking
                if (interactionMode === 'scan' || interactionMode === 'link' || interactionMode === 'merge') {
                    return false;
                }
                // Prevent node drag if panning canvas
                if (interactionMode === 'pan') return false;
                
                return !event.ctrlKey && !event.button;
            })
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    };

  // ResizeObserver: update SVG viewBox when container resizes (panels open/close)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout>;
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const svgEl = svgRef.current;
        if (svgEl) {
          svgEl.setAttribute('width', `${el.clientWidth}`);
          svgEl.setAttribute('height', `${el.clientHeight}`);
        }
      }, 100);
    });
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(timeout); };
  }, []);

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-slate-950 bg-dot-grid" ref={containerRef}>
      
      {selectionRect && (
          <div 
             className="absolute border border-cyan-400 bg-cyan-400/20 pointer-events-none z-10"
             style={{
                 left: selectionRect.width > 0 ? selectionRect.x : selectionRect.x + selectionRect.width,
                 top: selectionRect.height > 0 ? selectionRect.y : selectionRect.y + selectionRect.height,
                 width: Math.abs(selectionRect.width),
                 height: Math.abs(selectionRect.height)
             }}
          />
      )}

      <svg ref={svgRef} className="w-full h-full block cursor-crosshair" onClick={() => { 
          if (!linkerMode.active) {
              setSelectedNode(null); 
              setSelectedEdge(null); 
              setPathfindingPath(new Set());
              setSelectedNodes(new Set());
          }
      }} />
      
      {/* SOURCE FILTER ACTIVE INDICATOR */}
      {focusSource && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 flex gap-2 items-center pointer-events-auto">
             <div className="bg-indigo-900/80 backdrop-blur-md p-1.5 rounded-full border border-indigo-500/50 shadow-xl flex items-center gap-2 pl-3 pr-1 animate-in slide-in-from-top-4 fade-in">
                 <span className="text-indigo-200 text-xs font-bold uppercase flex items-center gap-2">
                    <Filter size={14} /> Source Filter Active
                 </span>
                 <div className="w-px h-4 bg-indigo-500/30 mx-1"></div>
                 <button 
                    onClick={() => onClearSourceFilter && onClearSourceFilter()}
                    className="p-1 rounded-full hover:bg-white/10 text-indigo-300 hover:text-white transition-colors"
                    title="Clear Filter"
                 >
                    <X size={14} />
                 </button>
             </div>
          </div>
      )}

      {/* TAG FILTER ACTIVE INDICATOR */}
      {activeTagFilter && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 flex gap-2 items-center pointer-events-auto">
             <div className="bg-pink-900/80 backdrop-blur-md p-1.5 rounded-full border border-pink-500/50 shadow-xl flex items-center gap-2 pl-3 pr-1 animate-in slide-in-from-top-4 fade-in">
                 <span className="text-pink-200 text-xs font-bold uppercase flex items-center gap-2">
                    <Tag size={14} /> Tag: {activeTagFilter}
                 </span>
                 <div className="w-px h-4 bg-pink-500/30 mx-1"></div>
                 <button 
                    onClick={() => setActiveTagFilter(null)}
                    className="p-1 rounded-full hover:bg-white/10 text-pink-300 hover:text-white transition-colors"
                    title="Clear Filter"
                 >
                    <X size={14} />
                 </button>
             </div>
          </div>
      )}

      {/* ... [Omnibar, Modals - kept same] ... */}
      {omnibarOpen && (
          <div className="absolute inset-0 z-50 flex items-start justify-center pt-32 bg-black/50 backdrop-blur-sm animate-in fade-in">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 border-b border-slate-800">
                      <Search className="text-slate-400" size={20} />
                      <input 
                         autoFocus
                         value={omnibarQuery}
                         onChange={e => setOmnibarQuery(e.target.value)}
                         placeholder="Search nodes or run commands..."
                         className="bg-transparent border-none text-white text-lg placeholder-slate-500 focus:outline-none w-full"
                         onKeyDown={(e) => {
                             if (e.key === 'Escape') setOmnibarOpen(false);
                             if (e.key === 'Enter' && filteredNodes.length > 0) {
                                 const node = filteredNodes[0];
                                 setSelectedNode({ ...node });
                                 focusCameraOn(node);
                                 setOmnibarOpen(false);
                                 setOmnibarQuery('');
                             }
                         }}
                      />
                      <div className="flex gap-1">
                          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">ESC</span>
                      </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto p-2">
                      {filteredNodes.length === 0 && omnibarQuery && (
                          <div className="text-slate-500 p-4 text-center text-sm">No results found.</div>
                      )}
                      {filteredNodes.map((node, i) => (
                          <button 
                             key={node.id}
                             onClick={() => {
                                 setSelectedNode({ ...node });
                                 focusCameraOn(node);
                                 setOmnibarOpen(false);
                                 setOmnibarQuery('');
                             }}
                             className={clsx(
                                 "w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-slate-800 transition-colors group",
                                 i === 0 && "bg-slate-800/50"
                             )}
                          >
                             <div className="flex items-center gap-3">
                                <span className="text-slate-400 group-hover:text-cyan-400"><CornerDownLeft size={16}/></span>
                                <div>
                                    <div className="text-sm font-bold text-white">{node.label}</div>
                                    <div className="text-xs text-slate-500">{node.type} • {String(node.data.description || '').slice(0, 50)}...</div>
                                </div>
                             </div>
                             <span className="text-xs text-slate-600 font-mono">Jump to</span>
                          </button>
                      ))}
                      {!omnibarQuery && (
                          <div className="p-4">
                              <div className="text-xs font-bold text-slate-500 uppercase mb-2">Available Commands</div>
                              <div className="grid grid-cols-2 gap-2 text-sm text-slate-300">
                                  <div className="flex justify-between p-2 bg-slate-800/30 rounded"><span>Inject Data</span> <span className="font-mono text-slate-500">I</span></div>
                                  <div className="flex justify-between p-2 bg-slate-800/30 rounded"><span>Toggle Vault</span> <span className="font-mono text-slate-500">[</span></div>
                                  <div className="flex justify-between p-2 bg-slate-800/30 rounded"><span>Toggle Chat</span> <span className="font-mono text-slate-500">]</span></div>
                                  <div className="flex justify-between p-2 bg-slate-800/30 rounded"><span>Reset View</span> <span className="font-mono text-slate-500">C</span></div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {(interactionMode === 'link' || interactionMode === 'merge') && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4">
              <div className={clsx(
                  "bg-slate-900/90 backdrop-blur-md border p-3 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.3)] flex items-center gap-4",
                  interactionMode === 'merge' ? "border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.3)]" : "border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
              )}>
                  <div className="flex items-center gap-2 px-2">
                      <div className={clsx("w-2 h-2 rounded-full animate-pulse", interactionMode === 'merge' ? "bg-purple-400" : "bg-cyan-400")}></div>
                      <span className={clsx("text-xs font-bold uppercase tracking-wider", interactionMode === 'merge' ? "text-purple-400" : "text-cyan-400")}>
                          {interactionMode === 'merge' ? "Merge Mode" : "Canvas Linker"}
                      </span>
                  </div>
                  <div className="text-xs text-slate-400 border-l border-white/10 pl-3">
                      {linkerMode.target ? "Target Locked" : (linkerMode.source ? "Select Target Node" : "Select Source Node")}
                  </div>
                  <button 
                      onClick={() => setInteractionMode('select')} 
                      className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                      <X size={14} />
                  </button>
              </div>
          </div>
      )}

      {interactionMode === 'pin' && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4">
              <div className="bg-slate-900/90 backdrop-blur-md border border-red-500/50 p-3 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center gap-4">
                  <div className="flex items-center gap-2 px-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Pin Mode Active</span>
                  </div>
                  <div className="text-xs text-slate-400 border-l border-white/10 pl-3">
                      Drag nodes to lock position. Click to toggle.
                  </div>
                  <button 
                      onClick={() => setInteractionMode('select')}
                      className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                      <X size={14} />
                  </button>
              </div>
          </div>
      )}

      {interactionMode === 'link' && linkerMode.active && linkerMode.source && linkerMode.target && (
          <SmartLinkerHUD 
              source={linkerMode.source}
              target={linkerMode.target}
              onClose={() => {
                  setInteractionMode('select');
                  setLinkerMode({ active: false, source: null, target: null, mousePos: null });
              }}
              onSuccess={() => {
                  setInteractionMode('select');
                  loadGraphData();
              }}
          />
      )}

      {interactionMode === 'merge' && linkerMode.active && linkerMode.source && linkerMode.target && (
          <MergeNodeHUD 
              source={linkerMode.source}
              target={linkerMode.target}
              onClose={() => {
                  setInteractionMode('select');
                  setLinkerMode({ active: false, source: null, target: null, mousePos: null });
              }}
              onSuccess={() => {
                  setInteractionMode('select');
                  loadGraphData();
                  setSelectedNode(null); 
              }}
          />
      )}

      {showEnrichmentModal && (
        <EnrichmentModal 
            orphans={orphans} 
            onClose={() => setShowEnrichmentModal(false)}
            onSuccess={() => {
                setShowEnrichmentModal(false);
                loadGraphData();
            }}
        />
      )}

      {showConnectionModal && selectedNode && (
        <ConnectionEditorModal
            currentNode={selectedNode}
            allNodes={graphData.nodes}
            allEdges={graphData.links}
            onClose={() => setShowConnectionModal(false)}
            onUpdate={() => {
                loadGraphData(); 
            }}
            onEnterLinkerMode={() => {
                setShowConnectionModal(false);
                setInteractionMode('link');
                setLinkerMode({
                    active: true,
                    source: selectedNode,
                    target: null,
                    mousePos: null
                });
            }}
            onEnterMergeMode={() => {
                setShowConnectionModal(false);
                setInteractionMode('merge');
                setLinkerMode({
                    active: true,
                    source: selectedNode,
                    target: null,
                    mousePos: null
                });
            }}
        />
      )}

      {/* ... [Pathways Lens, Anchor Focus, Top Indicators - kept same] ... */}
      {activeLens === 'Pathways' && !activeFlowLens && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in">
             <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col">
                 <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center gap-3">
                         <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-500">
                             <GitMerge size={24} />
                         </div>
                         <div>
                             <h2 className="text-xl font-bold text-white">Neural Pathway Selector</h2>
                             <p className="text-slate-400 text-sm">Select a frequency to filter the synaptic network.</p>
                         </div>
                     </div>
                     <button onClick={() => onLensChange('All')} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white">
                         <X size={20} />
                     </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button 
                        onClick={() => setActiveFlowLens('positive')}
                        className="bg-slate-950 p-6 rounded-xl border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-950/20 group transition-all text-left"
                    >
                        <div className="w-12 h-12 bg-cyan-900/30 rounded-full flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-110 transition-transform">
                            <CheckCircle2 size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-cyan-400">Constructive Flow</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Filter for enabling connections: <span className="text-cyan-500">Leads To, Supports, Enables, Achieved.</span>
                        </p>
                    </button>

                    <button 
                        onClick={() => setActiveFlowLens('negative')}
                        className="bg-slate-950 p-6 rounded-xl border border-slate-800 hover:border-red-500/50 hover:bg-red-950/20 group transition-all text-left"
                    >
                        <div className="w-12 h-12 bg-red-900/30 rounded-full flex items-center justify-center text-red-400 mb-4 group-hover:scale-110 transition-transform">
                            <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-red-400">Critical Pathway</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Filter for friction points: <span className="text-red-500">Blocks, Conflicts, Risks, Contradicts.</span>
                        </p>
                    </button>

                    <button 
                        onClick={() => setActiveFlowLens('neutral')}
                        className="bg-slate-950 p-6 rounded-xl border border-slate-800 hover:border-slate-500/50 hover:bg-slate-800 group transition-all text-left"
                    >
                        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-slate-300 mb-4 group-hover:scale-110 transition-transform">
                            <ArrowRightLeft size={24} />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2 group-hover:text-slate-300">Structural Grid</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">
                            Filter for ontology: <span className="text-slate-300">Part Of, Defines, Mentions, Owns.</span>
                        </p>
                    </button>
                 </div>
             </div>
         </div>
      )}

      {activeLens === 'AnchorFocus' && !focusedAnchorId && (
         <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in">
             <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
                 <div className="flex items-center justify-between mb-6">
                     <div className="flex items-center gap-3">
                         <div className="p-3 bg-amber-500/10 rounded-full text-amber-500">
                             <Scan size={24} />
                         </div>
                         <div>
                             <h2 className="text-xl font-bold text-white">Select Anchor Focus</h2>
                             <p className="text-slate-400 text-sm">Choose a strategic node to inspect its complete gravitational field.</p>
                         </div>
                     </div>
                     <button onClick={exitAnchorMode} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white">
                         <X size={20} />
                     </button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                     {availableAnchors.length === 0 ? (
                         <div className="col-span-full py-12 text-center text-slate-500 flex flex-col items-center">
                             <Anchor size={48} className="mb-4 opacity-20"/>
                             <p>No Anchors Found. Create one in the Injection Hub.</p>
                         </div>
                     ) : (
                         availableAnchors.map(anchor => {
                             const details = getAnchorDetails(anchor);
                             const Icon = getAnchorIconComponent(anchor);
                             return (
                                 <button 
                                     key={anchor.id}
                                     onClick={() => enterAnchorMode(anchor.id)}
                                     className="flex items-start gap-4 p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)] transition-all text-left group"
                                 >
                                     <div className="mt-1">
                                         <Icon size={20} style={{ color: details?.color }} className="group-hover:scale-110 transition-transform" />
                                     </div>
                                     <div>
                                         <h3 className="font-bold text-slate-200 group-hover:text-white mb-1">{anchor.label}</h3>
                                         <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border border-slate-700 text-slate-500 bg-slate-900">
                                            {anchor.type}
                                         </span>
                                     </div>
                                 </button>
                             )
                         })
                     )}
                 </div>
             </div>
         </div>
      )}

      {/* Top Indicators - Already exists, will be overlayed if Tag filter is active */}
      
      {/* ... [Legend and Shortcuts - kept same] ... */}
      {/* Physics Paused Indicator */}
      {isPaused && (
        <div className="absolute top-28 right-6 pointer-events-none">
          <div className="text-center text-[10px] text-amber-500 font-bold uppercase border border-amber-900/50 bg-amber-950/30 backdrop-blur-md rounded px-3 py-1.5">
            Physics Paused [Space]
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-6 z-10 pointer-events-auto flex items-end gap-3">
         <div className="relative">
             <button 
               onClick={() => setShowLegend(!showLegend)}
               className="bg-slate-900/80 backdrop-blur-md border border-white/10 p-2 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider shadow-lg"
             >
               <Info size={16} /> Legend
             </button>

             {showLegend && (
               <div className="absolute bottom-12 left-0 bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-xl p-4 w-64 shadow-2xl animate-in slide-in-from-bottom-5 mb-2">
                  <div className="mb-4">
                     <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-2">Sources</h4>
                     <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full border-2 border-red-500 bg-transparent"></div>
                           <span className="text-[10px] text-slate-300">YouTube</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full border-2 border-cyan-500 bg-transparent"></div>
                           <span className="text-[10px] text-slate-300">Meeting</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <div className="w-3 h-3 rounded-full border-2 border-emerald-500 bg-transparent"></div>
                           <span className="text-[10px] text-slate-300">Note</span>
                        </div>
                     </div>
                  </div>
                  <div>
                     <h4 className="text-[10px] text-slate-500 font-bold uppercase mb-2">Entities</h4>
                     <div className="grid grid-cols-2 gap-y-2 gap-x-1 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        <div className="flex items-center gap-2 col-span-2 pb-1 border-b border-white/5 mb-1">
                           <div className="w-3 h-3 rounded-full bg-[#3b82f6]"></div>
                           <span className="text-[10px] text-white font-bold">Project</span>
                        </div>
                        <div className="flex items-center gap-2 col-span-2 pb-1 border-b border-white/5 mb-1">
                           <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
                           <span className="text-[10px] text-white font-bold">Topic</span>
                        </div>
                        <div className="flex items-center gap-2 col-span-2 pb-1 border-b border-white/5 mb-1">
                           <div className="w-3 h-3 rounded-full bg-[#eab308]"></div>
                           <span className="text-[10px] text-white font-bold">Goal</span>
                        </div>
                        {Object.entries(ENTITY_THEME)
                          .filter(([k]) => k !== 'default' && k !== 'Project' && k !== 'Goal' && k !== 'Anchor' && k !== 'Topic')
                          .map(([type, conf]) => (
                          <div key={type} className="flex items-center gap-2">
                             <div className="w-3 h-3 rounded-full" style={{ backgroundColor: conf.color }}></div>
                             <span className="text-[10px] text-slate-300 truncate">{type}</span>
                          </div>
                        ))}
                     </div>
                  </div>
               </div>
             )}
         </div>

         <div className="relative">
             <button 
               onClick={() => setShowShortcuts(!showShortcuts)}
               className={clsx(
                   "bg-slate-900/80 backdrop-blur-md border border-white/10 p-2 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider shadow-lg",
                   showShortcuts && "bg-cyan-900/30 border-cyan-500/30 text-cyan-400"
               )}
             >
               <Keyboard size={16} /> Shortcuts
             </button>

             {showShortcuts && (
                 <div className="absolute bottom-12 left-0 bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 rounded-xl p-4 w-72 shadow-2xl animate-in slide-in-from-bottom-5 mb-2">
                     <div className="flex items-center gap-2 mb-3 border-b border-white/10 pb-2">
                         <Command size={14} className="text-cyan-400"/>
                         <h4 className="text-xs font-bold text-white uppercase tracking-wider">Command Protocol</h4>
                     </div>
                     <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                         {SHORTCUTS.map((sc, i) => (
                             <div key={i} className="flex items-center justify-between py-1 group">
                                 <span className="text-xs text-slate-400 group-hover:text-slate-200">{sc.label}</span>
                                 <div className="flex items-center gap-2">
                                     <span className="text-[9px] text-slate-600 uppercase">{sc.category}</span>
                                     <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-400 shadow-sm min-w-[20px] text-center">
                                         {sc.key}
                                     </kbd>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}
         </div>
      </div>

      <div className="absolute left-6 top-1/2 -translate-y-1/2 z-20 pointer-events-auto flex flex-col gap-2">
        <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 p-1.5 rounded-lg shadow-2xl flex flex-col gap-2">
           
           <div className="relative group">
               <button 
                 onClick={() => setShowModeMenu(!showModeMenu)}
                 className={clsx(
                    "p-2.5 rounded-md transition-colors relative", 
                    showModeMenu ? "bg-white/10 text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
                 )}
                 title="Select Interaction Mode"
               >
                  <CurrentModeIcon size={20} />
                  <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-r border-b border-current opacity-50 rotate-45"></div>
               </button>

               {(showModeMenu || false) && (
                   <div className="absolute left-full top-0 ml-3 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-64 overflow-hidden z-50 animate-in slide-in-from-left-2 fade-in">
                       <div className="px-3 py-2 bg-slate-950/50 border-b border-slate-800">
                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Navigation Protocol</span>
                       </div>
                       <div className="p-1">
                           {(Object.keys(MODE_CONFIG) as InteractionMode[]).map((key) => {
                               const config = MODE_CONFIG[key];
                               return (
                               <button
                                   key={key}
                                   onClick={() => { setInteractionMode(key); setShowModeMenu(false); }}
                                   className={clsx(
                                       "w-full text-left flex items-start gap-3 p-2 rounded transition-colors group",
                                       interactionMode === key ? "bg-cyan-900/20" : "hover:bg-slate-800"
                                   )}
                               >
                                   <div className={clsx("mt-0.5 p-1 rounded", interactionMode === key ? "text-cyan-400 bg-cyan-900/30" : "text-slate-400 group-hover:text-slate-200")}>
                                       <config.icon size={16} />
                                   </div>
                                   <div>
                                       <div className={clsx("text-sm font-bold", interactionMode === key ? "text-cyan-400" : "text-slate-200")}>{config.label}</div>
                                       <div className="text-[10px] text-slate-500 leading-tight">{config.description}</div>
                                   </div>
                                   {interactionMode === key && (
                                       <div className="ml-auto self-center text-cyan-500">
                                           <CheckCircle2 size={14} />
                                       </div>
                                   )}
                               </button>
                           )})}
                       </div>
                   </div>
               )}
           </div>
           
           <div className="h-px w-full bg-white/10 my-1"></div>

           {/* TAG FILTER */}
           <div className="relative group">
                <button 
                    onClick={() => setShowTagMenu(!showTagMenu)}
                    className={clsx(
                        "p-2.5 rounded-md transition-colors relative", 
                        activeTagFilter || showTagMenu ? "text-pink-400 bg-pink-900/20" : "text-slate-500 hover:text-pink-300 hover:bg-white/10"
                    )}
                    title="Filter by Tags"
                >
                    <Tag size={20} />
                    {activeTagFilter && <span className="absolute top-1 right-1 w-2 h-2 bg-pink-500 rounded-full animate-pulse"></span>}
                </button>

                {showTagMenu && (
                    <div className="absolute left-full top-0 ml-3 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-64 max-h-[400px] flex flex-col z-50 animate-in slide-in-from-left-2 fade-in">
                        <div className="px-3 py-2 bg-slate-950/50 border-b border-slate-800 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tag Matrix</span>
                            {activeTagFilter && (
                                <button onClick={() => { setActiveTagFilter(null); setShowTagMenu(false); }} className="text-[10px] text-pink-400 hover:text-pink-300">Clear</button>
                            )}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                            {userTags.length > 0 && (
                                <div className="mb-2">
                                    <div className="px-2 py-1 text-[9px] font-bold text-pink-500 uppercase">Human Tags</div>
                                    {userTags.map(tag => (
                                        <button
                                            key={`user-${tag}`}
                                            onClick={() => { setActiveTagFilter(tag); setShowTagMenu(false); }}
                                            className={clsx(
                                                "w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2",
                                                activeTagFilter === tag ? "bg-pink-900/30 text-pink-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                            )}
                                        >
                                            <User size={10} className="text-pink-500/50"/>
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {aiTags.length > 0 && (
                                <div>
                                    <div className="px-2 py-1 text-[9px] font-bold text-cyan-500 uppercase">AI Classifications</div>
                                    {aiTags.map(tag => (
                                        <button
                                            key={`ai-${tag}`}
                                            onClick={() => { setActiveTagFilter(tag); setShowTagMenu(false); }}
                                            className={clsx(
                                                "w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2",
                                                activeTagFilter === tag ? "bg-cyan-900/30 text-cyan-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                                            )}
                                        >
                                            <Bot size={10} className="text-cyan-500/50"/>
                                            {tag}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {aiTags.length === 0 && userTags.length === 0 && (
                                <div className="p-4 text-center text-xs text-slate-600 italic">No tags detected in graph.</div>
                            )}
                        </div>
                    </div>
                )}
           </div>

           <div className="relative group">
               <button onClick={loadGraphData} className={clsx("p-2.5 rounded-md hover:bg-white/10 text-cyan-400 transition-colors", loading && "animate-spin")}>
                 <RefreshCw size={20} />
               </button>
               <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-48 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <div className="text-xs font-bold text-white mb-1">Reload Graph</div>
                  <div className="text-[10px] text-slate-400 leading-tight">Sync the latest data from the database and refresh the layout.</div>
               </div>
           </div>
           
           <div className="relative group">
                <button 
                    onClick={() => setShowEnrichmentModal(true)}
                    disabled={orphans.length === 0}
                    className={clsx(
                        "p-2.5 rounded-md transition-colors relative", 
                        orphans.length > 0 ? "text-emerald-400 hover:bg-emerald-950/30" : "text-slate-600 cursor-not-allowed"
                    )}
                >
                    <Magnet size={20} />
                    {orphans.length > 0 && (
                        <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900"></span>
                    )}
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-48 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <div className="text-xs font-bold text-white mb-1">Graph Enrichment</div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                      {orphans.length > 0 ? `Analyze and reconnect ${orphans.length} isolated nodes.` : "No isolated nodes detected."}
                  </div>
               </div>
           </div>

           <div className="relative group">
              <button 
                onClick={() => setEdgeMode(prev => prev === 'standard' ? 'synaptic' : 'standard')} 
                className={clsx("p-2.5 rounded-md hover:bg-white/10 transition-colors", edgeMode === 'synaptic' ? "text-amber-400" : "text-slate-500")}
              >
                {edgeMode === 'synaptic' ? <Waves size={20} /> : <Activity size={20} />}
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-48 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <div className="text-xs font-bold text-white mb-1">Synaptic Flow</div>
                  <div className="text-[10px] text-slate-400 leading-tight">Visualize active relationship directionality with particle effects.</div>
               </div>
           </div>
           
           <div className="relative group">
              <button 
                onClick={() => setShowImplicit(!showImplicit)} 
                className={clsx("p-2.5 rounded-md hover:bg-white/10 transition-colors", showImplicit ? "text-cyan-400" : "text-slate-500")}
              >
                {showImplicit ? <Network size={20} /> : <Grid size={20} className="opacity-50"/>}
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 w-48 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <div className="text-xs font-bold text-white mb-1">Implicit Grid</div>
                  <div className="text-[10px] text-slate-400 leading-tight">Toggle inferred connections based on shared tags or context.</div>
               </div>
           </div>

           <div className="h-px w-full bg-white/10 my-1"></div>
           
           <button onClick={() => handleZoom(1.2)} className="p-2.5 rounded-md hover:bg-white/10 text-slate-300" title="Zoom In"><ZoomIn size={20} /></button>
           <button onClick={() => handleZoom(0.8)} className="p-2.5 rounded-md hover:bg-white/10 text-slate-300" title="Zoom Out"><ZoomOut size={20} /></button>
        </div>
      </div>

      {(selectedNode || selectedEdge) && !linkerMode.active && (
        <div className={clsx(
           "absolute right-6 top-28 bottom-24 w-80 backdrop-blur-xl shadow-2xl border rounded-2xl overflow-y-auto animate-in slide-in-from-right z-30 p-6",
           isYouTubeNode(selectedNode) ? "bg-slate-900/95 border-red-900/50 shadow-red-900/20" : "bg-slate-900/90 border-white/10"
        )}>
           <div className="flex justify-between items-start mb-4 relative">
               {selectedNode && (
                   <button 
                       onClick={() => togglePin(selectedNode)}
                       className={clsx(
                           "absolute -left-1 top-0 p-2 rounded-full transition-colors z-10",
                           selectedNode.fx != null 
                               ? "text-red-400 bg-red-900/20 hover:bg-red-900/40" 
                               : "text-slate-600 hover:text-slate-300 hover:bg-white/5"
                       )}
                       title={selectedNode.fx != null ? "Unpin Node" : "Pin Node"}
                   >
                       <Pin size={16} className={selectedNode.fx != null ? "fill-current" : ""} />
                   </button>
               )}

               <button onClick={() => { setSelectedNode(null); setSelectedEdge(null); setPathfindingPath(new Set()); setSelectedNodes(new Set()); }} className="absolute top-0 -right-2 text-slate-500 hover:text-white p-2"><X size={18}/></button>
           </div>
           
           {selectedNode && (
             <div className="pt-6">
               <div className="mb-6">
                  {selectedNode.data.source_type && (
                     <div className={clsx(
                       "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mb-3 border",
                       isYouTubeNode(selectedNode) ? "bg-red-950/40 border-red-900/50 text-red-400" : "bg-slate-800 border-slate-700 text-slate-400"
                     )}>
                        {isYouTubeNode(selectedNode) ? <Youtube size={12}/> : <Database size={12}/>}
                        {selectedNode.data.source_type} Source
                     </div>
                  )}

                  {isAnchorNode(selectedNode) ? (() => {
                     const details = getAnchorDetails(selectedNode);
                     const Icon = getAnchorIconComponent(selectedNode);
                     return (
                        <div className="flex flex-col gap-2">
                             <div className="flex items-center gap-2 mb-1 animate-pulse" style={{ color: details?.color }}>
                                <Icon size={20} />
                                <span className="text-xs font-bold tracking-widest uppercase">Strategic {details?.type}</span>
                            </div>
                            
                            {activeLens !== 'AnchorFocus' && (
                                <button
                                    onClick={() => enterAnchorMode(selectedNode.id)}
                                    className="flex items-center justify-center gap-2 w-full py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all mb-2"
                                >
                                    <Scan size={14} /> Focus View
                                </button>
                            )}
                            {activeLens === 'AnchorFocus' && selectedNode.id === focusedAnchorId && (
                                <div className="text-[10px] text-amber-500/70 italic text-center mb-2">
                                    Currently Inspecting Gravitational Field
                                </div>
                            )}
                            {/* Scan for Connections button */}
                            <button
                                onClick={() => handleRescanAnchor(selectedNode)}
                                disabled={isRescanScanning}
                                className="flex items-center justify-center gap-2 w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all mb-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isRescanScanning ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        {rescanStatusMessage || 'Scanning...'}
                                    </>
                                ) : (
                                    <>
                                        <Search size={14} /> Scan for Connections
                                    </>
                                )}
                            </button>
                        </div>
                     )
                  })() : (
                    <div className="flex items-center gap-2 mb-2">
                       <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getEntityConfig(selectedNode.type).color }}></span>
                       <span className="text-xs font-bold tracking-widest uppercase text-slate-400">{selectedNode.type}</span>
                    </div>
                  )}
                  
                  <h2 
                    className={clsx("text-xl font-bold leading-tight break-words")}
                    style={{ color: isAnchorNode(selectedNode) ? getAnchorDetails(selectedNode)?.color : '#fff' }}
                  >
                    {selectedNode.label}
                  </h2>
               </div>

               <div className="grid grid-cols-2 gap-2 mb-6">
                 <button 
                   onClick={() => selectedNode && onTraceNode && onTraceNode(selectedNode)}
                   className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wide transition-all shadow-lg shadow-indigo-900/20 hover:scale-[1.02]"
                 >
                    <MessageSquare size={14} /> Trace
                 </button>
                 <button 
                   onClick={() => setShowConnectionModal(true)}
                   className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-bold uppercase tracking-wide transition-all border border-slate-600 hover:border-slate-500 hover:scale-[1.02]"
                 >
                    <Edit3 size={14} /> Connections
                 </button>
               </div>

               {isYouTubeNode(selectedNode) && selectedNode.data.source_url && (
                 <div className="mb-6 rounded-lg overflow-hidden border border-red-900/30 bg-black relative group shadow-lg">
                    <div className="absolute inset-0 bg-gradient-to-t from-red-900/20 to-transparent pointer-events-none"></div>
                    <div className="p-6 flex flex-col items-center justify-center text-center gap-3">
                       <PlayCircle size={40} className="text-red-500 opacity-80 group-hover:scale-110 transition-transform duration-300"/>
                       <a 
                         href={selectedNode.data.source_url} 
                         target="_blank" 
                         rel="noopener noreferrer" 
                         className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-full flex items-center gap-2 transition-all shadow-lg shadow-red-900/50"
                       >
                         Watch Source <ExternalLink size={12}/>
                       </a>
                    </div>
                 </div>
               )}

               <div className="flex items-center gap-2 mb-4 text-xs text-slate-500">
                  <span className="bg-white/5 px-2 py-1 rounded border border-white/5">
                    Degree: <span className="text-cyan-400">{selectedNode.val}</span>
                  </span>
               </div>

               {/* Tags Display */}
               <div className="flex flex-wrap gap-1.5 mb-4">
                    {/* AI Tags */}
                    {selectedNode.data.tags && Array.isArray(selectedNode.data.tags) && (selectedNode.data.tags as any[]).map((tag: any, i: number) => (
                      <span key={`ai-${i}`} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 flex items-center gap-1">
                         <Bot size={10} /> {String(tag)}
                      </span>
                    ))}
                    {/* User Tags */}
                    {selectedNode.data.user_tags && Array.isArray(selectedNode.data.user_tags) && (selectedNode.data.user_tags as any[]).map((tag: any, i: number) => (
                      <span key={`user-${i}`} className="text-[10px] bg-pink-900/30 text-pink-300 px-2 py-0.5 rounded-full border border-pink-500/50 flex items-center gap-1">
                         <User size={10} /> {String(tag)}
                      </span>
                    ))}
               </div>

               {selectedNode.data.description && (
                 <p className="text-sm text-slate-300 leading-relaxed mb-6 border-l-2 border-slate-700 pl-3">
                   {String(selectedNode.data.description)}
                 </p>
               )}
               
               {selectedNode.data.quote && (
                  <div className="mb-6 bg-black/30 p-3 rounded border border-white/5 relative">
                     <Quote size={16} className="text-slate-600 absolute top-2 left-2 opacity-50"/>
                     <p className="text-xs text-slate-400 italic pl-6">
                       "{String(selectedNode.data.quote)}"
                     </p>
                  </div>
               )}

               <div className="space-y-2 mt-auto pt-4 border-t border-white/5">
                 <div className="flex justify-between text-xs border-b border-slate-800 pb-2">
                   <span className="text-slate-500">Confidence</span>
                   <span className="text-cyan-400 font-mono">
                     {selectedNode.data.confidence ? `${(Number(selectedNode.data.confidence) * 100).toFixed(0)}%` : 'N/A'}
                   </span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-slate-800 pb-2">
                   <span className="text-slate-500">Source</span>
                   <span className="text-slate-400 truncate max-w-[150px]">{String(selectedNode.data.source || 'Unknown')}</span>
                 </div>
                 <div className="flex justify-between text-xs border-b border-slate-800 pb-2">
                   <span className="text-slate-500">ID</span>
                   <span className="text-slate-600 font-mono truncate w-32 text-right">{selectedNode.id}</span>
                 </div>
               </div>
             </div>
           )}
      </div>
      )}

      {/* Context Menu for Nodes */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-cyber-slate/95 backdrop-blur-md border border-white/20 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              togglePin(contextMenu.node);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Pin size={14} className={contextMenu.node.fx != null ? 'text-amber-400' : ''} />
            {contextMenu.node.fx != null ? 'Unpin Node' : 'Pin Node'}
          </button>
          <div className="border-t border-white/10 my-1" />
          <button
            onClick={() => handleToggleAnchor(contextMenu.node)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Anchor size={14} className={(contextMenu.node.data?.is_anchor || contextMenu.node.type === 'Anchor') ? 'text-cyber-cyan' : ''} />
            {(contextMenu.node.data?.is_anchor || contextMenu.node.type === 'Anchor') ? 'Demote from Anchor' : 'Promote to Anchor'}
          </button>
          <div className="border-t border-white/10 my-1" />
          <button
            onClick={() => {
              handleDeleteNode(contextMenu.node);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          >
            <Trash2 size={14} />
            Delete Node
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setContextMenu(null)}
        />
      )}

      {/* Anchor Rescan Review Modal */}
      {showRescanModal && rescanAnchorNode && (
        <AnchorScanReviewModal
          anchorName={rescanAnchorNode.label}
          anchorType={rescanAnchorNode.type}
          connections={rescanConnections}
          scanProgress={rescanProgress}
          isScanning={isRescanScanning}
          onConfirm={handleConfirmRescanConnections}
          onCancel={handleCancelRescan}
        />
      )}
    </div>
  );
};

export default GraphView;