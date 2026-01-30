import React from 'react';
import { Sparkles, Keyboard } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface ReadyStepProps {
  onComplete: (openInjector: boolean) => void;
  onPrevious: () => void;
}

const shortcuts = [
  { key: 'I', action: 'Open Ingestion Hub' },
  { key: '/', action: 'Open AI Chat' },
  { key: '[', action: 'Open Data Vault' },
  { key: 'Space', action: 'Freeze Physics' },
  { key: '1-6', action: 'Switch View Lenses' },
];

export const ReadyStep: React.FC<ReadyStepProps> = ({ onComplete, onPrevious }) => {
  return (
    <OnboardingStep
      icon={Sparkles}
      iconColor="text-emerald-400"
      title="You're Ready!"
      subtitle="Start Building Your Knowledge Graph"
      onPrevious={onPrevious}
      showSkip={false}
    >
      {/* Keyboard Shortcuts */}
      <div className="bg-slate-800/50 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Keyboard size={18} className="text-slate-400" />
          <h3 className="text-white font-semibold">Quick Reference</h3>
        </div>
        <div className="space-y-2">
          {shortcuts.map((shortcut, i) => (
            <div key={i} className="flex items-center gap-3">
              <kbd className="px-2 py-1 bg-slate-700 rounded text-cyan-400 font-mono text-xs min-w-[60px] text-center">
                {shortcut.key}
              </kbd>
              <span className="text-slate-400 text-sm">{shortcut.action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => onComplete(true)}
          className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-colors"
        >
          Inject Your First Knowledge
        </button>
        <button
          onClick={() => onComplete(false)}
          className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
        >
          Explore the Empty Graph
        </button>
      </div>

      <p className="text-slate-500 text-xs text-center mt-4">
        You can re-access this guide anytime via the <span className="text-cyan-400">?</span> icon in the top bar.
      </p>
    </OnboardingStep>
  );
};
