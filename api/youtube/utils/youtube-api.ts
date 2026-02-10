// YouTube Data API v3 utilities
// Uses the official API for reliable video metadata including duration

/**
 * Parse ISO 8601 duration to seconds
 * Examples: PT1H2M3S -> 3723, PT5M30S -> 330, PT45S -> 45
 */
export function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Fetch video durations using YouTube Data API v3
 *
 * @param videoIds - Array of YouTube video IDs (max 50 per request)
 * @param apiKey - YouTube Data API key
 * @returns Map of videoId -> duration in seconds
 */
export async function fetchVideoDurationsFromAPI(
  videoIds: string[],
  apiKey: string
): Promise<Map<string, number | null>> {
  const results = new Map<string, number | null>();

  if (!apiKey || videoIds.length === 0) {
    return results;
  }

  // YouTube API allows max 50 videos per request
  const batches: string[][] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    batches.push(videoIds.slice(i, i + 50));
  }

  for (const batch of batches) {
    try {
      const ids = batch.join(',');
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${apiKey}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[YouTube API] Error fetching durations:', response.status, errorData);

        // If API key is invalid or quota exceeded, mark all as null
        for (const id of batch) {
          results.set(id, null);
        }
        continue;
      }

      const data = await response.json();

      // Process each video in the response
      for (const item of data.items || []) {
        const duration = item.contentDetails?.duration;
        if (duration) {
          results.set(item.id, parseISO8601Duration(duration));
        } else {
          results.set(item.id, null);
        }
      }

      // Mark any videos not in response as null (deleted/private)
      for (const id of batch) {
        if (!results.has(id)) {
          results.set(id, null);
        }
      }

    } catch (error) {
      console.error('[YouTube API] Error:', error);
      // Mark all videos in this batch as null
      for (const id of batch) {
        results.set(id, null);
      }
    }
  }

  return results;
}

/**
 * Get duration for a single video using YouTube Data API
 */
export async function getVideoDurationFromAPI(
  videoId: string,
  apiKey: string
): Promise<number | null> {
  const results = await fetchVideoDurationsFromAPI([videoId], apiKey);
  return results.get(videoId) ?? null;
}
