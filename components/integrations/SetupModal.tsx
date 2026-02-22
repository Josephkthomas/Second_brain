import React from 'react';
import { X } from 'lucide-react';
import type { IntegrationDefinition } from '../../config/integrations';
import type { UserIntegration } from '../../types/integrations';
import { deleteUserIntegration } from '../../services/integrations';
import CirclebackSetup from './setups/CirclebackSetup';
import FirefliesSetup from './setups/FirefliesSetup';
import TldvSetup from './setups/TldvSetup';
import MeetgeekSetup from './setups/MeetgeekSetup';

// Registry of setup components per integration slug
const SETUP_COMPONENTS: Record<string, React.FC<SetupComponentProps>> = {
  circleback: CirclebackSetup,
  fireflies: FirefliesSetup,
  tldv: TldvSetup,
  meetgeek: MeetgeekSetup,
};

export interface SetupComponentProps {
  integration: IntegrationDefinition;
  userIntegration?: UserIntegration;
  onSuccess: () => void;
  onDisconnect: () => void;
}

interface SetupModalProps {
  integration: IntegrationDefinition;
  userIntegration?: UserIntegration;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SetupModal({ integration, userIntegration, onClose, onSuccess }: SetupModalProps) {
  const SetupComponent = SETUP_COMPONENTS[integration.slug];

  // Icon lookup (reuse the same map from IntegrationTile)
  const iconColors: Record<string, string> = {
    indigo: 'bg-indigo-500/20', violet: 'bg-violet-500/20', red: 'bg-red-500/20',
    slate: 'bg-slate-500/20', pink: 'bg-pink-500/20', amber: 'bg-amber-500/20',
    orange: 'bg-orange-500/20', emerald: 'bg-emerald-500/20',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColors[integration.accentColor] || 'bg-slate-500/20'}`}>
              <span className="text-sm font-bold text-white">{integration.name.charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{integration.name}</h2>
              <p className="text-xs text-slate-400">{integration.tagline}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {SetupComponent ? (
            <SetupComponent
              integration={integration}
              userIntegration={userIntegration}
              onSuccess={onSuccess}
              onDisconnect={async () => {
                if (userIntegration) {
                  await deleteUserIntegration(userIntegration.id);
                }
                onSuccess();
              }}
            />
          ) : (
            <p className="text-slate-400 text-sm text-center py-8">
              Setup guide coming soon.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
