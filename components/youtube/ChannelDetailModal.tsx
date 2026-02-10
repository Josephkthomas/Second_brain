// ChannelDetailModal - View and edit YouTube channel details

import React, { useState, useEffect } from 'react';
import {
  X, Youtube, Loader2, AlertCircle, CheckCircle, Save,
  ExternalLink, Video, Clock, Settings2, Trash2, Play, Pause,
  RefreshCw, Tag
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAnchors } from '../../services/supabase';
import type { YouTubeChannel, YouTubeQueueItem } from '../../types/youtube';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';

interface ChannelDetailModalProps {
  channel: YouTubeChannel;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

const EXTRACTION_MODES: Array<{ id: ExtractionMode; name: string }> = [
  { id: 'comprehensive', name: 'Comprehensive' },
  { id: 'strategic', name: 'Strategic' },
  { id: 'actionable', name: 'Actionable' },
  { id: 'relational', name: 'Relational' },
];

const ANCHOR_EMPHASIS_OPTIONS: Array<{ id: AnchorEmphasis; name: string }> = [
  { id: 'standard', name: 'Standard' },
  { id: 'aggressive', name: 'Aggressive' },
  { id: 'passive', name: 'Passive' },
];

export default function ChannelDetailModal({
  channel,
  onClose,
  onUpdate,
  onDelete,
}: ChannelDetailModalProps) {
  const { session } = useAuth();

  // Settings state
  const [autoIngest, setAutoIngest] = useState(channel.auto_ingest);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>(
    (channel.extraction_mode as ExtractionMode) || 'comprehensive'
  );
  const [anchorEmphasis, setAnchorEmphasis] = useState<AnchorEmphasis>(
    (channel.anchor_emphasis as AnchorEmphasis) || 'standard'
  );
  const [linkedAnchorIds, setLinkedAnchorIds] = useState<string[]>(
    channel.linked_anchor_ids || []
  );
  const [customInstructions, setCustomInstructions] = useState(
    channel.custom_instructions || ''
  );

  // Duration filter settings (convert seconds to minutes for UI)
  const [minDurationMinutes, setMinDurationMinutes] = useState(
    (channel.min_video_duration ?? 90) / 60
  );
  const [maxDurationMinutes, setMaxDurationMinutes] = useState<number | null>(
    channel.max_video_duration ? channel.max_video_duration / 60 : null
  );

  // UI state
  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'settings'>('overview');
  const [queueItems, setQueueItems] = useState<YouTubeQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string }>>([]);

  // Fetch anchors
  useEffect(() => {
    async function loadAnchors() {
      try {
        const data = await fetchAnchors();
        setAnchors(data.map(a => ({ id: a.id, label: a.label })));
      } catch (err) {
        console.error('Failed to fetch anchors:', err);
      }
    }
    loadAnchors();
  }, []);

  // Fetch queue items for this channel
  useEffect(() => {
    async function loadQueue() {
      if (!session?.access_token) return;

      setIsLoadingQueue(true);
      try {
        const response = await fetch(`/api/youtube/queue?channel_id=${channel.id}`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setQueueItems(data.items || []);
        }
      } catch (err) {
        console.error('Failed to fetch queue:', err);
      } finally {
        setIsLoadingQueue(false);
      }
    }

    if (activeTab === 'queue') {
      loadQueue();
    }
  }, [activeTab, channel.id, session?.access_token]);

  // Save settings
  const handleSave = async () => {
    if (!session?.access_token) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/youtube/channels', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: channel.id,
          auto_ingest: autoIngest,
          extraction_mode: extractionMode,
          anchor_emphasis: anchorEmphasis,
          linked_anchor_ids: linkedAnchorIds,
          custom_instructions: customInstructions.trim() || null,
          min_video_duration: Math.round(minDurationMinutes * 60),
          max_video_duration: maxDurationMinutes ? Math.round(maxDurationMinutes * 60) : null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update channel');
      }

      setSuccess(true);
      setTimeout(() => {
        onUpdate();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete channel
  const handleDelete = async () => {
    if (!session?.access_token) return;
    if (!confirm('Are you sure you want to delete this channel? This cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/youtube/channels', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: channel.id }),
      });

      if (response.ok) {
        onDelete();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete channel');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
    }
  };

  // Toggle anchor
  const toggleAnchor = (anchorId: string) => {
    setLinkedAnchorIds(prev =>
      prev.includes(anchorId)
        ? prev.filter(id => id !== anchorId)
        : [...prev, anchorId]
    );
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'processing':
      case 'extracting':
      case 'fetching_transcript': return 'text-cyan-400 bg-cyan-500/10';
      case 'pending': return 'text-slate-400 bg-slate-500/10';
      case 'failed': return 'text-red-400 bg-red-500/10';
      default: return 'text-slate-400 bg-slate-500/10';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            {channel.thumbnail_url ? (
              <img
                src={channel.thumbnail_url}
                alt={channel.channel_name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                <Youtube className="w-6 h-6 text-red-500" />
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{channel.channel_name}</h3>
              <a
                href={channel.channel_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-slate-400 hover:text-red-400 flex items-center gap-1"
              >
                View on YouTube <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {[
            { id: 'overview', label: 'Overview', icon: Video },
            { id: 'queue', label: 'Queue', icon: Clock },
            { id: 'settings', label: 'Settings', icon: Settings2 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                'flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-2xl font-bold text-white">
                    {channel.total_videos_ingested || 0}
                  </div>
                  <div className="text-sm text-slate-400">Videos Ingested</div>
                </div>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-sm font-medium text-white">
                    {formatDate(channel.last_checked_at)}
                  </div>
                  <div className="text-sm text-slate-400">Last Checked</div>
                </div>
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className={clsx(
                    'text-sm font-medium',
                    channel.is_active ? 'text-emerald-400' : 'text-slate-400'
                  )}>
                    {channel.is_active ? 'Active' : 'Paused'}
                  </div>
                  <div className="text-sm text-slate-400">Status</div>
                </div>
              </div>

              {/* Description */}
              {channel.description && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="text-sm font-medium text-slate-300 mb-2">Description</div>
                  <p className="text-sm text-slate-400">{channel.description}</p>
                </div>
              )}

              {/* Current Settings Summary */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="text-sm font-medium text-slate-300 mb-3">Current Settings</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Auto-Ingest:</span>{' '}
                    <span className={autoIngest ? 'text-emerald-400' : 'text-slate-400'}>
                      {autoIngest ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Extraction Mode:</span>{' '}
                    <span className="text-white capitalize">{extractionMode}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Anchor Emphasis:</span>{' '}
                    <span className="text-white capitalize">{anchorEmphasis}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Linked Anchors:</span>{' '}
                    <span className="text-white">{linkedAnchorIds.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Min Duration:</span>{' '}
                    <span className="text-white">{minDurationMinutes} min</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Max Duration:</span>{' '}
                    <span className="text-white">{maxDurationMinutes ? `${maxDurationMinutes} min` : 'Unlimited'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Queue Tab */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {isLoadingQueue ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : queueItems.length === 0 ? (
                <div className="text-center py-12">
                  <Video className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No videos in queue</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Videos will appear here when they're queued for processing
                  </p>
                </div>
              ) : (
                queueItems.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-lg"
                  >
                    <img
                      src={item.thumbnail_url || `https://i.ytimg.com/vi/${item.video_id}/default.jpg`}
                      alt={item.video_title}
                      className="w-24 h-14 rounded object-cover bg-slate-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {item.video_title}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {formatDate(item.published_at)}
                      </div>
                    </div>
                    <div className={clsx(
                      'px-2 py-1 rounded text-xs font-medium',
                      getStatusColor(item.status)
                    )}>
                      {item.status}
                    </div>
                    {item.nodes_created > 0 && (
                      <div className="text-xs text-slate-400">
                        {item.nodes_created} nodes
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Auto-Ingest Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-lg">
                <div>
                  <div className="text-white font-medium">Auto-Ingest New Videos</div>
                  <div className="text-sm text-slate-400">Automatically process new uploads</div>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoIngest(!autoIngest)}
                  className={clsx(
                    'w-12 h-6 rounded-full transition-colors relative',
                    autoIngest ? 'bg-red-600' : 'bg-slate-700'
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                      autoIngest ? 'left-7' : 'left-1'
                    )}
                  />
                </button>
              </div>

              {/* Extraction Mode */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Extraction Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {EXTRACTION_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setExtractionMode(mode.id)}
                      className={clsx(
                        'p-3 rounded-lg border text-sm font-medium transition-all text-left',
                        extractionMode === mode.id
                          ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                      )}
                    >
                      {mode.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Anchor Emphasis */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Anchor Emphasis
                </label>
                <div className="flex gap-2">
                  {ANCHOR_EMPHASIS_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setAnchorEmphasis(option.id)}
                      className={clsx(
                        'flex-1 p-2 rounded-lg border text-sm transition-all',
                        anchorEmphasis === option.id
                          ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                      )}
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Linked Anchors */}
              {anchors.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    <Tag className="w-4 h-4 inline mr-2" />
                    Linked Anchors
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {anchors.map(anchor => (
                      <button
                        key={anchor.id}
                        type="button"
                        onClick={() => toggleAnchor(anchor.id)}
                        className={clsx(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          linkedAnchorIds.includes(anchor.id)
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600'
                        )}
                      >
                        {anchor.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Video Duration Filter */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  <Clock className="w-4 h-4 inline mr-2" />
                  Video Duration Filter
                </label>
                <p className="text-xs text-slate-500 mb-3">
                  Only process videos within this duration range
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Minimum (minutes)</label>
                    <input
                      type="number"
                      value={minDurationMinutes}
                      onChange={(e) => setMinDurationMinutes(Math.max(0, parseFloat(e.target.value) || 0))}
                      min={0}
                      step={0.5}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="1.5"
                    />
                    <p className="text-xs text-slate-500 mt-1">1.5 min skips Shorts</p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Maximum (minutes)</label>
                    <input
                      type="number"
                      value={maxDurationMinutes ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMaxDurationMinutes(val === '' ? null : Math.max(0, parseFloat(val) || 0));
                      }}
                      min={0}
                      step={5}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                      placeholder="Unlimited"
                    />
                    <p className="text-xs text-slate-500 mt-1">Empty = no limit</p>
                  </div>
                </div>
              </div>

              {/* Custom Instructions */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Custom Instructions
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g., Focus on technical concepts, ignore sponsor segments..."
                  className="w-full h-24 px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                />
              </div>

              {/* Error/Success */}
              {error && (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-500" />
                  <p className="text-emerald-400 text-sm">Settings saved!</p>
                </div>
              )}

              {/* Danger Zone */}
              <div className="pt-6 border-t border-slate-800">
                <div className="text-sm font-medium text-red-400 mb-3">Danger Zone</div>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete Channel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {activeTab === 'settings' && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={clsx(
                'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
                isSaving
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              )}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
