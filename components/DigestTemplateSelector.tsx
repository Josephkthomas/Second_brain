import React from 'react';
import {
  X, FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap,
  Sparkles, TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart,
  Anchor, Lightbulb, Compass, BarChart3,
} from 'lucide-react';
import { DIGEST_TEMPLATES, TEMPLATE_CATEGORY_LABELS, type DigestTemplateDefinition } from '../config/digestTemplates';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  FolderKanban, ListChecks, Users, Radar, AlertTriangle, GraduationCap, Sparkles,
  TrendingUp, GitMerge, Network, Gavel, CalendarDays, PieChart, Anchor, Lightbulb,
  Compass, BarChart3,
};

const ACCENT_MAP: Record<string, string> = {
  cyan: 'border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10',
  amber: 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10',
  violet: 'border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10',
  emerald: 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10',
  red: 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10',
  blue: 'border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
};

const ACCENT_ICON_MAP: Record<string, string> = {
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  violet: 'text-violet-400',
  emerald: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
};

interface Props {
  onSelect: (template: DigestTemplateDefinition) => void;
  onClose: () => void;
  existingTemplateIds: string[];
}

export const DigestTemplateSelector: React.FC<Props> = ({ onSelect, onClose, existingTemplateIds }) => {
  const categories = Object.entries(TEMPLATE_CATEGORY_LABELS).map(([key, label]) => ({ key, label }));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-cyber-slate border border-white/10 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Select a Module Template</h3>
            <p className="text-xs text-slate-500 mt-0.5">Each module gathers a specific type of intelligence</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Templates */}
        <div className="p-5 overflow-y-auto max-h-[60vh] space-y-5">
          {categories.map(cat => {
            const templates = DIGEST_TEMPLATES.filter(t => t.category === cat.key);
            if (templates.length === 0) return null;
            return (
              <div key={cat.key}>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{cat.label}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {templates.map(template => {
                    const Icon = ICON_MAP[template.iconName] || FolderKanban;
                    const alreadyAdded = existingTemplateIds.includes(template.template_id);
                    return (
                      <button
                        key={template.template_id}
                        onClick={() => !alreadyAdded && onSelect(template)}
                        disabled={alreadyAdded}
                        className={`p-4 rounded-lg border text-left transition-all ${
                          alreadyAdded
                            ? 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed'
                            : ACCENT_MAP[template.accentColor] || 'border-white/10 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <Icon size={16} className={alreadyAdded ? 'text-slate-600' : (ACCENT_ICON_MAP[template.accentColor] || 'text-slate-400')} />
                          <span className="text-sm font-semibold text-white">{template.name}</span>
                          {alreadyAdded && (
                            <span className="ml-auto text-[10px] bg-white/10 text-slate-500 px-1.5 py-0.5 rounded">Added</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{template.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
