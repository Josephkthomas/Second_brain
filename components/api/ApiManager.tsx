// ApiManager - Container component for Universal Ingest API interface
// Two tabs: Queue (live processing status) and API Settings (endpoint docs + test)

import React, { useState } from 'react';
import { ListTodo, Settings, Zap } from 'lucide-react';
import clsx from 'clsx';
import IngestQueuePanel from '../IngestQueuePanel';
import ApiSettingsPanel from '../ApiSettingsPanel';

type TabType = 'queue' | 'settings';

interface ApiManagerProps {
  onComplete?: () => void;
  onGraphUpdate?: () => void;
}

export default function ApiManager({ onComplete, onGraphUpdate }: ApiManagerProps) {
  const [activeTab, setActiveTab] = useState<TabType>('queue');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-200">Universal Ingest API</h2>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
        <button
          onClick={() => setActiveTab('queue')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'queue'
              ? 'bg-slate-800 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
          )}
        >
          <ListTodo className="w-4 h-4" />
          Queue
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'settings'
              ? 'bg-slate-800 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
          )}
        >
          <Settings className="w-4 h-4" />
          API Settings
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'queue' && (
          <IngestQueuePanel onGraphUpdate={onGraphUpdate} />
        )}
        {activeTab === 'settings' && (
          <ApiSettingsPanel />
        )}
      </div>
    </div>
  );
}
