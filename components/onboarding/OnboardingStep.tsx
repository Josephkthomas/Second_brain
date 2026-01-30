import React from 'react';
import { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface OnboardingStepProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onNext?: () => void;
  onPrevious?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  showPrevious?: boolean;
  showSkip?: boolean;
  isLastStep?: boolean;
}

export const OnboardingStep: React.FC<OnboardingStepProps> = ({
  icon: Icon,
  iconColor = 'text-cyan-400',
  title,
  subtitle,
  children,
  onNext,
  onPrevious,
  onSkip,
  nextLabel = 'Next',
  showPrevious = true,
  showSkip = false,
  isLastStep = false,
}) => {
  return (
    <div className="max-w-2xl w-full bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl p-8 shadow-2xl">
      {/* Step Header */}
      <div className="text-center mb-8">
        <div className={clsx(
          "inline-flex items-center justify-center w-16 h-16 rounded-full mb-4",
          iconColor === 'text-cyan-400' ? 'bg-cyan-400/10' : 'bg-slate-700/50'
        )}>
          <Icon size={32} className={iconColor} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        {subtitle && (
          <p className="text-slate-400 text-sm">{subtitle}</p>
        )}
      </div>

      {/* Step Content */}
      <div className="space-y-6">
        {children}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8 pt-6 border-t border-white/10">
        <div className="flex gap-4">
          {showPrevious && onPrevious && (
            <button
              onClick={onPrevious}
              className="text-slate-400 hover:text-white text-sm transition-colors"
            >
              Previous
            </button>
          )}
          {showSkip && onSkip && (
            <button
              onClick={onSkip}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Skip Onboarding
            </button>
          )}
        </div>

        {onNext && (
          <button
            onClick={onNext}
            className={clsx(
              "px-6 py-2.5 rounded-lg font-bold transition-all",
              isLastStep
                ? "bg-emerald-500 hover:bg-emerald-400 text-white"
                : "bg-cyan-400 hover:bg-cyan-300 text-black"
            )}
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
};
