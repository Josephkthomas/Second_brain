import React from 'react';
import { BrainCircuit, CheckCircle2 } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
  onJumpToStep: (step: number) => void;
}

const topics = [
  { label: 'The Ingestion Hub', step: 1 },
  { label: 'Data Types You Can Add', step: 2 },
  { label: 'Context & Metadata', step: 3 },
  { label: 'The AI Pipeline', step: 4 },
  { label: 'Understanding Anchors', step: 5 },
];

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext, onSkip, onJumpToStep }) => {
  return (
    <OnboardingStep
      icon={BrainCircuit}
      title="Welcome to Synapse"
      subtitle="Your Personal Knowledge Graph"
      onNext={onNext}
      onSkip={onSkip}
      nextLabel="Start Tour"
      showPrevious={false}
      showSkip={true}
    >
      <div className="text-center">
        <p className="text-slate-300 mb-6">
          Synapse transforms your notes, research, and documents into an interconnected
          web of knowledge. Every piece of information you add becomes part of a living
          network that grows smarter over time.
        </p>

        <div className="bg-slate-800/50 rounded-xl p-6 text-left">
          <p className="text-slate-400 text-sm mb-4">This tour will cover:</p>
          <div className="space-y-3">
            {topics.map((topic, i) => (
              <button
                key={i}
                onClick={() => onJumpToStep(topic.step)}
                className="flex items-center gap-3 w-full text-left group"
              >
                <CheckCircle2 size={18} className="text-cyan-400/50 group-hover:text-cyan-400 transition-colors" />
                <span className="text-slate-300 group-hover:text-white transition-colors">
                  {topic.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </OnboardingStep>
  );
};
