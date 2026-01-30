import React from 'react';
import { Upload, Globe, Search, FileText, Keyboard } from 'lucide-react';
import { OnboardingStep } from '../OnboardingStep';

interface IngestionHubStepProps {
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

export const IngestionHubStep: React.FC<IngestionHubStepProps> = ({ onNext, onPrevious, onSkip }) => {
  return (
    <OnboardingStep
      icon={Upload}
      title="The Ingestion Hub"
      subtitle="Where Knowledge Begins"
      onNext={onNext}
      onPrevious={onPrevious}
      onSkip={onSkip}
      showSkip={true}
    >
      <p className="text-slate-300 text-center mb-6">
        The Ingestion Hub is your gateway to adding knowledge. It has two main modes:
      </p>

      <div className="space-y-4">
        {/* Deep Research Mode */}
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Globe size={20} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Deep Research</h3>
              <p className="text-cyan-400/70 text-sm">AI-powered discovery</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            Enter a topic or question. Synapse searches the web and automatically
            extracts entities, relationships, and insights into your graph.
          </p>
        </div>

        {/* Standard Input Mode */}
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <FileText size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-white font-semibold">Standard Input</h3>
              <p className="text-indigo-400/70 text-sm">Manual content entry</p>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            Add your own notes, meeting transcripts, YouTube videos, or documents.
            The AI extracts knowledge from content you already have.
          </p>
        </div>
      </div>

      {/* Keyboard Shortcut */}
      <div className="mt-6 flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Keyboard size={16} />
        <span>Press</span>
        <kbd className="px-2 py-1 bg-slate-800 rounded text-cyan-400 font-mono text-xs">I</kbd>
        <span>anywhere to open the Ingestion Hub</span>
      </div>
    </OnboardingStep>
  );
};
