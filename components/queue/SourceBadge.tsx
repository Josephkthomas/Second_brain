// SourceBadge — 120×80px visual identifier for each source type
// Shows YouTube thumbnail when available, otherwise a color-coded icon panel

import React from 'react';
import {
  Youtube, Users, FileText, Globe, StickyNote, Zap,
  Mic, Mail, MessageSquare, Newspaper,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SourceCategory } from '../../types/queue';
import clsx from 'clsx';

interface SourceBadgeProps {
  sourceType: SourceCategory;
  thumbnailUrl?: string | null;
  className?: string;
}

const SOURCE_CONFIG: Record<SourceCategory, {
  icon: LucideIcon;
  bg: string;
  iconColor: string;
  border: string;
  label: string;
}> = {
  YouTube:  { icon: Youtube,        bg: 'bg-red-900/20',    iconColor: 'text-red-400',    border: 'border-red-900/50',    label: 'YouTube' },
  Meeting:  { icon: Mic,            bg: 'bg-purple-900/20', iconColor: 'text-purple-400', border: 'border-purple-900/50', label: 'Meeting' },
  Document: { icon: FileText,       bg: 'bg-blue-900/20',   iconColor: 'text-blue-400',   border: 'border-blue-900/50',   label: 'Document' },
  Research: { icon: Globe,          bg: 'bg-cyan-900/20',   iconColor: 'text-cyan-400',   border: 'border-cyan-900/50',   label: 'Research' },
  Note:     { icon: StickyNote,     bg: 'bg-emerald-900/20',iconColor: 'text-emerald-400',border: 'border-emerald-900/50',label: 'Note' },
  API:      { icon: Zap,            bg: 'bg-violet-900/20', iconColor: 'text-violet-400', border: 'border-violet-900/50', label: 'API' },
  Podcast:  { icon: Mic,            bg: 'bg-orange-900/20', iconColor: 'text-orange-400', border: 'border-orange-900/50', label: 'Podcast' },
  Email:    { icon: Mail,           bg: 'bg-amber-900/20',  iconColor: 'text-amber-400',  border: 'border-amber-900/50',  label: 'Email' },
  Chat:     { icon: MessageSquare,  bg: 'bg-teal-900/20',   iconColor: 'text-teal-400',   border: 'border-teal-900/50',   label: 'Chat' },
  Article:  { icon: Newspaper,      bg: 'bg-indigo-900/20', iconColor: 'text-indigo-400', border: 'border-indigo-900/50', label: 'Article' },
};

export default function SourceBadge({ sourceType, thumbnailUrl, className }: SourceBadgeProps) {
  // YouTube with a thumbnail — show the image
  if (sourceType === 'YouTube' && thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className={clsx('w-[120px] h-[80px] rounded-lg object-cover bg-slate-800 flex-shrink-0', className)}
      />
    );
  }

  // All others or YouTube without thumbnail — show icon panel
  const config = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.Note;
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        'w-[120px] h-[80px] rounded-lg flex flex-col items-center justify-center gap-1.5 border flex-shrink-0',
        config.bg,
        config.border,
        className
      )}
    >
      <Icon size={28} className={config.iconColor} />
      <span className={clsx('text-[10px] font-medium', config.iconColor)}>{config.label}</span>
    </div>
  );
}

// Also export the config for use in filter pills
export { SOURCE_CONFIG };
