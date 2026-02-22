import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Circle } from 'lucide-react';
import { fetchNodesBySourceId, fetchEdgesBySourceId, type SourceNode, type SourceEdge } from '../services/sources';
import { getEntityConfig } from '../utils/theme';
import clsx from 'clsx';

interface SourceDetailPanelProps {
  sourceId: string;
  sourceTitle?: string;
  highlightedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onClose: () => void;
}

type Tab = 'nodes' | 'edges';

export const SourceDetailPanel: React.FC<SourceDetailPanelProps> = ({
  sourceId,
  sourceTitle,
  highlightedNodeId,
  onSelectNode,
  onClose,
}) => {
  const [tab, setTab] = useState<Tab>('nodes');
  const [nodes, setNodes] = useState<SourceNode[]>([]);
  const [edges, setEdges] = useState<SourceEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const [nodeData, edgeData] = await Promise.all([
        fetchNodesBySourceId(sourceId),
        fetchEdgesBySourceId(sourceId),
      ]);
      if (!cancelled) {
        setNodes(nodeData);
        setEdges(edgeData);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [sourceId]);

  return (
    <div className="h-full w-[320px] min-w-[320px] bg-cyber-black/95 border-l border-white/10 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-bold text-white truncate pr-2 max-w-[240px]">
            {sourceTitle || 'Source Detail'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors shrink-0">
            <X size={14} />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} edges</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['nodes', 'edges'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors',
              tab === t
                ? 'text-amber-400 border-b-2 border-amber-400'
                : 'text-slate-500 hover:text-slate-300'
            )}
          >
            {t === 'nodes' ? `Nodes (${nodes.length})` : `Edges (${edges.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="text-center py-10 text-slate-500 text-[10px] animate-pulse">Loading...</div>
        ) : tab === 'nodes' ? (
          <div className="space-y-0.5">
            {nodes.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-[10px]">No nodes extracted from this source.</div>
            ) : (
              nodes.map(node => {
                const config = getEntityConfig(node.entity_type);
                const isHighlighted = node.id === highlightedNodeId;

                return (
                  <button
                    key={node.id}
                    onClick={() => onSelectNode(node.id)}
                    className={clsx(
                      'w-full text-left p-2 rounded-lg transition-all flex items-center gap-2.5 group',
                      isHighlighted
                        ? 'bg-amber-900/20 border border-amber-500/40'
                        : 'hover:bg-white/5 border border-transparent'
                    )}
                  >
                    <Circle
                      size={8}
                      fill={config.color}
                      stroke={config.color}
                      className="shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        'text-[11px] font-medium truncate',
                        isHighlighted ? 'text-amber-300' : 'text-white'
                      )}>
                        {node.label}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] text-slate-500">{node.entity_type}</span>
                        {node.confidence != null && (
                          <span className="text-[9px] text-slate-600">
                            {Math.round(node.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={10}
                      className={clsx(
                        'shrink-0 transition-colors',
                        isHighlighted ? 'text-amber-400' : 'text-slate-600 group-hover:text-slate-400'
                      )}
                    />
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {edges.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-[10px]">No edges found for this source.</div>
            ) : (
              edges.map(edge => (
                <div
                  key={edge.id}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-white font-medium truncate max-w-[100px]">{edge.source_label}</span>
                    <span className="text-slate-600 shrink-0">→</span>
                    <span className="text-amber-400 text-[9px] font-medium shrink-0">{edge.relation_type.replace(/_/g, ' ')}</span>
                    <span className="text-slate-600 shrink-0">→</span>
                    <span className="text-white font-medium truncate max-w-[100px]">{edge.target_label}</span>
                  </div>
                  {edge.evidence && (
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate ml-0.5">{edge.evidence}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="p-2.5 border-t border-white/5 shrink-0">
        <p className="text-[9px] text-slate-600 text-center">
          Click a node to highlight it in the graph
        </p>
      </div>
    </div>
  );
};
