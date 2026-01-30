import React from 'react';
import { Anchor, Rocket, Trophy, BookOpen } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface AnchorsConceptStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

const anchorTypes = [
  {
    icon: Rocket,
    emoji: '🚀',
    label: 'Project',
    color: 'blue',
    description: 'Track all knowledge related to a specific initiative or workstream',
  },
  {
    icon: Trophy,
    emoji: '🏆',
    label: 'Goal',
    color: 'amber',
    description: 'Organize insights toward an outcome you\'re working to achieve',
  },
  {
    icon: BookOpen,
    emoji: '📚',
    label: 'Topic',
    color: 'emerald',
    description: 'Create a hub for a subject area or domain of interest',
  },
];

const colorMap: Record<string, { bg: string; border: string; icon: string }> = {
  blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400' },
  amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400' },
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400' },
};

export const AnchorsConceptStep: React.FC<AnchorsConceptStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={Anchor}
      iconColor="text-amber-400"
      title="Understanding Anchors"
      subtitle="The Backbone of Your Knowledge Graph"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      <p className="text-slate-300 text-center mb-6">
        Anchors are high-priority nodes that organize your knowledge into meaningful clusters.
        They're the strategic focal points of your graph.
      </p>

      <div className="space-y-3 mb-6">
        {anchorTypes.map((type, i) => {
          const colors = colorMap[type.color];
          const Icon = type.icon;

          return (
            <div
              key={i}
              className={`${colors.bg} ${colors.border} border rounded-xl p-4`}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{type.emoji}</span>
                <span className="text-white font-semibold">{type.label}</span>
              </div>
              <p className="text-slate-400 text-sm pl-10">{type.description}</p>
            </div>
          );
        })}
      </div>

      {/* Visual Distinction */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <h4 className="text-white text-sm font-medium mb-3">Visual Distinction</h4>
        <div className="flex items-center justify-center gap-6">
          {/* Regular Node */}
          <div className="flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-slate-600 border-2 border-slate-500" />
            <span className="text-slate-500 text-xs mt-2">Regular Node</span>
          </div>

          <span className="text-slate-600">vs</span>

          {/* Anchor Node */}
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 rounded-full bg-amber-500/30 border-3 border-amber-400 flex items-center justify-center">
              <span className="text-lg">⚓</span>
            </div>
            <span className="text-amber-400 text-xs mt-2">Anchor (4x larger)</span>
          </div>
        </div>
      </div>
    </OnboardingStep>
  );
};
