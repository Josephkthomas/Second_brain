// WatchHistoryReview — Pre-processing review screen
// PRD Section 13.3: Review-Import Screen
// Shows parse stats, filter controls, anchor selection, and top channels

import React, { useState, useMemo } from 'react';
import {
  Calendar, Filter, Hash, Youtube, Users, Eye, BarChart3,
  Anchor, Loader2, ChevronDown, ChevronRight, X
} from 'lucide-react';
import clsx from 'clsx';
import type {
  ParsedWatchHistory,
  WatchHistoryFilters,
  DeduplicatedEntry,
  ChannelStat,
} from '../../types/watchHistory';
import { DEFAULT_WATCH_HISTORY_FILTERS } from '../../types/watchHistory';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';

interface WatchHistoryReviewProps {
  parsedData: ParsedWatchHistory;
  deduplicatedEntries: DeduplicatedEntry[];
  topChannels: ChannelStat[];
  anchors: { id: string; label: string; entity_type: string; description?: string }[];
  filters: WatchHistoryFilters;
  onFiltersChange: (filters: WatchHistoryFilters) => void;
  selectedAnchorIds: string[];
  onAnchorToggle: (anchorId: string) => void;
  anchorEmphasis: AnchorEmphasis;
  onAnchorEmphasisChange: (emphasis: AnchorEmphasis) => void;
  extractionMode: ExtractionMode;
  onExtractionModeChange: (mode: ExtractionMode) => void;
  estimatedBatches: number;
  filteredCount: number;
  onStart: () => void;
  onCancel: () => void;
}

export default function WatchHistoryReview({
  parsedData,
  deduplicatedEntries,
  topChannels,
  anchors,
  filters,
  onFiltersChange,
  selectedAnchorIds,
  onAnchorToggle,
  anchorEmphasis,
  onAnchorEmphasisChange,
  extractionMode,
  onExtractionModeChange,
  estimatedBatches,
  filteredCount,
  onStart,
  onCancel,
}: WatchHistoryReviewProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [showAnchors, setShowAnchors] = useState(false);

  const { metadata } = parsedData;
  const estimatedCost = (estimatedBatches * 0.002).toFixed(2);
  const estimatedMinutes = Math.ceil(estimatedBatches * 2.5 / 60);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Stats Header */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-orange-900/30 rounded-lg">
            <BarChart3 size={20} className="text-orange-400" />
          </div>
          <h3 className="text-lg font-bold text-white">Watch History Import</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">{metadata.totalParsed.toLocaleString()}</div>
            <div className="text-xs text-slate-500 uppercase">Videos Parsed</div>
          </div>
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">{metadata.uniqueVideos.toLocaleString()}</div>
            <div className="text-xs text-slate-500 uppercase">Unique Videos</div>
          </div>
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">{metadata.uniqueChannels.toLocaleString()}</div>
            <div className="text-xs text-slate-500 uppercase">Unique Channels</div>
          </div>
          <div className="bg-slate-950 rounded-lg p-3">
            <div className="text-2xl font-bold text-cyan-400">{filteredCount.toLocaleString()}</div>
            <div className="text-xs text-slate-500 uppercase">After Filters</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {metadata.dateRange.earliest.toLocaleDateString()} → {metadata.dateRange.latest.toLocaleDateString()}
          </span>
          <span>|</span>
          <span>{metadata.skippedAds} ads filtered</span>
          <span>|</span>
          <span>{metadata.skippedDeleted} deleted skipped</span>
          <span>|</span>
          <span>{metadata.skippedShorts} shorts detected</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-orange-400" />
            <span className="font-medium text-slate-200">Filters</span>
          </div>
          {showFilters ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
        </button>

        {showFilters && (
          <div className="p-4 border-t border-slate-800 space-y-4">
            {/* Include Shorts */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includeShorts}
                onChange={e => onFiltersChange({ ...filters, includeShorts: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-sm text-slate-300">
                Include Shorts ({metadata.skippedShorts} detected)
              </span>
            </label>

            {/* Minimum Views */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Minimum views per video</label>
              <select
                value={filters.minViewCount}
                onChange={e => onFiltersChange({ ...filters, minViewCount: parseInt(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white w-32"
              >
                <option value={1}>1 (all)</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={5}>5+</option>
                <option value={10}>10+</option>
              </select>
            </div>

            {/* Min Channel Frequency */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Min videos per channel</label>
              <select
                value={filters.minChannelFrequency}
                onChange={e => onFiltersChange({ ...filters, minChannelFrequency: parseInt(e.target.value) })}
                className="bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-white w-32"
              >
                <option value={1}>1 (all)</option>
                <option value={2}>2+</option>
                <option value={3}>3+</option>
                <option value={5}>5+</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Anchors */}
      {anchors.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAnchors(!showAnchors)}
            className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Anchor size={16} className="text-amber-400" />
              <span className="font-medium text-slate-200">Anchors (optional)</span>
              {selectedAnchorIds.length > 0 && (
                <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded-full">
                  {selectedAnchorIds.length} selected
                </span>
              )}
            </div>
            {showAnchors ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
          </button>

          {showAnchors && (
            <div className="p-4 border-t border-slate-800 space-y-3">
              <div className="flex flex-wrap gap-2">
                {anchors.map(anchor => (
                  <button
                    key={anchor.id}
                    onClick={() => onAnchorToggle(anchor.id)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      selectedAnchorIds.includes(anchor.id)
                        ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    {anchor.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Emphasis</label>
                <div className="flex gap-2">
                  {(['passive', 'standard', 'aggressive'] as AnchorEmphasis[]).map(emphasis => (
                    <button
                      key={emphasis}
                      onClick={() => onAnchorEmphasisChange(emphasis)}
                      className={clsx(
                        'px-3 py-1 rounded text-xs font-medium capitalize transition-all',
                        anchorEmphasis === emphasis
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      )}
                    >
                      {emphasis}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top Channels */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Top Channels</h4>
        <div className="grid grid-cols-2 gap-2">
          {topChannels.slice(0, 10).map((channel, i) => (
            <div key={channel.channel_id} className="flex items-center gap-2 text-sm">
              <span className="text-slate-600 font-mono text-xs w-5">{i + 1}.</span>
              <span className="text-slate-300 truncate flex-1">{channel.channel_name}</span>
              <span className="text-xs text-slate-500">{channel.total_views} views</span>
            </div>
          ))}
        </div>
      </div>

      {/* Estimate & Actions */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-slate-400">
            Estimated: <span className="text-white font-medium">~{estimatedBatches} batches</span>
            {' '}&middot;{' '}
            <span className="text-white font-medium">~${estimatedCost}</span>
            {' '}&middot;{' '}
            <span className="text-white font-medium">~{estimatedMinutes} min</span>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onStart}
            className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(234,88,12,0.2)]"
          >
            Start Import →
          </button>
        </div>
      </div>
    </div>
  );
}
