import React from 'react';
import { Cpu, ArrowRight, CheckCircle2, GitMerge, Search } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface PipelineStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const PipelineStep: React.FC<PipelineStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={Cpu}
      title="AI Extraction Pipeline"
      subtitle="How Your Knowledge Gets Processed"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      <p className="text-slate-300 text-center mb-6">
        A multi-agent AI system processes your input and builds your knowledge graph:
      </p>

      {/* Pipeline Visualization */}
      <div className="flex items-center justify-between mb-6">
        {/* Step 1: Extract */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-2">
            <Search size={24} className="text-cyan-400" />
          </div>
          <span className="text-white text-sm font-medium">Extract</span>
          <span className="text-slate-500 text-xs">Agent 1</span>
        </div>

        <ArrowRight size={20} className="text-slate-600" />

        {/* Step 2: Weave */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center mb-2">
            <GitMerge size={24} className="text-purple-400" />
          </div>
          <span className="text-white text-sm font-medium">Weave</span>
          <span className="text-slate-500 text-xs">Agent 2</span>
        </div>

        <ArrowRight size={20} className="text-slate-600" />

        {/* Step 3: Review */}
        <div className="flex flex-col items-center">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mb-2">
            <CheckCircle2 size={24} className="text-emerald-400" />
          </div>
          <span className="text-white text-sm font-medium">Review</span>
          <span className="text-slate-500 text-xs">You</span>
        </div>
      </div>

      {/* Pipeline Descriptions */}
      <div className="space-y-3">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-slate-300 text-sm font-medium">Extract</span>
          </div>
          <p className="text-slate-500 text-xs pl-4">
            Identifies entities (people, topics, decisions) and relationships from your content.
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-purple-400" />
            <span className="text-slate-300 text-sm font-medium">Weave</span>
          </div>
          <p className="text-slate-500 text-xs pl-4">
            Finds cross-connections between new entities and your existing knowledge graph.
          </p>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 text-sm font-medium">Review</span>
          </div>
          <p className="text-slate-500 text-xs pl-4">
            You select which entities to inject. Nothing enters your graph without approval.
          </p>
        </div>
      </div>
    </OnboardingStep>
  );
};
