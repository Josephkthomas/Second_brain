// PlaylistList - Display list of connected YouTube playlists

import React, { useState } from 'react';
import { Search, Plus, ListVideo, ExternalLink, Trash2, CheckCircle, AlertCircle, Loader2, Pause, Play, Eye } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubePlaylist } from '../../types/youtube';
import PlaylistVideoBrowser from './PlaylistVideoBrowser';

interface PlaylistListProps {
  playlists: YouTubePlaylist[];
  onRefresh: () => void;
  onAddPlaylist: () => void;
}

export default function PlaylistList({ playlists, onRefresh, onAddPlaylist }: PlaylistListProps) {
  const { session } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'paused'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [browserPlaylistId, setBrowserPlaylistId] = useState<string | null>(null);

  // Filter playlists
  const filteredPlaylists = playlists.filter(playlist => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!playlist.playlist_name?.toLowerCase().includes(query) &&
          !playlist.synapse_code.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (filterActive === 'active' && !playlist.is_active) return false;
    if (filterActive === 'paused' && playlist.is_active) return false;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!session?.access_token || !confirm('Disconnect this playlist? Existing ingested data will be preserved.')) return;
    setDeletingId(id);
    try {
      await fetch('/api/youtube/playlists', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (playlist: YouTubePlaylist) => {
    if (!session?.access_token) return;
    setTogglingId(playlist.id);
    try {
      await fetch('/api/youtube/playlists', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: playlist.id, is_active: !playlist.is_active }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to toggle playlist:', err);
    } finally {
      setTogglingId(null);
    }
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Empty state
  if (playlists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-800 rounded-lg py-12">
        <div className="p-4 bg-red-500/10 rounded-full mb-4">
          <ListVideo className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No Playlists Connected</h3>
        <p className="text-slate-400 text-sm mb-4 text-center max-w-md">
          Connect a YouTube playlist to automatically ingest videos you add to it.
        </p>
        <button
          onClick={onAddPlaylist}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Connect Your First Playlist
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search playlists..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:border-slate-700 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterActive('paused')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'paused' ? 'bg-slate-700 text-slate-300' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Paused
          </button>
        </div>
      </div>

      {/* Playlist Cards */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filteredPlaylists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-500">
            <p>No playlists match your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPlaylists.map(playlist => (
              <div
                key={playlist.id}
                className={clsx(
                  'bg-slate-900 border rounded-lg p-4 transition-all hover:border-slate-600',
                  browserPlaylistId === playlist.id && 'ring-1 ring-cyan-500/30',
                  playlist.connection_status === 'error'
                    ? 'border-red-500/40'
                    : playlist.is_active
                      ? 'border-slate-800'
                      : 'border-slate-800/50 opacity-70'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {playlist.thumbnail_url ? (
                      <img
                        src={playlist.thumbnail_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-red-500/10 rounded flex items-center justify-center flex-shrink-0">
                        <ListVideo className="w-5 h-5 text-red-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h4 className="text-white font-medium text-sm truncate">
                        {playlist.playlist_name || 'Untitled Playlist'}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">{playlist.synapse_code}</p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    {playlist.connection_status === 'verified' && playlist.is_active && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle className="w-3 h-3" />
                        Connected
                      </span>
                    )}
                    {playlist.connection_status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-red-400" title={playlist.connection_error || ''}>
                        <AlertCircle className="w-3 h-3" />
                        Error
                      </span>
                    )}
                    {!playlist.is_active && playlist.connection_status !== 'error' && (
                      <span className="text-xs text-slate-500">Paused</span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-3 text-xs text-slate-400">
                  <span>{playlist.known_video_count} videos</span>
                  <span>{playlist.total_videos_ingested} ingested</span>
                  <span>Polled {formatRelativeTime(playlist.last_polled_at)}</span>
                </div>

                {/* Error message */}
                {playlist.connection_error && (
                  <p className="text-xs text-red-400 mb-3 truncate">{playlist.connection_error}</p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-slate-800 pt-3">
                  <a
                    href={playlist.playlist_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors"
                    title="Open on YouTube"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={() => handleToggleActive(playlist)}
                    disabled={togglingId === playlist.id}
                    className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded transition-colors"
                    title={playlist.is_active ? 'Pause polling' : 'Resume polling'}
                  >
                    {togglingId === playlist.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : playlist.is_active ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() => setBrowserPlaylistId(
                      browserPlaylistId === playlist.id ? null : playlist.id
                    )}
                    className={clsx(
                      'p-1.5 rounded transition-colors',
                      browserPlaylistId === playlist.id
                        ? 'text-cyan-400 bg-cyan-500/10'
                        : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10'
                    )}
                    title="Browse and queue videos"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex-1" />

                  <button
                    onClick={() => handleDelete(playlist.id)}
                    disabled={deletingId === playlist.id}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                    title="Disconnect playlist"
                  >
                    {deletingId === playlist.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Video Browser Panel */}
        {browserPlaylistId && (() => {
          const browsePlaylist = playlists.find(p => p.id === browserPlaylistId);
          if (!browsePlaylist) return null;
          return (
            <PlaylistVideoBrowser
              playlist={browsePlaylist}
              onClose={() => setBrowserPlaylistId(null)}
              onQueueChange={onRefresh}
            />
          );
        })()}
      </div>
    </div>
  );
}
