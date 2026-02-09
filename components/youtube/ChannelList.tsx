// ChannelList - Display list of YouTube channels with filtering

import React, { useState, useEffect } from 'react';
import { Search, Plus, Youtube } from 'lucide-react';
import { fetchAnchors } from '../../services/supabase';
import type { YouTubeChannel } from '../../types/youtube';
import ChannelCard from './ChannelCard';
import ChannelDetailModal from './ChannelDetailModal';

interface ChannelListProps {
  channels: YouTubeChannel[];
  onRefresh: () => void;
  onAddChannel: () => void;
}

export default function ChannelList({ channels, onRefresh, onAddChannel }: ChannelListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'paused'>('all');
  const [anchors, setAnchors] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedChannel, setSelectedChannel] = useState<YouTubeChannel | null>(null);

  // Fetch anchors for display
  useEffect(() => {
    async function loadAnchors() {
      try {
        const data = await fetchAnchors();
        setAnchors(data.map(a => ({ id: a.id, label: a.label })));
      } catch (err) {
        console.error('Failed to fetch anchors:', err);
      }
    }
    loadAnchors();
  }, []);

  // Filter channels
  const filteredChannels = channels.filter(channel => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!channel.channel_name.toLowerCase().includes(query) &&
          !channel.description?.toLowerCase().includes(query)) {
        return false;
      }
    }

    // Active filter
    if (filterActive === 'active' && !channel.is_active) return false;
    if (filterActive === 'paused' && channel.is_active) return false;

    return true;
  });

  // Empty state
  if (channels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full border-2 border-dashed border-slate-800 rounded-lg py-12">
        <div className="p-4 bg-red-500/10 rounded-full mb-4">
          <Youtube className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-lg font-medium text-white mb-2">No Channels Yet</h3>
        <p className="text-slate-400 text-sm mb-4 text-center max-w-md">
          Add YouTube channels to automatically extract knowledge from new videos.
        </p>
        <button
          onClick={onAddChannel}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Your First Channel
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search channels..."
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:border-slate-700 focus:outline-none"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setFilterActive('all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'all'
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterActive('active')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'active'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterActive('paused')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              filterActive === 'paused'
                ? 'bg-slate-700 text-slate-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Paused
          </button>
        </div>
      </div>

      {/* Channel Grid */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-500">
            <p>No channels match your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredChannels.map(channel => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                anchors={anchors}
                onUpdate={onRefresh}
                onClick={() => setSelectedChannel(channel)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Channel Detail Modal */}
      {selectedChannel && (
        <ChannelDetailModal
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
          onUpdate={() => {
            setSelectedChannel(null);
            onRefresh();
          }}
          onDelete={() => {
            setSelectedChannel(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
