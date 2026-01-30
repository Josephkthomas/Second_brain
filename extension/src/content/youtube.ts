// YouTube content script - extracts video metadata and transcripts

export interface YouTubeVideoData {
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

// Extract video ID from URL
function getVideoId(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Extract video metadata from the page DOM
function extractVideoMetadata(): Partial<YouTubeVideoData> {
  const videoId = getVideoId();
  if (!videoId) return {};

  // Try multiple selectors for title (YouTube changes their DOM frequently)
  const titleElement =
    document.querySelector('h1.ytd-video-primary-info-renderer') ||
    document.querySelector('h1.ytd-watch-metadata') ||
    document.querySelector('h1 yt-formatted-string');

  const title = titleElement?.textContent?.trim() || document.title.replace(' - YouTube', '');

  // Channel name
  const channelElement =
    document.querySelector('ytd-channel-name a') ||
    document.querySelector('#channel-name a') ||
    document.querySelector('.ytd-video-owner-renderer a');

  const channelName = channelElement?.textContent?.trim() || '';
  const channelUrl = (channelElement as HTMLAnchorElement)?.href || '';

  // Description (first 500 chars)
  const descElement =
    document.querySelector('#description-inline-expander') ||
    document.querySelector('ytd-text-inline-expander') ||
    document.querySelector('#description');

  const description = descElement?.textContent?.trim().slice(0, 500) || '';

  return {
    type: 'youtube',
    videoId,
    title,
    channelName,
    channelUrl,
    description,
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    url: window.location.href,
  };
}

// Attempt to scrape transcript from YouTube's transcript panel
async function scrapeTranscript(): Promise<string | null> {
  try {
    // First, try to find and click the "Show transcript" button
    // Look for the more options menu button
    const moreActionsButton = document.querySelector('button[aria-label="More actions"]');
    if (moreActionsButton) {
      (moreActionsButton as HTMLElement).click();
      await sleep(500);

      // Look for "Show transcript" in the menu
      const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer');
      for (const item of menuItems) {
        if (item.textContent?.toLowerCase().includes('transcript')) {
          (item as HTMLElement).click();
          await sleep(1000);
          break;
        }
      }
    }

    // Now try to scrape the transcript panel
    const transcriptPanel = document.querySelector('ytd-transcript-renderer');
    if (!transcriptPanel) {
      // Try alternative: look for transcript segments directly
      return await scrapeFromCaptionAPI();
    }

    const segments = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
    if (segments.length === 0) {
      return await scrapeFromCaptionAPI();
    }

    const lines: string[] = [];
    segments.forEach(segment => {
      const text = segment.querySelector('.segment-text')?.textContent?.trim();
      if (text) {
        lines.push(text);
      }
    });

    return lines.length > 0 ? lines.join(' ') : null;
  } catch (error) {
    console.error('Error scraping transcript:', error);
    return await scrapeFromCaptionAPI();
  }
}

// Alternative: Try to get captions from YouTube's internal API
async function scrapeFromCaptionAPI(): Promise<string | null> {
  try {
    const videoId = getVideoId();
    if (!videoId) return null;

    console.log('Synapse: Attempting to fetch captions for video:', videoId);

    // Method 1: Look for ytInitialPlayerResponse in page
    let playerResponse: any = null;

    // Check if it's available as a global variable
    if ((window as any).ytInitialPlayerResponse) {
      playerResponse = (window as any).ytInitialPlayerResponse;
      console.log('Synapse: Found ytInitialPlayerResponse global');
    }

    // Method 2: Parse from script tags if not found globally
    if (!playerResponse) {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';

        // Look for ytInitialPlayerResponse
        const playerMatch = content.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
        if (playerMatch) {
          try {
            playerResponse = JSON.parse(playerMatch[1]);
            console.log('Synapse: Parsed ytInitialPlayerResponse from script');
            break;
          } catch (e) {
            // Try a more lenient extraction
            const startIdx = content.indexOf('ytInitialPlayerResponse');
            if (startIdx !== -1) {
              const jsonStart = content.indexOf('{', startIdx);
              if (jsonStart !== -1) {
                let braceCount = 0;
                let jsonEnd = jsonStart;
                for (let i = jsonStart; i < content.length; i++) {
                  if (content[i] === '{') braceCount++;
                  if (content[i] === '}') braceCount--;
                  if (braceCount === 0) {
                    jsonEnd = i + 1;
                    break;
                  }
                }
                try {
                  playerResponse = JSON.parse(content.substring(jsonStart, jsonEnd));
                  console.log('Synapse: Extracted ytInitialPlayerResponse with brace matching');
                  break;
                } catch (e2) {
                  console.log('Synapse: Failed to parse extracted JSON');
                }
              }
            }
          }
        }
      }
    }

    if (!playerResponse) {
      console.log('Synapse: Could not find player response');
      return null;
    }

    // Extract caption tracks
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) {
      console.log('Synapse: No caption tracks found in player response');
      return null;
    }

    console.log('Synapse: Found', captionTracks.length, 'caption tracks');

    // Prefer English captions, then auto-generated, then any
    let selectedTrack = captionTracks.find((t: any) =>
      t.languageCode === 'en' && !t.kind
    ) || captionTracks.find((t: any) =>
      t.languageCode === 'en'
    ) || captionTracks.find((t: any) =>
      t.languageCode?.startsWith('en')
    ) || captionTracks[0];

    if (!selectedTrack?.baseUrl) {
      console.log('Synapse: No valid caption URL found');
      return null;
    }

    // Build the caption URL with proper format parameters
    let captionUrl = selectedTrack.baseUrl;

    // Add format parameter if not present (srv3 is the JSON format, but we want XML)
    if (!captionUrl.includes('&fmt=')) {
      captionUrl += '&fmt=srv1'; // srv1 is simple XML format
    }

    console.log('Synapse: Fetching captions from:', captionUrl.substring(0, 100) + '...');

    // Fetch via background script to bypass CSP restrictions
    const response = await new Promise<Response>((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchUrl', url: captionUrl },
        (result) => {
          if (chrome.runtime.lastError) {
            console.log('Synapse: Background fetch error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else if (result.error) {
            reject(new Error(result.error));
          } else {
            // Create a fake Response object with the text
            resolve({
              ok: true,
              status: 200,
              text: async () => result.data
            } as Response);
          }
        }
      );
    });

    console.log('Synapse: Caption response received');

    if (!response.ok) {
      console.log('Synapse: Caption fetch failed with status:', response.status);
      // Try without format parameter as fallback
      const fallbackResponse = await fetch(selectedTrack.baseUrl);
      if (!fallbackResponse.ok) {
        return null;
      }
      const fallbackXml = await fallbackResponse.text();
      console.log('Synapse: Fallback caption XML, length:', fallbackXml.length);
      if (fallbackXml.length > 0) {
        return parseTranscriptXml(fallbackXml);
      }
      return null;
    }

    const xml = await response.text();
    console.log('Synapse: Received caption XML, length:', xml.length);
    console.log('Synapse: First 500 chars:', xml.substring(0, 500));

    if (xml.length === 0) {
      console.log('Synapse: Empty response, trying JSON format...');
      // Try JSON format (srv3)
      const jsonUrl = selectedTrack.baseUrl + '&fmt=json3';
      const jsonResponse = await fetch(jsonUrl);
      if (jsonResponse.ok) {
        const jsonText = await jsonResponse.text();
        console.log('Synapse: JSON response length:', jsonText.length);
        try {
          const jsonData = JSON.parse(jsonText);
          if (jsonData.events) {
            const lines = jsonData.events
              .filter((e: any) => e.segs)
              .flatMap((e: any) => e.segs.map((s: any) => s.utf8))
              .filter((t: string) => t && t.trim());
            console.log('Synapse: Extracted', lines.length, 'segments from JSON');
            return lines.join(' ');
          }
        } catch (e) {
          console.log('Synapse: Failed to parse JSON captions');
        }
      }
      return null;
    }

    return parseTranscriptXml(xml);
  } catch (error) {
    console.error('Synapse: Error fetching captions:', error);
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to parse transcript XML
function parseTranscriptXml(xml: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const textElements = doc.querySelectorAll('text');

  const lines: string[] = [];
  textElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text) {
      // Decode HTML entities
      const decoded = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ');
      lines.push(decoded);
    }
  });

  console.log('Synapse: Extracted', lines.length, 'caption segments from XML');
  return lines.length > 0 ? lines.join(' ') : null;
}

// Main function to get all YouTube data
async function getYouTubeData(): Promise<YouTubeVideoData | null> {
  const videoId = getVideoId();
  if (!videoId) return null;

  const metadata = extractVideoMetadata();
  const transcript = await scrapeTranscript();

  return {
    type: 'youtube',
    videoId: metadata.videoId || videoId,
    title: metadata.title || 'Untitled Video',
    channelName: metadata.channelName || '',
    channelUrl: metadata.channelUrl || '',
    description: metadata.description || '',
    transcript,
    thumbnailUrl: metadata.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    url: window.location.href,
    hasTranscript: !!transcript,
  };
}

// Listen for messages from the popup or background script
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'getYouTubeData') {
    getYouTubeData().then(data => {
      sendResponse(data);
    }).catch(error => {
      console.error('Error getting YouTube data:', error);
      sendResponse(null);
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'getPageType') {
    const videoId = getVideoId();
    sendResponse({
      type: videoId ? 'youtube' : 'article',
      isYouTube: !!videoId
    });
    return true;
  }
});

// Log when content script loads
console.log('Synapse: YouTube content script loaded');
