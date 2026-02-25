import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Anchor, Plus, Trash2, Star, TrendingUp, Info, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getAnchors, getAnchorStats, getAnchorConnectionInfo, createAnchor, demoteFromAnchor, updateAnchorStrength } from '../services/anchorService';
import { AnchorNode, AnchorStats, AnchorConnectionInfo } from '../types';
import clsx from 'clsx';
import { generateEmbedding, connectAnchorToKnowledgeEnhanced, ConnectionCandidate, BatchScanProgress } from '../services/gemini';
import { getSupabase, getCurrentUserId, fetchExistingNodes, fetchRelevantNodes, semanticSearchNodesExtended } from '../services/supabase';
import AnchorScanReviewModal from './AnchorScanReviewModal';

interface AnchorManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onAnchorUpdate?: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, icon, children, defaultOpen = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-cyber-slate/30 hover:bg-cyber-slate/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-cyber-cyan">{icon}</div>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 bg-cyber-slate/10">
          {children}
        </div>
      )}
    </div>
  );
};

const ENTITY_TYPES = [
  'Topic',
  'Project',
  'Goal',
  'Concept',
  'Person',
  'Organization',
  'Technology',
  'Decision',
  'Insight'
];

export const AnchorManager: React.FC<AnchorManagerProps> = ({ isOpen, onClose, onAnchorUpdate }) => {
  const [anchors, setAnchors] = useState<AnchorNode[]>([]);
  const [stats, setStats] = useState<AnchorStats | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<AnchorConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAnchorLabel, setNewAnchorLabel] = useState('');
  const [newAnchorType, setNewAnchorType] = useState('Topic');
  const [newAnchorDescription, setNewAnchorDescription] = useState('');
  const [newAnchorStrength, setNewAnchorStrength] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  // Auto-scan state (for finding connections after anchor creation)
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<BatchScanProgress | null>(null);
  const [pendingConnections, setPendingConnections] = useState<ConnectionCandidate[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  const pendingAnchorRef = useRef<AnchorNode | null>(null);

  const loadAnchors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [anchorData, statsData, connectionData] = await Promise.all([
        getAnchors(),
        getAnchorStats(),
        getAnchorConnectionInfo()
      ]);

      setAnchors(anchorData);
      setStats(statsData);
      setConnectionInfo(connectionData);
    } catch (err) {
      setError('Failed to load anchors');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadAnchors();
    }
  }, [isOpen, loadAnchors]);

  // Automatic Scan - runs after anchor creation, shows review modal with results
  // Uses HYBRID approach: semantic search + keyword search + recent nodes for comprehensive coverage
  const performAutoScan = async (anchor: AnchorNode, embedding: number[]) => {
    setIsScanning(true);
    setScanStatusMessage('Searching database for related knowledge...');
    setScanProgress({
      phase: 'semantic_search',
      totalBatches: 1,
      currentBatch: 1,
      nodesProcessed: 0,
      totalNodes: 200,
      connectionsFound: 0
    });

    try {
      // HYBRID RETRIEVAL STRATEGY for better coverage
      const nodeMap = new Map<string, { id: string; label: string; entity_type: string; description?: string; similarity_score?: number }>();

      // 1. SEMANTIC SEARCH: Find nodes with similar embeddings (lower threshold for broader match)
      if (embedding && embedding.length > 0) {
        const semanticResults = await semanticSearchNodesExtended(embedding, 0.15, 150);
        semanticResults.forEach(n => {
          nodeMap.set(n.id, {
            id: n.id,
            label: n.label,
            entity_type: n.entity_type,
            description: n.description,
            similarity_score: n.similarity
          });
        });
        console.log(`[Anchor Scan - Manager] Semantic search found ${semanticResults.length} nodes (threshold: 0.15)`);
      }

      // 2. KEYWORD SEARCH: Extract keywords from anchor name/description and search
      const anchorText = `${anchor.label} ${(anchor as any).description || ''}`;
      const keywords = anchorText
        .toLowerCase()
        .split(/[\s,.\-_:;()]+/)
        .filter(word => word.length > 3)
        .filter(word => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been'].includes(word));

      if (keywords.length > 0) {
        const keywordResults = await fetchRelevantNodes(keywords.slice(0, 10));
        keywordResults.forEach(n => {
          if (!nodeMap.has(n.id)) {
            nodeMap.set(n.id, {
              id: n.id,
              label: n.label,
              entity_type: n.entity_type,
              description: n.description,
              similarity_score: 0.5
            });
          }
        });
        console.log(`[Anchor Scan - Manager] Keyword search (${keywords.slice(0, 5).join(', ')}...) found ${keywordResults.length} additional nodes`);
      }

      // 3. RECENT NODES: Add recent nodes as fallback/supplement
      if (nodeMap.size < 50) {
        const recentNodes = await fetchExistingNodes();
        recentNodes.forEach(n => {
          if (!nodeMap.has(n.id)) {
            nodeMap.set(n.id, {
              id: n.id,
              label: n.label,
              entity_type: n.entity_type,
              description: n.description,
              similarity_score: 0.3
            });
          }
        });
        console.log(`[Anchor Scan - Manager] Added ${recentNodes.length} recent nodes as supplement`);
      }

      // Convert map to array, sorted by similarity
      let nodesToAnalyze = Array.from(nodeMap.values())
        .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
        .slice(0, 200);

      console.log(`[Anchor Scan - Manager] Total unique nodes to analyze: ${nodesToAnalyze.length}`);

      if (nodesToAnalyze.length === 0) {
        // No nodes to scan - finish
        setIsScanning(false);
        setScanProgress(null);
        setScanStatusMessage('');
        setCreating(false);
        await loadAnchors();
        onAnchorUpdate?.();
        pendingAnchorRef.current = null;
        return;
      }

      // Update progress for AI analysis phase
      setScanStatusMessage('Analyzing connections with AI...');
      setScanProgress({
        phase: 'ai_analysis',
        totalBatches: 1,
        currentBatch: 1,
        nodesProcessed: 0,
        totalNodes: nodesToAnalyze.length,
        connectionsFound: 0
      });

      // Find connections using enhanced AI
      const connections = await connectAnchorToKnowledgeEnhanced(
        { label: anchor.label, type: (anchor as any).entity_type, description: (anchor as any).description },
        nodesToAnalyze
      );

      console.log(`[Anchor Scan - Manager] Enhanced AI found ${connections.length} high-confidence connections`);

      // Show review modal with results
      setPendingConnections(connections);
      setShowReviewModal(true);
      setIsScanning(false);
      setScanProgress(null);
      setScanStatusMessage('');

    } catch (err: any) {
      setError(err.message || "Scan failed");
      setIsScanning(false);
      setScanProgress(null);
      setScanStatusMessage('');
      setCreating(false);
    }
  };

  // Handle user confirming selected connections from review modal
  const handleConfirmConnections = async (selectedConnections: ConnectionCandidate[]) => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;

    setShowReviewModal(false);

    try {
      const supabase = getSupabase();
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');

      if (selectedConnections.length > 0) {
        setScanStatusMessage(`Saving ${selectedConnections.length} connections...`);

        const edgesToInsert = selectedConnections.map(c => ({
          source_node_id: anchor.id,
          target_node_id: c.target_node_id,
          relation_type: c.relation.toLowerCase().replace(/\s+/g, '_'),
          evidence: c.evidence,
          weight: c.confidence,
          user_id: userId,
        }));

        await supabase.from('knowledge_edges').insert(edgesToInsert);
        console.log(`[Anchor Scan - Manager] Saved ${selectedConnections.length} connections`);
      }

      // Reset form and reload
      setNewAnchorLabel('');
      setNewAnchorType('Topic');
      setNewAnchorDescription('');
      setNewAnchorStrength(undefined);

      await loadAnchors();
      onAnchorUpdate?.();

    } catch (err: any) {
      setError(err.message || "Failed to save connections");
    } finally {
      setCreating(false);
      pendingAnchorRef.current = null;
      setPendingConnections([]);
      setScanStatusMessage('');
    }
  };

  // Cancel review modal - still complete anchor but skip connections
  const handleCancelReview = async () => {
    setShowReviewModal(false);
    setPendingConnections([]);
    setScanProgress(null);
    setScanStatusMessage('');

    // Reset form and reload
    setNewAnchorLabel('');
    setNewAnchorType('Topic');
    setNewAnchorDescription('');
    setNewAnchorStrength(undefined);

    await loadAnchors();
    onAnchorUpdate?.();

    setCreating(false);
    pendingAnchorRef.current = null;
  };

  const handleCreateAnchor = async () => {
    if (!newAnchorLabel.trim()) {
      setError('Anchor label is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      setScanStatusMessage('Creating anchor...');

      // Step 1: Create the anchor
      const { data: newAnchor, error: createError } = await createAnchor(
        newAnchorLabel.trim(),
        newAnchorType,
        newAnchorDescription.trim() || undefined,
        newAnchorStrength
      );

      if (createError) throw createError;
      if (!newAnchor) throw new Error('Failed to create anchor');

      console.log('[Anchor Manager] Anchor created:', newAnchor.label);

      // Step 2: Generate embedding for the anchor
      setScanStatusMessage('Generating embedding...');
      const embeddingText = `${newAnchor.label}: ${(newAnchor as any).description || ''}`;
      const embedding = await generateEmbedding(embeddingText);

      if (embedding.length > 0) {
        // Update anchor with embedding
        const supabase = getSupabase();
        await supabase.from('knowledge_nodes').update({ embedding }).eq('id', newAnchor.id);
        console.log('[Anchor Manager] Embedding saved for anchor');
      }

      // Step 3: Store anchor reference and trigger auto-scan
      pendingAnchorRef.current = newAnchor;
      await performAutoScan(newAnchor, embedding);

      // Note: Form reset and loadAnchors will happen in handleConfirmConnections or handleCancelReview

    } catch (err) {
      setError('Failed to create anchor');
      console.error(err);
      setCreating(false);
      setScanStatusMessage('');
    }
  };

  const handleRemoveAnchor = async (anchorId: string) => {
    if (!confirm('Remove anchor status? The node will remain in your graph.')) return;

    try {
      setError(null);
      const { error: demoteError } = await demoteFromAnchor(anchorId);
      if (demoteError) throw demoteError;

      await loadAnchors();
      onAnchorUpdate?.();
    } catch (err) {
      setError('Failed to remove anchor');
      console.error(err);
    }
  };

  const handleUpdateStrength = async (anchorId: string, strength: number | null) => {
    try {
      setError(null);
      const { error: updateError } = await updateAnchorStrength(anchorId, strength);
      if (updateError) throw updateError;

      await loadAnchors();
      onAnchorUpdate?.();
    } catch (err) {
      setError('Failed to update anchor strength');
      console.error(err);
    }
  };

  const getConnectionCount = (anchorId: string): number => {
    const info = connectionInfo.find(c => c.anchor_id === anchorId);
    return info?.connection_count || 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-20 border-b border-white/10 bg-cyber-slate/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="bg-cyber-cyan/10 p-2.5 rounded-lg">
            <Anchor size={24} className="text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Anchor Manager</h1>
            <p className="text-xs text-slate-400">Define your focal points for knowledge extraction</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="absolute top-20 bottom-0 left-0 right-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-8 h-8 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full animate-spin mb-4" />
              <p className="text-sm">Loading anchors...</p>
            </div>
          ) : (
            <>
              {/* Error Message */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Info Banner */}
              <div className="bg-cyber-cyan/5 border border-cyber-cyan/20 rounded-lg p-4 mb-6">
                <div className="flex gap-3">
                  <Info size={18} className="text-cyber-cyan flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Anchors are your focal points - entities that represent ongoing areas of focus.
                    During extraction, the AI actively looks for connections between new content and your anchors.
                    Higher priority anchors (5★) receive more emphasis.
                  </p>
                </div>
              </div>

              {/* Stats Overview */}
              {stats && stats.total_anchors > 0 && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
                    <div className="text-white/60 text-xs">Total Anchors</div>
                    <div className="text-2xl font-bold text-white mt-1">{stats.total_anchors}</div>
                  </div>
                  <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
                    <div className="text-white/60 text-xs">Avg Priority</div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {stats.average_strength > 0 ? `${stats.average_strength}★` : 'N/A'}
                    </div>
                  </div>
                  <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
                    <div className="text-white/60 text-xs">Top Type</div>
                    <div className="text-2xl font-bold text-white mt-1 truncate">
                      {Object.entries(stats.anchors_by_type).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
                    </div>
                  </div>
                </div>
              )}

              {/* Create Anchor Section */}
              <Section
                title={showCreateForm ? "Create New Anchor" : "Create Anchor"}
                icon={<Plus size={18} />}
                defaultOpen={false}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Label *</label>
                    <input
                      type="text"
                      placeholder="e.g., AI Safety, Product Strategy, Machine Learning"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors"
                      value={newAnchorLabel}
                      onChange={(e) => setNewAnchorLabel(e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Entity Type</label>
                    <select
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer"
                      value={newAnchorType}
                      onChange={(e) => setNewAnchorType(e.target.value)}
                    >
                      {ENTITY_TYPES.map(type => (
                        <option key={type} value={type} className="bg-cyber-slate">{type}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Description (optional)</label>
                    <textarea
                      placeholder="Brief description of this anchor's significance..."
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors resize-none h-20"
                      value={newAnchorDescription}
                      onChange={(e) => setNewAnchorDescription(e.target.value)}
                      maxLength={300}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Priority (optional)</label>
                    <select
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer"
                      value={newAnchorStrength || ''}
                      onChange={(e) => setNewAnchorStrength(e.target.value ? parseInt(e.target.value) : undefined)}
                    >
                      <option value="" className="bg-cyber-slate">No priority set</option>
                      <option value="5" className="bg-cyber-slate">5 - Highest Priority</option>
                      <option value="4" className="bg-cyber-slate">4 - High Priority</option>
                      <option value="3" className="bg-cyber-slate">3 - Medium Priority</option>
                      <option value="2" className="bg-cyber-slate">2 - Low Priority</option>
                      <option value="1" className="bg-cyber-slate">1 - Lowest Priority</option>
                    </select>
                  </div>

                  <button
                    onClick={handleCreateAnchor}
                    disabled={creating || isScanning || !newAnchorLabel.trim()}
                    className={clsx(
                      "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      creating || isScanning || !newAnchorLabel.trim()
                        ? "bg-white/5 text-slate-500 cursor-not-allowed"
                        : "bg-cyber-cyan/20 hover:bg-cyber-cyan/30 border border-cyber-cyan/50 text-cyber-cyan"
                    )}
                  >
                    {creating || isScanning ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        {scanStatusMessage || 'Creating...'}
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        Create Anchor
                      </>
                    )}
                  </button>
                </div>
              </Section>

              {/* Anchor List */}
              <Section
                title={`Your Anchors (${anchors.length})`}
                icon={<Anchor size={18} />}
                defaultOpen={true}
              >
                {anchors.length === 0 ? (
                  <div className="text-center py-8">
                    <Anchor className="w-12 h-12 text-white/20 mx-auto mb-4" />
                    <p className="text-white/60 text-sm">No anchors yet</p>
                    <p className="text-white/40 text-xs mt-2">
                      Create anchors to define your areas of focus
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anchors.map(anchor => (
                      <div
                        key={anchor.id}
                        className="bg-cyber-slate/30 border border-white/10 hover:border-cyber-cyan/30 rounded-lg p-4 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-semibold text-white truncate">{anchor.label}</h3>
                              <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">
                                {(anchor as any).entity_type || 'Unknown'}
                              </span>
                              {anchor.anchor_strength && (
                                <div className="flex items-center gap-0.5">
                                  {[...Array(anchor.anchor_strength)].map((_, i) => (
                                    <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                                  ))}
                                </div>
                              )}
                            </div>

                            {(anchor as any).description && (
                              <p className="text-white/50 text-xs mt-1.5 line-clamp-2">
                                {(anchor as any).description}
                              </p>
                            )}

                            <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                              <div className="flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" />
                                {getConnectionCount(anchor.id)} connections
                              </div>
                              {anchor.anchor_created_at && (
                                <div>
                                  Created {new Date(anchor.anchor_created_at).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select
                              value={anchor.anchor_strength || ''}
                              onChange={(e) => handleUpdateStrength(
                                anchor.id,
                                e.target.value ? parseInt(e.target.value) : null
                              )}
                              className="bg-cyber-slate border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyber-cyan/50"
                              title="Set priority"
                            >
                              <option value="">No priority</option>
                              <option value="5">Priority 5</option>
                              <option value="4">Priority 4</option>
                              <option value="3">Priority 3</option>
                              <option value="2">Priority 2</option>
                              <option value="1">Priority 1</option>
                            </select>

                            <button
                              onClick={() => handleRemoveAnchor(anchor.id)}
                              className="p-1.5 hover:bg-red-500/20 rounded transition-colors group"
                              title="Remove anchor status"
                            >
                              <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* Footer Note */}
              <div className="text-center pt-4 pb-8">
                <p className="text-xs text-slate-500">
                  You can also promote nodes to anchors by right-clicking them in the graph view.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Auto-Scan Review Modal */}
      {showReviewModal && (
        <AnchorScanReviewModal
          anchorName={pendingAnchorRef.current?.label || newAnchorLabel}
          anchorType={pendingAnchorRef.current ? (pendingAnchorRef.current as any).entity_type : newAnchorType}
          connections={pendingConnections}
          scanProgress={scanProgress}
          isScanning={isScanning}
          onConfirm={handleConfirmConnections}
          onCancel={handleCancelReview}
        />
      )}
    </div>
  );
};

/* ─── Standalone content (for embedding in SettingsPanel) ─── */

export const AnchorManagerContent: React.FC<{ onAnchorUpdate?: () => void }> = ({ onAnchorUpdate }) => {
  const [anchors, setAnchors] = useState<AnchorNode[]>([]);
  const [stats, setStats] = useState<AnchorStats | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<AnchorConnectionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newAnchorLabel, setNewAnchorLabel] = useState('');
  const [newAnchorType, setNewAnchorType] = useState('Topic');
  const [newAnchorDescription, setNewAnchorDescription] = useState('');
  const [newAnchorStrength, setNewAnchorStrength] = useState<number | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<BatchScanProgress | null>(null);
  const [pendingConnections, setPendingConnections] = useState<ConnectionCandidate[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [scanStatusMessage, setScanStatusMessage] = useState('');
  const pendingAnchorRef = useRef<AnchorNode | null>(null);

  const loadAnchors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [anchorData, statsData, connectionData] = await Promise.all([
        getAnchors(), getAnchorStats(), getAnchorConnectionInfo()
      ]);
      setAnchors(anchorData);
      setStats(statsData);
      setConnectionInfo(connectionData);
    } catch (err) {
      setError('Failed to load anchors');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAnchors(); }, [loadAnchors]);

  const performAutoScan = async (anchor: AnchorNode, embedding: number[]) => {
    setIsScanning(true);
    setScanStatusMessage('Searching database for related knowledge...');
    setScanProgress({ phase: 'semantic_search', totalBatches: 1, currentBatch: 1, nodesProcessed: 0, totalNodes: 200, connectionsFound: 0 });

    try {
      const nodeMap = new Map<string, { id: string; label: string; entity_type: string; description?: string; similarity_score?: number }>();

      if (embedding && embedding.length > 0) {
        const semanticResults = await semanticSearchNodesExtended(embedding, 0.15, 150);
        semanticResults.forEach(n => { nodeMap.set(n.id, { id: n.id, label: n.label, entity_type: n.entity_type, description: n.description, similarity_score: n.similarity }); });
      }

      const anchorText = `${anchor.label} ${(anchor as any).description || ''}`;
      const keywords = anchorText.toLowerCase().split(/[\s,.\-_:;()]+/).filter(word => word.length > 3).filter(word => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been'].includes(word));
      if (keywords.length > 0) {
        const keywordResults = await fetchRelevantNodes(keywords.slice(0, 10));
        keywordResults.forEach(n => { if (!nodeMap.has(n.id)) nodeMap.set(n.id, { id: n.id, label: n.label, entity_type: n.entity_type, description: n.description, similarity_score: 0.5 }); });
      }

      if (nodeMap.size < 50) {
        const recentNodes = await fetchExistingNodes();
        recentNodes.forEach(n => { if (!nodeMap.has(n.id)) nodeMap.set(n.id, { id: n.id, label: n.label, entity_type: n.entity_type, description: n.description, similarity_score: 0.3 }); });
      }

      let nodesToAnalyze = Array.from(nodeMap.values()).sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0)).slice(0, 200);

      if (nodesToAnalyze.length === 0) {
        setIsScanning(false); setScanProgress(null); setScanStatusMessage(''); setCreating(false);
        await loadAnchors(); onAnchorUpdate?.(); pendingAnchorRef.current = null;
        return;
      }

      setScanStatusMessage('Analyzing connections with AI...');
      setScanProgress({ phase: 'ai_analysis', totalBatches: 1, currentBatch: 1, nodesProcessed: 0, totalNodes: nodesToAnalyze.length, connectionsFound: 0 });

      const connections = await connectAnchorToKnowledgeEnhanced(
        { label: anchor.label, type: (anchor as any).entity_type, description: (anchor as any).description },
        nodesToAnalyze
      );

      setPendingConnections(connections);
      setShowReviewModal(true);
      setIsScanning(false); setScanProgress(null); setScanStatusMessage('');
    } catch (err: any) {
      setError(err.message || "Scan failed");
      setIsScanning(false); setScanProgress(null); setScanStatusMessage(''); setCreating(false);
    }
  };

  const handleConfirmConnections = async (selectedConnections: ConnectionCandidate[]) => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    setShowReviewModal(false);
    try {
      const supabase = getSupabase();
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('Not authenticated');
      if (selectedConnections.length > 0) {
        setScanStatusMessage(`Saving ${selectedConnections.length} connections...`);
        const edgesToInsert = selectedConnections.map(c => ({ source_node_id: anchor.id, target_node_id: c.target_node_id, relation_type: c.relation.toLowerCase().replace(/\s+/g, '_'), evidence: c.evidence, weight: c.confidence, user_id: userId }));
        await supabase.from('knowledge_edges').insert(edgesToInsert);
      }
      setNewAnchorLabel(''); setNewAnchorType('Topic'); setNewAnchorDescription(''); setNewAnchorStrength(undefined);
      await loadAnchors(); onAnchorUpdate?.();
    } catch (err: any) {
      setError(err.message || "Failed to save connections");
    } finally {
      setCreating(false); pendingAnchorRef.current = null; setPendingConnections([]); setScanStatusMessage('');
    }
  };

  const handleCancelReview = async () => {
    setShowReviewModal(false); setPendingConnections([]); setScanProgress(null); setScanStatusMessage('');
    setNewAnchorLabel(''); setNewAnchorType('Topic'); setNewAnchorDescription(''); setNewAnchorStrength(undefined);
    await loadAnchors(); onAnchorUpdate?.();
    setCreating(false); pendingAnchorRef.current = null;
  };

  const handleCreateAnchor = async () => {
    if (!newAnchorLabel.trim()) { setError('Anchor label is required'); return; }
    try {
      setCreating(true); setError(null); setScanStatusMessage('Creating anchor...');
      const { data: newAnchor, error: createError } = await createAnchor(newAnchorLabel.trim(), newAnchorType, newAnchorDescription.trim() || undefined, newAnchorStrength);
      if (createError) throw createError;
      if (!newAnchor) throw new Error('Failed to create anchor');

      setScanStatusMessage('Generating embedding...');
      const embeddingText = `${newAnchor.label}: ${(newAnchor as any).description || ''}`;
      const embedding = await generateEmbedding(embeddingText);
      if (embedding.length > 0) {
        const supabase = getSupabase();
        await supabase.from('knowledge_nodes').update({ embedding }).eq('id', newAnchor.id);
      }

      pendingAnchorRef.current = newAnchor;
      await performAutoScan(newAnchor, embedding);
    } catch (err) {
      setError('Failed to create anchor'); console.error(err); setCreating(false); setScanStatusMessage('');
    }
  };

  const handleRemoveAnchor = async (anchorId: string) => {
    if (!confirm('Remove anchor status? The node will remain in your graph.')) return;
    try { setError(null); const { error: demoteError } = await demoteFromAnchor(anchorId); if (demoteError) throw demoteError; await loadAnchors(); onAnchorUpdate?.(); }
    catch (err) { setError('Failed to remove anchor'); console.error(err); }
  };

  const handleUpdateStrength = async (anchorId: string, strength: number | null) => {
    try { setError(null); const { error: updateError } = await updateAnchorStrength(anchorId, strength); if (updateError) throw updateError; await loadAnchors(); onAnchorUpdate?.(); }
    catch (err) { setError('Failed to update anchor strength'); console.error(err); }
  };

  const getConnectionCount = (anchorId: string): number => {
    const info = connectionInfo.find(c => c.anchor_id === anchorId);
    return info?.connection_count || 0;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-8 h-8 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full animate-spin mb-4" />
        <p className="text-sm">Loading anchors...</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-cyber-cyan/5 border border-cyber-cyan/20 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <Info size={18} className="text-cyber-cyan flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed">
              Anchors are your focal points - entities that represent ongoing areas of focus.
              During extraction, the AI actively looks for connections between new content and your anchors.
              Higher priority anchors (5★) receive more emphasis.
            </p>
          </div>
        </div>

        {stats && stats.total_anchors > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
              <div className="text-white/60 text-xs">Total Anchors</div>
              <div className="text-2xl font-bold text-white mt-1">{stats.total_anchors}</div>
            </div>
            <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
              <div className="text-white/60 text-xs">Avg Priority</div>
              <div className="text-2xl font-bold text-white mt-1">{stats.average_strength > 0 ? `${stats.average_strength}★` : 'N/A'}</div>
            </div>
            <div className="bg-cyber-slate/50 border border-white/10 rounded-lg p-4">
              <div className="text-white/60 text-xs">Top Type</div>
              <div className="text-2xl font-bold text-white mt-1 truncate">{Object.entries(stats.anchors_by_type).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}</div>
            </div>
          </div>
        )}

        <Section title="Create Anchor" icon={<Plus size={18} />} defaultOpen={false}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Label *</label>
              <input type="text" placeholder="e.g., AI Safety, Product Strategy, Machine Learning" className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors" value={newAnchorLabel} onChange={(e) => setNewAnchorLabel(e.target.value)} maxLength={100} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Entity Type</label>
              <select className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer" value={newAnchorType} onChange={(e) => setNewAnchorType(e.target.value)}>
                {ENTITY_TYPES.map(type => (<option key={type} value={type} className="bg-cyber-slate">{type}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Description (optional)</label>
              <textarea placeholder="Brief description of this anchor's significance..." className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors resize-none h-20" value={newAnchorDescription} onChange={(e) => setNewAnchorDescription(e.target.value)} maxLength={300} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Priority (optional)</label>
              <select className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer" value={newAnchorStrength || ''} onChange={(e) => setNewAnchorStrength(e.target.value ? parseInt(e.target.value) : undefined)}>
                <option value="" className="bg-cyber-slate">No priority set</option>
                <option value="5" className="bg-cyber-slate">5 - Highest Priority</option>
                <option value="4" className="bg-cyber-slate">4 - High Priority</option>
                <option value="3" className="bg-cyber-slate">3 - Medium Priority</option>
                <option value="2" className="bg-cyber-slate">2 - Low Priority</option>
                <option value="1" className="bg-cyber-slate">1 - Lowest Priority</option>
              </select>
            </div>
            <button onClick={handleCreateAnchor} disabled={creating || isScanning || !newAnchorLabel.trim()} className={clsx("w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors", creating || isScanning || !newAnchorLabel.trim() ? "bg-white/5 text-slate-500 cursor-not-allowed" : "bg-cyber-cyan/20 hover:bg-cyber-cyan/30 border border-cyber-cyan/50 text-cyber-cyan")}>
              {creating || isScanning ? (<><Loader2 size={16} className="animate-spin" />{scanStatusMessage || 'Creating...'}</>) : (<><Plus size={16} />Create Anchor</>)}
            </button>
          </div>
        </Section>

        <Section title={`Your Anchors (${anchors.length})`} icon={<Anchor size={18} />} defaultOpen={true}>
          {anchors.length === 0 ? (
            <div className="text-center py-8">
              <Anchor className="w-12 h-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/60 text-sm">No anchors yet</p>
              <p className="text-white/40 text-xs mt-2">Create anchors to define your areas of focus</p>
            </div>
          ) : (
            <div className="space-y-3">
              {anchors.map(anchor => (
                <div key={anchor.id} className="bg-cyber-slate/30 border border-white/10 hover:border-cyber-cyan/30 rounded-lg p-4 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-white truncate">{anchor.label}</h3>
                        <span className="px-2 py-0.5 bg-white/10 rounded text-xs text-white/60">{(anchor as any).entity_type || 'Unknown'}</span>
                        {anchor.anchor_strength && (
                          <div className="flex items-center gap-0.5">
                            {[...Array(anchor.anchor_strength)].map((_, i) => (<Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />))}
                          </div>
                        )}
                      </div>
                      {(anchor as any).description && (<p className="text-white/50 text-xs mt-1.5 line-clamp-2">{(anchor as any).description}</p>)}
                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                        <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{getConnectionCount(anchor.id)} connections</div>
                        {anchor.anchor_created_at && (<div>Created {new Date(anchor.anchor_created_at).toLocaleDateString()}</div>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select value={anchor.anchor_strength || ''} onChange={(e) => handleUpdateStrength(anchor.id, e.target.value ? parseInt(e.target.value) : null)} className="bg-cyber-slate border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyber-cyan/50" title="Set priority">
                        <option value="">No priority</option>
                        <option value="5">Priority 5</option><option value="4">Priority 4</option><option value="3">Priority 3</option><option value="2">Priority 2</option><option value="1">Priority 1</option>
                      </select>
                      <button onClick={() => handleRemoveAnchor(anchor.id)} className="p-1.5 hover:bg-red-500/20 rounded transition-colors group" title="Remove anchor status">
                        <Trash2 className="w-4 h-4 text-white/40 group-hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <div className="text-center pt-4 pb-8">
          <p className="text-xs text-slate-500">You can also promote nodes to anchors by right-clicking them in the graph view.</p>
        </div>
      </div>

      {showReviewModal && (
        <AnchorScanReviewModal
          anchorName={pendingAnchorRef.current?.label || newAnchorLabel}
          anchorType={pendingAnchorRef.current ? (pendingAnchorRef.current as any).entity_type : newAnchorType}
          connections={pendingConnections}
          scanProgress={scanProgress}
          isScanning={isScanning}
          onConfirm={handleConfirmConnections}
          onCancel={handleCancelReview}
        />
      )}
    </>
  );
};

export default AnchorManager;
