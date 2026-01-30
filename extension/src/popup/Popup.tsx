import React, { useState, useEffect } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { getCurrentSession, signOut } from '../lib/supabase';
import { Login } from './Login';
import { CapturePreview } from './CapturePreview';
import { StatusFeedback } from './StatusFeedback';

type ViewState = 'loading' | 'login' | 'capture' | 'success' | 'error';

interface User {
  id: string;
  email: string | undefined;
}

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
  videoId?: string;
  author?: string | null;
  publishedDate?: string | null;
  description?: string;
  channelUrl?: string;
}

interface CaptureResult {
  nodesCreated?: number;
  edgesCreated?: number;
  sourceId?: string;
}

export const Popup: React.FC = () => {
  const [view, setView] = useState<ViewState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [pageData, setPageData] = useState<ContentData | null>(null);
  const [error, setError] = useState<string>('');
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { session, user: authUser } = await getCurrentSession();
      if (session && authUser) {
        setUser({ id: authUser.id, email: authUser.email });
        await detectPageContent();
      } else {
        setView('login');
      }
    } catch (err) {
      console.error('Auth check error:', err);
      setView('login');
    }
  };

  const detectPageContent = async () => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || !tab.url) {
        setError('Cannot access current tab');
        setView('error');
        return;
      }

      // Check if it's a YouTube video
      const isYouTube = tab.url.includes('youtube.com/watch');

      // Try to get content from content script
      const action = isYouTube ? 'getYouTubeData' : 'getArticleData';

      chrome.tabs.sendMessage(tab.id, { action }, (response) => {
        if (chrome.runtime.lastError) {
          // Content script might not be loaded, inject it
          chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: [isYouTube ? 'content-youtube.js' : 'content-article.js'],
          }).then(() => {
            // Retry after injection
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id!, { action }, (retryResponse) => {
                if (retryResponse) {
                  setPageData(retryResponse);
                  setView('capture');
                } else {
                  setError('Could not detect page content');
                  setView('error');
                }
              });
            }, 100);
          }).catch(err => {
            console.error('Script injection error:', err);
            setError('Cannot access this page');
            setView('error');
          });
          return;
        }

        if (response) {
          setPageData(response);
          setView('capture');
        } else {
          setError('No content found on this page');
          setView('error');
        }
      });
    } catch (err) {
      console.error('Page detection error:', err);
      setError('Failed to detect page content');
      setView('error');
    }
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    detectPageContent();
  };

  const handleCapture = async (extractNow: boolean) => {
    if (!pageData) return;

    setView('loading');

    try {
      const response = await new Promise<{
        success: boolean;
        sourceId?: string;
        nodesCreated?: number;
        edgesCreated?: number;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'captureContent', data: pageData, extractNow },
          resolve
        );
      });

      if (response.success) {
        setCaptureResult({
          sourceId: response.sourceId,
          nodesCreated: response.nodesCreated,
          edgesCreated: response.edgesCreated,
        });
        setView('success');
      } else {
        setError(response.error || 'Capture failed');
        setView('error');
      }
    } catch (err) {
      console.error('Capture error:', err);
      setError('Failed to capture content');
      setView('error');
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
    setView('login');
  };

  const handleRetry = () => {
    setError('');
    detectPageContent();
  };

  // Loading state
  if (view === 'loading') {
    return (
      <div className="popup-container">
        <div className="loading-state">
          <Loader2 className="loading-spinner" size={32} />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Login state
  if (view === 'login') {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  // Capture state
  if (view === 'capture' && pageData) {
    return (
      <CapturePreview
        data={pageData}
        onCapture={handleCapture}
        onLogout={handleLogout}
        userEmail={user?.email}
      />
    );
  }

  // Success/Error state
  return (
    <StatusFeedback
      status={view}
      error={error}
      result={captureResult}
      onRetry={handleRetry}
      onClose={() => window.close()}
    />
  );
};
