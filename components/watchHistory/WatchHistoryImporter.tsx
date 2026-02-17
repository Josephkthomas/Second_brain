// WatchHistoryImporter — Main orchestrator for the watch history import pipeline
// PRD Section 4: Pipeline Architecture — Client-side orchestration
// Manages upload/parse/review locally, delegates long-running processing to WatchHistoryContext

import React, { useState, useCallback } from 'react';
import {
  Upload, Loader2, AlertCircle, UploadCloud, FileText, X
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { useWatchHistory } from '../../contexts/WatchHistoryContext';
import { fetchAnchors } from '../../services/supabase';
import { parseWatchHistoryHTML, deduplicateEntries, applyFilters, getTopChannels } from '../../utils/watchHistoryParser';
import { clusterAndBatch } from '../../utils/watchHistoryClustering';
import type {
  ParsedWatchHistory,
  DeduplicatedEntry,
  WatchHistoryFilters,
  ChannelStat,
  ChannelTagInfo,
} from '../../types/watchHistory';
import { DEFAULT_WATCH_HISTORY_FILTERS } from '../../types/watchHistory';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';
import WatchHistoryReview from './WatchHistoryReview';
import WatchHistoryProgress from './WatchHistoryProgress';
import WatchHistoryComplete from './WatchHistoryComplete';

interface WatchHistoryImporterProps {
  onComplete?: () => void;
  onGraphUpdate?: () => void;
}

export default function WatchHistoryImporter({ onComplete, onGraphUpdate }: WatchHistoryImporterProps) {
  const { session } = useAuth();
  const {
    step: contextStep,
    progress,
    finalResult,
    error: contextError,
    isImportActive,
    startImport,
    reset: resetContext,
  } = useWatchHistory();

  // ==========================================
  // Local pre-processing state (not persisted across navigation)
  // ==========================================

  const [localStep, setLocalStep] = useState<'upload' | 'parsing' | 'review' | 'clustering'>('upload');
  const [localError, setLocalError] = useState<string | null>(null);

  // Parse state
  const [parsedData, setParsedData] = useState<ParsedWatchHistory | null>(null);
  const [deduped, setDeduped] = useState<DeduplicatedEntry[]>([]);
  const [topChannels, setTopChannels] = useState<ChannelStat[]>([]);

  // Filter & config state
  const [filters, setFilters] = useState<WatchHistoryFilters>(DEFAULT_WATCH_HISTORY_FILTERS);
  const [anchors, setAnchors] = useState<{ id: string; label: string; entity_type: string; description?: string }[]>([]);
  const [selectedAnchorIds, setSelectedAnchorIds] = useState<string[]>([]);
  const [anchorEmphasis, setAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('comprehensive');

  // Clustering state
  const [clusteringStatus, setClusteringStatus] = useState('');

  // ==========================================
  // Effective step: context takes priority when processing/done/error
  // ==========================================

  const effectiveStep = (isImportActive || contextStep === 'done' || contextStep === 'error')
    ? contextStep
    : localStep;

  // Effective error: show context error during processing phases, local error otherwise
  const effectiveError = (contextStep === 'error') ? contextError : localError;

  // Computed
  const filteredEntries = parsedData ? applyFilters(deduped, filters) : [];
  const estimatedBatches = Math.max(1, Math.ceil(filteredEntries.length / 60));

  // ==========================================
  // STEP 1: File Upload & Parse
  // ==========================================

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setLocalError('Please select an HTML file from Google Takeout');
      return;
    }

    setLocalError(null);
    setLocalStep('parsing');

    try {
      const text = await file.text();

      // Quick validation
      if (!text.includes('content-cell')) {
        setLocalError('This does not appear to be a Google Takeout watch history file. Expected "content-cell" class.');
        setLocalStep('upload');
        return;
      }

      const parsed = parseWatchHistoryHTML(text);

      if (parsed.entries.length === 0) {
        setLocalError('No watch history entries found in this file.');
        setLocalStep('upload');
        return;
      }

      const dedupedEntries = deduplicateEntries(parsed.entries);
      const channels = getTopChannels(dedupedEntries, 20);

      setParsedData(parsed);
      setDeduped(dedupedEntries);
      setTopChannels(channels);

      // Load anchors for the review screen
      try {
        const userAnchors = await fetchAnchors();
        setAnchors(userAnchors.map(a => ({
          id: a.id,
          label: a.label,
          entity_type: a.entity_type || 'Topic',
          description: a.description,
        })));
      } catch {
        // Non-critical — anchors are optional
      }

      setLocalStep('review');
    } catch (err) {
      console.error('Parse error:', err);
      setLocalError(err instanceof Error ? err.message : 'Failed to parse file');
      setLocalStep('upload');
    }
  };

  // ==========================================
  // STEP 2: Start Import (Clustering + hand off to context)
  // ==========================================

  const handleStartImport = async () => {
    if (!parsedData || !session) return;

    setLocalError(null);
    setLocalStep('clustering');

    try {
      // Apply filters to get final entries
      const entries = applyFilters(deduped, filters);

      if (entries.length === 0) {
        setLocalError('No entries remain after filters. Adjust your filter settings.');
        setLocalStep('review');
        return;
      }

      // Fetch channel tags from server (Tier 2 enrichment)
      setClusteringStatus('Fetching channel metadata from YouTube API...');
      const channelTags = await fetchChannelTagsFromServer(entries);

      setClusteringStatus('Building thematic clusters...');
      const batches = clusterAndBatch(entries, channelTags);

      if (batches.length === 0) {
        setLocalError('No batches could be created. Try adjusting filter settings.');
        setLocalStep('review');
        return;
      }

      setClusteringStatus(`Created ${batches.length} batches. Starting extraction...`);

      // Hand off to context for long-running processing
      startImport({
        batches,
        metadata: parsedData.metadata,
        options: {
          extractionMode,
          anchorEmphasis,
          linkedAnchorIds: selectedAnchorIds,
          includeShorts: filters.includeShorts,
          minViewCount: filters.minViewCount,
        },
        accessToken: session.access_token,
        onGraphUpdate,
      });
    } catch (err) {
      console.error('Import error:', err);
      setLocalError(err instanceof Error ? err.message : 'Import failed');
      setLocalStep('review');
    }
  };

  // ==========================================
  // Fetch channel tags from server endpoint
  // ==========================================

  async function fetchChannelTagsFromServer(entries: DeduplicatedEntry[]): Promise<Map<string, ChannelTagInfo>> {
    const channelTags = new Map<string, ChannelTagInfo>();

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
    };

    // Collect unique channel IDs
    const channelIds = [...new Set(entries.map(e => e.channel_id))].filter(id => id.length > 0);

    // Fetch in batches of 50
    for (let i = 0; i < channelIds.length; i += 50) {
      const batch = channelIds.slice(i, i + 50);
      try {
        const response = await fetch('/api/youtube/channel-tags', {
          method: 'POST',
          headers,
          body: JSON.stringify({ channelIds: batch }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.channels) {
            for (const [id, info] of Object.entries(data.channels)) {
              channelTags.set(id, info as ChannelTagInfo);
            }
          }
        }
      } catch {
        // Non-critical — will fall through to Tier 3 temporal clustering
        console.warn(`[WatchHistory] Failed to fetch tags for batch ${i / 50 + 1}`);
      }
    }

    return channelTags;
  }

  // ==========================================
  // Event handlers
  // ==========================================

  const handleAnchorToggle = (anchorId: string) => {
    setSelectedAnchorIds(prev =>
      prev.includes(anchorId)
        ? prev.filter(id => id !== anchorId)
        : [...prev, anchorId]
    );
  };

  const handleReset = () => {
    resetContext();
    setLocalStep('upload');
    setParsedData(null);
    setDeduped([]);
    setTopChannels([]);
    setFilters(DEFAULT_WATCH_HISTORY_FILTERS);
    setLocalError(null);
  };

  const handleViewGraph = () => {
    if (onComplete) onComplete();
  };

  // ==========================================
  // Render
  // ==========================================

  return (
    <div className="max-w-3xl mx-auto">
      {/* Upload Step */}
      {effectiveStep === 'upload' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-slate-900 border border-slate-700 border-dashed rounded-xl p-10 text-center hover:border-orange-500/50 transition-colors">
            <input
              type="file"
              accept=".html,.htm"
              onChange={handleFileSelect}
              className="hidden"
              id="watch-history-upload"
            />
            <label htmlFor="watch-history-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-orange-900/20 rounded-full">
                  <UploadCloud size={32} className="text-orange-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white mb-1">Upload Watch History</p>
                  <p className="text-sm text-slate-400 max-w-md">
                    Select your <code className="text-orange-400">watch-history.html</code> file from Google Takeout.
                    The file is parsed locally — nothing is uploaded to the server.
                  </p>
                </div>
                <div className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg transition-colors">
                  Choose File
                </div>
              </div>
            </label>
          </div>

          <div className="text-center text-xs text-slate-600">
            <p>Go to <a href="https://takeout.google.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">Google Takeout</a> → select "YouTube and YouTube Music" → "Watch History" → export as HTML</p>
          </div>
        </div>
      )}

      {/* Parsing Step */}
      {effectiveStep === 'parsing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-orange-400 animate-spin" />
          <p className="text-slate-300 font-medium">Parsing watch history...</p>
          <p className="text-xs text-slate-500">This may take a moment for large files</p>
        </div>
      )}

      {/* Review Step */}
      {effectiveStep === 'review' && parsedData && (
        <WatchHistoryReview
          parsedData={parsedData}
          deduplicatedEntries={deduped}
          topChannels={topChannels}
          anchors={anchors}
          filters={filters}
          onFiltersChange={setFilters}
          selectedAnchorIds={selectedAnchorIds}
          onAnchorToggle={handleAnchorToggle}
          anchorEmphasis={anchorEmphasis}
          onAnchorEmphasisChange={setAnchorEmphasis}
          extractionMode={extractionMode}
          onExtractionModeChange={setExtractionMode}
          estimatedBatches={estimatedBatches}
          filteredCount={filteredEntries.length}
          onStart={handleStartImport}
          onCancel={handleReset}
        />
      )}

      {/* Clustering Step */}
      {effectiveStep === 'clustering' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-orange-400 animate-spin" />
          <p className="text-slate-300 font-medium">{clusteringStatus || 'Building clusters...'}</p>
        </div>
      )}

      {/* Processing Step */}
      {effectiveStep === 'processing' && progress && (
        <WatchHistoryProgress progress={progress} />
      )}

      {/* Finalizing Step */}
      {effectiveStep === 'finalizing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-slate-300 font-medium">Merging entities & resolving against existing graph...</p>
          <p className="text-xs text-slate-500">This may take up to 30 seconds</p>
        </div>
      )}

      {/* Done Step */}
      {effectiveStep === 'done' && finalResult && (
        <WatchHistoryComplete
          result={finalResult}
          totalVideos={parsedData?.metadata.totalParsed || finalResult.batchesProcessed * 50}
          onViewGraph={handleViewGraph}
          onImportAnother={handleReset}
        />
      )}

      {/* Error Step */}
      {effectiveStep === 'error' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-6 text-center">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Import Error</h3>
            <p className="text-sm text-red-400">{effectiveError}</p>
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            >
              Start Over
            </button>
            {parsedData && (
              <button
                onClick={() => setLocalStep('review')}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
              >
                Back to Review
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error banner (non-blocking) */}
      {effectiveError && effectiveStep !== 'error' && effectiveStep !== 'upload' && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{effectiveError}</span>
          <button onClick={() => setLocalError(null)} className="ml-auto hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
