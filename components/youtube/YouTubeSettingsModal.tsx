// YouTubeSettingsModal - Configure YouTube auto-ingestion settings

import React, { useState, useEffect } from 'react';
import {
  X, Settings, Loader2, CheckCircle,
  AlertCircle, Save
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubeSettings } from '../../types/youtube';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';

interface YouTubeSettingsModalProps {
  settings: YouTubeSettings | null;
  onClose: () => void;
  onSuccess: () => void;
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

export default function YouTubeSettingsModal({
  settings,
  onClose,
  onSuccess,
}: YouTubeSettingsModalProps) {
  const { session } = useAuth();

  // Form state
  const [defaultAutoIngest, setDefaultAutoIngest] = useState(true);
  const [defaultExtractionMode, setDefaultExtractionMode] = useState<ExtractionMode>('comprehensive');
  const [defaultAnchorEmphasis, setDefaultAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [dailyVideoLimit, setDailyVideoLimit] = useState(20);
  const [maxVideosPerChannel, setMaxVideosPerChannel] = useState(50);
  const [youtubeApiKey, setYoutubeApiKey] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load current settings
  useEffect(() => {
    if (settings) {
      setDefaultAutoIngest(settings.default_auto_ingest);
      setDefaultExtractionMode(settings.default_extraction_mode as ExtractionMode);
      setDefaultAnchorEmphasis(settings.default_anchor_emphasis as AnchorEmphasis);
      setDailyVideoLimit(settings.daily_video_limit);
      setMaxVideosPerChannel(settings.max_videos_per_channel);
    }
  }, [settings]);

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(false);

      const updates: Record<string, any> = {
        default_auto_ingest: defaultAutoIngest,
        default_extraction_mode: defaultExtractionMode,
        default_anchor_emphasis: defaultAnchorEmphasis,
        daily_video_limit: dailyVideoLimit,
        max_videos_per_channel: maxVideosPerChannel,
      };

      // Only include API key if user entered something (don't clear existing key)
      if (youtubeApiKey.trim()) {
        updates.youtube_api_key = youtubeApiKey.trim();
      }

      const response = await fetch('/api/youtube/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);

      // Close after brief delay
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Settings className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">YouTube Settings</h3>
              <p className="text-sm text-slate-400">Configure auto-ingestion preferences</p>
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
          {/* Default Auto-Ingest */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-lg">
            <div>
              <div className="text-white font-medium">Default Auto-Ingest</div>
              <div className="text-sm text-slate-400">Enable by default for new channels</div>
            </div>
            <button
              type="button"
              onClick={() => setDefaultAutoIngest(!defaultAutoIngest)}
              className={clsx(
                'w-12 h-6 rounded-full transition-colors relative',
                defaultAutoIngest ? 'bg-red-600' : 'bg-slate-700'
              )}
            >
              <span
                className={clsx(
                  'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                  defaultAutoIngest ? 'left-7' : 'left-1'
                )}
              />
            </button>
          </div>

          {/* Default Extraction Mode */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Default Extraction Mode
            </label>
            <select
              value={defaultExtractionMode}
              onChange={(e) => setDefaultExtractionMode(e.target.value as ExtractionMode)}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            >
              {EXTRACTION_MODES.map(mode => (
                <option key={mode.id} value={mode.id}>{mode.name}</option>
              ))}
            </select>
          </div>

          {/* Default Anchor Emphasis */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Default Anchor Emphasis
            </label>
            <div className="flex gap-2">
              {ANCHOR_EMPHASIS_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setDefaultAnchorEmphasis(option.id)}
                  className={clsx(
                    'flex-1 p-2 rounded-lg border text-sm transition-all',
                    defaultAnchorEmphasis === option.id
                      ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  )}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Video Limit */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Daily Video Limit
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Maximum videos to process per day (1-100)
            </p>
            <input
              type="number"
              min={1}
              max={100}
              value={dailyVideoLimit}
              onChange={(e) => setDailyVideoLimit(parseInt(e.target.value, 10) || 20)}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Max Videos Per Channel */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Max Backfill Per Channel
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Maximum historical videos to backfill when adding a channel (1-200)
            </p>
            <input
              type="number"
              min={1}
              max={200}
              value={maxVideosPerChannel}
              onChange={(e) => setMaxVideosPerChannel(parseInt(e.target.value, 10) || 50)}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <p className="text-emerald-400 text-sm">Settings saved successfully!</p>
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
            disabled={isSubmitting}
            className={clsx(
              'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
              isSubmitting
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
