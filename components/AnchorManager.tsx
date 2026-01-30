import React, { useState, useEffect, useCallback } from 'react';
import { Anchor, Plus, Trash2, Star, TrendingUp, Info, X, ChevronDown, ChevronUp } from 'lucide-react';
import { getAnchors, getAnchorStats, getAnchorConnectionInfo, createAnchor, demoteFromAnchor, updateAnchorStrength } from '../services/anchorService';
import { AnchorNode, AnchorStats, AnchorConnectionInfo } from '../types';
import clsx from 'clsx';

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

  const handleCreateAnchor = async () => {
    if (!newAnchorLabel.trim()) {
      setError('Anchor label is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const { error: createError } = await createAnchor(
        newAnchorLabel.trim(),
        newAnchorType,
        newAnchorDescription.trim() || undefined,
        newAnchorStrength
      );

      if (createError) throw createError;

      // Reset form
      setNewAnchorLabel('');
      setNewAnchorType('Topic');
      setNewAnchorDescription('');
      setNewAnchorStrength(undefined);
      setShowCreateForm(false);

      // Reload anchors
      await loadAnchors();
      onAnchorUpdate?.();
    } catch (err) {
      setError('Failed to create anchor');
      console.error(err);
    } finally {
      setCreating(false);
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
                    disabled={creating || !newAnchorLabel.trim()}
                    className={clsx(
                      "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      creating || !newAnchorLabel.trim()
                        ? "bg-white/5 text-slate-500 cursor-not-allowed"
                        : "bg-cyber-cyan/20 hover:bg-cyber-cyan/30 border border-cyber-cyan/50 text-cyber-cyan"
                    )}
                  >
                    {creating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full animate-spin" />
                        Creating...
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
    </div>
  );
};

export default AnchorManager;
