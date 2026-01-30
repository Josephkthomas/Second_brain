// Background service worker for Synapse extension
import { getSupabase, getCurrentSession, saveKnowledgeSource, getAccessToken } from '../lib/supabase';
import { EXTRACT_API_URL, SYNAPSE_APP_URL } from '../lib/constants';

// Types for content data
interface YouTubeData {
  type: 'youtube';
  videoId: string;
  title: string;
  channelName: string;
  channelUrl: string;
  description: string;
  transcript: string | null;
  thumbnailUrl: string;
  url: string;
  hasTranscript: boolean;
}

interface ArticleData {
  type: 'article';
  url: string;
  title: string;
  content: string;
  selectedText: string | null;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  wordCount: number;
}

type ContentData = YouTubeData | ArticleData;

interface CaptureRequest {
  action: 'captureContent';
  data: ContentData;
  extractNow: boolean;
}

interface CaptureResponse {
  success: boolean;
  sourceId?: string;
  nodesCreated?: number;
  edgesCreated?: number;
  error?: string;
}

// Handle content capture
async function handleCapture(data: ContentData, extractNow: boolean): Promise<CaptureResponse> {
  try {
    // Check authentication
    const { session, user } = await getCurrentSession();
    if (!session || !user) {
      return { success: false, error: 'Not authenticated. Please log in.' };
    }

    // Prepare content for saving
    let title: string;
    let content: string;
    let sourceType: 'YouTube' | 'Document';
    let metadata: Record<string, unknown>;

    if (data.type === 'youtube') {
      title = data.title;
      content = data.transcript || data.description || '';
      sourceType = 'YouTube';
      metadata = {
        videoId: data.videoId,
        channelName: data.channelName,
        channelUrl: data.channelUrl,
        thumbnailUrl: data.thumbnailUrl,
        hasTranscript: data.hasTranscript,
      };

      if (!content || content.length < 10) {
        return {
          success: false,
          error: 'No transcript available for this video. Only metadata can be saved.',
        };
      }
    } else {
      title = data.title;
      content = data.selectedText || data.content;
      sourceType = 'Document';
      metadata = {
        author: data.author,
        publishedDate: data.publishedDate,
        siteName: data.siteName,
        wordCount: data.wordCount,
        hasSelection: !!data.selectedText,
      };

      if (!content || content.length < 10) {
        return {
          success: false,
          error: 'No content found on this page.',
        };
      }
    }

    // Save to knowledge_sources
    const { id: sourceId, error: saveError } = await saveKnowledgeSource({
      title,
      content,
      sourceType,
      sourceUrl: data.url,
      metadata,
    });

    if (saveError || !sourceId) {
      return {
        success: false,
        error: saveError?.message || 'Failed to save content',
      };
    }

    // If extractNow is true, call the extraction API
    if (extractNow) {
      const extractResult = await triggerExtraction(sourceId);
      if (!extractResult.success) {
        // Content was saved, but extraction failed
        return {
          success: true,
          sourceId,
          error: `Content saved but extraction failed: ${extractResult.error}`,
        };
      }

      return {
        success: true,
        sourceId,
        nodesCreated: extractResult.nodesCreated,
        edgesCreated: extractResult.edgesCreated,
      };
    }

    return { success: true, sourceId };
  } catch (error) {
    console.error('Capture error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// Call the extraction API endpoint
async function triggerExtraction(sourceId: string): Promise<{
  success: boolean;
  nodesCreated?: number;
  edgesCreated?: number;
  error?: string;
}> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, error: 'No access token' };
    }

    const response = await fetch(EXTRACT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ sourceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      nodesCreated: result.nodesCreated,
      edgesCreated: result.edgesCreated,
    };
  } catch (error) {
    console.error('Extraction API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    };
  }
}

// Show notification
function showNotification(title: string, message: string, isError = false) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: isError ? 2 : 1,
  });
}

// Message listener
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Handle URL fetch requests from content scripts (to bypass page CSP)
  if (request.action === 'fetchUrl') {
    console.log('Synapse: Background fetching URL:', request.url?.substring(0, 80) + '...');
    fetch(request.url)
      .then(response => response.text())
      .then(data => {
        console.log('Synapse: Background fetch success, length:', data.length);
        sendResponse({ data });
      })
      .catch(error => {
        console.error('Synapse: Background fetch error:', error);
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.action === 'captureContent') {
    const { data, extractNow } = request as CaptureRequest;

    handleCapture(data, extractNow).then(result => {
      // Show notification based on result
      if (result.success) {
        const message = result.nodesCreated
          ? `Extracted ${result.nodesCreated} nodes and ${result.edgesCreated} edges`
          : 'Content saved for later processing';
        showNotification('Added to Synapse', message);
      } else {
        showNotification('Capture Failed', result.error || 'Unknown error', true);
      }

      sendResponse(result);
    }).catch(error => {
      console.error('Message handler error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return true; // Keep channel open for async response
  }

  if (request.action === 'checkAuth') {
    getCurrentSession().then(({ session, user }) => {
      sendResponse({
        isAuthenticated: !!session && !!user,
        user: user ? { id: user.id, email: user.email } : null,
      });
    });
    return true;
  }

  if (request.action === 'openSynapseApp') {
    chrome.tabs.create({ url: SYNAPSE_APP_URL });
    sendResponse({ success: true });
    return true;
  }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    console.log('Synapse extension installed');
  } else if (details.reason === 'update') {
    console.log('Synapse extension updated');
  }
});

console.log('Synapse: Background service worker started');
