import React from 'react';
import clsx from 'clsx';

interface OnboardingProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onStepClick: (step: number) => void;
}

export const OnboardingProgress: React.FC<OnboardingProgressProps> = ({
  currentStep,
  totalSteps,
  stepLabels,
  onStepClick,
}) => {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: totalSteps }).map((_, i) => {
        const isActive = i === currentStep;
        const isCompleted = i < currentStep;

        return (
          <button
            key={i}
            onClick={() => onStepClick(i)}
            className={clsx(
              "transition-all duration-300 rounded-full relative group",
              isActive
                ? "w-8 h-3 bg-cyan-400"
                : isCompleted
                  ? "w-3 h-3 bg-emerald-500 hover:bg-emerald-400"
                  : "w-3 h-3 bg-slate-600 hover:bg-slate-500"
            )}
            title={stepLabels[i]}
          >
            {/* Tooltip */}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              {stepLabels[i]}
            </span>
          </button>
        );
      })}
    </div>
  );
};
