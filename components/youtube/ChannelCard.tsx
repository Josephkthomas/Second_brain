// ChannelCard - Display a single YouTube channel with actions

import React, { useState } from 'react';
import { Trash2, Power, Edit, Clock, Tag, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import type { YouTubeChannel } from '../../types/youtube';

interface ChannelCardProps {
  channel: YouTubeChannel;
  anchors?: Array<{ id: string; label: string }>;
  onUpdate: () => void;
  onClick?: () => void;
  onScan?: () => void;
}

export default function ChannelCard({ channel, anchors = [], onUpdate, onClick, onScan }: ChannelCardProps) {
  const { session } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get anchor labels for this channel
  const linkedAnchors = (channel.linked_anchor_ids || [])
    .map(id => anchors.find(a => a.id === id)?.label)
    .filter(Boolean);

  // Toggle active state
  const handleToggleActive = async () => {
    if (!session?.access_token || isUpdating) return;

    try {
      setIsUpdating(true);

      const response = await fetch('/api/youtube/channels', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: channel.id,
          is_active: !channel.is_active,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update channel');
      }

      onUpdate();
    } catch (err) {
      console.error('Error toggling channel:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete channel
  const handleDelete = async () => {
    if (!session?.access_token || isDeleting) return;

    if (!confirm(`Delete "${channel.channel_name}"? This will stop auto-ingestion but won't delete already extracted knowledge.`)) {
      return;
    }

    try {
      setIsDeleting(true);

      const response = await fetch('/api/youtube/channels', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: channel.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete channel');
      }

      onUpdate();
    } catch (err) {
      console.error('Error deleting channel:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-slate-900 border rounded-lg p-4 transition-all hover:border-slate-700',
        channel.is_active ? 'border-slate-800' : 'border-slate-800/50 opacity-60',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Thumbnail */}
        {channel.thumbnail_url ? (
          <img
            src={channel.thumbnail_url}
            alt={channel.channel_name}
            className="w-12 h-12 rounded-full object-cover bg-slate-800"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
            <span className="text-xl font-bold text-slate-600">
              {channel.channel_name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}

        {/* Name & URL */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{channel.channel_name}</h3>
          <a
            href={channel.channel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors"
          >
            View on YouTube
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Active Toggle */}
        <button
          onClick={handleToggleActive}
          disabled={isUpdating}
          className={clsx(
            'p-2 rounded-lg transition-all',
            channel.is_active
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
          )}
          title={channel.is_active ? 'Active - Click to pause' : 'Paused - Click to activate'}
        >
          {isUpdating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Power className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Linked Anchors */}
      {linkedAnchors.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Tag className="w-3 h-3 text-slate-500" />
          {linkedAnchors.map((label, i) => (
            <span
              key={i}
              className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Extraction Mode */}
      <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
        <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/30 rounded text-cyan-400">
          {channel.extraction_mode}
        </span>
        <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded">
          {channel.anchor_emphasis}
        </span>
      </div>

      {/* Custom Instructions Preview */}
      {channel.custom_instructions && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2 italic">
          "{channel.custom_instructions}"
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>Last checked: {formatDate(channel.last_checked_at)}</span>
        </div>
        <div>
          {channel.total_videos_ingested} videos ingested
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onScan?.();
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Re-scan
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          disabled={isDeleting}
          className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-xs font-medium transition-colors"
        >
          {isDeleting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Trash2 className="w-3 h-3" />
          )}
          Delete
        </button>
      </div>
    </div>
  );
}
