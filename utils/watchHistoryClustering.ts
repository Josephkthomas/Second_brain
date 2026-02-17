// Watch History Clustering & Batching
// PRD Section 7: Stage 3 — Clustering & Batching
// Client-side logic that groups videos into thematic batches for extraction

import type { DeduplicatedEntry, VideoBatch, ChannelTagInfo } from '../types/watchHistory';

const MAX_BATCH_SIZE = 100; // Max video titles per batch
const MIN_CHANNEL_CLUSTER_SIZE = 10; // Minimum unique videos for a channel to get its own batch

/**
 * Generate a unique batch ID
 */
function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get the date range from a list of entries
 */
function getDateRange(entries: DeduplicatedEntry[]): { start: Date; end: Date } {
  let earliest = entries[0]?.first_watched || new Date();
  let latest = entries[0]?.last_watched || new Date();

  for (const entry of entries) {
    if (entry.first_watched < earliest) earliest = entry.first_watched;
    if (entry.last_watched > latest) latest = entry.last_watched;
  }

  return { start: earliest, end: latest };
}

/**
 * Split an array of entries into sub-batches of max size
 */
function splitIntoBatches(entries: DeduplicatedEntry[], maxSize: number): DeduplicatedEntry[][] {
  const batches: DeduplicatedEntry[][] = [];
  for (let i = 0; i < entries.length; i += maxSize) {
    batches.push(entries.slice(i, i + maxSize));
  }
  return batches;
}

/**
 * Tier 1: Channel-Based Clusters
 * Channels with 10+ unique videos become their own batch(es)
 */
export function buildChannelClusters(
  entries: DeduplicatedEntry[],
  minSize: number = MIN_CHANNEL_CLUSTER_SIZE
): { batches: VideoBatch[]; remaining: DeduplicatedEntry[] } {
  // Group by channel
  const channelMap = new Map<string, DeduplicatedEntry[]>();
  for (const entry of entries) {
    const list = channelMap.get(entry.channel_id) || [];
    list.push(entry);
    channelMap.set(entry.channel_id, list);
  }

  const batches: VideoBatch[] = [];
  const remaining: DeduplicatedEntry[] = [];

  for (const [channelId, channelEntries] of channelMap) {
    if (channelEntries.length >= minSize) {
      // This channel qualifies for its own batch(es)
      const channelName = channelEntries[0].channel_name;
      const subBatches = splitIntoBatches(channelEntries, MAX_BATCH_SIZE);

      for (let i = 0; i < subBatches.length; i++) {
        const sub = subBatches[i];
        const totalViews = sub.reduce((sum, e) => sum + e.view_count, 0);
        const label = subBatches.length > 1
          ? `${channelName} (Part ${i + 1})`
          : channelName;

        batches.push({
          batch_id: generateBatchId(),
          batch_type: 'channel',
          label,
          entries: sub,
          total_views: totalViews,
          channel_names: [channelName],
          channel_tags: [],
          date_range: getDateRange(sub),
        });
      }
    } else {
      remaining.push(...channelEntries);
    }
  }

  return { batches, remaining };
}

/**
 * Extract the topic name from a Wikidata URL
 * e.g., "https://en.wikipedia.org/wiki/Artificial_intelligence" → "Artificial intelligence"
 */
function extractTopicFromUrl(url: string): string {
  const match = url.match(/\/wiki\/(.+)$/);
  if (!match) return 'Other';
  return decodeURIComponent(match[1]).replace(/_/g, ' ');
}

/**
 * Tier 2: YouTube API Tag-Enriched Thematic Clusters
 * Groups remaining entries by their channel's topic categories
 */
export function buildThematicClusters(
  entries: DeduplicatedEntry[],
  channelTags: Map<string, ChannelTagInfo>
): { batches: VideoBatch[]; remaining: DeduplicatedEntry[] } {
  // Group entries by primary topic category
  const topicGroups = new Map<string, DeduplicatedEntry[]>();
  const remaining: DeduplicatedEntry[] = [];

  for (const entry of entries) {
    const tags = channelTags.get(entry.channel_id);
    if (tags && tags.topicCategories.length > 0) {
      // Use first (primary) topic category
      const primaryTopic = extractTopicFromUrl(tags.topicCategories[0]);
      const list = topicGroups.get(primaryTopic) || [];
      list.push(entry);
      topicGroups.set(primaryTopic, list);
    } else {
      // No topic data — falls through to Tier 3
      remaining.push(entry);
    }
  }

  const batches: VideoBatch[] = [];

  for (const [topic, topicEntries] of topicGroups) {
    const subBatches = splitIntoBatches(topicEntries, MAX_BATCH_SIZE);

    for (let i = 0; i < subBatches.length; i++) {
      const sub = subBatches[i];
      const totalViews = sub.reduce((sum, e) => sum + e.view_count, 0);
      const uniqueChannels = [...new Set(sub.map(e => e.channel_name))];

      // Aggregate tags from all channels in this batch
      const allTags = new Set<string>();
      for (const entry of sub) {
        const tags = channelTags.get(entry.channel_id);
        if (tags) {
          tags.tags.forEach(t => allTags.add(t));
        }
      }

      const label = subBatches.length > 1
        ? `${topic} (Part ${i + 1})`
        : topic;

      batches.push({
        batch_id: generateBatchId(),
        batch_type: 'thematic',
        label,
        entries: sub,
        total_views: totalViews,
        channel_names: uniqueChannels,
        channel_tags: Array.from(allTags).slice(0, 20),
        date_range: getDateRange(sub),
      });
    }
  }

  return { batches, remaining };
}

/**
 * Get the quarter label for a date
 */
function getQuarterLabel(date: Date): string {
  const year = date.getFullYear();
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return `Q${quarter} ${year}`;
}

/**
 * Tier 3: Temporal Fallback Clusters
 * Groups remaining entries by calendar quarter
 */
export function buildTemporalClusters(entries: DeduplicatedEntry[]): VideoBatch[] {
  // Group by quarter
  const quarterMap = new Map<string, DeduplicatedEntry[]>();

  for (const entry of entries) {
    const quarter = getQuarterLabel(entry.last_watched);
    const list = quarterMap.get(quarter) || [];
    list.push(entry);
    quarterMap.set(quarter, list);
  }

  const batches: VideoBatch[] = [];

  for (const [quarter, quarterEntries] of quarterMap) {
    const subBatches = splitIntoBatches(quarterEntries, MAX_BATCH_SIZE);

    for (let i = 0; i < subBatches.length; i++) {
      const sub = subBatches[i];
      const totalViews = sub.reduce((sum, e) => sum + e.view_count, 0);
      const uniqueChannels = [...new Set(sub.map(e => e.channel_name))];

      const label = subBatches.length > 1
        ? `${quarter} — Mixed (Part ${i + 1})`
        : `${quarter} — Mixed`;

      batches.push({
        batch_id: generateBatchId(),
        batch_type: 'temporal',
        label,
        entries: sub,
        total_views: totalViews,
        channel_names: uniqueChannels,
        channel_tags: [],
        date_range: getDateRange(sub),
      });
    }
  }

  return batches;
}

/**
 * Main clustering orchestrator
 * Runs all three tiers in sequence: Channel → Thematic → Temporal
 */
export function clusterAndBatch(
  entries: DeduplicatedEntry[],
  channelTags: Map<string, ChannelTagInfo>
): VideoBatch[] {
  // Tier 1: Channel-based clusters
  const { batches: channelBatches, remaining: afterChannel } = buildChannelClusters(entries);

  // Tier 2: Tag-enriched thematic clusters (for remaining entries)
  const { batches: thematicBatches, remaining: afterThematic } = buildThematicClusters(afterChannel, channelTags);

  // Tier 3: Temporal fallback (for any still remaining)
  const temporalBatches = afterThematic.length > 0
    ? buildTemporalClusters(afterThematic)
    : [];

  return [...channelBatches, ...thematicBatches, ...temporalBatches];
}
