// ChannelRepairModal - Check and repair invalid YouTube channel IDs
// This helps fix channels that were added before the channel ID extraction was working properly

import React, { useState, useEffect } from 'react';
import { X, Wrench, AlertTriangle, CheckCircle, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

interface ChannelRepairModalProps {
  onClose: () => void;
  onRepaired: () => void;
}

interface ChannelStatus {
  id: string;
  channel_name: string;
  channel_url: string;
  channel_id: string | null;
  is_valid: boolean;
  is_active: boolean;
  issue: string | null;
}

interface RepairResult {
  id: string;
  channel_name: string;
  old_channel_id: string | null;
  new_channel_id: string | null;
  status: 'repaired' | 'failed';
  error?: string;
}

export default function ChannelRepairModal({ onClose, onRepaired }: ChannelRepairModalProps) {
  const { session } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isRepairing, setIsRepairing] = useState(false);
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [repairResults, setRepairResults] = useState<RepairResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, valid: 0, invalid: 0 });

  // Fetch channel status on mount
  useEffect(() => {
    fetchChannelStatus();
  }, []);

  const fetchChannelStatus = async () => {
    if (!session?.access_token) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/youtube/repair-channels', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch channel status');
      }

      const data = await response.json();
      setChannels(data.channels || []);
      setStats({
        total: data.total,
        valid: data.valid,
        invalid: data.invalid,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check channels');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepairAll = async () => {
    if (!session?.access_token) return;

    try {
      setIsRepairing(true);
      setError(null);
      setRepairResults([]);

      const response = await fetch('/api/youtube/repair-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({}),  // Repair all invalid channels
      });

      if (!response.ok) {
        throw new Error('Failed to repair channels');
      }

      const data = await response.json();
      setRepairResults(data.results || []);

      // Refresh the channel list
      await fetchChannelStatus();

      // If any were repaired, notify parent
      if (data.repaired > 0) {
        onRepaired();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to repair channels');
    } finally {
      setIsRepairing(false);
    }
  };

  const invalidChannels = channels.filter(c => !c.is_valid);
  const validChannels = channels.filter(c => c.is_valid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
              <Wrench className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Repair Channel IDs</h3>
              <p className="text-sm text-slate-400">Fix channels with missing or invalid YouTube IDs</p>
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
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p>Checking channel IDs...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white">{stats.total}</div>
                  <div className="text-xs text-slate-400">Total Channels</div>
                </div>
                <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.valid}</div>
                  <div className="text-xs text-slate-400">Valid IDs</div>
                </div>
                <div className={clsx(
                  'rounded-lg p-4 text-center',
                  stats.invalid > 0
                    ? 'bg-red-950/30 border border-red-800/50'
                    : 'bg-slate-950 border border-slate-800'
                )}>
                  <div className={clsx(
                    'text-2xl font-bold',
                    stats.invalid > 0 ? 'text-red-400' : 'text-slate-400'
                  )}>
                    {stats.invalid}
                  </div>
                  <div className="text-xs text-slate-400">Need Repair</div>
                </div>
              </div>

              {/* All Good Message */}
              {stats.invalid === 0 && (
                <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div>
                    <p className="text-emerald-400 font-medium">All channels have valid IDs!</p>
                    <p className="text-sm text-slate-400">No repair needed.</p>
                  </div>
                </div>
              )}

              {/* Invalid Channels List */}
              {stats.invalid > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    Channels Needing Repair
                  </h4>
                  <div className="space-y-2">
                    {invalidChannels.map(channel => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 bg-slate-950 border border-red-800/30 rounded-lg"
                      >
                        <div>
                          <div className="text-white font-medium">{channel.channel_name}</div>
                          <div className="text-xs text-red-400">{channel.issue}</div>
                          {channel.channel_url && (
                            <div className="text-xs text-slate-500 mt-1 truncate max-w-md">
                              URL: {channel.channel_url}
                            </div>
                          )}
                        </div>
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repair Results */}
              {repairResults.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-white mb-3">Repair Results</h4>
                  <div className="space-y-2">
                    {repairResults.map((result, idx) => (
                      <div
                        key={idx}
                        className={clsx(
                          'flex items-center justify-between p-3 rounded-lg border',
                          result.status === 'repaired'
                            ? 'bg-emerald-950/30 border-emerald-800/50'
                            : 'bg-red-950/30 border-red-800/50'
                        )}
                      >
                        <div>
                          <div className="text-white font-medium">{result.channel_name}</div>
                          {result.status === 'repaired' ? (
                            <div className="text-xs text-emerald-400">
                              Fixed: {result.old_channel_id || 'null'} → {result.new_channel_id}
                            </div>
                          ) : (
                            <div className="text-xs text-red-400">
                              Failed: {result.error}
                            </div>
                          )}
                        </div>
                        {result.status === 'repaired' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Valid Channels (collapsed) */}
              {validChannels.length > 0 && (
                <details className="group">
                  <summary className="text-sm font-medium text-slate-400 cursor-pointer hover:text-white transition-colors">
                    <span className="ml-1">Show {validChannels.length} valid channels</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    {validChannels.map(channel => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg"
                      >
                        <div>
                          <div className="text-white font-medium">{channel.channel_name}</div>
                          <div className="text-xs text-slate-500">ID: {channel.channel_id}</div>
                        </div>
                        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-800">
          <button
            onClick={fetchChannelStatus}
            disabled={isLoading || isRepairing}
            className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
            Refresh
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
            {stats.invalid > 0 && (
              <button
                onClick={handleRepairAll}
                disabled={isRepairing || isLoading}
                className={clsx(
                  'flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors',
                  isRepairing || isLoading
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                )}
              >
                {isRepairing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Repairing...
                  </>
                ) : (
                  <>
                    <Wrench className="w-4 h-4" />
                    Repair {stats.invalid} Channel{stats.invalid !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
