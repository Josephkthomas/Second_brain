import React, { useState, useEffect } from 'react';
import { OnboardingProgress } from './OnboardingProgress';
import { WelcomeStep } from './steps/WelcomeStep';
import { IngestionHubStep } from './steps/IngestionHubStep';
import { DataTypesStep } from './steps/DataTypesStep';
import { MetadataStep } from './steps/MetadataStep';
import { PipelineStep } from './steps/PipelineStep';
import { AnchorsConceptStep } from './steps/AnchorsConceptStep';
import { AnchorsWorkflowStep } from './steps/AnchorsWorkflowStep';
import { ReadyStep } from './steps/ReadyStep';
import {
  markOnboardingComplete,
  markOnboardingSkipped,
  saveProgress,
  getLastStepViewed,
} from './onboarding-utils';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
  onOpenInjectionHub: () => void;
}

const STEP_LABELS = [
  'Welcome',
  'Ingestion Hub',
  'Data Types',
  'Metadata',
  'AI Pipeline',
  'Anchors: Concept',
  'Anchors: Workflow',
  'Ready',
];

const TOTAL_STEPS = STEP_LABELS.length;

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onSkip,
  onOpenInjectionHub,
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Resume from last viewed step if available
  useEffect(() => {
    const lastStep = getLastStepViewed();
    if (lastStep > 0 && lastStep < TOTAL_STEPS) {
      setCurrentStep(lastStep);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      saveProgress(nextStep);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleJumpToStep = (step: number) => {
    if (step >= 0 && step < TOTAL_STEPS) {
      setCurrentStep(step);
      saveProgress(step);
    }
  };

  const handleSkip = () => {
    markOnboardingSkipped();
    onSkip();
  };

  const handleComplete = (openInjector: boolean) => {
    markOnboardingComplete();
    onComplete();
    if (openInjector) {
      // Small delay to ensure the main app is mounted
      setTimeout(() => {
        onOpenInjectionHub();
      }, 100);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <WelcomeStep
            onNext={handleNext}
            onSkip={handleSkip}
            onJumpToStep={handleJumpToStep}
          />
        );
      case 1:
        return (
          <IngestionHubStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 2:
        return (
          <DataTypesStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 3:
        return (
          <MetadataStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 4:
        return (
          <PipelineStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 5:
        return (
          <AnchorsConceptStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 6:
        return (
          <AnchorsWorkflowStep
            onNext={handleNext}
            onPrevious={handlePrevious}
            onSkip={handleSkip}
          />
        );
      case 7:
        return (
          <ReadyStep
            onComplete={handleComplete}
            onPrevious={handlePrevious}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 overflow-auto">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">
        <OnboardingProgress
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
          onStepClick={handleJumpToStep}
        />

        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
          {renderStep()}
        </div>
      </div>
    </div>
  );
};
