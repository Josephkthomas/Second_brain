// AnchorScanReviewModal - Review and confirm connections found during comprehensive anchor scan

import React, { useState, useMemo } from 'react';
import {
  X,
  Loader2,
  CheckSquare,
  Square,
  Search,
  Link2,
  ArrowRight,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';
import clsx from 'clsx';
import { getEntityConfig } from '../utils/theme';
import type { ConnectionCandidate, BatchScanProgress } from '../services/gemini';

interface AnchorScanReviewModalProps {
  anchorName: string;
  anchorType: string;
  connections: ConnectionCandidate[];
  scanProgress: BatchScanProgress | null;
  isScanning: boolean;
  onConfirm: (selectedConnections: ConnectionCandidate[]) => void;
  onCancel: () => void;
}

export default function AnchorScanReviewModal({
  anchorName,
  anchorType,
  connections,
  scanProgress,
  isScanning,
  onConfirm,
  onCancel,
}: AnchorScanReviewModalProps) {
  // State for selections - auto-select high confidence (>= 0.75) connections
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(
      connections.filter(c => c.confidence >= 0.75).map(c => c.target_node_id)
    );
  });

  // Update selections when connections change (e.g., after scan completes)
  React.useEffect(() => {
    if (connections.length > 0) {
      setSelectedIds(new Set(
        connections.filter(c => c.confidence >= 0.75).map(c => c.target_node_id)
      ));
    }
  }, [connections]);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMinConfidence, setFilterMinConfidence] = useState<number>(0.6);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'confidence' | 'similarity' | 'type'>('confidence');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Get unique entity types
  const entityTypes = useMemo(() => {
    const types = new Set(connections.map(c => c.target_type));
    return ['all', ...Array.from(types).sort()];
  }, [connections]);

  // Filtered and sorted connections
  const filteredConnections = useMemo(() => {
    let result = connections.filter(c => {
      // Type filter
      if (filterType !== 'all' && c.target_type !== filterType) return false;
      // Confidence filter
      if (c.confidence < filterMinConfidence) return false;
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!c.target_label.toLowerCase().includes(query) &&
            !c.relation.toLowerCase().includes(query) &&
            !c.evidence.toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'similarity') return (b.similarity_score || 0) - (a.similarity_score || 0);
      if (sortBy === 'type') return a.target_type.localeCompare(b.target_type);
      return 0;
    });

    return result;
  }, [connections, filterType, filterMinConfidence, searchQuery, sortBy]);

  // Toggle functions
  const toggleSelection = (nodeId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredConnections.map(c => c.target_node_id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleExpanded = (nodeId: string) => {
    const newSet = new Set(expandedIds);
    if (newSet.has(nodeId)) {
      newSet.delete(nodeId);
    } else {
      newSet.add(nodeId);
    }
    setExpandedIds(newSet);
  };

  // Get selected connections for confirm
  const handleConfirm = () => {
    const selected = connections.filter(c => selectedIds.has(c.target_node_id));
    onConfirm(selected);
  };

  // Confidence badge styling
  const getConfidenceBadgeClass = (confidence: number) => {
    if (confidence >= 0.8) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
    if (confidence >= 0.7) return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
    return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
  };

  // Get relation type badge styling
  const getRelationBadgeClass = (relation: string) => {
    const positiveRelations = ['leads_to', 'supports', 'enables', 'created', 'achieved'];
    const negativeRelations = ['blocks', 'contradicts', 'risks', 'prevents', 'challenges'];

    if (positiveRelations.some(r => relation.includes(r))) {
      return 'text-emerald-400 bg-emerald-500/10';
    }
    if (negativeRelations.some(r => relation.includes(r))) {
      return 'text-red-400 bg-red-500/10';
    }
    return 'text-cyan-400 bg-cyan-500/10';
  };

  const progressPercent = scanProgress
    ? Math.round((scanProgress.nodesProcessed / scanProgress.totalNodes) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-900/20 rounded-lg text-amber-500 border border-amber-900/50">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Review Connections for "{anchorName}"
              </h3>
              <p className="text-sm text-slate-400">
                {isScanning
                  ? `Scanning... ${scanProgress?.nodesProcessed || 0} / ${scanProgress?.totalNodes || 0} nodes`
                  : `Found ${connections.length} potential connections`}
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar (during scan) */}
        {isScanning && scanProgress && (
          <div className="px-4 py-4 border-b border-slate-800 bg-slate-950">
            <div className="flex items-center gap-4 mb-2">
              <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              <span className="text-sm text-slate-400">
                {scanProgress.phase === 'semantic_search'
                  ? 'Finding semantically similar nodes...'
                  : `Analyzing batch ${scanProgress.currentBatch} / ${scanProgress.totalBatches}`}
              </span>
              <span className="text-sm text-amber-400 ml-auto">
                {scanProgress.connectionsFound} connections found
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {scanProgress.currentBatchLabel && (
              <p className="text-xs text-slate-500 mt-2">
                Processing: {scanProgress.currentBatchLabel}...
              </p>
            )}
          </div>
        )}

        {/* Filters */}
        {!isScanning && connections.length > 0 && (
          <div className="p-4 border-b border-slate-800 bg-slate-900/50">
            {/* Search and toggle filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search nodes, relations, or evidence..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  showFilters
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                )}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filters
              </button>
            </div>

            {/* Expandable filter options */}
            {showFilters && (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-800">
                {/* Type Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500/50 focus:outline-none"
                  >
                    {entityTypes.map((type) => (
                      <option key={type} value={type}>
                        {type === 'all' ? 'All Types' : type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Confidence Filter */}
                <select
                  value={filterMinConfidence}
                  onChange={(e) => setFilterMinConfidence(parseFloat(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500/50 focus:outline-none"
                >
                  <option value={0.6}>60%+ Confidence</option>
                  <option value={0.7}>70%+ Confidence</option>
                  <option value={0.8}>80%+ Confidence</option>
                  <option value={0.9}>90%+ Confidence</option>
                </select>

                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'confidence' | 'similarity' | 'type')}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-amber-500/50 focus:outline-none"
                >
                  <option value="confidence">Sort: Confidence</option>
                  <option value="similarity">Sort: Similarity</option>
                  <option value="type">Sort: Type</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Connection List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isScanning ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-amber-500" />
              <p>Analyzing potential connections...</p>
              <p className="text-sm text-slate-500 mt-1">This may take a minute</p>
            </div>
          ) : filteredConnections.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              {connections.length === 0 ? (
                <>
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p>No connections found</p>
                  <p className="text-sm mt-1">Try adjusting the scan parameters</p>
                </>
              ) : (
                <>
                  <Search className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                  <p>No connections match your filters</p>
                  <p className="text-sm mt-1">Try adjusting the filter settings</p>
                </>
              )}
            </div>
          ) : (
            filteredConnections.map((conn) => {
              const isSelected = selectedIds.has(conn.target_node_id);
              const isExpanded = expandedIds.has(conn.target_node_id);
              const entityConfig = getEntityConfig(conn.target_type);

              return (
                <div
                  key={conn.target_node_id}
                  className={clsx(
                    'border rounded-lg p-3 transition-all cursor-pointer',
                    isSelected
                      ? 'bg-amber-950/20 border-amber-500/50'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  )}
                  onClick={() => toggleSelection(conn.target_node_id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className="pt-0.5 flex-shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-amber-500" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-600" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Target Node */}
                        <span className="font-medium text-white">{conn.target_label}</span>

                        {/* Entity Type Badge */}
                        <span
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: `${entityConfig.color}20`,
                            color: entityConfig.color,
                          }}
                        >
                          {conn.target_type}
                        </span>

                        {/* Relation Arrow */}
                        <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />

                        {/* Relation Type */}
                        <span
                          className={clsx(
                            'text-xs px-2 py-0.5 rounded font-mono',
                            getRelationBadgeClass(conn.relation)
                          )}
                        >
                          {conn.relation}
                        </span>

                        {/* Confidence Badge */}
                        <span
                          className={clsx(
                            'text-xs px-2 py-0.5 rounded border',
                            getConfidenceBadgeClass(conn.confidence)
                          )}
                        >
                          {(conn.confidence * 100).toFixed(0)}%
                        </span>

                        {/* Similarity Score (if available) */}
                        {conn.similarity_score !== undefined && (
                          <span className="text-xs text-slate-500">
                            Sim: {(conn.similarity_score * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Evidence Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(conn.target_node_id);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-400 mt-2 flex items-center gap-1 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                        Evidence
                      </button>

                      {/* Expanded Evidence */}
                      {isExpanded && (
                        <p className="text-sm text-slate-400 mt-2 pl-4 border-l-2 border-slate-700">
                          {conn.evidence}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-4">
            {!isScanning && connections.length > 0 && (
              <>
                <button
                  onClick={selectAll}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Select All ({filteredConnections.length})
                </button>
                <button
                  onClick={deselectAll}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Deselect All
                </button>
                <span className="text-sm text-amber-400">
                  {selectedIds.size} selected
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0 || isScanning}
              className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(245,158,11,0.3)]"
            >
              <Check className="w-4 h-4" />
              Confirm {selectedIds.size} Connection{selectedIds.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
