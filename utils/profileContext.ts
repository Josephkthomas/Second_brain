import { UserProfile } from '../services/supabase';

/**
 * Builds a natural language context string from a user profile
 * to be appended to extraction system prompts.
 */
export function buildProfileContext(profile: UserProfile | null): string {
  if (!profile) return '';

  const sections: string[] = [];

  // Professional context
  const prof = profile.professional_context || {};
  if (prof.role || prof.industry || prof.current_projects) {
    const profParts: string[] = [];
    if (prof.role) profParts.push(`Role: ${prof.role}`);
    if (prof.industry) profParts.push(`Industry: ${prof.industry}`);
    if (prof.current_projects) profParts.push(`Current projects: ${prof.current_projects}`);
    sections.push(`Professional Context: ${profParts.join('. ')}`);
  }

  // Personal interests
  const interests = profile.personal_interests || {};
  if (interests.topics || interests.learning_goals) {
    const interestParts: string[] = [];
    if (interests.topics) interestParts.push(`Interested in: ${interests.topics}`);
    if (interests.learning_goals) interestParts.push(`Learning goals: ${interests.learning_goals}`);
    sections.push(`Personal Interests: ${interestParts.join('. ')}`);
  }

  // Processing preferences
  const prefs = profile.processing_preferences || {};
  if (prefs.insight_depth || prefs.relationship_focus) {
    const prefParts: string[] = [];
    if (prefs.insight_depth) {
      prefParts.push(prefs.insight_depth === 'detailed'
        ? 'Extract detailed insights and all relevant entities'
        : 'Focus on high-level key concepts only');
    }
    if (prefs.relationship_focus) {
      prefParts.push(prefs.relationship_focus === 'broad'
        ? 'Identify many connections across topics'
        : 'Focus on fewer, stronger connections');
    }
    sections.push(`Extraction Preferences: ${prefParts.join('. ')}`);
  }

  if (sections.length === 0) return '';

  return `\n\n## User Profile Context
The following information about the user should inform your extraction - prioritize entities and relationships relevant to their context:
${sections.join('\n')}`;
}
