// ProcessingStages — Vertical list of processing steps
// Shows every stage label with status icon: checkmark, spinner, error, or empty circle

import React from 'react';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ProcessingStage } from '../../types/queue';

interface ProcessingStagesProps {
  stages: ProcessingStage[];
}

export default function ProcessingStages({ stages }: ProcessingStagesProps) {
  return (
    <div className="space-y-1">
      {stages.map((stage, i) => (
        <div key={i} className="flex items-center gap-2">
          {/* Status icon */}
          {stage.status === 'done' ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          ) : stage.status === 'active' ? (
            <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0" />
          ) : stage.status === 'failed' ? (
            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          ) : (
            <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0" />
          )}

          {/* Label — always visible */}
          <span
            className={clsx(
              'text-[11px]',
              stage.status === 'done' ? 'text-emerald-300' :
              stage.status === 'active' ? 'text-cyan-300' :
              stage.status === 'failed' ? 'text-red-400' :
              'text-slate-500'
            )}
          >
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}
