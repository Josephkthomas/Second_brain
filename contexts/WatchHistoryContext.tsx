// WatchHistoryContext — Persists watch history import processing state across navigation.
// Processing continues in the background when the user leaves the InjectionHub,
// and progress/results are shown when they return.

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import type {
  WatchHistoryProcessingProgress,
  BatchExtractionResult,
  FinalizeImportResponse,
  VideoBatch,
  WatchHistoryMetadata,
} from '../types/watchHistory';
import type { ExtractionMode, AnchorEmphasis } from '../types/extraction';

// ============================================
// Types
// ============================================

type ContextStep = 'idle' | 'processing' | 'finalizing' | 'done' | 'error';

export interface StartImportParams {
  batches: VideoBatch[];
  metadata: WatchHistoryMetadata;
  options: {
    extractionMode: ExtractionMode;
    anchorEmphasis: AnchorEmphasis;
    linkedAnchorIds: string[];
    includeShorts: boolean;
    minViewCount: number;
  };
  accessToken: string;
  onGraphUpdate?: () => void;
}

interface WatchHistoryContextType {
  step: ContextStep;
  progress: WatchHistoryProcessingProgress | null;
  batchResults: BatchExtractionResult[];
  finalResult: FinalizeImportResponse | null;
  error: string | null;
  isImportActive: boolean;

  startImport: (params: StartImportParams) => void;
  abort: () => void;
  reset: () => void;
}

// ============================================
// Context
// ============================================

const WatchHistoryContext = createContext<WatchHistoryContextType | undefined>(undefined);

export const useWatchHistory = () => {
  const context = useContext(WatchHistoryContext);
  if (!context) {
    throw new Error('useWatchHistory must be used within WatchHistoryProvider');
  }
  return context;
};

// ============================================
// Constants
// ============================================

const BATCH_DELAY_MS = 1500;
const MAX_RETRIES = 2;

// ============================================
// Provider
// ============================================

export const WatchHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [step, setStep] = useState<ContextStep>('idle');
  const [progress, setProgress] = useState<WatchHistoryProcessingProgress | null>(null);
  const [batchResults, setBatchResults] = useState<BatchExtractionResult[]>([]);
  const [finalResult, setFinalResult] = useState<FinalizeImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for async safety (avoid stale closures)
  const abortRef = useRef(false);
  const paramsRef = useRef<StartImportParams | null>(null);
  const onGraphUpdateRef = useRef<(() => void) | undefined>(undefined);

  const isImportActive = step === 'processing' || step === 'finalizing';

  // ==========================================
  // Process all batches sequentially
  // ==========================================

  const processBatches = useCallback(async (batches: VideoBatch[]) => {
    const params = paramsRef.current;
    if (!params) return;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${params.accessToken}`,
    };

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
                extractionMode: params.options.extractionMode,
                anchorEmphasis: params.options.anchorEmphasis,
                linkedAnchorIds: params.options.linkedAnchorIds,
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
      await finalizeImport(results, headers);
    } else if (results.length === 0) {
      setError('All batches failed. Please check your configuration and try again.');
      setStep('error');
    }
  }, []);

  // ==========================================
  // Finalize import
  // ==========================================

  const finalizeImport = useCallback(async (results: BatchExtractionResult[], headers: Record<string, string>) => {
    const params = paramsRef.current;
    if (!params) return;

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
            totalParsed: params.metadata.totalParsed,
            dateRange: {
              earliest: params.metadata.dateRange.earliest.toISOString(),
              latest: params.metadata.dateRange.latest.toISOString(),
            },
            uniqueChannels: params.metadata.uniqueChannels,
            uniqueVideos: params.metadata.uniqueVideos,
            skippedAds: params.metadata.skippedAds,
            skippedDeleted: params.metadata.skippedDeleted,
            skippedShorts: params.metadata.skippedShorts,
          },
          options: {
            extractionMode: params.options.extractionMode,
            anchorEmphasis: params.options.anchorEmphasis,
            linkedAnchorIds: params.options.linkedAnchorIds,
            includeShorts: params.options.includeShorts,
            minViewCount: params.options.minViewCount,
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

      onGraphUpdateRef.current?.();
    } catch (err) {
      console.error('Finalization error:', err);
      setError(err instanceof Error ? err.message : 'Finalization failed');
      setStep('error');
    }
  }, []);

  // ==========================================
  // Public actions
  // ==========================================

  const startImport = useCallback((params: StartImportParams) => {
    if (isImportActive) {
      console.warn('[WatchHistory] Import already in progress');
      return;
    }

    abortRef.current = false;
    paramsRef.current = params;
    onGraphUpdateRef.current = params.onGraphUpdate;

    setError(null);
    setFinalResult(null);
    setBatchResults([]);
    setStep('processing');

    // Fire and forget — the async loop updates state via setters
    processBatches(params.batches);
  }, [isImportActive, processBatches]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setStep('idle');
    setProgress(null);
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    paramsRef.current = null;
    onGraphUpdateRef.current = undefined;
    setStep('idle');
    setProgress(null);
    setBatchResults([]);
    setFinalResult(null);
    setError(null);
  }, []);

  return (
    <WatchHistoryContext.Provider value={{
      step, progress, batchResults, finalResult, error,
      isImportActive,
      startImport, abort, reset,
    }}>
      {children}
    </WatchHistoryContext.Provider>
  );
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
