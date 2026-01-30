import { GoogleGenAI, Type } from "@google/genai";
import { TableRow, AnalysisResult } from "../types";
import { fetchRelevantNodes, fetchNodeNeighbors, semanticSearchNodes, fetchNodesWithoutEmbeddings, updateNodeEmbedding, countNodesWithoutEmbeddings } from "./supabase";

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
  let contextHeader = context ? `USER CONTEXT: Type: ${context.type}, Title: ${context.title || "Unknown"}` : "";
  
  if (context?.customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\nThe user has provided specific guidance for this extraction. Follow these rules STRICTLY:\n"${context.customInstructions}"\n`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: `Input Text:\n"""\n${text.slice(0, 25000)}\n"""`,
      config: {
        temperature: 0.1,
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
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

export const extractKnowledgeFromFile = async (base64Data: string, mimeType: string, filename: string, customInstructions?: string): Promise<ExtractedGraph> => {
  const ai = initGenAI();
  let contextHeader = `USER CONTEXT: Filename: ${filename}`;
  
  if (customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\n"${customInstructions}"\n`;
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
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
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

export const extractKnowledgeFromWeb = async (url: string, title?: string, customInstructions?: string): Promise<ExtractedGraph> => {
  const ai = initGenAI();
  let contextHeader = `Target URL: ${url}`;
  
  if (customInstructions) {
      contextHeader += `\n\n### USER CUSTOM EXTRACTION INSTRUCTIONS (IMPORTANT):\n"${customInstructions}"\n`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: `Deep read this URL: ${url}. Extract knowledge.`,
      config: {
        temperature: 0.1,
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
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

const generateSearchQueries = async (userQuery: string): Promise<string[]> => {
    // ... [Same implementation] ...
    const ai = initGenAI();
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: userQuery,
            config: {
                systemInstruction: "Generate 5-8 database search queries (keywords/entities) for the user input.",
                responseMimeType: 'application/json',
                responseSchema: { type: Type.OBJECT, properties: { queries: { type: Type.ARRAY, items: { type: Type.STRING } } } }
            }
        });
        const parsed = cleanAndParseJSON(response.text || '{}');
        return parsed.queries || [userQuery];
    } catch (e) { return [userQuery]; }
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