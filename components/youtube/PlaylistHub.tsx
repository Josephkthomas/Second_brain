// PlaylistHub — Playlist-first YouTube ingestion page
// Inline form to connect playlists, browse videos, queue for processing

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ListVideo, Plus, Link, Tag, Settings2, Loader2, CheckCircle, AlertCircle,
  ExternalLink, Trash2, Pause, Play, Eye, EyeOff, ChevronDown, ArrowRight,
  Save, X, RefreshCw, Clock
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAnchors } from '../../services/supabase';
import type { ExtractionMode, AnchorEmphasis } from '../../types/extraction';
import type { YouTubePlaylist } from '../../types/youtube';
import PlaylistVideoBrowser from './PlaylistVideoBrowser';

interface PlaylistHubProps {
  onGraphUpdate?: () => void;
  onNavigateToQueue?: () => void;
}

const EXTRACTION_MODES: Array<{ id: ExtractionMode; name: string; desc: string }> = [
  { id: 'comprehensive', name: 'Comprehensive', desc: 'All entities & relationships' },
  { id: 'strategic', name: 'Strategic', desc: 'Goals, decisions, projects' },
  { id: 'actionable', name: 'Actionable', desc: 'Actions, tasks, insights' },
  { id: 'relational', name: 'Relational', desc: 'Connections & people' },
];

const ANCHOR_EMPHASIS_OPTIONS: Array<{ id: AnchorEmphasis; name: string }> = [
  { id: 'standard', name: 'Standard' },
  { id: 'aggressive', name: 'Aggressive' },
  { id: 'passive', name: 'Passive' },
];

export default function PlaylistHub({ onGraphUpdate, onNavigateToQueue }: PlaylistHubProps) {
  const { session } = useAuth();

  // Playlists data
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('comprehensive');
  const [anchorEmphasis, setAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [linkedAnchorIds, setLinkedAnchorIds] = useState<string[]>([]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Anchors for linking
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string }>>([]);

  // Expanded playlist (video browser)
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);

  // Queue banner
  const [queuedCount, setQueuedCount] = useState<number | null>(null);

  // Edit settings panel
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editAutoProcess, setEditAutoProcess] = useState(true);
  const [editExtractionMode, setEditExtractionMode] = useState<ExtractionMode>('comprehensive');
  const [editAnchorEmphasis, setEditAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [editLinkedAnchorIds, setEditLinkedAnchorIds] = useState<string[]>([]);
  const [editCustomInstructions, setEditCustomInstructions] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Scan status
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ newVideos: number; playlistsChecked: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const scanResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SCAN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // Fetch playlists
  const fetchPlaylists = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/youtube/playlists', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPlaylists(data.playlists || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch playlists');
      }
    } catch {
      setError('Failed to fetch playlists');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { fetchPlaylists(); }, [fetchPlaylists]);

  // Fetch anchors
  useEffect(() => {
    fetchAnchors().then(data =>
      setAnchors(data.map(a => ({ id: a.id, label: a.label })))
    ).catch(() => {});
  }, []);

  // Validate URL
  const validateUrl = (url: string): string | null => {
    const trimmed = url.trim();
    if (!trimmed) return 'Please enter a playlist URL';
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname.includes('youtube.com') && !parsed.hostname.includes('youtu.be')) {
        return 'URL must be from youtube.com';
      }
      if (!parsed.searchParams.get('list')) {
        return 'URL must contain a ?list= parameter. Copy the full URL from your YouTube playlist page.';
      }
      return null;
    } catch {
      if (!/[?&]list=/.test(trimmed)) {
        return 'Paste the full YouTube playlist URL (e.g., https://www.youtube.com/playlist?list=PLxxxxxx)';
      }
      return null;
    }
  };

  // Submit new playlist
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token || !playlistUrl.trim()) return;

    const urlError = validateUrl(playlistUrl);
    if (urlError) { setSubmitError(urlError); return; }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setSubmitSuccess(null);

      const res = await fetch('/api/youtube/playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect playlist');
      }

      setSubmitSuccess(`Connected "${data.playlist?.playlist_name || 'playlist'}" successfully!`);
      setPlaylistUrl('');
      setCustomInstructions('');
      setShowAdvanced(false);
      fetchPlaylists();

      // Auto-expand the new playlist to show videos
      if (data.playlist?.id) {
        setExpandedPlaylistId(data.playlist.id);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to connect playlist');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle playlist active/paused
  const handleToggle = async (playlist: YouTubePlaylist) => {
    if (!session?.access_token) return;
    try {
      await fetch('/api/youtube/playlists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: playlist.id, is_active: !playlist.is_active }),
      });
      fetchPlaylists();
    } catch {}
  };

  // Delete playlist
  const handleDelete = async (id: string) => {
    if (!session?.access_token || !confirm('Disconnect this playlist? Existing data is preserved.')) return;
    try {
      await fetch('/api/youtube/playlists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (expandedPlaylistId === id) setExpandedPlaylistId(null);
      fetchPlaylists();
    } catch {}
  };

  const toggleAnchor = (anchorId: string) => {
    setLinkedAnchorIds(prev =>
      prev.includes(anchorId) ? prev.filter(id => id !== anchorId) : [...prev, anchorId]
    );
  };

  // ── Edit settings ──────────────────────────

  const openEditPanel = (pl: YouTubePlaylist) => {
    if (editingPlaylistId === pl.id) {
      setEditingPlaylistId(null);
      return;
    }
    setEditingPlaylistId(pl.id);
    setEditAutoProcess(pl.auto_process);
    setEditExtractionMode(pl.extraction_mode);
    setEditAnchorEmphasis(pl.anchor_emphasis);
    setEditLinkedAnchorIds(pl.linked_anchor_ids || []);
    setEditCustomInstructions(pl.custom_instructions || '');
    setEditError(null);
  };

  const toggleEditAnchor = (anchorId: string) => {
    setEditLinkedAnchorIds(prev =>
      prev.includes(anchorId) ? prev.filter(id => id !== anchorId) : [...prev, anchorId]
    );
  };

  const handleSaveEdit = async () => {
    if (!session?.access_token || !editingPlaylistId) return;
    try {
      setIsSavingEdit(true);
      setEditError(null);
      const res = await fetch('/api/youtube/playlists', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: editingPlaylistId,
          auto_process: editAutoProcess,
          extraction_mode: editExtractionMode,
          anchor_emphasis: editAnchorEmphasis,
          linked_anchor_ids: editLinkedAnchorIds,
          custom_instructions: editCustomInstructions.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      setEditingPlaylistId(null);
      fetchPlaylists();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Scan status helpers ──────────────────────────

  // Update clock every 30s for countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Derive last polled timestamp from most recent playlist
  const lastPolledAt = playlists.reduce<string | null>((latest, pl) => {
    if (!pl.last_polled_at) return latest;
    if (!latest) return pl.last_polled_at;
    return new Date(pl.last_polled_at) > new Date(latest) ? pl.last_polled_at : latest;
  }, null);

  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const diff = now - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getNextScanCountdown = () => {
    if (!lastPolledAt) return null;
    const nextScanTime = new Date(lastPolledAt).getTime() + SCAN_INTERVAL_MS;
    const remaining = nextScanTime - now;
    if (remaining <= 0) return 'Any moment';
    const mins = Math.ceil(remaining / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  };

  const handleScanNow = async () => {
    if (!session?.access_token || isScanning) return;
    try {
      setIsScanning(true);
      setScanResult(null);

      const res = await fetch('/api/youtube/poll-playlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Scan failed');
      }

      setScanResult({
        newVideos: data.newVideosQueued || 0,
        playlistsChecked: data.playlistsPolled || 0,
      });

      // Clear result toast after 8s
      if (scanResultTimerRef.current) clearTimeout(scanResultTimerRef.current);
      scanResultTimerRef.current = setTimeout(() => setScanResult(null), 8000);

      // Refresh playlists to get updated last_polled_at
      fetchPlaylists();
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Loading playlists...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Connect Playlist Form ─── */}
      <form onSubmit={handleSubmit} className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <ListVideo className="w-5 h-5 text-red-500" />
          <h3 className="text-sm font-bold text-white">Connect a YouTube Playlist</h3>
        </div>

        {/* URL + Submit */}
        <div className="flex gap-2">
          <input
            type="text"
            value={playlistUrl}
            onChange={e => setPlaylistUrl(e.target.value)}
            placeholder="https://www.youtube.com/playlist?list=PLxxxxxxx"
            className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:border-red-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSubmitting || !playlistUrl.trim()}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isSubmitting || !playlistUrl.trim()
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-red-600 hover:bg-red-500 text-white'
            )}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isSubmitting ? 'Connecting...' : 'Connect'}
          </button>
        </div>

        {/* Auto-process toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoProcess(!autoProcess)}
            className={clsx(
              'w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
              autoProcess ? 'bg-red-600' : 'bg-slate-700'
            )}
          >
            <span className={clsx(
              'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
              autoProcess ? 'left-[18px]' : 'left-0.5'
            )} />
          </button>
          <span className="text-xs text-slate-400">Auto-process new videos</span>
        </div>

        {/* Anchor linking */}
        {anchors.length > 0 && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
              <Tag className="w-3 h-3" /> Link to Anchors
            </label>
            <div className="flex flex-wrap gap-1.5">
              {anchors.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAnchor(a.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    linkedAnchorIds.includes(a.id)
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600'
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Advanced Options */}
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          Advanced Options
          <ChevronDown className={clsx('w-3 h-3 transition-transform', showAdvanced && 'rotate-180')} />
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-4 border-l border-slate-800">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Extraction Mode</label>
              <div className="flex flex-wrap gap-1.5">
                {EXTRACTION_MODES.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setExtractionMode(m.id)}
                    className={clsx(
                      'px-2.5 py-1 rounded-md text-xs transition-colors border',
                      extractionMode === m.id
                        ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                        : 'border-slate-700 text-slate-500 hover:border-slate-600'
                    )}
                    title={m.desc}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Anchor Emphasis</label>
              <div className="flex gap-1.5">
                {ANCHOR_EMPHASIS_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setAnchorEmphasis(o.id)}
                    className={clsx(
                      'px-2.5 py-1 rounded-md text-xs transition-colors border',
                      anchorEmphasis === o.id
                        ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                        : 'border-slate-700 text-slate-500 hover:border-slate-600'
                    )}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Custom Instructions</label>
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                placeholder="e.g., Focus on technical concepts, ignore sponsor segments..."
                className="w-full h-16 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Error / Success */}
        {submitError && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-xs">{submitError}</p>
          </div>
        )}
        {submitSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <p className="text-emerald-400 text-xs">{submitSuccess}</p>
          </div>
        )}
      </form>

      {/* ─── Queue Banner ─── */}
      {queuedCount !== null && queuedCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <CheckCircle className="w-4 h-4 text-cyan-400" />
          <span className="text-sm text-cyan-300">{queuedCount} video{queuedCount !== 1 ? 's' : ''} added to queue.</span>
          {onNavigateToQueue && (
            <button
              onClick={onNavigateToQueue}
              className="ml-auto flex items-center gap-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              View Queue <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ─── Error ─── */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {/* ─── Scan Status Bar ─── */}
      {playlists.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/60 border border-slate-800 rounded-lg">
          <RefreshCw className={clsx('w-3.5 h-3.5 text-slate-500 flex-shrink-0', isScanning && 'animate-spin text-cyan-400')} />
          <div className="flex items-center gap-3 text-xs text-slate-400 flex-1 min-w-0">
            <span>Last scan: <span className="text-slate-300">{formatRelativeTime(lastPolledAt)}</span></span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next in: <span className="text-slate-300">{getNextScanCountdown() || '—'}</span>
            </span>
          </div>

          {/* Scan result toast */}
          {scanResult && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 flex-shrink-0">
              <CheckCircle className="w-3 h-3" />
              {scanResult.newVideos > 0
                ? `${scanResult.newVideos} new video${scanResult.newVideos !== 1 ? 's' : ''} found`
                : 'No new videos'}
            </span>
          )}

          <button
            onClick={handleScanNow}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3" />
                Scan Now
              </>
            )}
          </button>
        </div>
      )}

      {/* ─── My Playlists ─── */}
      {playlists.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3">My Playlists ({playlists.length})</h3>
          <div className="space-y-3">
            {playlists.map(pl => (
              <div key={pl.id}>
                {/* Playlist Card */}
                <div className={clsx(
                  'bg-slate-900 border rounded-lg p-4 transition-all',
                  expandedPlaylistId === pl.id ? 'border-cyan-500/40 ring-1 ring-cyan-500/20' : 'border-slate-800'
                )}>
                  <div className="flex items-center gap-3">
                    {pl.thumbnail_url && (
                      <img src={pl.thumbnail_url} alt="" className="w-16 h-10 rounded object-cover bg-slate-800 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-white text-sm font-medium truncate">{pl.playlist_name || 'Untitled Playlist'}</h4>
                        {!pl.is_active && <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">Paused</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                        <span>{pl.known_video_count} videos</span>
                        <span>{pl.total_videos_ingested} ingested</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedPlaylistId(expandedPlaylistId === pl.id ? null : pl.id)}
                        className={clsx(
                          'p-2 rounded-lg transition-colors',
                          expandedPlaylistId === pl.id
                            ? 'text-cyan-400 bg-cyan-500/10'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        )}
                        title="Browse Videos"
                      >
                        {expandedPlaylistId === pl.id ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEditPanel(pl)}
                        className={clsx(
                          'p-2 rounded-lg transition-colors',
                          editingPlaylistId === pl.id
                            ? 'text-cyan-400 bg-cyan-500/10'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        )}
                        title="Edit Settings"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggle(pl)}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title={pl.is_active ? 'Pause' : 'Resume'}
                      >
                        {pl.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <a
                        href={pl.playlist_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        title="Open on YouTube"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => handleDelete(pl.id)}
                        className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Disconnect"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Edit Settings Panel */}
                {editingPlaylistId === pl.id && (
                  <div className="mt-1 bg-slate-950 border border-slate-700 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 fade-in">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-cyan-400" />
                        Playlist Settings
                      </h4>
                      <button
                        onClick={() => setEditingPlaylistId(null)}
                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Auto-process toggle */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setEditAutoProcess(!editAutoProcess)}
                        className={clsx(
                          'w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
                          editAutoProcess ? 'bg-red-600' : 'bg-slate-700'
                        )}
                      >
                        <span className={clsx(
                          'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                          editAutoProcess ? 'left-[18px]' : 'left-0.5'
                        )} />
                      </button>
                      <span className="text-xs text-slate-400">Auto-process new videos</span>
                    </div>

                    {/* Extraction Mode */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Extraction Mode</label>
                      <div className="flex flex-wrap gap-1.5">
                        {EXTRACTION_MODES.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setEditExtractionMode(m.id)}
                            className={clsx(
                              'px-2.5 py-1 rounded-md text-xs transition-colors border',
                              editExtractionMode === m.id
                                ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                                : 'border-slate-700 text-slate-500 hover:border-slate-600'
                            )}
                            title={m.desc}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Anchor Emphasis */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Anchor Emphasis</label>
                      <div className="flex gap-1.5">
                        {ANCHOR_EMPHASIS_OPTIONS.map(o => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setEditAnchorEmphasis(o.id)}
                            className={clsx(
                              'px-2.5 py-1 rounded-md text-xs transition-colors border',
                              editAnchorEmphasis === o.id
                                ? 'border-cyan-500 bg-cyan-900/20 text-cyan-400'
                                : 'border-slate-700 text-slate-500 hover:border-slate-600'
                            )}
                          >
                            {o.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Linked Anchors */}
                    {anchors.length > 0 && (
                      <div>
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
                          <Tag className="w-3 h-3" /> Linked Anchors
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {anchors.map(a => (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => toggleEditAnchor(a.id)}
                              className={clsx(
                                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                                editLinkedAnchorIds.includes(a.id)
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600'
                              )}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Custom Instructions */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Custom Instructions</label>
                      <textarea
                        value={editCustomInstructions}
                        onChange={e => setEditCustomInstructions(e.target.value)}
                        placeholder="e.g., Focus on technical concepts, ignore sponsor segments..."
                        className="w-full h-16 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs placeholder-slate-500 focus:border-cyan-500 focus:outline-none resize-none"
                      />
                    </div>

                    {/* Error */}
                    {editError && (
                      <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <p className="text-red-400 text-xs">{editError}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setEditingPlaylistId(null)}
                        className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        {isSavingEdit ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Video Browser (expanded) */}
                {expandedPlaylistId === pl.id && (
                  <div className="mt-1 border border-slate-800 rounded-lg overflow-hidden">
                    <PlaylistVideoBrowser
                      playlist={pl}
                      onClose={() => setExpandedPlaylistId(null)}
                      onQueueChange={(count) => {
                        setQueuedCount(count);
                        // Auto-clear after 8s
                        setTimeout(() => setQueuedCount(null), 8000);
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {playlists.length === 0 && !isLoading && (
        <div className="text-center py-8 text-slate-500">
          <ListVideo className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No playlists connected yet</p>
          <p className="text-xs mt-1">Paste a YouTube playlist URL above to get started</p>
        </div>
      )}
    </div>
  );
}
