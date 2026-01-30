import React, { useState } from 'react';
import {
  Brain,
  Youtube,
  FileText,
  CheckCircle2,
  AlertCircle,
  Zap,
  Clock,
  LogOut,
  Loader2,
} from 'lucide-react';

interface ContentData {
  type: 'youtube' | 'article';
  title: string;
  url: string;
  content?: string;
  transcript?: string | null;
  channelName?: string;
  siteName?: string | null;
  thumbnailUrl?: string;
  hasTranscript?: boolean;
  wordCount?: number;
  selectedText?: string | null;
}

interface CapturePreviewProps {
  data: ContentData;
  onCapture: (extractNow: boolean) => Promise<void>;
  onLogout: () => void;
  userEmail?: string;
}

export const CapturePreview: React.FC<CapturePreviewProps> = ({
  data,
  onCapture,
  onLogout,
  userEmail,
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState<'now' | 'later' | null>(null);

  const isYouTube = data.type === 'youtube';
  const hasContent = isYouTube ? data.hasTranscript : (data.content?.length ?? 0) > 10;
  const contentPreview = isYouTube
    ? data.transcript?.slice(0, 200)
    : (data.selectedText || data.content)?.slice(0, 200);

  const handleCapture = async (extractNow: boolean) => {
    setCaptureMode(extractNow ? 'now' : 'later');
    setIsCapturing(true);
    await onCapture(extractNow);
  };

  const getSubtitle = () => {
    if (isYouTube) {
      return data.channelName || 'YouTube Video';
    }
    return data.siteName || new URL(data.url).hostname;
  };

  const getWordCount = () => {
    if (isYouTube && data.transcript) {
      return data.transcript.split(/\s+/).length;
    }
    return data.wordCount || 0;
  };

  return (
    <div className="popup-container">
      {/* Header */}
      <div className="header">
        <Brain className="header-icon" size={24} />
        <div className="header-content">
          <h1 className="header-title">Synapse Capture</h1>
          {userEmail && (
            <button className="logout-btn" onClick={onLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content Preview Card */}
      <div className="content-card">
        {/* Thumbnail and Info */}
        <div className="content-header">
          {data.thumbnailUrl ? (
            <img
              src={data.thumbnailUrl}
              alt="Thumbnail"
              className="content-thumbnail"
            />
          ) : (
            <div className="content-icon">
              {isYouTube ? (
                <Youtube className="icon-youtube" size={24} />
              ) : (
                <FileText className="icon-article" size={24} />
              )}
            </div>
          )}
          <div className="content-info">
            <h2 className="content-title">{data.title}</h2>
            <p className="content-subtitle">{getSubtitle()}</p>
          </div>
        </div>

        {/* Content Status */}
        <div className="content-status">
          {hasContent ? (
            <>
              <CheckCircle2 className="status-icon-success" size={16} />
              <span className="status-text-success">
                {isYouTube ? 'Transcript available' : 'Content captured'}
                {' '}({getWordCount().toLocaleString()} words)
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="status-icon-warning" size={16} />
              <span className="status-text-warning">
                {isYouTube
                  ? 'No transcript available - metadata only'
                  : 'Limited content detected'}
              </span>
            </>
          )}
        </div>

        {/* Content Preview */}
        {contentPreview && (
          <div className="content-preview">
            <p>{contentPreview}...</p>
          </div>
        )}

        {/* Selection indicator */}
        {data.selectedText && (
          <div className="selection-indicator">
            Using selected text ({data.selectedText.split(/\s+/).length} words)
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button
          onClick={() => handleCapture(true)}
          disabled={isCapturing || !hasContent}
          className="btn-primary"
        >
          {isCapturing && captureMode === 'now' ? (
            <>
              <Loader2 className="btn-spinner" size={18} />
              Extracting...
            </>
          ) : (
            <>
              <Zap size={18} />
              Capture & Extract Now
            </>
          )}
        </button>

        <button
          onClick={() => handleCapture(false)}
          disabled={isCapturing || !hasContent}
          className="btn-secondary"
        >
          {isCapturing && captureMode === 'later' ? (
            <>
              <Loader2 className="btn-spinner" size={18} />
              Saving...
            </>
          ) : (
            <>
              <Clock size={18} />
              Save for Later
            </>
          )}
        </button>
      </div>

      <p className="action-hint">
        "Save for Later" queues content for extraction in the main app
      </p>
    </div>
  );
};
