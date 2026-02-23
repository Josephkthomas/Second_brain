// PlaylistVideoBrowser - Browse videos in a connected playlist and selectively queue them

import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, AlertCircle, CheckCircle, XCircle, Clock, Play, ListVideo, CheckSquare, Square, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubePlaylist, YouTubeQueueStatus } from '../../types/youtube';

interface PlaylistVideoBrowserProps {
  playlist: YouTubePlaylist;
  onClose: () => void;
  onQueueChange: () => void;
}

interface PlaylistVideoWithStatus {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  publishedAt: string;
  channelTitle: string;
  position: number;
  queueStatus: YouTubeQueueStatus | null;
  queueItemId: string | null;
}

const STATUS_BADGE: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-amber-400', icon: Clock },
  fetching_transcript: { label: 'Fetching', color: 'text-cyan-400', icon: Loader2 },
  extracting: { label: 'Extracting', color: 'text-indigo-400', icon: Loader2 },
  completed: { label: 'Done', color: 'text-emerald-400', icon: CheckCircle },
  failed: { label: 'Failed', color: 'text-red-400', icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-slate-400', icon: XCircle },
};

export default function PlaylistVideoBrowser({ playlist, onClose, onQueueChange }: PlaylistVideoBrowserProps) {
  const { session } = useAuth();
  const [videos, setVideos] = useState<PlaylistVideoWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [isQueuing, setIsQueuing] = useState(false);
  const [capped, setCapped] = useState(false);

  const fetchVideos = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/youtube/playlist-videos?playlist_id=${playlist.id}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch playlist videos');
      }

      setVideos(data.videos || []);
      setCapped(data.capped || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, playlist.id]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // A video is selectable if it's not in queue or if it failed
  const isSelectable = (video: PlaylistVideoWithStatus) =>
    !video.queueStatus || video.queueStatus === 'failed' || video.queueStatus === 'skipped';

  const selectableVideos = videos.filter(isSelectable);

  const toggleVideo = (videoId: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedVideoIds.size === selectableVideos.length) {
      setSelectedVideoIds(new Set());
    } else {
      setSelectedVideoIds(new Set(selectableVideos.map(v => v.videoId)));
    }
  };

  const handleQueueVideos = async (videoIds: string[]) => {
    if (!session?.access_token || videoIds.length === 0) return;

    try {
      setIsQueuing(true);
      setError(null);

      const toQueue = videos.filter(v => videoIds.includes(v.videoId));

      const response = await fetch('/api/youtube/queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          items: toQueue.map(v => ({
            video_id: v.videoId,
            video_url: `https://www.youtube.com/watch?v=${v.videoId}`,
            video_title: v.title,
            thumbnail_url: v.thumbnailUrl,
            published_at: v.publishedAt,
            playlist_source_id: playlist.id,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to queue videos');
      }

      // Refresh the video list to show updated statuses
      setSelectedVideoIds(new Set());
      await fetchVideos();
      onQueueChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue videos');
    } finally {
      setIsQueuing(false);
    }
  };

  const handleQueueSelected = () => {
    handleQueueVideos(Array.from(selectedVideoIds));
  };

  const handleQueueAll = () => {
    handleQueueVideos(selectableVideos.map(v => v.videoId));
  };

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Stats
  const queuedCount = videos.filter(v => v.queueStatus && v.queueStatus !== 'failed' && v.queueStatus !== 'skipped').length;
  const completedCount = videos.filter(v => v.queueStatus === 'completed').length;

  return (
    <div className="mt-4 bg-slate-950 border border-slate-700 rounded-xl overflow-hidden animate-in slide-in-from-top-2 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          {playlist.thumbnail_url ? (
            <img src={playlist.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-10 h-10 bg-red-500/10 rounded flex items-center justify-center flex-shrink-0">
              <ListVideo className="w-5 h-5 text-red-500" />
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-white font-medium truncate">{playlist.playlist_name || 'Untitled Playlist'}</h4>
            <p className="text-xs text-slate-400">
              {videos.length} videos{capped ? ' (showing first 200)' : ''} &middot; {completedCount} ingested &middot; {queuedCount} in queue
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Toolbar */}
      {!isLoading && videos.length > 0 && (
        <div className="flex items-center gap-3 p-3 border-b border-slate-800 bg-slate-900/50">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {selectedVideoIds.size === selectableVideos.length && selectableVideos.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-cyan-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            Select All ({selectableVideos.length})
          </button>

          <div className="flex-1" />

          {selectedVideoIds.size > 0 && (
            <button
              onClick={handleQueueSelected}
              disabled={isQueuing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isQueuing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Queue Selected ({selectedVideoIds.size})
            </button>
          )}

          {selectableVideos.length > 0 && (
            <button
              onClick={handleQueueAll}
              disabled={isQueuing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isQueuing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Queue All ({selectableVideos.length})
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading playlist videos...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 m-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={fetchVideos} className="ml-auto text-red-400 hover:text-red-300">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <ListVideo className="w-8 h-8 mb-3" />
            <p className="text-sm">No videos in this playlist</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {videos.map(video => {
              const canSelect = isSelectable(video);
              const isSelected = selectedVideoIds.has(video.videoId);
              const badge = video.queueStatus ? STATUS_BADGE[video.queueStatus] : null;
              const BadgeIcon = badge?.icon;
              const isActive = video.queueStatus === 'fetching_transcript' || video.queueStatus === 'extracting';

              return (
                <div
                  key={video.videoId}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-2.5 transition-colors',
                    canSelect ? 'hover:bg-slate-900/50 cursor-pointer' : 'opacity-70',
                    isSelected && 'bg-cyan-500/5'
                  )}
                  onClick={() => canSelect && toggleVideo(video.videoId)}
                >
                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    {canSelect ? (
                      isSelected ? (
                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-600" />
                      )
                    ) : (
                      <div className="w-4 h-4" />
                    )}
                  </div>

                  {/* Thumbnail */}
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    className="w-16 h-9 rounded object-cover flex-shrink-0 bg-slate-800"
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{video.title}</div>
                    <div className="text-xs text-slate-500">
                      {video.channelTitle && <span>{video.channelTitle} &middot; </span>}
                      {formatDate(video.publishedAt)}
                    </div>
                  </div>

                  {/* Status badge */}
                  {badge && BadgeIcon && (
                    <span className={clsx('flex items-center gap-1 text-xs flex-shrink-0', badge.color)}>
                      <BadgeIcon className={clsx('w-3 h-3', isActive && 'animate-spin')} />
                      {badge.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
