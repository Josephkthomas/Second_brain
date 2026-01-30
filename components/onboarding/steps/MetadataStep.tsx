import React from 'react';
import { Tag, MessageSquare, Hash } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface MetadataStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const MetadataStep: React.FC<MetadataStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={Tag}
      title="Context & Metadata"
      subtitle="Guide the AI & Organize Knowledge"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      {/* Custom Instructions */}
      <div className="bg-slate-800/50 rounded-xl p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={18} className="text-amber-400" />
          <h3 className="text-white font-semibold">Custom Extraction Instructions</h3>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Tell the AI what to focus on when extracting knowledge:
        </p>
        <div className="space-y-2">
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 text-sm text-slate-300 italic">
            "Extract all action items and deadlines"
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 text-sm text-slate-300 italic">
            "Focus on technical specifications"
          </div>
          <div className="bg-slate-900/50 rounded-lg px-3 py-2 text-sm text-slate-300 italic">
            "Ignore pleasantries, only capture decisions"
          </div>
        </div>
      </div>

      {/* Tagging System */}
      <div className="bg-slate-800/50 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Hash size={18} className="text-emerald-400" />
          <h3 className="text-white font-semibold">Tagging System</h3>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          Organize your knowledge with custom tags:
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-slate-500 text-xs mb-2">Global Tags (applied to all entities)</p>
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                #Q4-Planning
              </span>
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                #Product-Launch
              </span>
              <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs border border-dashed border-slate-600">
                + Add Tag
              </span>
            </div>
          </div>

          <div>
            <p className="text-slate-500 text-xs mb-2">Entity Tags (per-item customization)</p>
            <div className="flex gap-2 flex-wrap">
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                #high-priority
              </span>
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs">
                #follow-up
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-slate-500 text-xs text-center mt-4">
        Tags help you filter and organize knowledge across your entire graph.
      </p>
    </OnboardingStep>
  );
};
