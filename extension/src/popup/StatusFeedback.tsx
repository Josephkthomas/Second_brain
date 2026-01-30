import React from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Brain,
} from 'lucide-react';
import { SYNAPSE_APP_URL } from '../lib/constants';

interface CaptureResult {
  nodesCreated?: number;
  edgesCreated?: number;
  sourceId?: string;
}

interface StatusFeedbackProps {
  status: 'success' | 'error';
  error?: string;
  result?: CaptureResult | null;
  onRetry: () => void;
  onClose: () => void;
}

export const StatusFeedback: React.FC<StatusFeedbackProps> = ({
  status,
  error,
  result,
  onRetry,
  onClose,
}) => {
  const isSuccess = status === 'success';

  const handleOpenSynapse = () => {
    chrome.tabs.create({ url: SYNAPSE_APP_URL });
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <Brain className="header-icon" size={24} />
        <h1 className="header-title">Synapse Capture</h1>
      </div>

      {/* Status Card */}
      <div className={`status-card ${isSuccess ? 'status-success' : 'status-error'}`}>
        <div className="status-icon-container">
          {isSuccess ? (
            <CheckCircle2 className="status-icon-large-success" size={48} />
          ) : (
            <XCircle className="status-icon-large-error" size={48} />
          )}
        </div>

        <h2 className="status-title">
          {isSuccess ? 'Added to Synapse!' : 'Capture Failed'}
        </h2>

        {isSuccess && result && (
          <div className="status-details">
            {result.nodesCreated !== undefined ? (
              <p>
                Extracted <strong>{result.nodesCreated}</strong> nodes and{' '}
                <strong>{result.edgesCreated}</strong> edges
              </p>
            ) : (
              <p>Content saved and queued for extraction</p>
            )}
          </div>
        )}

        {!isSuccess && error && (
          <p className="status-error-text">{error}</p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        {isSuccess ? (
          <>
            <button
              onClick={handleOpenSynapse}
              className="btn-primary"
            >
              <ExternalLink size={18} />
              View in Synapse
            </button>
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onRetry}
              className="btn-primary"
            >
              <RefreshCw size={18} />
              Try Again
            </button>
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
};
