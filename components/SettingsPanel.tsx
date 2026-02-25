// SettingsPanel — Unified settings with tabbed navigation
// Tabs: Profile, Extraction, Anchors

import React, { useState } from 'react';
import { Settings, User, Zap, Anchor, X } from 'lucide-react';
import clsx from 'clsx';
import { UserProfileContent } from './UserProfileSettings';
import { ExtractionSettingsContent } from './ExtractionSettings';
import { AnchorManagerContent } from './AnchorManager';

type SettingsTab = 'profile' | 'extraction' | 'anchors';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAnchorUpdate?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose, onAnchorUpdate }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-8 z-10 p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>

      {/* Scrollable content */}
      <div className="h-full overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto w-full">

          {/* Center-aligned Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
              <Settings className="text-cyan-400" />
              Settings
            </h1>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              Manage your profile, extraction preferences, and anchor nodes.
            </p>
          </div>

          {/* Pill Toggle Bar */}
          <div className="flex justify-center mb-8">
            <div className="flex bg-slate-900 border border-slate-800 rounded-full p-1 shadow-lg">
              <button
                onClick={() => setActiveTab('profile')}
                className={clsx(
                  "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                  activeTab === 'profile'
                    ? "bg-indigo-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <User size={16} /> Profile
              </button>
              <button
                onClick={() => setActiveTab('extraction')}
                className={clsx(
                  "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                  activeTab === 'extraction'
                    ? "bg-cyan-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Zap size={16} /> Extraction
              </button>
              <button
                onClick={() => setActiveTab('anchors')}
                className={clsx(
                  "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all",
                  activeTab === 'anchors'
                    ? "bg-amber-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Anchor size={16} /> Anchors
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'profile' && <UserProfileContent />}
          {activeTab === 'extraction' && <ExtractionSettingsContent />}
          {activeTab === 'anchors' && <AnchorManagerContent onAnchorUpdate={onAnchorUpdate} />}

        </div>
      </div>
    </div>
  );
};
