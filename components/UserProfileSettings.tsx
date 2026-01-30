import React, { useState, useEffect, useCallback } from 'react';
import { fetchUserProfile, updateUserProfile, UserProfile } from '../services/supabase';
import { Check, User, Briefcase, Sparkles, Settings, ChevronDown, ChevronUp, X } from 'lucide-react';
import clsx from 'clsx';

interface UserProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ title, icon, children, defaultOpen = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultOpen);

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-cyber-slate/30 hover:bg-cyber-slate/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-cyber-cyan">{icon}</div>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4 bg-cyber-slate/10">
          {children}
        </div>
      )}
    </div>
  );
};

export const UserProfileSettings: React.FC<UserProfileSettingsProps> = ({ isOpen, onClose }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetchUserProfile().then((data) => {
        setProfile(data || {
          professional_context: {},
          personal_interests: {},
          processing_preferences: {}
        });
        setLoading(false);
      });
    }
  }, [isOpen]);

  const handleSave = useCallback(async (updates: Partial<UserProfile>) => {
    if (!profile) return;

    setSaving(true);
    const { error } = await updateUserProfile(updates);
    setSaving(false);

    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      console.error("Failed to save profile:", error);
    }
  }, [profile]);

  const updateField = useCallback((
    section: 'professional_context' | 'personal_interests' | 'processing_preferences',
    field: string,
    value: string
  ) => {
    if (!profile) return;

    const updated = {
      ...profile,
      [section]: {
        ...(profile[section] || {}),
        [field]: value
      }
    };
    setProfile(updated);
  }, [profile]);

  const handleBlur = useCallback((
    section: 'professional_context' | 'personal_interests' | 'processing_preferences',
    field: string,
    value: string
  ) => {
    if (!profile) return;

    handleSave({
      [section]: {
        ...(profile[section] || {}),
        [field]: value
      }
    });
  }, [profile, handleSave]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 h-20 border-b border-white/10 bg-cyber-slate/50 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="bg-cyber-cyan/10 p-2.5 rounded-lg">
            <Settings size={24} className="text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">User Profile</h1>
            <p className="text-xs text-slate-400">Personalize your knowledge extraction</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Save Status */}
          <div className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-300",
            saved ? "bg-emerald-500/20 text-emerald-400" : "bg-transparent text-transparent"
          )}>
            <Check size={14} />
            <span>Saved</span>
          </div>

          {saving && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-3 h-3 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full animate-spin" />
              <span>Saving...</span>
            </div>
          )}

          <button
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="absolute top-20 bottom-0 left-0 right-0 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500">
              <div className="w-8 h-8 border-2 border-cyber-cyan/30 border-t-cyber-cyan rounded-full animate-spin mb-4" />
              <p className="text-sm">Loading profile...</p>
            </div>
          ) : (
            <>
              {/* Info Banner */}
              <div className="bg-cyber-cyan/5 border border-cyber-cyan/20 rounded-lg p-4 mb-6">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your profile helps Synapse personalize entity extraction. When you inject content,
                  this context is used to prioritize entities and relationships relevant to your work and interests.
                  All fields are optional.
                </p>
              </div>

              {/* Professional Context */}
              <Section
                title="Professional Context"
                icon={<Briefcase size={18} />}
                defaultOpen={true}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Your Role</label>
                    <input
                      type="text"
                      placeholder="e.g., Product Manager, Software Engineer, Researcher"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors"
                      value={profile?.professional_context?.role || ''}
                      onChange={(e) => updateField('professional_context', 'role', e.target.value)}
                      onBlur={(e) => handleBlur('professional_context', 'role', e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Industry / Domain</label>
                    <input
                      type="text"
                      placeholder="e.g., AI/ML, Healthcare, Finance, Education"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors"
                      value={profile?.professional_context?.industry || ''}
                      onChange={(e) => updateField('professional_context', 'industry', e.target.value)}
                      onBlur={(e) => handleBlur('professional_context', 'industry', e.target.value)}
                      maxLength={100}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Current Projects / Focus Areas</label>
                    <textarea
                      placeholder="e.g., Building a knowledge graph tool, researching RAG systems, launching a new product"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors resize-none h-24"
                      value={profile?.professional_context?.current_projects || ''}
                      onChange={(e) => updateField('professional_context', 'current_projects', e.target.value)}
                      onBlur={(e) => handleBlur('professional_context', 'current_projects', e.target.value)}
                      maxLength={500}
                    />
                  </div>
                </div>
              </Section>

              {/* Personal Interests */}
              <Section
                title="Personal Interests"
                icon={<User size={18} />}
                defaultOpen={true}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Topics You Care About</label>
                    <textarea
                      placeholder="e.g., AI, cognitive science, personal productivity, philosophy, economics"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors resize-none h-24"
                      value={profile?.personal_interests?.topics || ''}
                      onChange={(e) => updateField('personal_interests', 'topics', e.target.value)}
                      onBlur={(e) => handleBlur('personal_interests', 'topics', e.target.value)}
                      maxLength={500}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Learning Goals</label>
                    <textarea
                      placeholder="e.g., Understanding graph databases, improving critical thinking, learning about quantum computing"
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyber-cyan/50 transition-colors resize-none h-24"
                      value={profile?.personal_interests?.learning_goals || ''}
                      onChange={(e) => updateField('personal_interests', 'learning_goals', e.target.value)}
                      onBlur={(e) => handleBlur('personal_interests', 'learning_goals', e.target.value)}
                      maxLength={500}
                    />
                  </div>
                </div>
              </Section>

              {/* Processing Preferences */}
              <Section
                title="Processing Preferences"
                icon={<Sparkles size={18} />}
                defaultOpen={true}
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Insight Depth</label>
                    <select
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer"
                      value={profile?.processing_preferences?.insight_depth || ''}
                      onChange={(e) => {
                        updateField('processing_preferences', 'insight_depth', e.target.value);
                        handleBlur('processing_preferences', 'insight_depth', e.target.value);
                      }}
                    >
                      <option value="" className="bg-cyber-slate">No preference</option>
                      <option value="detailed" className="bg-cyber-slate">Detailed - Extract everything relevant</option>
                      <option value="high-level" className="bg-cyber-slate">High-level - Key concepts only</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Relationship Focus</label>
                    <select
                      className="w-full bg-cyber-slate/50 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyber-cyan/50 transition-colors appearance-none cursor-pointer"
                      value={profile?.processing_preferences?.relationship_focus || ''}
                      onChange={(e) => {
                        updateField('processing_preferences', 'relationship_focus', e.target.value);
                        handleBlur('processing_preferences', 'relationship_focus', e.target.value);
                      }}
                    >
                      <option value="" className="bg-cyber-slate">No preference</option>
                      <option value="broad" className="bg-cyber-slate">Broad - Many connections across topics</option>
                      <option value="deep" className="bg-cyber-slate">Deep - Fewer, stronger connections</option>
                    </select>
                  </div>
                </div>
              </Section>

              {/* Footer Note */}
              <div className="text-center pt-4 pb-8">
                <p className="text-xs text-slate-500">
                  Changes are saved automatically when you leave each field.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileSettings;
