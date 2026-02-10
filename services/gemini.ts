import { GoogleGenAI, Type } from "@google/genai";
import { TableRow, AnalysisResult, AnchorNode } from "../types";
import { fetchRelevantNodes, fetchNodeNeighbors, semanticSearchNodes, fetchNodesWithoutEmbeddings, updateNodeEmbedding, countNodesWithoutEmbeddings, fetchUserProfile } from "./supabase";
import { buildProfileContext } from "../utils/profileContext";
import { getAnchors } from "./anchorService";
import { buildAnchorContext, hasAnchors } from "../utils/anchorContext";
import { buildExtractionPrompt, type PromptBuilderConfig } from "../utils/promptBuilder";
import type { ExtractionSessionConfig, ExtractionMode, AnchorEmphasis } from "../types/extraction";

const initGenAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Gemini API Key is missing. Checked: process.env.API_KEY, process.env.GEMINI_API_KEY");
    throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

// Helper for robust JSON parsing
const cleanAndParseJSON = (text: string) => {
  if (!text) return {};
  
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    return JSON.parse(clean);
  } catch (e) {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const sub = clean.substring(start, end + 1);
      try { return JSON.parse(sub); } catch (e2) { }
    }
    const startArr = clean.indexOf('[');
    const endArr = clean.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      const sub = clean.substring(startArr, endArr + 1);
      try { return JSON.parse(sub); } catch (e3) { }
    }
    throw new Error(`JSON Parse Error: ${(e as Error).message}`);
  }
};

// --- NEW: VECTOR EMBEDDING SERVICE ---

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const ai = initGenAI();
  try {
    // Note: Use text-embedding-004 for 768-dimensional vectors
    // Correct parameter is 'contents' (plural), similar to generateContent
    const result = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: text,
    });
    return result.embedding?.values || [];
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return [];
  }
};

// --- NEW: ENTITY RESOLUTION GATEKEEPER ---

export const resolveEntityMatch = async (
  newNode: { label: string, type: string, description: string },
  existingNode: { label: string, entity_type: string, description: string }
): Promise<boolean> => {
  const ai = initGenAI();

  const prompt = `
    I need to check for duplicates in my Knowledge Graph.
    
    NEW NODE:
    Label: "${newNode.label}"
    Type: "${newNode.type}"
    Description: "${newNode.description}"

    EXISTING DATABASE NODE:
    Label: "${existingNode.label}"
    Type: "${existingNode.entity_type}"
    Description: "${existingNode.description}"

    TASK:
    Are these referring to the exact same specific entity? 
    - "Elon Musk" and "Elon R. Musk" -> YES.
    - "Project Apollo" (User's project) and "Project Apollo" (NASA) -> NO (Different context).
    - "Budget" (Q3) and "Budget" (Q4) -> NO.
    
    Respond with JSON: { "isMatch": boolean, "reason": string }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMatch: { type: Type.BOOLEAN },
            reason: { type: Type.STRING }
          }
        }
      }
    });
    const result = cleanAndParseJSON(response.text || '{}');
    return result.isMatch === true;
  } catch (e) {
    console.error("Entity Resolution Failed", e);
    return false; // Fail safe: assume not a match to avoid data loss
  }
};

// ... [Existing Analysis functions: analyzeTableData - kept identical] ...
export const analyzeTableData = async (tableName: string, data: TableRow[]): Promise<AnalysisResult> => {
  const ai = initGenAI();
  const sampleData = data.slice(0, 10);

  const prompt = `
    Analyze the following database table data.
    Table Name: "${tableName}"
    Sample Data (JSON):
    ${JSON.stringify(sampleData, null, 2)}

    Please provide:
    1. A brief summary of what this data appears to represent (1-2 sentences).
    2. Three interesting insights or potential data quality observations.
    
    Return the response as a JSON object with 'summary' and 'insights' array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            insights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['info', 'warning', 'success'] }
                }
              }
            }
          }
        }
      }
    });

    return cleanAndParseJSON(response.text || '{}');
  } catch (error) {
    return {
      summary: "Failed to generate analysis.",
      insights: []
    };
  }
};

export interface ExtractedGraph {
  metadata: {
    sourceTitle: string;
    sourceType: string;
    sourceUrl?: string;
    thumbnailUrl?: string;
  };
  nodes: { 
    label: string; 
    type: string; 
    description: string; 
    confidence: number;
    tags: string[];
    quote: string;
  }[];
  edges: { 
    source: string; 
    target: string; 
    relation: string; 
    evidence: string;
  }[];
  searchQueries: string[];
}

export interface ExtractionContext {
  type: 'Meeting' | 'YouTube' | 'Note' | 'Research' | 'Document';
  title?: string;
  url?: string;
  customInstructions?: string;
  // PRD 3: Extraction configuration options
  extractionConfig?: ExtractionSessionConfig;
}

const COMMON_RELATIONS = [
  "authored", "mentions", "relates_to", "part_of", "leads_to", 
  "blocks", "supports", "contradicts", "owns", "depends_on", "defines"
];

// ... [performDeepResearch, transcribeAudio, generateSmartSuggestions - Kept Identical] ...

export const performDeepResearch = async (
  query: string, 
  focus: 'web' | 'academic' | 'video' | 'social',
  depth: 'fast' | 'deep'
): Promise<{ content: string; title: string; sourceUrl: string; sources: { title: string; uri: string }[] }> => {
  const ai = initGenAI();
  
  let systemInstruction = `You are a specialized Research Agent. Your goal is to gather accurate information on the topic: "${query}".`;
  
  if (focus === 'academic') systemInstruction += " Prioritize academic papers, journals, and technical documentation.";
  if (focus === 'video') systemInstruction += " Prioritize video transcripts, tutorials, and visual content descriptions.";
  if (focus === 'social') systemInstruction += " Prioritize public sentiment, discussions, and social media trends.";
  
  if (depth === 'deep') {
    systemInstruction += " perform a COMPREHENSIVE deep dive. Provide detailed explanations, historical context, and technical specifics. The output should be extensive.";
  } else {
    systemInstruction += " Provide a concise, high-level overview of the key facts.";
  }

  const prompt = `Research the topic: ${query}. Use Google Search to ground your response.`;

  try {
    const response = await ai.models.generateContent({
      model: depth === 'deep' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }], 
      }
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    let topUrl = "";
    
    const sourcesMap = new Map<string, string>();
    chunks.forEach((c: any) => {
        if (c.web?.uri) {
            sourcesMap.set(c.web.uri, c.web.title || "Web Source");
        }
    });
    
    const sources = Array.from(sourcesMap.entries()).map(([uri, title]) => ({ title, uri }));
    if (sources.length > 0) topUrl = sources[0].uri;

    return {
      content: response.text || "No results found.",
      title: `Research: ${query}`,
      sourceUrl: topUrl || "Google Search",
      sources: sources
    };

  } catch (error) {
    console.error("Deep Research Failed:", error);
    throw new Error("Research module unavailable.");
  }
};

export const transcribeAudio = async (base64Audio: string, mimeType: string = 'audio/webm'): Promise<string> => {
  const ai = initGenAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [{ inlineData: { mimeType, data: base64Audio } }, { text: "Transcribe the audio exactly as spoken." }]
      }
    });
    return response.text || "";
  } catch (error) { return ""; }
};

export const generateSmartSuggestions = async (
  existingNodes: { label: string; entity_type: string; description?: string }[]
): Promise<{ label: string; type: string; reason: string }[]> => {
  const ai = initGenAI();
  if (existingNodes.length === 0) {
    return [
      { label: "Emerging trends in AI", type: "Exploration", reason: "Start building your graph" },
      { label: "Renewable Energy players", type: "Analysis", reason: "Start building your graph" },
    ];
  }
  const contextList = existingNodes.slice(0, 50).map(n => `- ${n.label} (${n.entity_type})`).join("\n");
  const systemInstruction = `
    You are a Strategic Intelligence Analyst. Analyze the user's current knowledge base and suggest 4 high-value research topics.
    Output: JSON Array { "label": string, "type": "Gap"|"Synergy"|"Deep Dive", "reason": string }.
  `;
  const prompt = `Current Knowledge Graph Nodes:\n${contextList}\nWhat should the user research next?`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { label: { type: Type.STRING }, type: { type: Type.STRING }, reason: { type: Type.STRING } }
          }
        }
      }
    });
    return cleanAndParseJSON(response.text || '[]');
  } catch (error) { return []; }
};

const EXTRACTION_SYSTEM_INSTRUCTION = `
# Role: Elite Knowledge Graph Engineer
You are an advanced AI system designed to exhaustively mine unstructured text and structure it into a high-fidelity Knowledge Graph. 
Your goal is **Total Information Capture**.

## Ontology
- **Person**, **Organization**, **Topic**, **Project**, **Goal**
- **Decision**, **Action**, **Insight**, **Hypothesis**, **Question**
- **Risk**, **Blocker**, **Achievement**, **Feedback**

## Rules
- **Specificity**: Never use generic labels. "Q3 Budget", not "Budget".
- **Quotes**: Extract verbatim evidence for every node.
- **Search Tags**: Generate 3-5 keywords for retrieval.
`;

const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        sourceTitle: { type: Type.STRING },
        sourceType: { type: Type.STRING },
        sourceUrl: { type: Type.STRING },
        thumbnailUrl: { type: Type.STRING }
      },
      required: ["sourceTitle", "sourceType"]
    },
    searchQueries: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          type: { type: Type.STRING },
          description: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          quote: { type: Type.STRING }
        },
        required: ["label", "type", "description", "confidence"]
      }
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING },
          relation: { type: Type.STRING },
          evidence: { type: Type.STRING }
        }
      }
    }
  }
};

export const extractKnowledgeFromText = async (text: string, context?: ExtractionContext): Promise<ExtractedGraph> => {
  const ai = initGenAI();

  // Build system prompt using PRD 3 prompt builder if extraction config is provided
  let systemPrompt: string;

  // Always fetch profile and anchors
  const userProfile = await fetchUserProfile();
  let anchors: AnchorNode[] = [];
  try {
    anchors = await getAnchors();
  } catch (err) {
    console.warn('Failed to load anchors:', err);
  }

  if (context?.extractionConfig) {
    // Use new PRD 3 prompt builder
    const config: PromptBuilderConfig = {
      mode: context.extractionConfig.mode,
      anchorEmphasis: context.extractionConfig.anchorEmphasis,
      profile: userProfile,
      anchors: anchors,
      selectedAnchorIds: context.extractionConfig.selectedAnchorIds,
      userGuidance: context.extractionConfig.userGuidance,
      contextHeader: context ? `Source Type: ${context.type}, Title: ${context.title || "Unknown"}${context.url ? `, URL: ${context.url}` : ''}` : undefined
    };
    systemPrompt = buildExtractionPrompt(config);
  } else {
    // Fallback to legacy behavior for backward compatibility
    let contextHeader = context ? `USER CONTEXT: Type: ${context.type}, Title: ${context.title || "Unknown"}` : "";
    if (context?.customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\nThe user has provided specific guidance for this extraction. Follow these rules STRICTLY:\n"${context.customInstructions}"\n`;
    }
    const profileContext = buildProfileContext(userProfile);
    const anchorContext = hasAnchors(anchors) ? buildAnchorContext(anchors) : '';
    systemPrompt = EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader + profileContext + anchorContext;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Input Text:\n"""\n${text.slice(0, 25000)}\n"""`,
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const result = cleanAndParseJSON(response.text || '{}');
    if (!result.metadata) result.metadata = { sourceTitle: context?.title || "Untitled", sourceType: context?.type || "Other" };

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    throw error;
  }
};

export const extractKnowledgeFromFile = async (
  base64Data: string,
  mimeType: string,
  filename: string,
  customInstructions?: string,
  extractionConfig?: ExtractionSessionConfig
): Promise<ExtractedGraph> => {
  const ai = initGenAI();

  // Always fetch profile and anchors
  const userProfile = await fetchUserProfile();
  let anchors: AnchorNode[] = [];
  try {
    anchors = await getAnchors();
  } catch (err) {
    console.warn('Failed to load anchors:', err);
  }

  let systemPrompt: string;

  if (extractionConfig) {
    // Use new PRD 3 prompt builder
    const config: PromptBuilderConfig = {
      mode: extractionConfig.mode,
      anchorEmphasis: extractionConfig.anchorEmphasis,
      profile: userProfile,
      anchors: anchors,
      selectedAnchorIds: extractionConfig.selectedAnchorIds,
      userGuidance: extractionConfig.userGuidance || customInstructions,
      contextHeader: `Document: ${filename}`
    };
    systemPrompt = buildExtractionPrompt(config);
  } else {
    // Fallback to legacy behavior
    let contextHeader = `USER CONTEXT: Filename: ${filename}`;
    if (customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\n"${customInstructions}"\n`;
    }
    const profileContext = buildProfileContext(userProfile);
    const anchorContext = hasAnchors(anchors) ? buildAnchorContext(anchors) : '';
    systemPrompt = EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader + profileContext + anchorContext;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType } },
          { text: "Extract comprehensive knowledge graph nodes and edges from this document." }
        ]
      },
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const result = cleanAndParseJSON(response.text || '{}');
    if (!result.metadata) result.metadata = { sourceTitle: filename, sourceType: 'Document' };

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    throw error;
  }
};

export const extractKnowledgeFromWeb = async (
  url: string,
  title?: string,
  customInstructions?: string,
  extractionConfig?: ExtractionSessionConfig
): Promise<ExtractedGraph> => {
  const ai = initGenAI();

  // Always fetch profile and anchors
  const userProfile = await fetchUserProfile();
  let anchors: AnchorNode[] = [];
  try {
    anchors = await getAnchors();
  } catch (err) {
    console.warn('Failed to load anchors:', err);
  }

  let systemPrompt: string;

  if (extractionConfig) {
    // Use new PRD 3 prompt builder
    const config: PromptBuilderConfig = {
      mode: extractionConfig.mode,
      anchorEmphasis: extractionConfig.anchorEmphasis,
      profile: userProfile,
      anchors: anchors,
      selectedAnchorIds: extractionConfig.selectedAnchorIds,
      userGuidance: extractionConfig.userGuidance || customInstructions,
      contextHeader: `Web URL: ${url}${title ? `, Title: ${title}` : ''}`
    };
    systemPrompt = buildExtractionPrompt(config);
  } else {
    // Fallback to legacy behavior
    let contextHeader = `Target URL: ${url}`;
    if (customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\n"${customInstructions}"\n`;
    }
    const profileContext = buildProfileContext(userProfile);
    const anchorContext = hasAnchors(anchors) ? buildAnchorContext(anchors) : '';
    systemPrompt = EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader + profileContext + anchorContext;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Deep read this URL: ${url}. Extract knowledge.`,
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const result = cleanAndParseJSON(response.text || '{}');
    if (!result.metadata) result.metadata = { sourceTitle: title || "Web Research", sourceType: 'Research', sourceUrl: url };

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    throw error;
  }
};

// ... [Agents 2, 3, 4 - kept identical] ...
export const generateCrossConnections = async (
  newNodes: { label: string; type: string; description: string }[],
  existingNodes: { label: string; entity_type: string }[],
  anchors: { label: string; entity_type: string; description?: string }[] = []
) => {
  if (newNodes.length === 0 || (existingNodes.length === 0 && anchors.length === 0)) return [];
  const ai = initGenAI();

  const systemInstruction = `
    Role: Agent 2 – Knowledge Graph Weaver.
    Goal: Connect NEW nodes with EXISTING nodes and ANCHORS.
    Output: JSON Array of edges.
  `;
  const newNodesList = newNodes.map(n => `${n.label} (${n.type}): ${n.description}`).join("\n");
  const existingNodesList = existingNodes.map(n => `${n.label} (${n.entity_type})`).join("\n");
  const anchorsList = anchors.map(n => `[ANCHOR] ${n.label}`).join("\n");

  const prompt = `NEW NODES:\n${newNodesList}\n\nANCHORS:\n${anchorsList}\n\nCONTEXT:\n${existingNodesList}\n\nGenerate connections.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.2,
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                relation: { type: Type.STRING },
                evidence: { type: Type.STRING }
              }
            }
        }
      }
    });
    return cleanAndParseJSON(response.text || '[]');
  } catch (error) { return []; }
};

export const connectAnchorToKnowledge = async (
  anchor: { label: string; type: string; description: string },
  existingNodes: { id: string; label: string; entity_type: string; description?: string }[]
) => {
    // ... [Same implementation as before] ...
    if (existingNodes.length === 0) return [];
    const ai = initGenAI();
    const systemInstruction = `Role: Agent 3 – Retroactive Linker. Connect NEW ANCHOR to EXISTING NODES.`;
    const existingNodesList = existingNodes.map(n => `[ID: ${n.id}] ${n.label} (${n.entity_type}): ${n.description}`).join("\n");
    const prompt = `ANCHOR: ${anchor.label}\nCONTEXT:\n${existingNodesList}`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.2,
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: { target_node_id: { type: Type.STRING }, relation: { type: Type.STRING }, evidence: { type: Type.STRING } }
                    }
                }
            }
        });
        return cleanAndParseJSON(response.text || '[]');
    } catch (e) { return []; }
};

// --- COMPREHENSIVE ANCHOR SCAN TYPES AND FUNCTION ---

/**
 * A potential connection candidate discovered during comprehensive scan
 */
export interface ConnectionCandidate {
  target_node_id: string;
  target_label: string;
  target_type: string;
  relation: string;
  evidence: string;
  confidence: number;
  similarity_score?: number;
}

/**
 * Progress tracking for batched anchor scanning
 */
export interface BatchScanProgress {
  phase: 'semantic_search' | 'ai_analysis' | 'complete';
  totalBatches: number;
  currentBatch: number;
  nodesProcessed: number;
  totalNodes: number;
  connectionsFound: number;
  currentBatchLabel?: string;
}

/**
 * Comprehensive anchor-to-knowledge connection analysis
 * Processes nodes in batches with AI-powered relationship discovery
 *
 * @param anchor - The new anchor to find connections for
 * @param nodes - Candidate nodes to analyze (pre-filtered by semantic similarity)
 * @param batchSize - Number of nodes per AI analysis batch (default 40)
 * @param onProgress - Progress callback for UI updates
 * @returns Array of connection candidates sorted by confidence
 */
export const connectAnchorToKnowledgeBatch = async (
  anchor: { label: string; type: string; description: string },
  nodes: { id: string; label: string; entity_type: string; description?: string; similarity_score?: number }[],
  batchSize: number = 40,
  onProgress?: (progress: BatchScanProgress) => void
): Promise<ConnectionCandidate[]> => {
  if (nodes.length === 0) return [];

  const ai = initGenAI();
  const allConnections: ConnectionCandidate[] = [];
  const batches = Math.ceil(nodes.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const batchNodes = nodes.slice(i * batchSize, (i + 1) * batchSize);

    // Report progress
    onProgress?.({
      phase: 'ai_analysis',
      totalBatches: batches,
      currentBatch: i + 1,
      nodesProcessed: i * batchSize,
      totalNodes: nodes.length,
      connectionsFound: allConnections.length,
      currentBatchLabel: batchNodes[0]?.label
    });

    const systemInstruction = `
Role: Agent 3 – Retroactive Linker (Enhanced)

You are analyzing potential connections between a NEW ANCHOR and EXISTING NODES in a knowledge graph.

## Instructions:
1. Evaluate each candidate node for meaningful relationships to the anchor
2. Only include HIGH CONFIDENCE connections (clear semantic or logical relationship)
3. Provide specific evidence explaining WHY they're connected
4. Use relationship types from: ${COMMON_RELATIONS.join(', ')}
5. Assign a confidence score (0.0-1.0) based on relationship strength:
   - 0.9-1.0: Direct, explicit relationship
   - 0.7-0.89: Strong implied relationship
   - 0.6-0.69: Moderate, contextual relationship

## Be SELECTIVE:
- Quality over quantity
- Skip weak or tenuous connections
- Only return connections with confidence >= 0.6
    `;

    const nodesList = batchNodes.map(n =>
      `[ID: ${n.id}] ${n.label} (${n.entity_type}): ${n.description || 'No description'}${n.similarity_score ? ` [Semantic Similarity: ${(n.similarity_score * 100).toFixed(1)}%]` : ''}`
    ).join("\n");

    const prompt = `
ANCHOR TO CONNECT:
Name: ${anchor.label}
Type: ${anchor.type}
Description: ${anchor.description}

CANDIDATE NODES TO EVALUATE (${batchNodes.length} nodes):
${nodesList}

Analyze and return connections with confidence >= 0.6
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          temperature: 0.2,
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                target_node_id: { type: Type.STRING },
                relation: { type: Type.STRING },
                evidence: { type: Type.STRING },
                confidence: { type: Type.NUMBER }
              }
            }
          }
        }
      });

      const batchConnections = cleanAndParseJSON(response.text || '[]');

      // Enrich with node metadata
      for (const conn of batchConnections) {
        const node = batchNodes.find(n => n.id === conn.target_node_id);
        if (node && conn.confidence >= 0.6) {
          allConnections.push({
            target_node_id: conn.target_node_id,
            target_label: node.label,
            target_type: node.entity_type,
            relation: conn.relation,
            evidence: conn.evidence,
            confidence: conn.confidence,
            similarity_score: node.similarity_score
          });
        }
      }

      // Rate limit protection: 1 second delay between batches
      if (i < batches - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

    } catch (error) {
      console.error(`Batch ${i + 1} failed:`, error);
      // Continue with next batch
    }
  }

  // Final progress update
  onProgress?.({
    phase: 'complete',
    totalBatches: batches,
    currentBatch: batches,
    nodesProcessed: nodes.length,
    totalNodes: nodes.length,
    connectionsFound: allConnections.length
  });

  // Sort by confidence descending
  return allConnections.sort((a, b) => b.confidence - a.confidence);
};

export const mineContextFromRawText = async (
  anchor: { label: string; type: string; description: string },
  source: { id: string; title: string; content: string }
): Promise<{ nodes: any[], edges: any[] }> => {
    // ... [Same implementation as before] ...
    const ai = initGenAI();
    const systemInstruction = `Role: Agent 4 – Deep Miner. Retroactively extract nodes relevant to Anchor.`;
    const prompt = `ANCHOR: ${anchor.label}\nTEXT: ${source.content.slice(0, 25000)}`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                temperature: 0.1,
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        nodes: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, type: { type: Type.STRING }, description: { type: Type.STRING }, quote: { type: Type.STRING }, confidence: { type: Type.NUMBER } } } },
                        edges: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { target_label: { type: Type.STRING }, relation: { type: Type.STRING }, evidence: { type: Type.STRING } } } }
                    }
                }
            }
        });
        const result = cleanAndParseJSON(response.text || '{}');
        return { nodes: result.nodes || [], edges: result.edges || [] };
    } catch (e) { return { nodes: [], edges: [] }; }
};

// Simple keyword extraction that doesn't depend on API
const extractKeywordsFromQuery = (query: string): string[] => {
  // Remove common question words and stopwords
  const stopwords = new Set([
    'what', 'can', 'you', 'tell', 'me', 'about', 'the', 'a', 'an', 'is', 'are',
    'how', 'why', 'when', 'where', 'who', 'which', 'do', 'does', 'did', 'have',
    'has', 'had', 'be', 'been', 'being', 'this', 'that', 'these', 'those',
    'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as', 'of', 'in', 'on',
    'at', 'to', 'for', 'with', 'by', 'from', 'it', 'its', 'my', 'your', 'their'
  ]);

  // Split by spaces and common punctuation, keep meaningful words
  const words = query
    .split(/[\s,;:!?]+/)
    .map(w => w.trim())
    .filter(w => w.length > 2 && !stopwords.has(w.toLowerCase()));

  // Also try to find multi-word phrases (e.g., "McKinsey & Company", "AI Learning Lab")
  const phrases: string[] = [];

  // Match quoted phrases or capitalized word sequences
  const phraseMatches = query.match(/[A-Z][a-zA-Z]*(?:\s+(?:&|and)?\s*[A-Z][a-zA-Z]*)*/g);
  if (phraseMatches) {
    phrases.push(...phraseMatches.filter(p => p.length > 2));
  }

  // Combine words and phrases, remove duplicates
  const allTerms = [...new Set([...phrases, ...words])];

  console.log("Extracted search terms:", allTerms);
  return allTerms.length > 0 ? allTerms : [query];
};

const generateSearchQueries = async (userQuery: string): Promise<string[]> => {
    // Primary: Extract keywords directly (fast, reliable, no API dependency)
    const directKeywords = extractKeywordsFromQuery(userQuery);

    // Return direct keywords - no need to wait for API
    // This ensures search always works even if Gemini API is down
    return directKeywords;
};

export const suggestRelationship = async (
  source: { label: string; type: string; description?: string },
  target: { label: string; type: string; description?: string }
): Promise<{ relation: string; evidence: string }> => {
    const ai = initGenAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Source: ${source.label}\nTarget: ${target.label}`,
            config: {
                systemInstruction: `Identify relationship type from: ${COMMON_RELATIONS.join(", ")}.`,
                responseMimeType: 'application/json',
                responseSchema: { type: Type.OBJECT, properties: { relation: { type: Type.STRING }, evidence: { type: Type.STRING } } }
            }
        });
        return cleanAndParseJSON(response.text || '{}');
    } catch (e) { return { relation: 'relates_to', evidence: 'Manual' }; }
};

// --- UPDATED: GRAPH RAG CHAT AGENT (SEMANTIC) ---

export const queryGraphRAG = async (
  query: string,
  mode: 'general' | 'trace',
  traceNodeId?: string
): Promise<{ answer: string; nodes?: any[]; edges?: any[] }> => {
  const ai = initGenAI();
  
  let contextText = "";
  let dataArtifacts: { nodes: any[], edges: any[] } = { nodes: [], edges: [] };
  
  if (mode === 'trace' && traceNodeId) {
    // A. Specific Node Trace (Graph Traversal)
    const { nodes, edges } = await fetchNodeNeighbors(traceNodeId);
    
    if (nodes.length === 0) return { answer: "I couldn't find any information about that specific node in the graph." };
    
    dataArtifacts = { nodes, edges };
    const centralNode = nodes.find(n => n.id === traceNodeId);
    const neighbors = nodes.filter(n => n.id !== traceNodeId);
    
    contextText = `
      FOCUSED NODE: ${centralNode?.label} (${centralNode?.entity_type}) - ${centralNode?.description}
      IMMEDIATE CONNECTIONS:
      ${edges.map(e => {
         const neighborId = e.source_node_id === traceNodeId ? e.target_node_id : e.source_node_id;
         const neighbor = neighbors.find(n => n.id === neighborId);
         const direction = e.source_node_id === traceNodeId ? "->" : "<-";
         return `- ${direction} [${e.relation_type}] ${neighbor?.label} (${neighbor?.entity_type})`;
      }).join('\n')}
    `;
  } else {
    // B. Graph RAG - Keyword Search (Primary) with Semantic Search (Enhancement)
    let nodes: any[] = [];

    // Step 1: Always try keyword search first (reliable, works without embeddings)
    console.log("Performing keyword search for:", query);
    const searchTerms = await generateSearchQueries(query);
    console.log("Generated search terms:", searchTerms);
    nodes = await fetchRelevantNodes(searchTerms);
    console.log("Keyword search found:", nodes.length, "nodes");

    // Step 2: If keyword search found nothing, try semantic search as backup
    if (nodes.length === 0) {
      console.log("Keyword search returned no results, trying semantic search...");
      const queryEmbedding = await generateEmbedding(query);
      if (queryEmbedding.length > 0) {
        nodes = await semanticSearchNodes(queryEmbedding, 0.4, 20);
        console.log("Semantic search found:", nodes.length, "nodes");
      }
    }

    if (nodes.length === 0) {
      return { answer: "I scanned the knowledge graph but didn't find specific nodes matching your query. Try using different keywords or check if the topic exists in your knowledge base." };
    }

    // Step 3: Local Graph Expansion (Fetch edges for top results)
    const topNodes = nodes.slice(0, 8); 
    const edgesPromises = topNodes.map(n => fetchNodeNeighbors(n.id));
    const results = await Promise.all(edgesPromises);
    
    // Flatten results for artifacts
    const allEdges = results.flatMap(r => r.edges);
    const allNodes = [...nodes, ...results.flatMap(r => r.nodes)];
    
    const uniqueNodesMap = new Map();
    allNodes.forEach(n => uniqueNodesMap.set(n.id, n));
    dataArtifacts = { nodes: Array.from(uniqueNodesMap.values()), edges: allEdges };

    contextText = `
      RELEVANT NODES FOUND:
      ${nodes.map(n => `- ${n.label} (${n.entity_type}): ${n.description}`).join('\n')}

      LOCAL CONNECTIVITY SAMPLES:
      ${results.map((r, i) => {
         const node = topNodes[i];
         if(!node) return "";
         return `Node: ${node.label}\nConnections: ${r.edges.slice(0, 3).map(e => `[${e.relation_type}]`).join(', ')}`;
      }).join('\n')}
    `;
  }

  // 2. Synthesis
  const systemInstruction = `
    You are SYNAPSE, an AI interface for a Knowledge Graph.
    Answer based **strictly** on the provided GRAPH CONTEXT.
    CITATION PROTOCOL:
    - Mention entities as clickable references: [[Node Label]].
    - Example: "[[Project Alpha]] is blocked by [[Budget Cuts]]."
    - Do not invent citations.
    - Return JSON with 'answer' key.
  `;

  const prompt = `QUERY: "${query}"\nCONTEXT:\n${contextText}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, properties: { answer: { type: Type.STRING } } }
      }
    });

    const parsed = cleanAndParseJSON(response.text || '{}');
    return {
      answer: parsed.answer || "Analysis complete.",
      nodes: dataArtifacts.nodes,
      edges: dataArtifacts.edges
    };

  } catch (error) {
    return { answer: "I encountered an error querying the neural network." };
  }
};

// --- EMBEDDING BACKFILL UTILITY ---

export interface BackfillProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  currentNode?: string;
}

export const backfillEmbeddings = async (
  batchSize: number = 10,
  onProgress?: (progress: BackfillProgress) => void
): Promise<BackfillProgress> => {
  const total = await countNodesWithoutEmbeddings();

  const progress: BackfillProgress = {
    total,
    processed: 0,
    successful: 0,
    failed: 0
  };

  if (total === 0) {
    console.log("All nodes already have embeddings!");
    return progress;
  }

  console.log(`Starting embedding backfill for ${total} nodes...`);

  // Process in batches to avoid overwhelming the API
  while (progress.processed < total) {
    const nodes = await fetchNodesWithoutEmbeddings(batchSize);

    if (nodes.length === 0) break;

    for (const node of nodes) {
      progress.currentNode = node.label;
      onProgress?.(progress);

      try {
        const text = `${node.label}: ${node.description || ''}`;
        const embedding = await generateEmbedding(text);

        if (embedding.length > 0) {
          const success = await updateNodeEmbedding(node.id, embedding);
          if (success) {
            progress.successful++;
            console.log(`✓ Generated embedding for: ${node.label}`);
          } else {
            progress.failed++;
            console.error(`✗ Failed to save embedding for: ${node.label}`);
          }
        } else {
          progress.failed++;
          console.error(`✗ Failed to generate embedding for: ${node.label}`);
        }
      } catch (error) {
        progress.failed++;
        console.error(`✗ Error processing ${node.label}:`, error);
      }

      progress.processed++;
      onProgress?.(progress);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`Backfill complete: ${progress.successful} successful, ${progress.failed} failed`);
  return progress;
};

// Get count of nodes needing embeddings (for UI display)
export const getEmbeddingStatus = async (): Promise<{ missing: number; message: string }> => {
  const missing = await countNodesWithoutEmbeddings();

  if (missing === 0) {
    return { missing: 0, message: "All nodes have embeddings" };
  }

  return { missing, message: `${missing} nodes need embeddings` };
};

// ============================================
// YOUTUBE TRANSCRIPT EXTRACTION
// ============================================

/**
 * Metadata about the YouTube video being processed
 */
export interface YouTubeVideoMetadata {
  title: string;
  channelName: string;
  videoUrl: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  description?: string;
}

/**
 * Special system instruction for YouTube transcript extraction
 * Optimized for spoken content, which often has:
 * - Transcription errors
 * - Less formal structure
 * - Verbal filler words
 * - Topic jumping
 */
const YOUTUBE_TRANSCRIPT_SYSTEM_INSTRUCTION = `
# Role: YouTube Video Analyst for Knowledge Graph Extraction

You are analyzing a YouTube video transcript to extract knowledge for a personal knowledge graph.

## Key Considerations for Video Transcripts:

1. **Spoken Content Artifacts**
   - Transcripts may have minor errors (homophone mistakes, missing punctuation)
   - Interpret based on context, not literal transcription
   - Speakers may use informal language, slang, or verbal fillers

2. **Content Structure**
   - Videos often jump between topics - track the main threads
   - Look for key segments: introductions, main points, conclusions
   - Note any timestamps or sections mentioned by the speaker

3. **Extraction Focus**
   - Key concepts and topics discussed
   - People mentioned (speakers, interviewees, referenced individuals)
   - Products, tools, books, or resources recommended
   - Actionable insights and advice
   - Opinions vs facts (mark opinions with lower confidence)
   - Quotes worth preserving (significant statements)

4. **Relationship Mapping**
   - Connect topics to the channel's main theme
   - Link recommendations to the problems they solve
   - Map advice to the goals it supports

5. **Confidence Scoring**
   - High (0.8-1.0): Clear, well-explained concepts
   - Medium (0.5-0.7): Opinions, predictions, or briefly mentioned items
   - Low (0.3-0.5): Tangential mentions or unclear references
`;

/**
 * Extract knowledge from a YouTube video transcript
 * Uses transcript-specific prompts optimized for spoken content
 *
 * @param transcript - The video transcript text
 * @param videoMetadata - Metadata about the video (title, channel, etc.)
 * @param extractionConfig - Optional extraction configuration (mode, anchor emphasis, etc.)
 * @returns ExtractedGraph with nodes and edges
 */
export const extractKnowledgeFromYouTubeTranscript = async (
  transcript: string,
  videoMetadata: YouTubeVideoMetadata,
  extractionConfig?: ExtractionSessionConfig
): Promise<ExtractedGraph> => {
  const ai = initGenAI();

  // Fetch profile and anchors for context
  const userProfile = await fetchUserProfile();
  let anchors: AnchorNode[] = [];
  try {
    anchors = await getAnchors();
  } catch (err) {
    console.warn('Failed to load anchors:', err);
  }

  // Build context header
  const contextHeader = `
## Video Information
- **Title**: ${videoMetadata.title}
- **Channel**: ${videoMetadata.channelName}
- **URL**: ${videoMetadata.videoUrl}
${videoMetadata.publishedAt ? `- **Published**: ${videoMetadata.publishedAt}` : ''}
${videoMetadata.description ? `- **Description**: ${videoMetadata.description.slice(0, 500)}` : ''}
`;

  let systemPrompt: string;

  if (extractionConfig) {
    // Use PRD 3 prompt builder with YouTube-specific additions
    const config: PromptBuilderConfig = {
      mode: extractionConfig.mode,
      anchorEmphasis: extractionConfig.anchorEmphasis,
      profile: userProfile,
      anchors: anchors,
      selectedAnchorIds: extractionConfig.selectedAnchorIds,
      userGuidance: extractionConfig.userGuidance,
      contextHeader: contextHeader
    };
    // Prepend YouTube-specific instructions
    systemPrompt = YOUTUBE_TRANSCRIPT_SYSTEM_INSTRUCTION + '\n\n' + buildExtractionPrompt(config);
  } else {
    // Fallback: combine YouTube instructions with standard extraction
    const profileContext = buildProfileContext(userProfile);
    const anchorContext = hasAnchors(anchors) ? buildAnchorContext(anchors) : '';
    systemPrompt = YOUTUBE_TRANSCRIPT_SYSTEM_INSTRUCTION + '\n' + contextHeader + '\n' + EXTRACTION_SYSTEM_INSTRUCTION + profileContext + anchorContext;
  }

  // Clean and prepare transcript
  const cleanedTranscript = cleanTranscriptForExtraction(transcript);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `YouTube Video Transcript:\n"""\n${cleanedTranscript.slice(0, 30000)}\n"""`,
      config: {
        temperature: 0.1,
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    const result = cleanAndParseJSON(response.text || '{}');

    // Ensure metadata includes video info
    const metadata = {
      sourceTitle: videoMetadata.title,
      sourceType: 'YouTube',
      sourceUrl: videoMetadata.videoUrl,
      thumbnailUrl: videoMetadata.thumbnailUrl,
      ...result.metadata
    };

    return {
      metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    console.error('YouTube transcript extraction failed:', error);
    throw error;
  }
};

/**
 * Clean transcript text for better extraction
 * - Remove timing artifacts
 * - Normalize whitespace
 * - Optionally remove speaker labels
 */
function cleanTranscriptForExtraction(transcript: string): string {
  let cleaned = transcript;

  // Remove common timestamp patterns like [00:00:00] or (00:00)
  cleaned = cleaned.replace(/\[[\d:]+\]/g, '');
  cleaned = cleaned.replace(/\([\d:]+\)/g, '');

  // Remove auto-generated caption artifacts like [Music] [Applause]
  cleaned = cleaned.replace(/\[(Music|Applause|Laughter|Silence)\]/gi, '');

  // Normalize excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');

  return cleaned.trim();
}