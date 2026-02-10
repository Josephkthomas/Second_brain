// YouTubeManager - Main component for YouTube channel auto-ingestion
// Displays channels, queue, and settings tabs

import React, { useState, useEffect, useCallback } from 'react';
import { Youtube, Plus, Settings, RefreshCw, Loader2, AlertCircle, Wrench } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';
import { getSupabase, getCurrentUserId } from '../../services/supabase';
import type { YouTubeChannel, YouTubeQueueItem, YouTubeSettings, YouTubeStats } from '../../types/youtube';
import ChannelList from './ChannelList';
import QueueStatusPanel from './QueueStatusPanel';
import ScanHistoryPanel from './ScanHistoryPanel';
import AddChannelModal from './AddChannelModal';
import YouTubeSettingsModal from './YouTubeSettingsModal';
import ChannelRepairModal from './ChannelRepairModal';

type TabType = 'channels' | 'queue' | 'history';

interface YouTubeManagerProps {
  onComplete?: () => void;
  onGraphUpdate?: () => void;
}

export default function YouTubeManager({ onComplete, onGraphUpdate }: YouTubeManagerProps) {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('channels');
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [queueItems, setQueueItems] = useState<YouTubeQueueItem[]>([]);
  const [settings, setSettings] = useState<YouTubeSettings | null>(null);
  const [stats, setStats] = useState<YouTubeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      // Fetch channels
      const channelsRes = await fetch('/api/youtube/channels', { headers });
      const channelsData = await channelsRes.json();
      if (!channelsRes.ok) {
        throw new Error(channelsData.error || `Failed to fetch channels (${channelsRes.status})`);
      }
      setChannels(channelsData.channels || []);

      // Fetch queue
      const queueRes = await fetch('/api/youtube/queue?limit=100', { headers });
      const queueData = await queueRes.json();
      if (!queueRes.ok) {
        throw new Error(queueData.error || `Failed to fetch queue (${queueRes.status})`);
      }
      setQueueItems(queueData.items || []);

      // Fetch settings
      const settingsRes = await fetch('/api/youtube/settings', { headers });
      const settingsData = await settingsRes.json();
      if (!settingsRes.ok) {
        throw new Error(settingsData.error || `Failed to fetch settings (${settingsRes.status})`);
      }
      setSettings(settingsData.settings);

      // Calculate stats
      const channelList = channelsData.channels || [];
      const queueList = queueData.items || [];
      const today = new Date().toISOString().split('T')[0];

      setStats({
        total_channels: channelList.length,
        active_channels: channelList.filter((c: YouTubeChannel) => c.is_active).length,
        pending_videos: queueList.filter((q: YouTubeQueueItem) => q.status === 'pending').length,
        processing_videos: queueList.filter((q: YouTubeQueueItem) =>
          q.status === 'fetching_transcript' || q.status === 'extracting'
        ).length,
        completed_today: queueList.filter((q: YouTubeQueueItem) =>
          q.status === 'completed' && q.completed_at?.startsWith(today)
        ).length,
        failed_today: queueList.filter((q: YouTubeQueueItem) =>
          q.status === 'failed' && q.completed_at?.startsWith(today)
        ).length,
        daily_limit: settingsData.settings?.daily_video_limit || 20,
        videos_today: settingsData.settings?.videos_ingested_today || 0,
      });

    } catch (err) {
      console.error('Error fetching YouTube data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  // Channel added handler
  const handleChannelAdded = () => {
    setShowAddModal(false);
    fetchData();
  };

  // Settings updated handler
  const handleSettingsUpdated = () => {
    setShowSettingsModal(false);
    fetchData();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>Loading YouTube channels...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/30">
            <Youtube className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">YouTube Auto-Ingest</h2>
            <p className="text-sm text-slate-400">
              Automatically capture knowledge from YouTube channels
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={clsx('w-5 h-5', isRefreshing && 'animate-spin')} />
          </button>

          <button
            onClick={() => setShowRepairModal(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Repair Channel IDs"
          >
            <Wrench className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Channel
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-white">{stats.total_channels}</div>
            <div className="text-xs text-slate-400">Channels</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-amber-400">{stats.pending_videos}</div>
            <div className="text-xs text-slate-400">Pending</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-cyan-400">{stats.processing_videos}</div>
            <div className="text-xs text-slate-400">Processing</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="text-2xl font-bold text-emerald-400">
              {stats.videos_today}/{stats.daily_limit}
            </div>
            <div className="text-xs text-slate-400">Today's Usage</div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit mb-6">
        <button
          onClick={() => setActiveTab('channels')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all',
            activeTab === 'channels'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          )}
        >
          Channels ({channels.length})
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all',
            activeTab === 'queue'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          )}
        >
          Queue ({queueItems.filter(q => q.status === 'pending' || q.status === 'fetching_transcript' || q.status === 'extracting').length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all',
            activeTab === 'history'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          )}
        >
          History
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'channels' && (
          <ChannelList
            channels={channels}
            onRefresh={fetchData}
            onAddChannel={() => setShowAddModal(true)}
            onGraphUpdate={onGraphUpdate}
          />
        )}

        {activeTab === 'queue' && (
          <QueueStatusPanel
            items={queueItems}
            onRefresh={fetchData}
            onGraphUpdate={onGraphUpdate}
          />
        )}

        {activeTab === 'history' && (
          <ScanHistoryPanel />
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddChannelModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleChannelAdded}
        />
      )}

      {showSettingsModal && (
        <YouTubeSettingsModal
          settings={settings}
          onClose={() => setShowSettingsModal(false)}
          onSuccess={handleSettingsUpdated}
        />
      )}

      {showRepairModal && (
        <ChannelRepairModal
          onClose={() => setShowRepairModal(false)}
          onRepaired={() => {
            setShowRepairModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
