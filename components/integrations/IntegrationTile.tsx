import React from 'react';
import {
  CheckCircle, ChevronRight, Clock,
  Radio, Mic, Flame, FileText, MessageSquare, BookOpen, Zap, Terminal
} from 'lucide-react';
import clsx from 'clsx';
import type { IntegrationDefinition } from '../../config/integrations';
import type { UserIntegration } from '../../types/integrations';

const ICON_MAP: Record<string, React.ElementType> = {
  Radio, Mic, Flame, FileText, MessageSquare, BookOpen, Zap, Terminal,
};

const ACCENT_COLORS: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  indigo:  { border: 'border-indigo-500/40',  bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  glow: 'shadow-[0_0_12px_rgba(99,102,241,0.15)]' },
  violet:  { border: 'border-violet-500/40',  bg: 'bg-violet-500/10',  text: 'text-violet-400',  glow: 'shadow-[0_0_12px_rgba(139,92,246,0.15)]' },
  red:     { border: 'border-red-500/40',     bg: 'bg-red-500/10',     text: 'text-red-400',     glow: 'shadow-[0_0_12px_rgba(239,68,68,0.15)]' },
  slate:   { border: 'border-slate-400/40',   bg: 'bg-slate-500/10',   text: 'text-slate-300',   glow: 'shadow-[0_0_12px_rgba(148,163,184,0.1)]' },
  pink:    { border: 'border-pink-500/40',    bg: 'bg-pink-500/10',    text: 'text-pink-400',    glow: 'shadow-[0_0_12px_rgba(236,72,153,0.15)]' },
  amber:   { border: 'border-amber-500/40',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   glow: 'shadow-[0_0_12px_rgba(245,158,11,0.15)]' },
  orange:  { border: 'border-orange-500/40',  bg: 'bg-orange-500/10',  text: 'text-orange-400',  glow: 'shadow-[0_0_12px_rgba(249,115,22,0.15)]' },
  emerald: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', glow: 'shadow-[0_0_12px_rgba(16,185,129,0.15)]' },
};

interface IntegrationTileProps {
  integration: IntegrationDefinition;
  userIntegration?: UserIntegration;
  onClick: () => void;
}

export default function IntegrationTile({ integration, userIntegration, onClick }: IntegrationTileProps) {
  const isConnected = userIntegration?.status === 'active';
  const isPaused = userIntegration?.status === 'paused';
  const isComingSoon = integration.status === 'coming_soon';

  const Icon = ICON_MAP[integration.iconName] || Zap;
  const colors = ACCENT_COLORS[integration.accentColor] || ACCENT_COLORS.indigo;

  return (
    <button
      onClick={onClick}
      disabled={isComingSoon}
      className={clsx(
        'relative w-full text-left p-4 rounded-xl border transition-all duration-200',
        'bg-slate-900/80 backdrop-blur-sm',
        isConnected && `${colors.border} ${colors.glow}`,
        isPaused && 'border-amber-500/30',
        !isConnected && !isPaused && !isComingSoon && 'border-white/10 hover:border-white/20 hover:bg-slate-800/80 cursor-pointer',
        isComingSoon && 'border-white/5 opacity-50 cursor-not-allowed',
      )}
    >
      {/* Status badges */}
      {isComingSoon && (
        <span className="absolute top-2 right-2 text-[9px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-800 px-1.5 py-0.5 rounded">
          Soon
        </span>
      )}
      {isConnected && (
        <span className="absolute top-2 right-2">
          <CheckCircle size={14} className="text-emerald-400" />
        </span>
      )}
      {isPaused && (
        <span className="absolute top-2 right-2">
          <Clock size={14} className="text-amber-400" />
        </span>
      )}

      {/* Icon */}
      <div className={clsx('w-9 h-9 rounded-lg mb-3 flex items-center justify-center', colors.bg)}>
        <Icon size={18} className={colors.text} />
      </div>

      {/* Name + description */}
      <p className="text-sm font-medium text-white leading-tight">{integration.name}</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-tight">{integration.description}</p>

      {/* Status line */}
      <div className="mt-3 flex items-center gap-1">
        {isConnected ? (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-medium">
              {userIntegration!.total_items_ingested} ingested
            </span>
          </>
        ) : isPaused ? (
          <span className="text-[10px] text-amber-400 font-medium">Paused</span>
        ) : !isComingSoon ? (
          <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
            Set up <ChevronRight size={10} />
          </span>
        ) : null}
      </div>
    </button>
  );
}
