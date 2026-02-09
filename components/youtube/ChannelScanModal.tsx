// ChannelScanModal - Scan a channel for recent videos with selection and processing options

import React, { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  RefreshCw,
  CheckSquare,
  Square,
  Clock,
  Calendar,
  ExternalLink,
  Plus,
  Zap,
  CheckCircle2,
  AlertCircle,
  Info,
  Play,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubeChannel } from '../../types/youtube';

interface ScanVideoResult {
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string;
  published_at: string;
  duration_seconds: number | null;
  duration_formatted: string;
  description: string | null;
  status: 'new' | 'queued' | 'processing' | 'completed' | 'failed';
  queue_item_id?: string;
}

interface ScanSummary {
  total: number;
  new: number;
  queued: number;
  completed: number;
}

interface ChannelScanModalProps {
  channel: YouTubeChannel;
  onClose: () => void;
  onRefresh: () => void;
  onGraphUpdate?: () => void;
}

export default function ChannelScanModal({
  channel,
  onClose,
  onRefresh,
  onGraphUpdate,
}: ChannelScanModalProps) {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<ScanVideoResult[]>([]);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    success: boolean;
    added: number;
    skipped: number;
    message: string;
  } | null>(null);

  // Fetch videos on mount
  useEffect(() => {
    fetchVideos();
  }, [channel.id]);

  const fetchVideos = async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);
      setResult(null);

      const response = await fetch(`/api/youtube/scan?channel_id=${channel.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to scan channel');
      }

      const data = await response.json();
      setVideos(data.videos || []);
      setSummary(data.summary || null);

      // Auto-select all new videos
      const newVideoIds = (data.videos || [])
        .filter((v: ScanVideoResult) => v.status === 'new')
        .map((v: ScanVideoResult) => v.video_id);
      setSelectedIds(new Set(newVideoIds));
    } catch (err) {
      console.error('Error scanning channel:', err);
      setError(err instanceof Error ? err.message : 'Failed to scan channel');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle selection for a single video
  const toggleSelection = (videoId: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(videoId)) {
      newSet.delete(videoId);
    } else {
      newSet.add(videoId);
    }
    setSelectedIds(newSet);
  };

  // Select all new videos
  const selectAllNew = () => {
    const newVideoIds = videos
      .filter(v => v.status === 'new')
      .map(v => v.video_id);
    setSelectedIds(new Set(newVideoIds));
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  // Check if all new videos are selected
  const allNewSelected = videos
    .filter(v => v.status === 'new')
    .every(v => selectedIds.has(v.video_id));

  // Handle add to queue
  const handleAddToQueue = async (processImmediately: boolean) => {
    if (!session?.access_token || selectedIds.size === 0) return;

    try {
      setIsSubmitting(true);
      setError(null);

      // Get full video data for selected videos (pass to API instead of just IDs)
      const selectedVideos = videos
        .filter(v => selectedIds.has(v.video_id))
        .map(v => ({
          video_id: v.video_id,
          title: v.title,
          url: v.url,
          thumbnail_url: v.thumbnail_url,
          published_at: v.published_at,
          duration_seconds: v.duration_seconds,
        }));

      const response = await fetch('/api/youtube/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          channel_id: channel.id,
          videos: selectedVideos,
          process_immediately: processImmediately,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add videos to queue');
      }

      const data = await response.json();
      setResult({
        success: true,
        added: data.added,
        skipped: data.skipped,
        message: data.message,
      });

      // Refresh the video list to show updated statuses
      await fetchVideos();

      // Refresh parent data
      onRefresh();

      // If processed immediately, trigger graph update
      if (processImmediately && onGraphUpdate) {
        onGraphUpdate();
      }
    } catch (err) {
      console.error('Error adding videos:', err);
      setError(err instanceof Error ? err.message : 'Failed to add videos');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get status badge
  const getStatusBadge = (status: ScanVideoResult['status']) => {
    switch (status) {
      case 'new':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
            New
          </span>
        );
      case 'queued':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
            Queued
          </span>
        );
      case 'processing':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Done
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 rounded flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const selectableCount = videos.filter(v => v.status === 'new').length;
  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {channel.thumbnail_url ? (
              <img
                src={channel.thumbnail_url}
                alt={channel.channel_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="text-lg font-bold text-red-400">
                  {channel.channel_name.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-white">Scan Channel</h2>
              <p className="text-sm text-slate-400">{channel.channel_name}</p>
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
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Scanning for recent videos...</p>
              <p className="text-sm text-slate-500 mt-1">This may take a moment</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={fetchVideos}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Summary & Actions Bar */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/50">
                <div className="flex items-center gap-4">
                  {summary && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-400">
                        {summary.total} videos found
                      </span>
                      <span className="text-emerald-400">
                        {summary.new} new
                      </span>
                      <span className="text-slate-500">
                        {summary.completed} already processed
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchVideos}
                    disabled={isLoading}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
                  </button>

                  {selectableCount > 0 && (
                    <button
                      onClick={allNewSelected ? deselectAll : selectAllNew}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      {allNewSelected ? (
                        <>
                          <Square className="w-4 h-4" />
                          Deselect All
                        </>
                      ) : (
                        <>
                          <CheckSquare className="w-4 h-4" />
                          Select All New
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Result Message */}
              {result && (
                <div
                  className={clsx(
                    'mx-4 mt-4 p-3 rounded-lg flex items-center gap-3',
                    result.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  )}
                >
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  )}
                  <div>
                    <p className={result.success ? 'text-emerald-400' : 'text-red-400'}>
                      {result.message}
                    </p>
                    {result.skipped > 0 && (
                      <p className="text-sm text-slate-400 mt-1">
                        {result.skipped} videos were already in the queue
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Video Table */}
              {videos.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                  <Info className="w-12 h-12 mb-4 text-slate-600" />
                  <p>No videos found in the channel's RSS feed</p>
                  <p className="text-sm text-slate-500 mt-1">
                    YouTube RSS feeds only show the most recent videos
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-slate-900 border-b border-slate-800">
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                        <th className="p-3 w-10"></th>
                        <th className="p-3">Video</th>
                        <th className="p-3 w-24">Duration</th>
                        <th className="p-3 w-28">Published</th>
                        <th className="p-3 w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {videos.map((video) => {
                        const isSelectable = video.status === 'new';
                        const isSelected = selectedIds.has(video.video_id);

                        return (
                          <tr
                            key={video.video_id}
                            onClick={() => isSelectable && toggleSelection(video.video_id)}
                            className={clsx(
                              'border-b border-slate-800/50 transition-colors',
                              isSelectable
                                ? 'hover:bg-slate-800/50 cursor-pointer'
                                : 'opacity-60',
                              isSelected && 'bg-emerald-500/5'
                            )}
                          >
                            {/* Checkbox */}
                            <td className="p-3">
                              {isSelectable && (
                                <div
                                  className={clsx(
                                    'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                                    isSelected
                                      ? 'bg-emerald-500 border-emerald-500 text-white'
                                      : 'border-slate-600 bg-slate-900'
                                  )}
                                >
                                  {isSelected && <CheckSquare className="w-3.5 h-3.5" />}
                                </div>
                              )}
                            </td>

                            {/* Video Info */}
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <div className="relative w-24 h-14 flex-shrink-0 rounded overflow-hidden bg-slate-800">
                                  <img
                                    src={video.thumbnail_url}
                                    alt={video.title}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                                    <Play className="w-6 h-6 text-white" />
                                  </div>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm text-white font-medium truncate" title={video.title}>
                                    {video.title}
                                  </p>
                                  <a
                                    href={video.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 mt-1 transition-colors"
                                  >
                                    Watch on YouTube
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              </div>
                            </td>

                            {/* Duration */}
                            <td className="p-3">
                              <div className="flex items-center gap-1 text-sm text-slate-400">
                                <Clock className="w-3.5 h-3.5" />
                                {video.duration_formatted}
                              </div>
                            </td>

                            {/* Published Date */}
                            <td className="p-3">
                              <div className="flex items-center gap-1 text-sm text-slate-400">
                                <Calendar className="w-3.5 h-3.5" />
                                {formatDate(video.published_at)}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="p-3">
                              {getStatusBadge(video.status)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="text-sm text-slate-400">
            {selectedCount > 0 ? (
              <span className="text-emerald-400">{selectedCount} video{selectedCount !== 1 ? 's' : ''} selected</span>
            ) : (
              <span>Select videos to add to queue</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={() => handleAddToQueue(false)}
              disabled={selectedCount === 0 || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add to Queue
            </button>

            <button
              onClick={() => handleAddToQueue(true)}
              disabled={selectedCount === 0 || isSubmitting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Process Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
