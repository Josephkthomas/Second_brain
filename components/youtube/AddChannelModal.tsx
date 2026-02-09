// AddChannelModal - Modal for adding a new YouTube channel

import React, { useState, useEffect } from 'react';
import { X, Youtube, Loader2, AlertCircle, CheckCircle, Link, Tag, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAnchors } from '../../services/supabase';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';

interface AddChannelModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const EXTRACTION_MODES: Array<{ id: ExtractionMode; name: string; description: string }> = [
  { id: 'comprehensive', name: 'Comprehensive', description: 'Extract all entities and relationships' },
  { id: 'strategic', name: 'Strategic', description: 'Focus on goals, decisions, and projects' },
  { id: 'actionable', name: 'Actionable', description: 'Prioritize actions, tasks, and insights' },
  { id: 'relational', name: 'Relational', description: 'Emphasize connections and people' },
];

const ANCHOR_EMPHASIS_OPTIONS: Array<{ id: AnchorEmphasis; name: string; description: string }> = [
  { id: 'standard', name: 'Standard', description: 'Balanced anchor linking' },
  { id: 'aggressive', name: 'Aggressive', description: 'Strongly prioritize anchor connections' },
  { id: 'passive', name: 'Passive', description: 'Minimal anchor influence' },
];

export default function AddChannelModal({ onClose, onSuccess }: AddChannelModalProps) {
  const { session } = useAuth();

  // Form state
  const [channelUrl, setChannelUrl] = useState('');
  const [autoIngest, setAutoIngest] = useState(true);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('comprehensive');
  const [anchorEmphasis, setAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [linkedAnchorIds, setLinkedAnchorIds] = useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [backfillCount, setBackfillCount] = useState(5);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string; entity_type: string }>>([]);

  // Fetch anchors on mount
  useEffect(() => {
    async function loadAnchors() {
      try {
        const data = await fetchAnchors();
        setAnchors(data.map(a => ({ id: a.id, label: a.label, entity_type: a.entity_type })));
      } catch (err) {
        console.error('Failed to fetch anchors:', err);
      }
    }
    loadAnchors();
  }, []);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !channelUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch('/api/youtube/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          channel_url: channelUrl.trim(),
          auto_ingest: autoIngest,
          extraction_mode: extractionMode,
          anchor_emphasis: anchorEmphasis,
          linked_anchor_ids: linkedAnchorIds,
          custom_instructions: customInstructions.trim() || null,
          backfill_count: backfillCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add channel');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add channel');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle anchor selection
  const toggleAnchor = (anchorId: string) => {
    setLinkedAnchorIds(prev =>
      prev.includes(anchorId)
        ? prev.filter(id => id !== anchorId)
        : [...prev, anchorId]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/30">
              <Youtube className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Add YouTube Channel</h3>
              <p className="text-sm text-slate-400">Subscribe to auto-ingest new videos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Channel URL */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <Link className="w-4 h-4 inline mr-2" />
              Channel URL
            </label>
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://www.youtube.com/@channelname"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              required
            />
            <p className="text-xs text-slate-500 mt-2">
              Supports @username, /channel/UCxxx, and /c/customname formats
            </p>
          </div>

          {/* Auto Ingest Toggle */}
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

          {/* Link to Anchors */}
          {anchors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                <Tag className="w-4 h-4 inline mr-2" />
                Link to Anchors (Optional)
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Connect extracted knowledge to your strategic anchors
              </p>
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

          {/* Backfill */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Backfill Recent Videos
            </label>
            <select
              value={backfillCount}
              onChange={(e) => setBackfillCount(parseInt(e.target.value, 10))}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-red-500 focus:outline-none"
            >
              <option value={0}>Don't backfill</option>
              <option value={3}>Last 3 videos</option>
              <option value={5}>Last 5 videos</option>
              <option value={10}>Last 10 videos</option>
              <option value={15}>Last 15 videos (max)</option>
            </select>
          </div>

          {/* Advanced Options */}
          <div className="border border-slate-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-slate-300">Advanced Options</span>
              </div>
              <span className="text-slate-500">{showAdvanced ? '−' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-slate-800 space-y-5">
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
                          'text-left p-3 rounded-lg border transition-all',
                          extractionMode === mode.id
                            ? 'border-cyan-500 bg-cyan-900/20'
                            : 'border-slate-700 bg-slate-900 hover:border-slate-600'
                        )}
                      >
                        <div className="text-sm font-medium text-white">{mode.name}</div>
                        <div className="text-xs text-slate-400">{mode.description}</div>
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

                {/* Custom Instructions */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Custom Instructions (Optional)
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g., Focus on technical concepts, ignore sponsor segments..."
                    className="w-full h-20 px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !channelUrl.trim()}
            className={clsx(
              'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
              isSubmitting || !channelUrl.trim()
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 text-white'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Add Channel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
