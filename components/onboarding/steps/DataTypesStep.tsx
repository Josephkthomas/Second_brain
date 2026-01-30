import React from 'react';
import { LayoutGrid, StickyNote, Youtube, Users, FileText, Globe } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface DataTypesStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

const dataTypes = [
  {
    icon: StickyNote,
    label: 'Personal Note',
    color: 'emerald',
    description: 'Quick ideas, reflections, and learnings',
  },
  {
    icon: Youtube,
    label: 'YouTube Video',
    color: 'red',
    description: 'Paste video URLs for transcript analysis',
  },
  {
    icon: Users,
    label: 'Meeting Transcript',
    color: 'purple',
    description: 'Import from Zoom, Teams, or Google Meet',
  },
  {
    icon: FileText,
    label: 'Document Upload',
    color: 'cyan',
    description: 'PDFs and images with OCR extraction',
  },
  {
    icon: Globe,
    label: 'Deep Research',
    color: 'blue',
    description: 'Auto-search web and extract knowledge',
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400' },
  red: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400' },
  purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', icon: 'text-purple-400' },
  cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: 'text-cyan-400' },
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400' },
};

export const DataTypesStep: React.FC<DataTypesStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={LayoutGrid}
      title="Knowledge Types"
      subtitle="What You Can Add"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      <p className="text-slate-300 text-center mb-6">
        Each input type is optimized for AI extraction tailored to that format:
      </p>

      <div className="grid grid-cols-2 gap-3">
        {dataTypes.map((type, i) => {
          const colors = colorMap[type.color];
          const Icon = type.icon;

          return (
            <div
              key={i}
              className={`${colors.bg} ${colors.border} border rounded-xl p-4 ${i === 4 ? 'col-span-2' : ''}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon size={20} className={colors.icon} />
                <span className="text-white font-medium text-sm">{type.label}</span>
              </div>
              <p className="text-slate-400 text-xs">{type.description}</p>
            </div>
          );
        })}
      </div>

      <p className="text-slate-500 text-xs text-center mt-4">
        The AI understands the structure of each format and extracts relevant entities accordingly.
      </p>
    </OnboardingStep>
  );
};
