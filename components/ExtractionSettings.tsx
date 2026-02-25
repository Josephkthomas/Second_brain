import React, { useState, useEffect, useCallback } from 'react';
import {
  getUserExtractionSettings,
  upsertExtractionSettings,
  getDefaultSettings
} from '../services/extractionSettings';
import { getSessionStats } from '../services/extractionSession';
import { getAllExtractionModes } from '../config/extractionModes';
import type { ExtractionSettings as ExtractionSettingsType, ExtractionMode, AnchorEmphasis } from '../types/extraction';
import {
  Check, X, Zap, Database, TrendingUp, CheckSquare, Network,
  ChevronDown, ChevronUp, Info, BarChart3, type LucideIcon
} from 'lucide-react';
import clsx from 'clsx';

interface ExtractionSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, icon, children, defaultOpen = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-cyber-slate/30 hover:bg-cyber-slate/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-cyan-400">{icon}</div>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 bg-cyber-slate/10">
          {children}
        </div>
      )}
    </div>
  );
};

// Map mode IDs to icons
const MODE_ICONS: Record<string, LucideIcon> = {
  comprehensive: Database,
  strategic: TrendingUp,
  actionable: CheckSquare,
  relational: Network
};

export const ExtractionSettings: React.FC<ExtractionSettingsProps> = ({ isOpen, onClose }) => {
  const [settings, setSettings] = useState<ExtractionSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [defaultMode, setDefaultMode] = useState<ExtractionMode>('comprehensive');
  const [defaultAnchorEmphasis, setDefaultAnchorEmphasis] = useState<AnchorEmphasis>('standard');

  // Stats
  const [stats, setStats] = useState<{
    totalSessions: number;
    totalEntities: number;
    totalRelationships: number;
    averageDuration: number;
    modeDistribution: Record<string, number>;
  } | null>(null);

  const modes = getAllExtractionModes();

  useEffect(() => {
    if (isOpen) {
      loadSettings();
      loadStats();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getUserExtractionSettings();

      if (data) {
        setSettings(data);
        setDefaultMode(data.default_mode);
        setDefaultAnchorEmphasis(data.default_anchor_emphasis);
      } else {
        // Use defaults
        const defaults = getDefaultSettings();
        setDefaultMode(defaults.default_mode);
        setDefaultAnchorEmphasis(defaults.default_anchor_emphasis);
      }
    } catch (err) {
      console.error('Failed to load extraction settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const sessionStats = await getSessionStats();
      setStats(sessionStats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const { error } = await upsertExtractionSettings(
        defaultMode,
        defaultAnchorEmphasis
      );

      if (!error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        await loadSettings();
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  }, [defaultMode, defaultAnchorEmphasis]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-20 border-b border-white/10 bg-cyber-slate/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="bg-cyan-500/10 p-2.5 rounded-lg">
            <Zap size={24} className="text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Extraction Settings</h1>
            <p className="text-xs text-slate-400">Configure default extraction behavior</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            saved ? "bg-emerald-500/20 text-emerald-400" : "bg-transparent text-transparent"
          )}>
            <Check size={14} />
            <span>Saved</span>
          </div>

          {saving && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              <span>Saving...</span>
            </div>
          )}

          <button
            onClick={handleSave}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-400 text-sm font-medium transition-colors"
          >
            Save Settings
          </button>

          <button
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="absolute top-20 bottom-0 left-0 right-0 overflow-y-auto">
        <ExtractionSettingsContent />
      </div>
    </div>
  );
};

/* ─── Standalone content (for embedding in SettingsPanel) ─── */

export const ExtractionSettingsContent: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [defaultMode, setDefaultMode] = useState<ExtractionMode>('comprehensive');
  const [defaultAnchorEmphasis, setDefaultAnchorEmphasis] = useState<AnchorEmphasis>('standard');
  const [stats, setStats] = useState<{
    totalSessions: number;
    totalEntities: number;
    totalRelationships: number;
    averageDuration: number;
    modeDistribution: Record<string, number>;
  } | null>(null);

  const modes = getAllExtractionModes();

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await getUserExtractionSettings();
      if (data) {
        setDefaultMode(data.default_mode);
        setDefaultAnchorEmphasis(data.default_anchor_emphasis);
      } else {
        const defaults = getDefaultSettings();
        setDefaultMode(defaults.default_mode);
        setDefaultAnchorEmphasis(defaults.default_anchor_emphasis);
      }
    } catch (err) {
      console.error('Failed to load extraction settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const sessionStats = await getSessionStats();
      setStats(sessionStats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const { error } = await upsertExtractionSettings(defaultMode, defaultAnchorEmphasis);
      if (!error) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  }, [defaultMode, defaultAnchorEmphasis]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Save Bar */}
      <div className="flex items-center justify-end gap-3 min-h-[28px]">
        {saving && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span>Saving...</span>
          </div>
        )}
        <div className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
          saved ? "bg-emerald-500/20 text-emerald-400" : "bg-transparent text-transparent"
        )}>
          <Check size={14} />
          <span>Saved</span>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-lg text-cyan-400 text-sm font-medium transition-colors"
        >
          Save Settings
        </button>
      </div>

      {/* Info Banner */}
      <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-300 leading-relaxed">
            These settings define how the AI processes your content by default.
            You can override these per-source in the Advanced Options panel when injecting content.
          </p>
        </div>
      </div>

      {/* Default Extraction Mode */}
      <Section title="Default Extraction Mode" icon={<Database size={18} />} defaultOpen={true}>
        <p className="text-xs text-slate-400 mb-4">
          Choose how the AI should process your content by default. Each mode optimizes for different use cases.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modes.map(mode => {
            const IconComponent = MODE_ICONS[mode.id] || Database;
            const isSelected = defaultMode === mode.id;
            return (
              <button key={mode.id} onClick={() => setDefaultMode(mode.id)} className={clsx("text-left p-4 rounded-lg border-2 transition-all", isSelected ? "border-cyan-500 bg-cyan-500/10" : "border-white/10 bg-cyber-slate/30 hover:border-white/20")}>
                <div className="flex items-start gap-3">
                  <IconComponent size={20} className={clsx("flex-shrink-0 mt-0.5", isSelected ? "text-cyan-400" : "text-slate-500")} />
                  <div className="flex-1 min-w-0">
                    <h4 className={clsx("font-semibold text-sm", isSelected ? "text-cyan-400" : "text-white")}>{mode.name}</h4>
                    <p className="text-slate-400 text-xs mt-1 leading-relaxed">{mode.description}</p>
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wide">Best for:</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{mode.useCases.slice(0, 2).join(', ')}</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Default Anchor Emphasis */}
      <Section title="Default Anchor Emphasis" icon={<Network size={18} />} defaultOpen={true}>
        <p className="text-xs text-slate-400 mb-4">
          Control how strongly the AI prioritizes finding connections to your anchor nodes.
        </p>
        <div className="space-y-3">
          {([
            { value: 'passive' as AnchorEmphasis, label: 'Passive', description: 'Note obvious connections to anchors, but don\'t prioritize them. Good for discovery and avoiding bias.' },
            { value: 'standard' as AnchorEmphasis, label: 'Standard (Recommended)', description: 'Actively look for connections to anchors while remaining balanced. Best for most use cases.' },
            { value: 'aggressive' as AnchorEmphasis, label: 'Aggressive', description: 'Strongly prioritize finding and creating connections to anchors. Use when building focused knowledge around specific themes.' }
          ]).map(option => {
            const isSelected = defaultAnchorEmphasis === option.value;
            return (
              <label key={option.value} className={clsx("flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all", isSelected ? "border-cyan-500 bg-cyan-500/10" : "border-white/10 bg-cyber-slate/30 hover:border-white/20")}>
                <input type="radio" name="anchorEmphasisContent" value={option.value} checked={isSelected} onChange={() => setDefaultAnchorEmphasis(option.value)} className="mt-1" />
                <div>
                  <div className={clsx("font-medium text-sm", isSelected ? "text-cyan-400" : "text-white")}>{option.label}</div>
                  <div className="text-xs text-slate-400 mt-1">{option.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Extraction Statistics */}
      {stats && stats.totalSessions > 0 && (
        <Section title="Extraction Statistics" icon={<BarChart3 size={18} />} defaultOpen={false}>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cyber-slate/30 rounded-lg p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Total Sessions</p>
              <p className="text-2xl font-bold text-white mt-1">{stats.totalSessions}</p>
            </div>
            <div className="bg-cyber-slate/30 rounded-lg p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Entities Extracted</p>
              <p className="text-2xl font-bold text-cyan-400 mt-1">{stats.totalEntities}</p>
            </div>
            <div className="bg-cyber-slate/30 rounded-lg p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Relationships</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{stats.totalRelationships}</p>
            </div>
            <div className="bg-cyber-slate/30 rounded-lg p-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Avg Duration</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{stats.averageDuration > 0 ? `${Math.round(stats.averageDuration / 1000)}s` : 'N/A'}</p>
            </div>
          </div>
          {Object.keys(stats.modeDistribution).length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Mode Usage</p>
              <div className="space-y-2">
                {Object.entries(stats.modeDistribution).map(([mode, count]) => {
                  const countNum = count as number;
                  const percentage = Math.round((countNum / stats.totalSessions) * 100);
                  return (
                    <div key={mode} className="flex items-center gap-3">
                      <span className="text-xs text-slate-400 w-24 capitalize">{mode}</span>
                      <div className="flex-1 h-2 bg-cyber-slate/30 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${percentage}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-12 text-right">{percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
};
