// Watch History HTML Parser
// Parses Google Takeout YouTube watch history HTML files client-side
// PRD Section 5: Stage 1 — HTML Parsing

import type {
  WatchHistoryEntry,
  ParsedWatchHistory,
  DeduplicatedEntry,
  WatchHistoryFilters,
} from '../types/watchHistory';

/**
 * Decode common HTML entities in text
 */
function decodeHTMLEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Extract video ID from a YouTube URL
 * Handles: watch?v=XXX, /shorts/XXX
 */
function extractVideoId(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

/**
 * Extract channel ID from a YouTube channel URL
 * Handles: /channel/UCxxxx
 */
function extractChannelId(url: string): string {
  const match = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
  return match ? match[1] : url;
}

/**
 * Parse a Google Takeout timestamp string
 * Format: "Jan 15, 2026, 9:50:09 AM GMT" or similar locale variants
 */
function parseTimestamp(text: string): Date | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  // Try native Date parsing first — Google Takeout format is generally parseable
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) return date;

  return null;
}

/**
 * Check if a URL is a YouTube Short
 */
function isShortUrl(url: string): boolean {
  return url.includes('/shorts/');
}

/**
 * Check if a title looks like a raw URL (common for Shorts)
 */
function isRawUrlTitle(title: string): boolean {
  return /^https?:\/\//.test(title.trim());
}

/**
 * Parse a Google Takeout YouTube watch history HTML file
 * Returns structured entries with metadata
 */
export function parseWatchHistoryHTML(html: string): ParsedWatchHistory {
  const entries: WatchHistoryEntry[] = [];
  let skippedAds = 0;
  let skippedDeleted = 0;
  let skippedShorts = 0;

  // Match each content-cell div (the container for each watch entry)
  // Using a regex that captures the content between opening and closing div tags
  const cellRegex = /<div class="content-cell mdl-cell mdl-cell--6-col mdl-typography--body-1">([\s\S]*?)<\/div>/g;
  let match;

  while ((match = cellRegex.exec(html)) !== null) {
    const cellContent = match[1];

    // Skip ads
    if (cellContent.includes('From Google Ads')) {
      skippedAds++;
      continue;
    }

    // Skip deleted videos
    if (cellContent.includes('video that has been removed') || cellContent.includes('Watched a video that has been removed')) {
      skippedDeleted++;
      continue;
    }

    // Skip stories/posts (no "Watched" prefix with video link)
    if (!cellContent.includes('Watched')) {
      continue;
    }

    // Extract video link and title: first <a> tag after "Watched"
    const videoLinkMatch = cellContent.match(/Watched\s*<a\s+href="(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=[^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!videoLinkMatch) {
      // May be a Short or non-standard entry
      const shortsMatch = cellContent.match(/Watched\s*<a\s+href="(https?:\/\/(?:www\.)?youtube\.com\/shorts\/[^"]+)"[^>]*>([^<]+)<\/a>/);
      if (shortsMatch) {
        const videoUrl = shortsMatch[1];
        const videoTitle = decodeHTMLEntities(shortsMatch[2]);
        const videoId = extractVideoId(videoUrl);

        if (!videoId) continue;

        // Extract channel link
        const channelMatch = cellContent.match(/<a\s+href="(https?:\/\/(?:www\.)?youtube\.com\/channel\/[^"]+)"[^>]*>([^<]+)<\/a>/);
        const channelUrl = channelMatch ? channelMatch[1] : '';
        const channelName = channelMatch ? decodeHTMLEntities(channelMatch[2]) : 'Unknown';
        const channelId = channelMatch ? extractChannelId(channelMatch[1]) : '';

        // Extract timestamp — last text line (after final <br>)
        const timestampMatch = cellContent.match(/<br>\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*\w*)/);
        const timestamp = timestampMatch ? parseTimestamp(timestampMatch[1]) : null;

        if (!timestamp) continue;

        skippedShorts++;
        entries.push({
          video_title: videoTitle,
          video_url: videoUrl,
          video_id: videoId,
          channel_name: channelName,
          channel_url: channelUrl,
          channel_id: channelId,
          timestamp,
          is_short: true,
          is_ad: false,
          is_deleted: false,
        });
        continue;
      }
      continue;
    }

    const videoUrl = videoLinkMatch[1];
    const videoTitle = decodeHTMLEntities(videoLinkMatch[2]);
    const videoId = extractVideoId(videoUrl);

    if (!videoId) continue;

    // Extract channel link: second <a> tag pointing to a channel
    const channelMatch = cellContent.match(/<a\s+href="(https?:\/\/(?:www\.)?youtube\.com\/channel\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    const channelUrl = channelMatch ? channelMatch[1] : '';
    const channelName = channelMatch ? decodeHTMLEntities(channelMatch[2]) : 'Unknown';
    const channelId = channelMatch ? extractChannelId(channelMatch[1]) : '';

    // Extract timestamp — text after the last <br> tag
    const timestampMatch = cellContent.match(/<br>\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)\s*\w*)/);
    const timestamp = timestampMatch ? parseTimestamp(timestampMatch[1]) : null;

    if (!timestamp) continue;

    // Detect shorts by URL or raw URL title
    const isShort = isShortUrl(videoUrl) || isRawUrlTitle(videoTitle);
    if (isShort) skippedShorts++;

    entries.push({
      video_title: videoTitle,
      video_url: videoUrl,
      video_id: videoId,
      channel_name: channelName,
      channel_url: channelUrl,
      channel_id: channelId,
      timestamp,
      is_short: isShort,
      is_ad: false,
      is_deleted: false,
    });
  }

  // Compute metadata
  const uniqueChannels = new Set(entries.map(e => e.channel_id));
  const uniqueVideos = new Set(entries.map(e => e.video_id));
  const timestamps = entries.map(e => e.timestamp.getTime()).filter(t => !isNaN(t));

  const metadata = {
    totalParsed: entries.length,
    dateRange: {
      earliest: timestamps.length > 0 ? new Date(Math.min(...timestamps)) : new Date(),
      latest: timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date(),
    },
    uniqueChannels: uniqueChannels.size,
    uniqueVideos: uniqueVideos.size,
    skippedAds,
    skippedDeleted,
    skippedShorts,
  };

  return { entries, metadata };
}

/**
 * Deduplicate entries by video_id
 * Collapses multiple views into single records with view counts
 */
export function deduplicateEntries(entries: WatchHistoryEntry[]): DeduplicatedEntry[] {
  const map = new Map<string, DeduplicatedEntry>();

  for (const entry of entries) {
    const existing = map.get(entry.video_id);
    if (existing) {
      existing.view_count++;
      existing.timestamps.push(entry.timestamp);
      if (entry.timestamp < existing.first_watched) {
        existing.first_watched = entry.timestamp;
      }
      if (entry.timestamp > existing.last_watched) {
        existing.last_watched = entry.timestamp;
      }
    } else {
      map.set(entry.video_id, {
        video_title: entry.video_title,
        video_url: entry.video_url,
        video_id: entry.video_id,
        channel_name: entry.channel_name,
        channel_url: entry.channel_url,
        channel_id: entry.channel_id,
        is_short: entry.is_short,
        view_count: 1,
        first_watched: entry.timestamp,
        last_watched: entry.timestamp,
        timestamps: [entry.timestamp],
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Apply user-configured filters to deduplicated entries
 */
export function applyFilters(
  entries: DeduplicatedEntry[],
  filters: WatchHistoryFilters
): DeduplicatedEntry[] {
  let filtered = entries;

  // Filter shorts
  if (!filters.includeShorts) {
    filtered = filtered.filter(e => !e.is_short);
  }

  // Filter by date range
  if (filters.dateRange.start) {
    const start = filters.dateRange.start.getTime();
    filtered = filtered.filter(e => e.last_watched.getTime() >= start);
  }
  if (filters.dateRange.end) {
    const end = filters.dateRange.end.getTime();
    filtered = filtered.filter(e => e.first_watched.getTime() <= end);
  }

  // Filter by minimum view count
  if (filters.minViewCount > 1) {
    filtered = filtered.filter(e => e.view_count >= filters.minViewCount);
  }

  // Filter by channel blocklist
  if (filters.channelBlocklist.length > 0) {
    const blockSet = new Set(filters.channelBlocklist);
    filtered = filtered.filter(e => !blockSet.has(e.channel_id));
  }

  // Filter by minimum channel frequency
  if (filters.minChannelFrequency > 1) {
    const channelCounts = new Map<string, number>();
    for (const e of filtered) {
      channelCounts.set(e.channel_id, (channelCounts.get(e.channel_id) || 0) + 1);
    }
    filtered = filtered.filter(e => (channelCounts.get(e.channel_id) || 0) >= filters.minChannelFrequency);
  }

  return filtered;
}

/**
 * Get top channels by video count from deduplicated entries
 */
export function getTopChannels(
  entries: DeduplicatedEntry[],
  limit: number = 10
): { channel_id: string; channel_name: string; video_count: number; total_views: number }[] {
  const channelMap = new Map<string, { channel_name: string; video_count: number; total_views: number }>();

  for (const entry of entries) {
    const existing = channelMap.get(entry.channel_id);
    if (existing) {
      existing.video_count++;
      existing.total_views += entry.view_count;
    } else {
      channelMap.set(entry.channel_id, {
        channel_name: entry.channel_name,
        video_count: 1,
        total_views: entry.view_count,
      });
    }
  }

  return Array.from(channelMap.entries())
    .map(([channel_id, data]) => ({ channel_id, ...data }))
    .sort((a, b) => b.total_views - a.total_views)
    .slice(0, limit);
}
