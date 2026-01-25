import { 
  User, Hash, Gavel, Target, Lightbulb, Building, Cpu, 
  AlertTriangle, HelpCircle, Sparkles, LucideIcon,
  Flag, CheckCircle2, BookOpen, Microscope, Zap, ShieldAlert,
  Anchor, Trophy
} from 'lucide-react';

export interface EntityConfig {
  color: string;
  icon: LucideIcon;
  shape: 'circle' | 'square' | 'diamond' | 'triangle' | 'hexagon';
}

export const ENTITY_THEME: Record<string, EntityConfig> = {
  // --- PRIMARY CORE ENTITIES (Blue, Green, Yellow, Red) ---
  'Project': { color: '#3b82f6', icon: Cpu, shape: 'square' },           // Blue-500 (Core Work)
  'Topic': { color: '#22c55e', icon: Hash, shape: 'circle' },            // Green-500 (Knowledge/Growth)
  'Goal': { color: '#eab308', icon: Trophy, shape: 'circle' },           // Yellow-500 (Target/Gold)
  'Decision': { color: '#ef4444', icon: Gavel, shape: 'square' },        // Red-500 (Critical)

  // --- SECONDARY ENTITIES (Purple, Cyan, Orange, Pink) ---
  'Person': { color: '#06b6d4', icon: User, shape: 'circle' },           // Cyan-500
  'Organization': { color: '#6366f1', icon: Building, shape: 'square' }, // Indigo-500
  'Insight': { color: '#a855f7', icon: Lightbulb, shape: 'diamond' },    // Purple-500
  'Action': { color: '#f97316', icon: Target, shape: 'triangle' },       // Orange-500
  'Risk': { color: '#ec4899', icon: AlertTriangle, shape: 'triangle' },  // Pink-500
  
  // --- TERTIARY / SPECIFIC ---
  'Question': { color: '#d946ef', icon: HelpCircle, shape: 'circle' },   // Fuchsia-500
  'Blocker': { color: '#be123c', icon: ShieldAlert, shape: 'triangle' }, // Rose-700
  'Feedback': { color: '#db2777', icon: Flag, shape: 'square' },         // Pink-600
  'Achievement': { color: '#14b8a6', icon: CheckCircle2, shape: 'diamond' }, // Teal-500
  'Lesson': { color: '#84cc16', icon: Zap, shape: 'hexagon' },           // Lime-500
  'Hypothesis': { color: '#8b5cf6', icon: Microscope, shape: 'diamond' },// Violet-500
  'Takeaway': { color: '#10b981', icon: BookOpen, shape: 'hexagon' },    // Emerald-500

  // --- ANCHOR DEFINITIONS (Matches Primary Colors) ---
  'Anchor': { color: '#f59e0b', icon: Anchor, shape: 'circle' },         // Amber-500
  
  'default': { color: '#94a3b8', icon: Sparkles, shape: 'circle' }       // Slate-400
};

export const getEntityConfig = (type: string): EntityConfig => {
  // Normalize type (capitalize first letter, handle casing)
  const normalizedKey = Object.keys(ENTITY_THEME).find(
    k => k.toLowerCase() === (type || '').toLowerCase()
  );
  return ENTITY_THEME[normalizedKey || 'default'];
};