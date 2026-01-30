import React from 'react';
import { Workflow, Plus, Zap, Network, Eye } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface AnchorsWorkflowStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const AnchorsWorkflowStep: React.FC<AnchorsWorkflowStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={Workflow}
      iconColor="text-amber-400"
      title="Creating & Using Anchors"
      subtitle="The Practical Workflow"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      {/* How to Create */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Plus size={18} className="text-amber-400" />
          <h3 className="text-white font-semibold">Creating an Anchor</h3>
        </div>
        <p className="text-slate-400 text-sm mb-3">
          In the Ingestion Hub, select <span className="text-amber-400">"Strategic Anchor"</span> from
          the Standard Input options. Give it a name, type, and description.
        </p>
        <div className="bg-slate-900/50 rounded-lg p-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400">Name:</span>
            <span className="text-white">Q1 Product Launch</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-amber-400">Type:</span>
            <span className="text-white">Project</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400">Description:</span>
            <span className="text-white">Launch the new dashboard by March...</span>
          </div>
        </div>
      </div>

      {/* What Happens Automatically */}
      <div className="bg-slate-800/50 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-cyan-400" />
          <h3 className="text-white font-semibold">What Happens Automatically</h3>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
            <span className="text-slate-400">
              <span className="text-white">Neural pathway generated</span> — embedding created for smart matching
            </span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
            <span className="text-slate-400">
              <span className="text-white">Existing knowledge scanned</span> — finds relevant connections
            </span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
            <span className="text-slate-400">
              <span className="text-white">Raw sources mined</span> — extracts anchor-related content
            </span>
          </div>
        </div>
      </div>

      {/* How to Use */}
      <div className="bg-slate-800/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={18} className="text-emerald-400" />
          <h3 className="text-white font-semibold">Using Anchors for Retrieval</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <kbd className="px-2 py-1 bg-slate-700 rounded text-amber-400 font-mono text-xs">6</kbd>
            <span className="text-slate-400 text-sm">
              Press to activate <span className="text-amber-400">AnchorFocus</span> lens
            </span>
          </div>
          <p className="text-slate-500 text-xs pl-9">
            Deep-dive into a specific anchor and its immediate connections.
            New injections automatically check for anchor relevance.
          </p>
        </div>
      </div>
    </OnboardingStep>
  );
};
