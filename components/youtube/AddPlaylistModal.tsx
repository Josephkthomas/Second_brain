// AddPlaylistModal - Setup wizard for connecting a YouTube playlist
// Step 1: Generate Synapse code
// Step 2: User creates playlist on YouTube with the code name
// Step 3: Paste playlist URL
// Step 4: Verify & configure extraction settings

import React, { useState, useEffect, useMemo } from 'react';
import { X, ListVideo, Loader2, AlertCircle, CheckCircle, Link, Tag, Settings2, Copy, Check, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAnchors } from '../../services/supabase';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';

interface AddPlaylistModalProps {
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

// Generate code on component mount (not per render)
function generatePlaylistCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SYN-${code}`;
}

export default function AddPlaylistModal({ onClose, onSuccess }: AddPlaylistModalProps) {
  const { session } = useAuth();

  // Generate code once on mount
  const synapseCode = useMemo(() => generatePlaylistCode(), []);
  const playlistName = `SYNAPSE-${synapseCode}`;

  // Form state
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('comprehensive');
  const [anchorEmphasis, setAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [linkedAnchorIds, setLinkedAnchorIds] = useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string; entity_type: string }>>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [nameCopied, setNameCopied] = useState(false);

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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(synapseCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleCopyName = () => {
    navigator.clipboard.writeText(playlistName);
    setNameCopied(true);
    setTimeout(() => setNameCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !playlistUrl.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch('/api/youtube/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          playlist_url: playlistUrl.trim(),
          auto_process: autoProcess,
          extraction_mode: extractionMode,
          anchor_emphasis: anchorEmphasis,
          linked_anchor_ids: linkedAnchorIds,
          custom_instructions: customInstructions.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect playlist');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect playlist');
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <ListVideo className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Connect YouTube Playlist</h3>
              <p className="text-sm text-slate-400">Auto-ingest videos from a YouTube playlist</p>
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

          {/* Step 1: Synapse Code */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <div className="text-sm font-medium text-slate-300 mb-1">Step 1: Your Synapse Code</div>
            <p className="text-xs text-slate-500 mb-3">
              Create a new playlist on YouTube and name it with this code
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg p-3">
                <span className="text-lg font-mono font-bold text-white tracking-wider">{playlistName}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyName}
                className="px-3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-2"
              >
                {nameCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span className="text-xs">{nameCopied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Step 2: Instructions */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <div className="text-sm font-medium text-slate-300 mb-2">Step 2: Create Playlist on YouTube</div>
            <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
              <li>Go to <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:text-red-300 inline-flex items-center gap-1">YouTube <ExternalLink className="w-3 h-3" /></a> and create a new playlist</li>
              <li>Name it exactly: <span className="text-white font-mono font-medium">{playlistName}</span></li>
              <li>Set the playlist to <span className="text-amber-400 font-medium">Public</span> or <span className="text-amber-400 font-medium">Unlisted</span></li>
              <li>Add any videos you want to ingest</li>
            </ol>
          </div>

          {/* Step 3: Paste URL */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              <Link className="w-4 h-4 inline mr-2" />
              Step 3: Paste Your Playlist URL
            </label>
            <input
              type="text"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=PLxxxxxxx"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              required
            />
            <p className="text-xs text-slate-500 mt-2">
              Copy the full URL from your browser when viewing the playlist
            </p>
          </div>

          {/* Auto Process Toggle */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <div>
              <div className="text-white font-medium">Auto-Process New Videos</div>
              <div className="text-sm text-slate-400">Automatically extract knowledge when new videos are added</div>
            </div>
            <button
              type="button"
              onClick={() => setAutoProcess(!autoProcess)}
              className={clsx(
                'w-12 h-6 rounded-full transition-colors relative',
                autoProcess ? 'bg-red-600' : 'bg-slate-700'
              )}
            >
              <span
                className={clsx(
                  'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                  autoProcess ? 'left-7' : 'left-1'
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
              <span className="text-slate-500">{showAdvanced ? '\u2212' : '+'}</span>
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-slate-800 space-y-5">
                {/* Extraction Mode */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">Extraction Mode</label>
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
                  <label className="block text-sm font-medium text-white mb-2">Anchor Emphasis</label>
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
            disabled={isSubmitting || !playlistUrl.trim()}
            className={clsx(
              'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
              isSubmitting || !playlistUrl.trim()
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 text-white'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Verify & Connect
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
