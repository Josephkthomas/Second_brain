// WatchHistoryImporter — Main orchestrator for the watch history import pipeline
// PRD Section 4: Pipeline Architecture — Client-side orchestration
// Manages the full workflow: upload → parse → review → cluster → process → finalize → done

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload, Loader2, AlertCircle, UploadCloud, FileText, X
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAnchors } from '../../services/supabase';
import { parseWatchHistoryHTML, deduplicateEntries, applyFilters, getTopChannels } from '../../utils/watchHistoryParser';
import { clusterAndBatch } from '../../utils/watchHistoryClustering';
import type {
  WatchHistoryStep,
  ParsedWatchHistory,
  DeduplicatedEntry,
  WatchHistoryFilters,
  WatchHistoryProcessingProgress,
  ChannelStat,
  ChannelTagInfo,
  VideoBatch,
  FinalizeImportResponse,
  BatchExtractionResult,
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

const BATCH_DELAY_MS = 1500; // Delay between batch API calls
const MAX_RETRIES = 2;

export default function WatchHistoryImporter({ onComplete, onGraphUpdate }: WatchHistoryImporterProps) {
  const { session } = useAuth();

  // Workflow state
  const [step, setStep] = useState<WatchHistoryStep>('upload');
  const [error, setError] = useState<string | null>(null);

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

  // Processing state
  const [progress, setProgress] = useState<WatchHistoryProcessingProgress | null>(null);
  const [batchResults, setBatchResults] = useState<BatchExtractionResult[]>([]);
  const abortRef = useRef(false);

  // Final result
  const [finalResult, setFinalResult] = useState<FinalizeImportResponse | null>(null);

  // Computed
  const filteredEntries = parsedData ? applyFilters(deduped, filters) : [];
  const estimatedBatches = Math.max(1, Math.ceil(filteredEntries.length / 60));

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
  };

  // ==========================================
  // STEP 1: File Upload & Parse
  // ==========================================

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setError('Please select an HTML file from Google Takeout');
      return;
    }

    setError(null);
    setStep('parsing');

    try {
      const text = await file.text();

      // Quick validation
      if (!text.includes('content-cell')) {
        setError('This does not appear to be a Google Takeout watch history file. Expected "content-cell" class.');
        setStep('upload');
        return;
      }

      const parsed = parseWatchHistoryHTML(text);

      if (parsed.entries.length === 0) {
        setError('No watch history entries found in this file.');
        setStep('upload');
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

      setStep('review');
    } catch (err) {
      console.error('Parse error:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse file');
      setStep('upload');
    }
  };

  // ==========================================
  // STEP 2: Start Import (Clustering + Processing)
  // ==========================================

  const handleStartImport = async () => {
    if (!parsedData) return;

    abortRef.current = false;
    setError(null);
    setStep('clustering');

    try {
      // Apply filters to get final entries
      const entries = applyFilters(deduped, filters);

      if (entries.length === 0) {
        setError('No entries remain after filters. Adjust your filter settings.');
        setStep('review');
        return;
      }

      // Fetch channel tags from server (Tier 2 enrichment)
      setClusteringStatus('Fetching channel metadata from YouTube API...');
      const channelTags = await fetchChannelTagsFromServer(entries);

      setClusteringStatus('Building thematic clusters...');
      const batches = clusterAndBatch(entries, channelTags);

      if (batches.length === 0) {
        setError('No batches could be created. Try adjusting filter settings.');
        setStep('review');
        return;
      }

      setClusteringStatus(`Created ${batches.length} batches. Starting extraction...`);

      // Move to processing
      setStep('processing');
      await processBatches(batches);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Import failed');
      setStep('error');
    }
  };

  // ==========================================
  // Fetch channel tags from server endpoint
  // ==========================================

  async function fetchChannelTagsFromServer(entries: DeduplicatedEntry[]): Promise<Map<string, ChannelTagInfo>> {
    const channelTags = new Map<string, ChannelTagInfo>();

    // Collect unique channel IDs
    const channelIds = [...new Set(entries.map(e => e.channel_id))].filter(id => id.length > 0);

    // Fetch in batches of 50
    for (let i = 0; i < channelIds.length; i += 50) {
      if (abortRef.current) break;

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
          // If warning about no API key, just continue without tags
        }
      } catch {
        // Non-critical — will fall through to Tier 3 temporal clustering
        console.warn(`[WatchHistory] Failed to fetch tags for batch ${i / 50 + 1}`);
      }
    }

    return channelTags;
  }

  // ==========================================
  // Process all batches sequentially
  // ==========================================

  const processBatches = async (batches: VideoBatch[]) => {
    const results: BatchExtractionResult[] = [];

    const progressState: WatchHistoryProcessingProgress = {
      currentBatchIndex: 0,
      totalBatches: batches.length,
      currentBatchLabel: '',
      nodesExtracted: 0,
      edgesExtracted: 0,
      batchesFailed: 0,
      startTime: Date.now(),
      completedBatches: [],
    };

    setProgress({ ...progressState });

    for (let i = 0; i < batches.length; i++) {
      if (abortRef.current) break;

      const batch = batches[i];
      progressState.currentBatchIndex = i;
      progressState.currentBatchLabel = batch.label;
      setProgress({ ...progressState });

      let success = false;
      let retries = 0;

      while (!success && retries <= MAX_RETRIES) {
        try {
          const response = await fetch('/api/youtube/extract-batch', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              batch: {
                batch_id: batch.batch_id,
                batch_type: batch.batch_type,
                label: batch.label,
                entries: batch.entries.map(e => ({
                  video_title: e.video_title,
                  video_id: e.video_id,
                  channel_name: e.channel_name,
                  view_count: e.view_count,
                  first_watched: e.first_watched.toISOString(),
                  last_watched: e.last_watched.toISOString(),
                })),
                total_views: batch.total_views,
                channel_names: batch.channel_names,
                channel_tags: batch.channel_tags,
                date_range: {
                  start: batch.date_range.start.toISOString(),
                  end: batch.date_range.end.toISOString(),
                },
              },
              options: {
                extractionMode,
                anchorEmphasis,
                linkedAnchorIds: selectedAnchorIds,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          const batchResult: BatchExtractionResult = {
            batch_id: batch.batch_id,
            nodes: data.nodes || [],
            edges: data.edges || [],
            batch_summary: data.batch_summary || '',
          };

          results.push(batchResult);
          progressState.nodesExtracted += batchResult.nodes.length;
          progressState.edgesExtracted += batchResult.edges.length;
          progressState.completedBatches.push({
            batch_id: batch.batch_id,
            label: batch.label,
            nodes: batchResult.nodes.length,
            edges: batchResult.edges.length,
            status: 'completed',
          });

          success = true;
        } catch (err) {
          retries++;
          if (retries > MAX_RETRIES) {
            console.error(`[WatchHistory] Batch failed after ${MAX_RETRIES} retries:`, batch.label, err);
            progressState.batchesFailed++;
            progressState.completedBatches.push({
              batch_id: batch.batch_id,
              label: batch.label,
              nodes: 0,
              edges: 0,
              status: 'failed',
            });
          } else {
            // Exponential backoff
            await sleep(BATCH_DELAY_MS * Math.pow(2, retries));
          }
        }
      }

      setProgress({ ...progressState });
      setBatchResults([...results]);

      // Delay between batches (rate limiting)
      if (i < batches.length - 1 && !abortRef.current) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    // All batches done — finalize
    if (!abortRef.current && results.length > 0) {
      await finalizeImport(results);
    } else if (results.length === 0) {
      setError('All batches failed. Please check your configuration and try again.');
      setStep('error');
    }
  };

  // ==========================================
  // Finalize import
  // ==========================================

  const finalizeImport = async (results: BatchExtractionResult[]) => {
    if (!parsedData) return;

    setStep('finalizing');

    try {
      const response = await fetch('/api/youtube/finalize-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          batchResults: results.map(r => ({
            batch_id: r.batch_id,
            nodes: r.nodes,
            edges: r.edges,
            summary: r.batch_summary,
          })),
          metadata: {
            totalParsed: parsedData.metadata.totalParsed,
            dateRange: {
              earliest: parsedData.metadata.dateRange.earliest.toISOString(),
              latest: parsedData.metadata.dateRange.latest.toISOString(),
            },
            uniqueChannels: parsedData.metadata.uniqueChannels,
            uniqueVideos: parsedData.metadata.uniqueVideos,
            skippedAds: parsedData.metadata.skippedAds,
            skippedDeleted: parsedData.metadata.skippedDeleted,
            skippedShorts: parsedData.metadata.skippedShorts,
          },
          options: {
            extractionMode,
            anchorEmphasis,
            linkedAnchorIds: selectedAnchorIds,
            includeShorts: filters.includeShorts,
            minViewCount: filters.minViewCount,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Finalization failed (${response.status})`);
      }

      const result: FinalizeImportResponse = await response.json();
      setFinalResult(result);
      setStep('done');

      if (onGraphUpdate) onGraphUpdate();
    } catch (err) {
      console.error('Finalization error:', err);
      setError(err instanceof Error ? err.message : 'Finalization failed');
      setStep('error');
    }
  };

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
    abortRef.current = true;
    setStep('upload');
    setParsedData(null);
    setDeduped([]);
    setTopChannels([]);
    setFilters(DEFAULT_WATCH_HISTORY_FILTERS);
    setProgress(null);
    setBatchResults([]);
    setFinalResult(null);
    setError(null);
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
      {step === 'upload' && (
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
      {step === 'parsing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-orange-400 animate-spin" />
          <p className="text-slate-300 font-medium">Parsing watch history...</p>
          <p className="text-xs text-slate-500">This may take a moment for large files</p>
        </div>
      )}

      {/* Review Step */}
      {step === 'review' && parsedData && (
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
      {step === 'clustering' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-orange-400 animate-spin" />
          <p className="text-slate-300 font-medium">{clusteringStatus || 'Building clusters...'}</p>
        </div>
      )}

      {/* Processing Step */}
      {step === 'processing' && progress && (
        <WatchHistoryProgress progress={progress} />
      )}

      {/* Finalizing Step */}
      {step === 'finalizing' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-in fade-in">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-slate-300 font-medium">Merging entities & resolving against existing graph...</p>
          <p className="text-xs text-slate-500">This may take up to 30 seconds</p>
        </div>
      )}

      {/* Done Step */}
      {step === 'done' && finalResult && (
        <WatchHistoryComplete
          result={finalResult}
          totalVideos={parsedData?.metadata.totalParsed || 0}
          onViewGraph={handleViewGraph}
          onImportAnother={handleReset}
        />
      )}

      {/* Error Step */}
      {step === 'error' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-red-900/20 border border-red-900/50 rounded-xl p-6 text-center">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-white mb-1">Import Error</h3>
            <p className="text-sm text-red-400">{error}</p>
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
                onClick={() => setStep('review')}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
              >
                Back to Review
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error banner (non-blocking) */}
      {error && step !== 'error' && step !== 'upload' && (
        <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} className="flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
