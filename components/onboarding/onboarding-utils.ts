// Onboarding state management utilities

export interface OnboardingState {
  completed: boolean;
  completedAt: string | null;
  skippedAt: string | null;
  lastStepViewed: number;
}

const STORAGE_KEY = 'synapse_onboarding_state';

const getDefaultState = (): OnboardingState => ({
  completed: false,
  completedAt: null,
  skippedAt: null,
  lastStepViewed: 0,
});

export const getOnboardingState = (): OnboardingState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to read onboarding state:', e);
  }
  return getDefaultState();
};

const saveOnboardingState = (state: OnboardingState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save onboarding state:', e);
  }
};

export const hasCompletedOnboarding = (): boolean => {
  const state = getOnboardingState();
  return state.completed || state.skippedAt !== null;
};

export const markOnboardingComplete = (): void => {
  const state = getOnboardingState();
  saveOnboardingState({
    ...state,
    completed: true,
    completedAt: new Date().toISOString(),
  });
};

export const markOnboardingSkipped = (): void => {
  const state = getOnboardingState();
  saveOnboardingState({
    ...state,
    skippedAt: new Date().toISOString(),
  });
};

export const saveProgress = (step: number): void => {
  const state = getOnboardingState();
  saveOnboardingState({
    ...state,
    lastStepViewed: step,
  });
};

export const resetOnboarding = (): void => {
  saveOnboardingState(getDefaultState());
};

export const getLastStepViewed = (): number => {
  return getOnboardingState().lastStepViewed;
};
