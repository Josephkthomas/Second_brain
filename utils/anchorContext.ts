import { AnchorNode } from '../types';

export interface AnchorContextOptions {
  includeStrength?: boolean;
  includeTypes?: boolean;
  maxAnchors?: number;
}

/**
 * Builds a formatted context string from anchor nodes for AI extraction
 * Similar pattern to buildProfileContext
 */
export function buildAnchorContext(
  anchors: AnchorNode[] | any[],
  options: AnchorContextOptions = {
    includeStrength: true,
    includeTypes: true,
    maxAnchors: 15
  }
): string {
  if (!anchors || anchors.length === 0) return '';

  // Limit number of anchors if specified
  let anchorList = anchors;
  if (options.maxAnchors && anchors.length > options.maxAnchors) {
    // Prioritize by strength if available, otherwise by creation date
    anchorList = [...anchors]
      .sort((a, b) => {
        const strengthA = a.anchor_strength || 0;
        const strengthB = b.anchor_strength || 0;
        if (strengthA !== strengthB) return strengthB - strengthA;
        // If no anchor_created_at, use a default
        const dateA = a.anchor_created_at ? new Date(a.anchor_created_at).getTime() : 0;
        const dateB = b.anchor_created_at ? new Date(b.anchor_created_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, options.maxAnchors);
  }

  const anchorDescriptions = anchorList.map(anchor => {
    let desc = `- "${anchor.label}"`;

    if (options.includeTypes && anchor.entity_type) {
      desc += ` (${anchor.entity_type})`;
    }

    if (options.includeStrength && anchor.anchor_strength) {
      desc += ` [Priority: ${anchor.anchor_strength}/5]`;
    }

    if (anchor.description) {
      // Truncate long descriptions
      const truncatedDesc = anchor.description.length > 100
        ? anchor.description.slice(0, 100) + '...'
        : anchor.description;
      desc += ` - ${truncatedDesc}`;
    }

    return desc;
  });

  return `

## User's Anchor Concepts
The user has designated the following entities as "anchors" - these represent their primary areas of focus and ongoing interest. When extracting entities and relationships, actively look for connections to these anchor concepts:

${anchorDescriptions.join('\n')}

### Extraction Guidance for Anchors:
- For each extracted entity, consider if it relates to any of the above anchors
- If a relationship exists, create an explicit edge with an appropriate relationship type
- Prioritize identifying connections to higher-priority anchors (higher numbers)
- Don't force connections that don't exist, but be thorough in looking for them
- Anchors help identify what matters most to the user`;
}

/**
 * Helper to check if there are any anchors
 */
export function hasAnchors(anchors: AnchorNode[] | any[] | null): boolean {
  return anchors != null && anchors.length > 0;
}

/**
 * Get anchor context with different emphasis levels
 */
export function buildAnchorContextWithEmphasis(
  anchors: AnchorNode[] | any[],
  emphasis: 'standard' | 'aggressive' | 'passive' = 'standard'
): string {
  if (!anchors || anchors.length === 0) return '';

  const baseContext = buildAnchorContext(anchors);

  switch (emphasis) {
    case 'aggressive':
      return baseContext + `

IMPORTANT: Make connecting to anchor concepts a HIGH priority. The user wants to build their knowledge graph around these focal points. Actively create edges linking new entities to relevant anchors.`;

    case 'passive':
      return baseContext.replace(
        'actively look for connections',
        'note any obvious connections'
      ).replace(
        'be thorough in looking for them',
        'only note clear, direct connections'
      );

    case 'standard':
    default:
      return baseContext;
  }
}
