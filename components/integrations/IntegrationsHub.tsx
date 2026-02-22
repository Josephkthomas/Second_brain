import React, { useState, useEffect, useCallback } from 'react';
import { Puzzle, Loader2, ArrowLeft } from 'lucide-react';
import { INTEGRATIONS, type IntegrationDefinition } from '../../config/integrations';
import { fetchUserIntegrations } from '../../services/integrations';
import type { UserIntegration } from '../../types/integrations';
import IntegrationTile from './IntegrationTile';
import SetupModal from './SetupModal';
import ApiManager from '../api/ApiManager';

interface IntegrationsHubProps {
  onComplete?: () => void;
  onGraphUpdate?: () => void;
}

type View = 'grid' | 'api';

const CATEGORIES = [
  { key: 'meetings' as const, label: 'Meeting Tools' },
  { key: 'notes' as const, label: 'Notes & Reading' },
  { key: 'communication' as const, label: 'Communication' },
  { key: 'custom' as const, label: 'Custom & API' },
];

export default function IntegrationsHub({ onComplete, onGraphUpdate }: IntegrationsHubProps) {
  const [userIntegrations, setUserIntegrations] = useState<UserIntegration[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('grid');

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    const data = await fetchUserIntegrations();
    setUserIntegrations(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const getUserIntegration = (slug: string) =>
    userIntegrations.find(ui => ui.integration_slug === slug);

  const handleTileClick = (integration: IntegrationDefinition) => {
    if (integration.status === 'coming_soon') return;

    // Custom / API tile → show ApiManager directly
    if (integration.slug === 'raw') {
      setView('api');
      return;
    }

    setSelectedIntegration(integration);
  };

  const handleModalClose = () => {
    setSelectedIntegration(null);
  };

  const handleModalSuccess = () => {
    setSelectedIntegration(null);
    loadIntegrations();
  };

  // ── API Manager View ───────────────────────────────────────
  if (view === 'api') {
    return (
      <div className="h-full flex flex-col">
        <button
          onClick={() => setView('grid')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-4 self-start"
        >
          <ArrowLeft size={14} />
          Back to Automations
        </button>
        <div className="flex-1 min-h-0">
          <ApiManager onComplete={onComplete} onGraphUpdate={onGraphUpdate} />
        </div>
      </div>
    );
  }

  // ── Tile Grid View ─────────────────────────────────────────
  return (
    <div className="space-y-8 overflow-y-auto h-full pr-1">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Puzzle className="text-violet-400" size={20} />
          Automations
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Connect your tools to automatically pipe content into your knowledge graph.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      ) : (
        <>
          {CATEGORIES.map(({ key, label }) => {
            const categoryIntegrations = INTEGRATIONS.filter(i => i.category === key);
            if (categoryIntegrations.length === 0) return null;

            return (
              <div key={key}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
                  {label}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {categoryIntegrations.map(integration => (
                    <IntegrationTile
                      key={integration.slug}
                      integration={integration}
                      userIntegration={getUserIntegration(integration.slug)}
                      onClick={() => handleTileClick(integration)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Setup Modal */}
      {selectedIntegration && (
        <SetupModal
          integration={selectedIntegration}
          userIntegration={getUserIntegration(selectedIntegration.slug)}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
