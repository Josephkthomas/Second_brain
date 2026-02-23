import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Compass, Plus, ChevronUp, ChevronDown, ChevronLeft, X,
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, Clock, Play, Trash2, ToggleLeft, ToggleRight, GripVertical,
  Mail, Send, History, Settings2, ArrowUp, ArrowDown, Eye,
  Brain, Database, Cpu, CheckCircle2, XCircle, Loader2, Zap, BarChart3,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
} from 'lucide-react';
import clsx from 'clsx';
import {
  fetchDigestProfiles, fetchDigestProfile, createDigestProfile, updateDigestProfile,
  deleteDigestProfile, addDigestModule, updateDigestModule, deleteDigestModule,
  reorderDigestModules, addDigestChannel, updateDigestChannel, deleteDigestChannel,
  fetchDigestHistory,
} from '../services/digest';
import { fetchAnchors } from '../services/supabase';
import { getDigestTemplate, DIGEST_TEMPLATES, getDigestTemplatesByFrequency, TEMPLATE_CATEGORY_LABELS } from '../config/digestTemplates';
import { DigestTemplateSelector } from './DigestTemplateSelector';
import { DigestViewer } from './DigestViewer';
import { generateDigest, generateCustomModulePrompt } from '../services/digestAgents';
import type { GenerationProgress, AgentProgressStep } from '../services/digestAgents';
import type {
  DigestProfile, DigestModule, DigestChannel, DigestHistoryEntry,
  ScheduleFrequency, DensityLevel, DigestScope,
} from '../types/digest';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap, Sparkles,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
  Compass, BarChart3,
};

const FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
};

const DENSITY_LABELS: Record<DensityLevel, string> = {
  brief: 'Brief', standard: 'Standard', comprehensive: 'Comprehensive',
};

// ─── Common Timezones for Dropdown ─────────────────────────
const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const TIMEZONE_LABELS: Record<string, string> = {
  'UTC': 'UTC',
  'America/New_York': 'US Eastern (New York)',
  'America/Chicago': 'US Central (Chicago)',
  'America/Denver': 'US Mountain (Denver)',
  'America/Los_Angeles': 'US Pacific (Los Angeles)',
  'America/Toronto': 'Canada (Toronto)',
  'Europe/London': 'UK (London)',
  'Europe/Paris': 'France (Paris)',
  'Europe/Berlin': 'Germany (Berlin)',
  'Europe/Amsterdam': 'Netherlands (Amsterdam)',
  'Asia/Tokyo': 'Japan (Tokyo)',
  'Asia/Shanghai': 'China (Shanghai)',
  'Asia/Singapore': 'Singapore',
  'Asia/Kolkata': 'India (Kolkata)',
  'Asia/Dubai': 'UAE (Dubai)',
  'Australia/Sydney': 'Australia (Sydney)',
  'Pacific/Auckland': 'New Zealand (Auckland)',
};

const DENSITY_TOOLTIPS: Record<DensityLevel, string> = {
  brief: 'Quick headlines and key bullets. 1-2 min read.',
  standard: 'Balanced analysis with highlights and detail. 3-5 min.',
  comprehensive: 'Full agent output with deep analysis. 8-12 min.',
};

type SectionSaveState = 'idle' | 'saving' | 'saved';

// ─── Section Component (defined OUTSIDE to prevent remount) ──
const Section: React.FC<{
  id: string;
  title: string;
  icon: React.ReactNode;
  expandedSection: string | null;
  onToggle: (id: string) => void;
  saveState?: SectionSaveState;
  onSave?: () => void;
  children: React.ReactNode;
}> = ({ id, title, icon, expandedSection, onToggle, saveState, onSave, children }) => {
  const isExpanded = expandedSection === id;
  return (
    <div className="border border-white/10 rounded-lg">
      <button
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between p-4 bg-cyber-slate/30 hover:bg-cyber-slate/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-sm font-semibold text-white">{title}</span>
          {saveState === 'saving' && <Loader2 size={12} className="text-cyan-400 animate-spin" />}
          {saveState === 'saved' && <CheckCircle2 size={12} className="text-emerald-400" />}
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 bg-cyber-slate/10 rounded-b-lg">
          {children}
          {onSave && (
            <div className="pt-2 border-t border-white/5 flex justify-end">
              <button
                onClick={onSave}
                disabled={saveState === 'saving'}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  saveState === 'saved'
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : saveState === 'saving'
                    ? "bg-white/5 text-slate-500 cursor-not-allowed"
                    : "bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20"
                )}
              >
                {saveState === 'saving' && <Loader2 size={12} className="animate-spin" />}
                {saveState === 'saved' && <CheckCircle2 size={12} />}
                {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save Section'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Channel Card Component (defined OUTSIDE to prevent remount) ──
const ChannelCard: React.FC<{
  channel: DigestChannel;
  icon: React.ReactNode;
  label: string;
  onToggle: (channelId: string, currentActive: boolean) => void;
  onDelete?: (channelId: string) => void;
  onUpdateDensity: (channelId: string, density: DensityLevel | null) => void;
  onUpdateFormat: (channelId: string, instructions: string) => void;
  children?: React.ReactNode;
}> = ({ channel, icon, label, onToggle, onDelete, onUpdateDensity, onUpdateFormat, children }) => {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-white/5">
        {icon}
        <span className="text-sm font-medium text-white flex-1">{label}</span>
        <span className={clsx(
          "text-[10px] px-1.5 py-0.5 rounded",
          channel.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700/50 text-slate-500"
        )}>
          {channel.is_active ? 'Connected' : 'Disabled'}
        </span>
        <button
          onClick={() => onToggle(channel.id, channel.is_active)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
        >
          {channel.is_active ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} className="text-slate-500" />}
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3">
        {/* Channel-specific config (children slot) */}
        {children}

        {/* Density Override */}
        <div>
          <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Density Override</label>
          <div className="flex gap-1">
            {([null, 'brief', 'standard', 'comprehensive'] as (DensityLevel | null)[]).map(d => (
              <button
                key={d ?? 'default'}
                onClick={() => onUpdateDensity(channel.id, d)}
                className={clsx(
                  "flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-colors border",
                  channel.density_override === d
                    ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                    : "bg-white/[0.02] text-slate-500 border-white/5 hover:bg-white/5 hover:text-slate-300"
                )}
              >
                {d === null ? 'Default' : DENSITY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>

        {/* Format Instructions */}
        <div>
          <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Format Instructions</label>
          <textarea
            defaultValue={channel.format_instructions || ''}
            onBlur={e => onUpdateFormat(channel.id, e.target.value)}
            placeholder="e.g. Keep it concise, use bullet points..."
            rows={2}
            className="w-full px-2.5 py-1.5 rounded bg-black/20 border border-white/5 text-xs text-slate-300 placeholder:text-slate-700 focus:border-cyan-500/30 focus:outline-none resize-none"
          />
        </div>

        {/* Delete */}
        {onDelete && (
          <button
            onClick={() => onDelete(channel.id)}
            className="flex items-center gap-1.5 text-[10px] text-slate-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={10} /> Remove channel
          </button>
        )}
      </div>
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type View = 'list' | 'editor' | 'history_detail' | 'generating';

export const OrientationCenter: React.FC<Props> = ({ isOpen, onClose }) => {
  // Navigation
  const [view, setView] = useState<View>('list');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Data
  const [profiles, setProfiles] = useState<DigestProfile[]>([]);
  const [editingProfile, setEditingProfile] = useState<(DigestProfile & { modules: DigestModule[]; channels: DigestChannel[] }) | null>(null);
  const [history, setHistory] = useState<DigestHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showCustomModuleWizard, setShowCustomModuleWizard] = useState(false);
  const [customModuleName, setCustomModuleName] = useState('');
  const [customModuleLookFor, setCustomModuleLookFor] = useState('');
  const [customModulePrioritise, setCustomModulePrioritise] = useState('');
  const [customModuleFormat, setCustomModuleFormat] = useState('');
  const [customModuleGenerating, setCustomModuleGenerating] = useState(false);
  const [showTelegramSetup, setShowTelegramSetup] = useState(false);
  const [showSlackSetup, setShowSlackSetup] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('basics');
  const [sectionSaveState, setSectionSaveState] = useState<Record<string, SectionSaveState>>({});

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);
  const [previewResult, setPreviewResult] = useState<DigestHistoryEntry | null>(null);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<DigestHistoryEntry | null>(null);

  // Form state for new/editing profile
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFrequency, setFormFrequency] = useState<ScheduleFrequency>('daily');
  const [formTime, setFormTime] = useState('08:00');
  const [formTimezone, setFormTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1); // Monday
  const [formDayOfMonth, setFormDayOfMonth] = useState<number>(1);
  const [formDensity, setFormDensity] = useState<DensityLevel>('standard');
  const [formScopeMode, setFormScopeMode] = useState<'all_active' | 'selected'>('all_active');
  const [selectedAnchorIds, setSelectedAnchorIds] = useState<Set<string>>(new Set());
  const [availableAnchors, setAvailableAnchors] = useState<{ id: string; label: string; entity_type: string }[]>([]);

  // Load data
  // Tracks whether initial form state has been populated (to skip resetting save state on load)
  const saveStateInitialized = useRef(false);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    const [profileData, historyData] = await Promise.all([
      fetchDigestProfiles(),
      fetchDigestHistory(undefined, 10),
    ]);
    setProfiles(profileData);
    setHistory(historyData);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadProfiles();
      setView('list');
      setSelectedProfileId(null);
    }
  }, [isOpen, loadProfiles]);

  // Open editor for existing or new profile
  const openEditor = async (profileId?: string) => {
    // Fetch anchors for scope selection
    const anchors = await fetchAnchors();
    setAvailableAnchors(anchors.map(a => ({ id: a.id, label: a.label, entity_type: a.entity_type })));

    if (profileId) {
      const profile = await fetchDigestProfile(profileId);
      if (!profile) return;
      setEditingProfile(profile);
      setFormName(profile.name);
      setFormDescription(profile.description || '');
      setFormFrequency(profile.frequency);
      setFormTime(profile.delivery_time?.slice(0, 5) || '08:00');
      setFormTimezone(profile.timezone);
      setFormDayOfWeek(profile.delivery_day_of_week ?? 1);
      setFormDayOfMonth(profile.delivery_day_of_month ?? 1);
      setFormDensity(profile.density);
      const scopeMode = profile.scope?.mode === 'selected' ? 'selected' : 'all_active';
      setFormScopeMode(scopeMode);
      if (scopeMode === 'selected' && profile.scope?.mode === 'selected') {
        setSelectedAnchorIds(new Set((profile.scope as { mode: 'selected'; anchor_ids: string[] }).anchor_ids || []));
      } else {
        setSelectedAnchorIds(new Set());
      }
      setSelectedProfileId(profileId);
    } else {
      setEditingProfile(null);
      setFormName('');
      setFormDescription('');
      setFormFrequency('daily');
      setFormTime('08:00');
      setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      setFormDayOfWeek(1);
      setFormDayOfMonth(1);
      setFormDensity('standard');
      setFormScopeMode('all_active');
      setSelectedAnchorIds(new Set());
      setSelectedProfileId(null);
    }
    setSectionSaveState({});
    setExpandedSection('basics');
    setView('editor');
    // Mark initialized after a tick so the useEffect watchers don't fire on initial population
    requestAnimationFrame(() => { saveStateInitialized.current = true; });
  };

  // Reset initialization flag when leaving editor
  useEffect(() => {
    if (view !== 'editor') {
      saveStateInitialized.current = false;
    }
  }, [view]);

  // Change watchers — reset "Saved" → "Save Section" when user edits a section
  useEffect(() => {
    if (!saveStateInitialized.current) return;
    setSectionSaveState(prev => prev.basics === 'saved' ? { ...prev, basics: 'idle' } : prev);
  }, [formName, formDescription, formFrequency, formTime, formTimezone, formDayOfWeek, formDayOfMonth, formDensity, formScopeMode, selectedAnchorIds]);

  useEffect(() => {
    if (!saveStateInitialized.current) return;
    setSectionSaveState(prev => prev.modules === 'saved' ? { ...prev, modules: 'idle' } : prev);
  }, [editingProfile?.modules]);

  useEffect(() => {
    if (!saveStateInitialized.current) return;
    setSectionSaveState(prev => prev.channels === 'saved' ? { ...prev, channels: 'idle' } : prev);
  }, [editingProfile?.channels]);

  // Save profile
  const handleSave = async () => {
    setSaving(true);
    const scope: DigestScope = formScopeMode === 'all_active'
      ? { mode: 'all_active' }
      : { mode: 'selected', anchor_ids: Array.from(selectedAnchorIds) };

    if (editingProfile) {
      await updateDigestProfile(editingProfile.id, {
        name: formName,
        description: formDescription || null,
        frequency: formFrequency,
        delivery_time: formTime,
        delivery_day_of_week: formFrequency === 'weekly' ? formDayOfWeek : null,
        delivery_day_of_month: formFrequency === 'monthly' ? formDayOfMonth : null,
        timezone: formTimezone,
        density: formDensity,
        scope,
      });
    } else {
      const { data } = await createDigestProfile({
        name: formName || 'New Digest',
        description: formDescription || undefined,
        frequency: formFrequency,
        delivery_time: formTime,
        delivery_day_of_week: formFrequency === 'weekly' ? formDayOfWeek : null,
        delivery_day_of_month: formFrequency === 'monthly' ? formDayOfMonth : null,
        timezone: formTimezone,
        density: formDensity,
        scope,
      });
      if (data) {
        setSelectedProfileId(data.id);
        const full = await fetchDigestProfile(data.id);
        setEditingProfile(full);
      }
    }
    setSaving(false);
    await loadProfiles();
  };

  // Per-section save — stays 'saved' until user makes another change
  const markSectionSaved = (sectionId: string) => {
    setSectionSaveState(prev => ({ ...prev, [sectionId]: 'saved' }));
  };

  const handleSaveBasics = async () => {
    setSectionSaveState(prev => ({ ...prev, basics: 'saving' }));
    const scope: DigestScope = formScopeMode === 'all_active'
      ? { mode: 'all_active' }
      : { mode: 'selected', anchor_ids: Array.from(selectedAnchorIds) };

    if (editingProfile) {
      await updateDigestProfile(editingProfile.id, {
        name: formName,
        description: formDescription || null,
        frequency: formFrequency,
        delivery_time: formTime,
        delivery_day_of_week: formFrequency === 'weekly' ? formDayOfWeek : null,
        delivery_day_of_month: formFrequency === 'monthly' ? formDayOfMonth : null,
        timezone: formTimezone,
        density: formDensity,
        scope,
      });
    } else {
      const { data } = await createDigestProfile({
        name: formName || 'New Digest',
        description: formDescription || undefined,
        frequency: formFrequency,
        delivery_time: formTime,
        delivery_day_of_week: formFrequency === 'weekly' ? formDayOfWeek : null,
        delivery_day_of_month: formFrequency === 'monthly' ? formDayOfMonth : null,
        timezone: formTimezone,
        density: formDensity,
        scope,
      });
      if (data) {
        setSelectedProfileId(data.id);
        const full = await fetchDigestProfile(data.id);
        setEditingProfile(full);
      }
    }
    markSectionSaved('basics');
    await loadProfiles();
  };

  const handleSaveModules = async () => {
    setSectionSaveState(prev => ({ ...prev, modules: 'saving' }));
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
    markSectionSaved('modules');
  };

  const handleSaveChannels = async () => {
    setSectionSaveState(prev => ({ ...prev, channels: 'saving' }));
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
    markSectionSaved('channels');
  };

  // Delete profile
  const handleDelete = async () => {
    if (!editingProfile) return;
    await deleteDigestProfile(editingProfile.id);
    setView('list');
    await loadProfiles();
  };

  // Toggle profile active
  const handleToggleActive = async (profileId: string, currentActive: boolean) => {
    await updateDigestProfile(profileId, { is_active: !currentActive });
    await loadProfiles();
    if (editingProfile?.id === profileId) {
      setEditingProfile(prev => prev ? { ...prev, is_active: !currentActive } : null);
    }
  };

  // Module operations
  const handleAddTemplate = async (template: { template_id: string }) => {
    if (!editingProfile) return;
    const nextOrder = editingProfile.modules.length;
    const { data } = await addDigestModule({
      digest_profile_id: editingProfile.id,
      template_id: template.template_id,
      sort_order: nextOrder,
    });
    if (data) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
    setShowTemplateSelector(false);
  };

  const handleRemoveModule = async (moduleId: string) => {
    await deleteDigestModule(moduleId);
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleToggleModule = async (moduleId: string, currentActive: boolean) => {
    await updateDigestModule(moduleId, { is_active: !currentActive });
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleMoveModule = async (moduleId: string, direction: 'up' | 'down') => {
    if (!editingProfile) return;
    const modules = [...editingProfile.modules];
    const idx = modules.findIndex(m => m.id === moduleId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= modules.length) return;
    [modules[idx], modules[targetIdx]] = [modules[targetIdx], modules[idx]];
    const moduleIds = modules.map(m => m.id);
    await reorderDigestModules(editingProfile.id, moduleIds);
    const updated = await fetchDigestProfile(editingProfile.id);
    if (updated) setEditingProfile(updated);
  };

  const handleUpdateModuleContext = async (moduleId: string, userContext: string) => {
    await updateDigestModule(moduleId, { user_context: userContext || null });
  };

  const handleCreateCustomModule = async () => {
    if (!editingProfile || !customModuleName.trim()) return;
    setCustomModuleGenerating(true);
    try {
      const systemPrompt = await generateCustomModulePrompt(
        customModuleName,
        customModuleLookFor,
        customModulePrioritise,
        customModuleFormat,
      );
      const nextOrder = editingProfile.modules.length;
      await addDigestModule({
        digest_profile_id: editingProfile.id,
        template_id: null,
        custom_name: customModuleName,
        custom_system_prompt: systemPrompt,
        sort_order: nextOrder,
      });
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
      setShowCustomModuleWizard(false);
      setCustomModuleName('');
      setCustomModuleLookFor('');
      setCustomModulePrioritise('');
      setCustomModuleFormat('');
    } catch (err) {
      console.error('Failed to create custom module:', err);
    } finally {
      setCustomModuleGenerating(false);
    }
  };

  // Generate digest
  const handleGenerate = async (profileId: string) => {
    setGenerating(true);
    setGenerationProgress(null);
    setPreviewResult(null);
    setView('generating');
    try {
      const result = await generateDigest(profileId, (progress) => {
        setGenerationProgress(progress);
      });
      if (result) {
        setPreviewResult(result);
        setSelectedHistoryEntry(result);
        // Brief pause so user can see the complete state
        await new Promise(r => setTimeout(r, 800));
        setView('history_detail');
        await loadProfiles();
      } else {
        // Failed — stay on generation screen to show errors
      }
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setGenerating(false);
    }
  };

  // View history entry
  const handleViewHistory = async (entry: DigestHistoryEntry) => {
    setSelectedHistoryEntry(entry);
    setView('history_detail');
  };

  // Channel operations
  const handleAddEmailChannel = async () => {
    if (!editingProfile) return;
    const { data } = await addDigestChannel({
      digest_profile_id: editingProfile.id,
      channel_type: 'email',
      channel_config: { address: '' },
    });
    if (data) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleUpdateChannelConfig = async (channelId: string, config: Record<string, string>) => {
    await updateDigestChannel(channelId, { channel_config: config });
  };

  const handleToggleChannel = async (channelId: string, currentActive: boolean) => {
    await updateDigestChannel(channelId, { is_active: !currentActive });
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleAddTelegramChannel = async () => {
    if (!editingProfile || !telegramBotToken.trim() || !telegramChatId.trim()) return;
    await addDigestChannel({
      digest_profile_id: editingProfile.id,
      channel_type: 'telegram',
      channel_config: { bot_token: telegramBotToken, chat_id: telegramChatId },
    });
    const updated = await fetchDigestProfile(editingProfile.id);
    if (updated) setEditingProfile(updated);
    setShowTelegramSetup(false);
    setTelegramBotToken('');
    setTelegramChatId('');
  };

  const handleAddSlackChannel = async () => {
    if (!editingProfile || !slackWebhookUrl.trim()) return;
    await addDigestChannel({
      digest_profile_id: editingProfile.id,
      channel_type: 'slack',
      channel_config: { webhook_url: slackWebhookUrl },
    });
    const updated = await fetchDigestProfile(editingProfile.id);
    if (updated) setEditingProfile(updated);
    setShowSlackSetup(false);
    setSlackWebhookUrl('');
  };

  const handleDeleteChannel = async (channelId: string) => {
    await deleteDigestChannel(channelId);
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleUpdateChannelDensity = async (channelId: string, density: DensityLevel | null) => {
    await updateDigestChannel(channelId, { density_override: density });
    if (editingProfile) {
      const updated = await fetchDigestProfile(editingProfile.id);
      if (updated) setEditingProfile(updated);
    }
  };

  const handleUpdateChannelFormat = async (channelId: string, instructions: string) => {
    await updateDigestChannel(channelId, { format_instructions: instructions || null });
  };

  if (!isOpen) return null;

  const getModuleName = (mod: DigestModule) => {
    if (mod.template_id) {
      const template = getDigestTemplate(mod.template_id);
      return template?.name || mod.template_id;
    }
    return mod.custom_name || 'Custom Module';
  };

  const getModuleIcon = (mod: DigestModule) => {
    if (mod.template_id) {
      const template = getDigestTemplate(mod.template_id);
      if (template) return ICON_MAP[template.iconName] || Sparkles;
    }
    return Sparkles;
  };

  const getModuleAccent = (mod: DigestModule) => {
    if (mod.template_id) {
      const template = getDigestTemplate(mod.template_id);
      return template?.accentColor || 'slate';
    }
    return 'slate';
  };

  const toggleSection = useCallback((id: string) => {
    setExpandedSection(prev => prev === id ? null : id);
  }, []);

  // ─── List View ────────────────────────────────────────────
  const renderListView = () => (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Compass className="text-cyan-400" size={22} />
          Orientation Center
        </h1>
        <p className="text-slate-400 text-sm mt-1.5 max-w-lg">
          Configure intelligence briefings that synthesise your knowledge graph into actionable digests, delivered on your schedule.
        </p>
      </div>

      {/* Create New */}
      <button
        onClick={() => openEditor()}
        className="w-full p-4 border-2 border-dashed border-white/10 hover:border-cyan-500/30 rounded-lg text-slate-400 hover:text-cyan-400 transition-all flex items-center justify-center gap-2 group"
      >
        <Plus size={18} className="group-hover:scale-110 transition-transform" />
        <span className="text-sm font-semibold">Create New Digest</span>
      </button>

      {/* Profile Cards */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 text-sm">Loading digests...</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <Compass size={48} className="mx-auto text-slate-700 mb-4" />
          <p className="text-slate-500 text-sm">No digests configured yet.</p>
          <p className="text-slate-600 text-xs mt-1">Create your first digest to start receiving intelligence briefings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className="border border-white/10 rounded-lg p-4 bg-cyber-slate/20 hover:bg-cyber-slate/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-white">{profile.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {FREQUENCY_LABELS[profile.frequency]} at {profile.delivery_time?.slice(0, 5) || '08:00'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    profile.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-500"
                  )}>
                    {profile.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>
              {profile.description && (
                <p className="text-xs text-slate-400 mb-3 line-clamp-2">{profile.description}</p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[10px] text-slate-600">
                  <span>{DENSITY_LABELS[profile.density]}</span>
                  <span>{profile.timezone}</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleGenerate(profile.id)}
                    disabled={generating}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors disabled:opacity-50"
                    title="Preview / Generate Now"
                  >
                    <Play size={12} /> Preview
                  </button>
                  <button
                    onClick={() => openEditor(profile.id)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(profile.id, profile.is_active)}
                    className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    title={profile.is_active ? 'Pause' : 'Activate'}
                  >
                    {profile.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent History */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <History size={14} className="text-slate-500" />
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recent Deliveries</h2>
          </div>
          <div className="space-y-2">
            {history.slice(0, 5).map(entry => {
              const profile = profiles.find(p => p.id === entry.digest_profile_id);
              return (
                <div key={entry.id} onClick={() => handleViewHistory(entry)} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      "w-2 h-2 rounded-full",
                      entry.status === 'completed' ? "bg-emerald-500" :
                      entry.status === 'failed' ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <div>
                      <span className="text-xs font-medium text-slate-300">{profile?.name || 'Unknown'}</span>
                      <span className="text-xs text-slate-600 ml-2">
                        {new Date(entry.delivered_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <span className={clsx(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    entry.status === 'completed' ? "bg-emerald-500/10 text-emerald-400" :
                    entry.status === 'failed' ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                  )}>
                    {entry.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ─── Editor View ──────────────────────────────────────────
  const renderEditorView = () => (
    <div className="space-y-6">
      {/* Editor Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('list'); loadProfiles(); }}
            className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">
              {editingProfile ? `Edit: ${editingProfile.name}` : 'New Digest'}
            </h1>
            <p className="text-xs text-slate-500">Configure your intelligence briefing</p>
          </div>
        </div>
        {editingProfile && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-2 rounded-md hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
              title="Delete digest"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Basics Section */}
      <Section id="basics" title="Basics" icon={<Settings2 size={16} className="text-cyan-400" />} expandedSection={expandedSection} onToggle={toggleSection} saveState={sectionSaveState.basics} onSave={handleSaveBasics}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Name</label>
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="e.g., Morning Brief"
              className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Description</label>
            <input
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Quick daily situational awareness"
              className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Frequency</label>
              <div className="flex gap-1.5">
                {(['daily', 'weekly', 'monthly'] as ScheduleFrequency[]).map(freq => (
                  <button
                    key={freq}
                    onClick={() => setFormFrequency(freq)}
                    className={clsx(
                      "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                      formFrequency === freq
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                        : "bg-transparent text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300"
                    )}
                  >
                    {FREQUENCY_LABELS[freq]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Delivery Time</label>
              <input
                type="time"
                value={formTime}
                onChange={e => setFormTime(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>
          {formFrequency === 'weekly' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Day of Week</label>
              <select
                value={formDayOfWeek}
                onChange={e => setFormDayOfWeek(parseInt(e.target.value))}
                className="w-full px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => (
                  <option key={i} value={i}>{day}</option>
                ))}
              </select>
            </div>
          )}
          {formFrequency === 'monthly' && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Day of Month</label>
              <input
                type="number"
                min={1}
                max={28}
                value={formDayOfMonth}
                onChange={e => setFormDayOfMonth(parseInt(e.target.value))}
                className="w-full px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Timezone</label>
              <select
                value={formTimezone}
                onChange={e => setFormTimezone(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md bg-black/30 border border-white/10 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
              >
                {/* If current value isn't in common list, show it first */}
                {!COMMON_TIMEZONES.includes(formTimezone) && (
                  <option value={formTimezone}>{formTimezone}</option>
                )}
                {COMMON_TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{TIMEZONE_LABELS[tz] || tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Density</label>
              <div className="flex gap-1.5">
                {(['brief', 'standard', 'comprehensive'] as DensityLevel[]).map(d => (
                  <div key={d} className="flex-1 relative group">
                    <button
                      onClick={() => setFormDensity(d)}
                      className={clsx(
                        "w-full px-2 py-1.5 rounded-md text-xs font-medium transition-all border",
                        formDensity === d
                          ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                          : "bg-transparent text-slate-500 border-transparent hover:bg-white/5 hover:text-slate-300"
                      )}
                    >
                      {DENSITY_LABELS[d]}
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-slate-800 border border-white/10 text-[10px] text-slate-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                      {DENSITY_TOOLTIPS[d]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Scope</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormScopeMode('all_active')}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all border",
                  formScopeMode === 'all_active'
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-transparent text-slate-500 border-transparent hover:bg-white/5"
                )}
              >
                All Active Anchors
              </button>
              <button
                onClick={() => setFormScopeMode('selected')}
                className={clsx(
                  "flex-1 px-3 py-2 rounded-md text-xs font-medium transition-all border",
                  formScopeMode === 'selected'
                    ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
                    : "bg-transparent text-slate-500 border-transparent hover:bg-white/5"
                )}
              >
                Selected Anchors
              </button>
            </div>
          </div>

          {/* Anchor Checklist (when "Selected Anchors" scope is active) */}
          {formScopeMode === 'selected' && (
            <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <label className="text-[10px] text-amber-400 font-medium uppercase tracking-wider mb-2 block">
                Select Anchors ({selectedAnchorIds.size} selected)
              </label>
              {availableAnchors.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No anchors found. Create anchors in your graph first.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {availableAnchors.map(anchor => {
                    const isChecked = selectedAnchorIds.has(anchor.id);
                    return (
                      <label
                        key={anchor.id}
                        className={clsx(
                          "flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors",
                          isChecked ? "bg-amber-500/10 border border-amber-500/20" : "hover:bg-white/5 border border-transparent"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedAnchorIds(prev => {
                              const next = new Set(prev);
                              if (next.has(anchor.id)) next.delete(anchor.id);
                              else next.add(anchor.id);
                              return next;
                            });
                          }}
                          className="accent-amber-500 w-3.5 h-3.5"
                        />
                        <span className="text-xs text-white font-medium">{anchor.label}</span>
                        <span className="text-[10px] text-slate-600 ml-auto">{anchor.entity_type}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Modules Section */}
      <Section id="modules" title="Modules" icon={<Sparkles size={16} className="text-violet-400" />} expandedSection={expandedSection} onToggle={toggleSection} saveState={sectionSaveState.modules} onSave={editingProfile ? handleSaveModules : undefined}>
        {editingProfile ? (
          <div className="space-y-3">
            {editingProfile.modules.length === 0 ? (
              <div className="text-center py-6 text-slate-600 text-xs">
                No modules yet. Add templates to build your digest.
              </div>
            ) : (
              editingProfile.modules.map((mod, idx) => {
                const Icon = getModuleIcon(mod);
                const accent = getModuleAccent(mod);
                return (
                  <div key={mod.id} className={clsx(
                    "border rounded-lg overflow-hidden transition-all",
                    mod.is_active ? "border-white/10" : "border-white/5 opacity-50"
                  )}>
                    <div className="flex items-center gap-3 p-3 bg-white/[0.02]">
                      <GripVertical size={14} className="text-slate-700" />
                      <Icon size={16} className={`text-${accent}-400`} />
                      <span className="text-sm font-medium text-white flex-1">{getModuleName(mod)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveModule(mod.id, 'up')}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          onClick={() => handleMoveModule(mod.id, 'down')}
                          disabled={idx === editingProfile.modules.length - 1}
                          className="p-1 rounded hover:bg-white/10 text-slate-600 hover:text-white disabled:opacity-30 transition-colors"
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          onClick={() => handleToggleModule(mod.id, mod.is_active)}
                          className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
                        >
                          {mod.is_active ? <ToggleRight size={14} className="text-emerald-400" /> : <ToggleLeft size={14} />}
                        </button>
                        <button
                          onClick={() => handleRemoveModule(mod.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {mod.is_active && (
                      <div className="px-3 pb-3 pt-1">
                        <label className="text-[10px] text-slate-600 mb-1 block">Custom context (optional)</label>
                        <input
                          defaultValue={mod.user_context || ''}
                          onBlur={e => handleUpdateModuleContext(mod.id, e.target.value)}
                          placeholder="e.g., Focus especially on Tokai project..."
                          className="w-full px-2.5 py-1.5 rounded bg-black/20 border border-white/5 text-xs text-slate-300 placeholder:text-slate-700 focus:border-cyan-500/30 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {/* ── Inline Template Library (filtered by frequency) ── */}
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Template Library</span>
                <span className="text-[10px] text-slate-600 bg-white/5 px-1.5 py-0.5 rounded">{FREQUENCY_LABELS[formFrequency]}</span>
              </div>
              {(() => {
                const filteredTemplates = getDigestTemplatesByFrequency(formFrequency);
                const categories = [...new Set(filteredTemplates.map(t => t.category))];
                return (
                  <div className="space-y-3">
                    {categories.map(cat => {
                      const catTemplates = filteredTemplates.filter(t => t.category === cat);
                      return (
                        <div key={cat}>
                          <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 block">{TEMPLATE_CATEGORY_LABELS[cat] || cat}</span>
                          <div className="grid grid-cols-2 gap-2">
                            {catTemplates.map(template => {
                              const isAdded = editingProfile.modules.some(m => m.template_id === template.template_id);
                              const Icon = ICON_MAP[template.iconName] || Sparkles;
                              return (
                                <button
                                  key={template.template_id}
                                  onClick={async () => {
                                    if (isAdded) {
                                      const mod = editingProfile.modules.find(m => m.template_id === template.template_id);
                                      if (mod) await handleRemoveModule(mod.id);
                                    } else {
                                      await handleAddTemplate({ template_id: template.template_id });
                                    }
                                  }}
                                  className={clsx(
                                    "flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all",
                                    isAdded
                                      ? "border-emerald-500/30 bg-emerald-500/5"
                                      : "border-white/5 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                                  )}
                                >
                                  <Icon size={14} className={`text-${template.accentColor}-400 mt-0.5 shrink-0`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-medium text-white truncate">{template.name}</span>
                                      {isAdded && <ToggleRight size={12} className="text-emerald-400 shrink-0" />}
                                    </div>
                                    <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">{template.description}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* ── Add Custom Module ── */}
            <button
              onClick={() => setShowCustomModuleWizard(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border border-violet-500/20 transition-colors"
            >
              <Plus size={14} /> Create Custom Module
            </button>
          </div>
        ) : (
          <div className="text-center py-4 text-slate-600 text-xs">
            Save the digest profile first, then add modules.
          </div>
        )}
      </Section>

      {/* Channels Section */}
      <Section id="channels" title="Delivery Channels" icon={<Send size={16} className="text-emerald-400" />} expandedSection={expandedSection} onToggle={toggleSection} saveState={sectionSaveState.channels} onSave={editingProfile ? handleSaveChannels : undefined}>
        {editingProfile ? (
          <div className="space-y-3">
            {/* In-App (always on) */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/[0.02]">
              <Eye size={16} className="text-cyan-400" />
              <div className="flex-1">
                <span className="text-sm font-medium text-white">In-App</span>
                <p className="text-[10px] text-slate-600">Always available in Orientation Center</p>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Always On</span>
            </div>

            {/* Email Channel Card */}
            {editingProfile.channels.filter(c => c.channel_type === 'email').map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                icon={<Mail size={16} className="text-blue-400" />}
                label="Email"
                onToggle={handleToggleChannel}
                onUpdateDensity={handleUpdateChannelDensity}
                onUpdateFormat={handleUpdateChannelFormat}
              >
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Email Address</label>
                  <input
                    defaultValue={ch.channel_config?.address || ''}
                    onBlur={e => handleUpdateChannelConfig(ch.id, { address: e.target.value })}
                    placeholder="your@email.com"
                    className="w-full px-2.5 py-1.5 rounded bg-black/20 border border-white/5 text-xs text-slate-300 placeholder:text-slate-700 focus:border-cyan-500/30 focus:outline-none"
                  />
                </div>
              </ChannelCard>
            ))}

            {/* Add Email button */}
            {editingProfile.channels.filter(c => c.channel_type === 'email').length === 0 && (
              <button
                onClick={handleAddEmailChannel}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
              >
                <Mail size={14} /> Add Email Channel
              </button>
            )}

            {/* Telegram Channel Card */}
            {editingProfile.channels.filter(c => c.channel_type === 'telegram').map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                icon={<Send size={16} className="text-blue-400" />}
                label="Telegram"
                onToggle={handleToggleChannel}
                onDelete={handleDeleteChannel}
                onUpdateDensity={handleUpdateChannelDensity}
                onUpdateFormat={handleUpdateChannelFormat}
              >
                <p className="text-[10px] text-slate-500">Chat ID: <span className="font-mono text-slate-400">{ch.channel_config?.chat_id}</span></p>
              </ChannelCard>
            ))}

            {/* Slack Channel Card */}
            {editingProfile.channels.filter(c => c.channel_type === 'slack').map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                icon={<Send size={16} className="text-purple-400" />}
                label="Slack"
                onToggle={handleToggleChannel}
                onDelete={handleDeleteChannel}
                onUpdateDensity={handleUpdateChannelDensity}
                onUpdateFormat={handleUpdateChannelFormat}
              >
                <p className="text-[10px] text-slate-500">Webhook configured</p>
              </ChannelCard>
            ))}

            {/* Add Telegram / Slack buttons */}
            <div className="flex gap-2 pt-1">
              {editingProfile.channels.filter(c => c.channel_type === 'telegram').length === 0 && (
                <button
                  onClick={() => setShowTelegramSetup(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
                >
                  <Send size={14} /> Add Telegram
                </button>
              )}
              {editingProfile.channels.filter(c => c.channel_type === 'slack').length === 0 && (
                <button
                  onClick={() => setShowSlackSetup(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/10"
                >
                  <Send size={14} /> Add Slack
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-slate-600 text-xs">
            Save the digest profile first, then configure channels.
          </div>
        )}
      </Section>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <button
          onClick={() => { setView('list'); loadProfiles(); }}
          className="px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {editingProfile && (
            <button
              onClick={() => handleGenerate(editingProfile.id)}
              disabled={generating || editingProfile.modules.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 transition-all disabled:opacity-30 border border-violet-500/30"
            >
              <Play size={14} />
              {generating ? 'Generating...' : 'Preview Digest'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !formName.trim()}
            className={clsx(
              "flex items-center gap-2 px-5 py-2 rounded-md text-xs font-bold transition-all",
              saving || !formName.trim()
                ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                : "bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_15px_rgba(6,182,212,0.3)]"
            )}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Template Selector Modal (kept for backward compat) */}
      {showTemplateSelector && (
        <DigestTemplateSelector
          onSelect={handleAddTemplate}
          onClose={() => setShowTemplateSelector(false)}
          existingTemplateIds={editingProfile?.modules.map(m => m.template_id).filter(Boolean) as string[] || []}
        />
      )}

      {/* Custom Module Wizard Modal */}
      {showCustomModuleWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-violet-400" />
                <h2 className="text-sm font-bold text-white">Create Custom Module</h2>
              </div>
              <button onClick={() => setShowCustomModuleWizard(false)} className="p-1 hover:bg-white/10 rounded-md text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Describe what you want this module to analyse. AI will generate the system prompt for the sub-agent.</p>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Module Name</label>
              <input
                value={customModuleName}
                onChange={e => setCustomModuleName(e.target.value)}
                placeholder="e.g., Competitor Tracker"
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">What should this module look for?</label>
              <textarea
                value={customModuleLookFor}
                onChange={e => setCustomModuleLookFor(e.target.value)}
                placeholder="e.g., Track all mentions of competitor companies, their products, strategies and any threats or opportunities..."
                rows={3}
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">How should it prioritise findings?</label>
              <textarea
                value={customModulePrioritise}
                onChange={e => setCustomModulePrioritise(e.target.value)}
                placeholder="e.g., Prioritise by relevance to my active projects, then by recency..."
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Preferred output format?</label>
              <textarea
                value={customModuleFormat}
                onChange={e => setCustomModuleFormat(e.target.value)}
                placeholder="e.g., Ranked bullet list with rationale for each item..."
                rows={2}
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCustomModuleWizard(false)}
                className="px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCustomModule}
                disabled={!customModuleName.trim() || customModuleGenerating}
                className={clsx(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-bold transition-all",
                  !customModuleName.trim() || customModuleGenerating
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-violet-500 hover:bg-violet-400 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                )}
              >
                {customModuleGenerating && <Loader2 size={14} className="animate-spin" />}
                {customModuleGenerating ? 'Generating...' : 'Create Module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telegram Setup Modal */}
      {showTelegramSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send size={16} className="text-blue-400" />
                <h2 className="text-sm font-bold text-white">Set Up Telegram</h2>
              </div>
              <button onClick={() => setShowTelegramSetup(false)} className="p-1 hover:bg-white/10 rounded-md text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[11px] text-slate-400 space-y-2">
              <p className="font-medium text-blue-400">How to set up:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Message <span className="text-white font-mono">@BotFather</span> on Telegram</li>
                <li>Create a new bot with <span className="text-white font-mono">/newbot</span></li>
                <li>Copy the bot token provided</li>
                <li>Start a chat with your bot, then visit <span className="text-white font-mono">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> to get your chat ID</li>
              </ol>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bot Token</label>
              <input
                value={telegramBotToken}
                onChange={e => setTelegramBotToken(e.target.value)}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white font-mono placeholder:text-slate-700 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Chat ID</label>
              <input
                value={telegramChatId}
                onChange={e => setTelegramChatId(e.target.value)}
                placeholder="e.g., 123456789"
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white font-mono placeholder:text-slate-700 focus:border-blue-500/50 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowTelegramSetup(false)} className="px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddTelegramChannel}
                disabled={!telegramBotToken.trim() || !telegramChatId.trim()}
                className={clsx(
                  "px-4 py-2 rounded-md text-xs font-bold transition-all",
                  !telegramBotToken.trim() || !telegramChatId.trim()
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-400 text-white"
                )}
              >
                Connect Telegram
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slack Setup Modal */}
      {showSlackSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send size={16} className="text-purple-400" />
                <h2 className="text-sm font-bold text-white">Set Up Slack</h2>
              </div>
              <button onClick={() => setShowSlackSetup(false)} className="p-1 hover:bg-white/10 rounded-md text-slate-500 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-[11px] text-slate-400 space-y-2">
              <p className="font-medium text-purple-400">How to set up:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Go to <span className="text-white font-mono">api.slack.com/apps</span></li>
                <li>Create a new app or select existing one</li>
                <li>Enable <span className="text-white">Incoming Webhooks</span></li>
                <li>Add a webhook to your desired channel and copy the URL</li>
              </ol>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Webhook URL</label>
              <input
                value={slackWebhookUrl}
                onChange={e => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 rounded-md bg-black/30 border border-white/10 text-sm text-white font-mono placeholder:text-slate-700 focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowSlackSetup(false)} className="px-4 py-2 rounded-md text-xs font-medium text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddSlackChannel}
                disabled={!slackWebhookUrl.trim()}
                className={clsx(
                  "px-4 py-2 rounded-md text-xs font-bold transition-all",
                  !slackWebhookUrl.trim()
                    ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                    : "bg-purple-500 hover:bg-purple-400 text-white"
                )}
              >
                Connect Slack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─── Generating View (Smart Loading Screen) ─────────────

  const PHASE_ICONS: Record<string, React.ComponentType<any>> = {
    init: Settings2,
    gathering: Database,
    sub_agent: Brain,
    meta_agent: Zap,
    saving: CheckCircle2,
    complete: CheckCircle2,
    error: XCircle,
  };

  const renderGeneratingView = () => {
    const progress = generationProgress;
    const elapsed = progress ? progress.elapsedMs : 0;
    const formatTime = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

    // Count completed / total steps
    const allSteps = progress?.steps || [];
    const completedSteps = allSteps.filter(s => s.status === 'complete').length;
    const totalSteps = allSteps.length;
    const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center pt-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 mb-4">
            {progress?.phase === 'complete' ? (
              <CheckCircle2 size={28} className="text-emerald-400" />
            ) : progress?.phase === 'error' ? (
              <XCircle size={28} className="text-red-400" />
            ) : (
              <Cpu size={28} className="text-cyan-400 animate-pulse" />
            )}
          </div>
          <h1 className="text-lg font-bold text-white">
            {progress?.phase === 'complete' ? 'Digest Ready' :
             progress?.phase === 'error' ? 'Generation Failed' :
             'Generating Intelligence Briefing'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {progress?.overallStatus || 'Preparing...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>{completedSteps} of {totalSteps} steps complete</span>
            <span>{formatTime(elapsed)}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={clsx(
                "h-full rounded-full transition-all duration-500 ease-out",
                progress?.phase === 'complete' ? "bg-emerald-500" :
                progress?.phase === 'error' ? "bg-red-500" :
                "bg-gradient-to-r from-cyan-500 to-violet-500"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Graph Stats */}
        {progress?.graphStats && (
          <div className="flex items-center justify-center gap-6 py-3 px-4 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-2">
              <Database size={12} className="text-cyan-500" />
              <span className="text-xs text-slate-400">
                <span className="text-white font-semibold">{progress.graphStats.nodes}</span> nodes
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <BarChart3 size={12} className="text-violet-500" />
              <span className="text-xs text-slate-400">
                <span className="text-white font-semibold">{progress.graphStats.edges}</span> edges
              </span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Compass size={12} className="text-amber-500" />
              <span className="text-xs text-slate-400">
                <span className="text-white font-semibold">{progress.graphStats.anchors}</span> anchors
              </span>
            </div>
          </div>
        )}

        {/* Step-by-Step Pipeline */}
        <div className="space-y-1">
          {allSteps.map((step, idx) => {
            const StepIcon = step.phase === 'sub_agent'
              ? (step.module ? (ICON_MAP[getDigestTemplate(
                  // Try to find the matching template icon
                  allSteps.filter(s => s.phase === 'sub_agent').findIndex(s => s === step) < (progress?.steps.filter(s => s.phase === 'sub_agent').length || 0)
                    ? '' : ''
                )?.iconName || ''] || Brain) : Brain)
              : (PHASE_ICONS[step.phase] || Sparkles);

            const duration = step.startedAt && step.completedAt
              ? formatTime(step.completedAt - step.startedAt)
              : null;

            return (
              <div
                key={idx}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                  step.status === 'running' && "bg-cyan-500/5 border border-cyan-500/20",
                  step.status === 'complete' && "bg-white/[0.01] border border-transparent",
                  step.status === 'error' && "bg-red-500/5 border border-red-500/20",
                  step.status === 'pending' && "opacity-40 border border-transparent",
                )}
              >
                {/* Status Icon */}
                <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full">
                  {step.status === 'running' ? (
                    <Loader2 size={16} className="text-cyan-400 animate-spin" />
                  ) : step.status === 'complete' ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : step.status === 'error' ? (
                    <XCircle size={16} className="text-red-400" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </div>

                {/* Step Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-xs font-medium",
                      step.status === 'running' ? "text-cyan-400" :
                      step.status === 'complete' ? "text-slate-300" :
                      step.status === 'error' ? "text-red-400" :
                      "text-slate-600"
                    )}>
                      {step.module || (step.phase === 'init' ? 'Initialising' : step.phase === 'gathering' ? 'Scanning Graph' : step.phase)}
                    </span>
                    {step.phase === 'sub_agent' && (
                      <span className="text-[10px] text-slate-700 bg-white/5 px-1 rounded">agent</span>
                    )}
                    {step.phase === 'meta_agent' && (
                      <span className="text-[10px] text-violet-500/60 bg-violet-500/10 px-1 rounded">synthesis</span>
                    )}
                  </div>
                  {step.detail && (
                    <p className={clsx(
                      "text-[11px] mt-0.5 truncate",
                      step.status === 'error' ? "text-red-400/60" : "text-slate-600"
                    )}>
                      {step.detail}
                    </p>
                  )}
                </div>

                {/* Duration */}
                {duration && (
                  <span className="text-[10px] text-slate-700 shrink-0 tabular-nums">
                    {duration}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Fallback: if no steps yet, show pulsing placeholder */}
        {allSteps.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500">Preparing generation pipeline...</p>
          </div>
        )}

        {/* Action buttons at bottom */}
        {(progress?.phase === 'complete' || progress?.phase === 'error') && (
          <div className="flex items-center justify-center gap-3 pt-4">
            {progress.phase === 'complete' && previewResult && (
              <button
                onClick={() => {
                  setSelectedHistoryEntry(previewResult);
                  setView('history_detail');
                }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
              >
                <Eye size={14} />
                View Digest
              </button>
            )}
            <button
              onClick={() => { setView('list'); setGenerationProgress(null); }}
              className="px-4 py-2.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              Back to Digests
            </button>
          </div>
        )}
      </div>
    );
  };

  // ─── Main Render ──────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full">
        {view === 'list' && renderListView()}
        {view === 'editor' && renderEditorView()}
        {view === 'generating' && renderGeneratingView()}
        {view === 'history_detail' && selectedHistoryEntry && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setView('list'); setSelectedHistoryEntry(null); }}
                className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div>
                <h1 className="text-lg font-bold text-white">Intelligence Briefing</h1>
                <p className="text-xs text-slate-500">
                  Generated {new Date(selectedHistoryEntry.delivered_at).toLocaleString()}
                </p>
              </div>
            </div>
            <DigestViewer entry={selectedHistoryEntry} channels={editingProfile?.channels} />
          </div>
        )}
      </div>
    </div>
  );
};
