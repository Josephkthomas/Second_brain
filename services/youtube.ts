// YouTube RSS Feed and Channel Utilities
// Handles channel URL resolution and video feed parsing

import type { ResolvedChannelInfo, YouTubeVideoInfo } from '../types/youtube';

// ============================================
// CONSTANTS
// ============================================

const YOUTUBE_RSS_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const YOUTUBE_CHANNEL_BASE = 'https://www.youtube.com/channel/';

// ============================================
// URL PARSING & CHANNEL RESOLUTION
// ============================================

/**
 * Extract channel identifier from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/@username
 * - https://www.youtube.com/channel/UCxxxxxx
 * - https://www.youtube.com/c/customname
 * - https://youtube.com/@username
 * - https://www.youtube.com/user/username (legacy)
 */
export function extractChannelIdentifier(url: string): { type: 'id' | 'handle' | 'custom' | 'user'; value: string } | null {
  try {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    const urlObj = new URL(normalizedUrl);
    const pathname = urlObj.pathname;

    // Handle @username format (most common now)
    const handleMatch = pathname.match(/^\/@([^/?]+)/);
    if (handleMatch) {
      return { type: 'handle', value: handleMatch[1] };
    }

    // Handle /channel/UCxxxxxx format (direct channel ID)
    const channelMatch = pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) {
      return { type: 'id', value: channelMatch[1] };
    }

    // Handle /c/customname format
    const customMatch = pathname.match(/^\/c\/([^/?]+)/);
    if (customMatch) {
      return { type: 'custom', value: customMatch[1] };
    }

    // Handle /user/username format (legacy)
    const userMatch = pathname.match(/^\/user\/([^/?]+)/);
    if (userMatch) {
      return { type: 'user', value: userMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve any YouTube channel URL to a channel ID and info
 * For @handles and custom URLs, we need to scrape the page to get the real channel ID
 */
export async function resolveChannelUrl(url: string): Promise<ResolvedChannelInfo> {
  const identifier = extractChannelIdentifier(url);

  if (!identifier) {
    throw new Error('Invalid YouTube channel URL. Please use a URL like https://www.youtube.com/@channelname or https://www.youtube.com/channel/UCxxxxxx');
  }

  // If it's already a channel ID, just fetch the info
  if (identifier.type === 'id') {
    return await fetchChannelInfoById(identifier.value);
  }

  // For handles, custom names, and legacy usernames, we need to scrape the page
  let pageUrl: string;
  switch (identifier.type) {
    case 'handle':
      pageUrl = `https://www.youtube.com/@${identifier.value}`;
      break;
    case 'custom':
      pageUrl = `https://www.youtube.com/c/${identifier.value}`;
      break;
    case 'user':
      pageUrl = `https://www.youtube.com/user/${identifier.value}`;
      break;
    default:
      throw new Error('Unknown identifier type');
  }

  return await scrapeChannelInfo(pageUrl);
}

/**
 * Scrape channel page to extract channel ID and info
 */
async function scrapeChannelInfo(pageUrl: string): Promise<ResolvedChannelInfo> {
  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch channel page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // Extract channel ID from page HTML
    // Pattern 1: "channelId":"UC..."
    let channelId: string | null = null;
    const channelIdMatch = html.match(/"channelId":"(UC[a-zA-Z0-9_-]+)"/);
    if (channelIdMatch) {
      channelId = channelIdMatch[1];
    }

    // Pattern 2: channel_id= in RSS link
    if (!channelId) {
      const rssMatch = html.match(/channel_id=(UC[a-zA-Z0-9_-]+)/);
      if (rssMatch) {
        channelId = rssMatch[1];
      }
    }

    // Pattern 3: externalId in JSON
    if (!channelId) {
      const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/);
      if (externalIdMatch) {
        channelId = externalIdMatch[1];
      }
    }

    if (!channelId) {
      throw new Error('Could not extract channel ID from page. The channel may not exist or the page structure has changed.');
    }

    // Extract channel name
    let channelName = 'Unknown Channel';
    const nameMatch = html.match(/<meta property="og:title" content="([^"]+)"/) ||
                     html.match(/"name":"([^"]+)".*?"@type":"Person"/) ||
                     html.match(/<title>([^<]+)<\/title>/);
    if (nameMatch) {
      channelName = decodeHTMLEntities(nameMatch[1].replace(' - YouTube', '').trim());
    }

    // Extract thumbnail
    let thumbnailUrl: string | null = null;
    const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/) ||
                          html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
    if (thumbnailMatch) {
      thumbnailUrl = thumbnailMatch[1];
    }

    // Extract description
    let description: string | null = null;
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/) ||
                     html.match(/"description":"([^"]+)"/);
    if (descMatch) {
      description = decodeHTMLEntities(descMatch[1]).substring(0, 500);
    }

    // Extract subscriber count (often obfuscated, so this may not always work)
    let subscriberCount: number | null = null;
    const subMatch = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/);
    if (subMatch) {
      subscriberCount = parseSubscriberCount(subMatch[1]);
    }

    return {
      channel_id: channelId,
      channel_name: channelName,
      channel_url: `${YOUTUBE_CHANNEL_BASE}${channelId}`,
      thumbnail_url: thumbnailUrl,
      description,
      subscriber_count: subscriberCount,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to resolve channel: ${error.message}`);
    }
    throw new Error('Failed to resolve channel: Unknown error');
  }
}

/**
 * Fetch channel info by channel ID using RSS feed
 */
async function fetchChannelInfoById(channelId: string): Promise<ResolvedChannelInfo> {
  try {
    const rssUrl = `${YOUTUBE_RSS_BASE}${channelId}`;
    const response = await fetch(rssUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xml = await response.text();

    // Extract channel name from feed
    const titleMatch = xml.match(/<title>([^<]+)<\/title>/);
    const channelName = titleMatch ? decodeHTMLEntities(titleMatch[1]) : 'Unknown Channel';

    // Try to get more info by scraping the channel page
    const pageUrl = `${YOUTUBE_CHANNEL_BASE}${channelId}`;
    try {
      const fullInfo = await scrapeChannelInfo(pageUrl);
      return {
        ...fullInfo,
        channel_id: channelId,
      };
    } catch {
      // Fall back to basic info from RSS
      return {
        channel_id: channelId,
        channel_name: channelName,
        channel_url: pageUrl,
        thumbnail_url: null,
        description: null,
        subscriber_count: null,
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch channel info: ${error.message}`);
    }
    throw new Error('Failed to fetch channel info: Unknown error');
  }
}

// ============================================
// RSS FEED PARSING
// ============================================

/**
 * Fetch latest videos from a channel's RSS feed
 * YouTube RSS feeds contain the 15 most recent videos
 */
export async function fetchChannelVideos(
  channelId: string,
  since?: Date
): Promise<YouTubeVideoInfo[]> {
  try {
    const rssUrl = `${YOUTUBE_RSS_BASE}${channelId}`;
    const response = await fetch(rssUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const videos = parseRssFeed(xml);

    // Filter by date if provided
    if (since) {
      return videos.filter(video => new Date(video.published_at) > since);
    }

    return videos;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch channel videos: ${error.message}`);
    }
    throw new Error('Failed to fetch channel videos: Unknown error');
  }
}

/**
 * Parse YouTube RSS XML feed into video info array
 */
function parseRssFeed(xml: string): YouTubeVideoInfo[] {
  const videos: YouTubeVideoInfo[] = [];

  // Match all <entry> elements
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;

  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const entry = entryMatch[1];

    // Extract video ID
    const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!videoIdMatch) continue;
    const videoId = videoIdMatch[1];

    // Extract title
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const title = titleMatch ? decodeHTMLEntities(titleMatch[1]) : 'Untitled';

    // Extract published date
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const publishedAt = publishedMatch ? publishedMatch[1] : new Date().toISOString();

    // Extract description (from media:description)
    const descMatch = entry.match(/<media:description>([^<]*)<\/media:description>/);
    const description = descMatch ? decodeHTMLEntities(descMatch[1]).substring(0, 500) : null;

    // Extract thumbnail (from media:thumbnail)
    const thumbMatch = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/);
    const thumbnailUrl = thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    videos.push({
      video_id: videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnail_url: thumbnailUrl,
      published_at: publishedAt,
      duration_seconds: null, // Not available in RSS
      description,
    });
  }

  return videos;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Decode HTML entities in strings
 */
function decodeHTMLEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&nbsp;': ' ',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities like &#1234;
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  // Handle hex entities like &#x1F4;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return result;
}

/**
 * Parse subscriber count strings like "1.5M subscribers" into numbers
 */
function parseSubscriberCount(text: string): number | null {
  const match = text.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;

  let num = parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();

  switch (suffix) {
    case 'K':
      num *= 1000;
      break;
    case 'M':
      num *= 1000000;
      break;
    case 'B':
      num *= 1000000000;
      break;
  }

  return Math.round(num);
}

/**
 * Validate that a string looks like a YouTube video ID
 */
export function isValidVideoId(videoId: string): boolean {
  // YouTube video IDs are 11 characters, alphanumeric with - and _
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

/**
 * Extract video ID from various YouTube video URL formats
 */
export function extractVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Standard watch URL: youtube.com/watch?v=xxxxx
    if (urlObj.searchParams.has('v')) {
      const v = urlObj.searchParams.get('v');
      if (v && isValidVideoId(v)) return v;
    }

    // Short URL: youtu.be/xxxxx
    if (urlObj.hostname === 'youtu.be') {
      const id = urlObj.pathname.slice(1);
      if (isValidVideoId(id)) return id;
    }

    // Embed URL: youtube.com/embed/xxxxx
    const embedMatch = urlObj.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];

    // Shorts URL: youtube.com/shorts/xxxxx
    const shortsMatch = urlObj.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Build YouTube video URL from video ID
 */
export function buildVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Build YouTube channel URL from channel ID
 */
export function buildChannelUrl(channelId: string): string {
  return `${YOUTUBE_CHANNEL_BASE}${channelId}`;
}
