import { GoogleGenAI, Type } from "@google/genai";
import { TableRow, AnalysisResult } from "../types";
import { fetchRelevantNodes, fetchNodeNeighbors } from "./supabase";

const initGenAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please set process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey });
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
    Each insight should have a 'title', 'description', and 'type' (info, warning, or success).
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

    let text = response.text || '{}';
    text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || "No summary available.",
      insights: Array.isArray(parsed.insights) ? parsed.insights : []
    };
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return {
      summary: "Failed to generate analysis.",
      insights: [
        { title: "Error", description: "Could not connect to Gemini API.", type: "warning" }
      ]
    };
  }
};

export interface ExtractedGraph {
  metadata: {
    sourceTitle: string;
    sourceType: string;
    sourceUrl?: string;
    thumbnailUrl?: string; // New: Supports thumbnails
  };
  nodes: { 
    label: string; 
    type: string; 
    description: string; 
    confidence: number;
    tags: string[];
    quote: string;
    attributes?: Record<string, any>;
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
}

const COMMON_RELATIONS = [
  "authored", "mentions", "relates_to", "part_of", "leads_to", 
  "blocks", "supports", "contradicts", "owns", "depends_on", "defines"
];

// NEW: Agent 0 - Deep Research (Web Grounding)
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

  const prompt = `Research the topic: ${query}. 
  Provide a structured report containing:
  1. Key Entities (People, Organizations, Technologies)
  2. Core Concepts
  3. Recent Developments
  4. Relationships between these elements.
  
  Use Google Search to ground your response.`;

  try {
    const response = await ai.models.generateContent({
      model: depth === 'deep' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }], // Enable Search Grounding
      }
    });

    // Extract the grounding metadata to get the top source
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    let topUrl = "";
    
    // Extract all unique sources
    const sourcesMap = new Map<string, string>(); // uri -> title
    chunks.forEach((c: any) => {
        if (c.web?.uri) {
            sourcesMap.set(c.web.uri, c.web.title || "Web Source");
        }
    });
    
    const sources = Array.from(sourcesMap.entries()).map(([uri, title]) => ({ title, uri }));

    if (sources.length > 0) {
       topUrl = sources[0].uri;
    }

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
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Transcribe the audio exactly as spoken."
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription failed:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

// NEW: Smart Suggestion Logic
export const generateSmartSuggestions = async (
  existingNodes: { label: string; entity_type: string; description?: string }[]
): Promise<{ label: string; type: string; reason: string }[]> => {
  const ai = initGenAI();

  if (existingNodes.length === 0) {
    return [
      { label: "Emerging trends in Artificial Intelligence", type: "Exploration", reason: "Start building your graph" },
      { label: "Key players in Renewable Energy", type: "Analysis", reason: "Start building your graph" },
      { label: "History of the Internet", type: "Context", reason: "Start building your graph" }
    ];
  }

  // Create a context summary for the model (limit to 50 items to fit context window comfortably)
  const contextList = existingNodes
    .slice(0, 50)
    .map(n => `- ${n.label} (${n.entity_type})`)
    .join("\n");

  const systemInstruction = `
    You are a Strategic Intelligence Analyst for a Knowledge Graph system.
    Your goal is to analyze the user's current knowledge base and suggest 4 high-value, actionable research topics.
    
    You are looking for:
    1. **Gaps**: What obvious related concepts are missing?
    2. **Synergies**: Can two separate projects or topics be bridged?
    3. **Deep Dives**: Which high-level topic needs more specific operational detail?
    
    Output Format: JSON Array of objects { "label": string, "type": "Gap" | "Synergy" | "Deep Dive" | "Trend", "reason": string }.
    - 'label' should be a research-ready query string (e.g. "Regulatory challenges for Project X").
    - 'reason' should be a short (3-5 words) explanation of why this is valuable.
  `;

  const prompt = `
    Current Knowledge Graph Nodes (Context):
    ${contextList}

    Based on these entities, what should the user research next to add the most value to their graph?
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7, // Higher creativity for suggestions
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              type: { type: Type.STRING },
              reason: { type: Type.STRING }
            }
          }
        }
      }
    });

    let text = response.text || '[]';
    text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(text);

  } catch (error) {
    console.error("Smart Suggestions Failed:", error);
    // Fallback to simple random
    return existingNodes.slice(0, 3).map(n => ({ 
      label: `Latest news on ${n.label}`, 
      type: "Update", 
      reason: "Keep data fresh" 
    }));
  }
};

const EXTRACTION_SYSTEM_INSTRUCTION = `
# Role: Elite Knowledge Graph Engineer & Ontology Analyst

You are an advanced AI system designed to exhaustively mine unstructured text (transcripts, notes, videos) and structure it into a high-fidelity Knowledge Graph. 
Your goal is **Total Information Capture**. You do not summarize; you atomize information into distinct, interconnected entities.

---

## 1. THE ONTOLOGY (Knowledge Entity Types)
You must strictly classify every extracted point into one of the following types. Do not invent new types.

### A. Core Entities (The "Nouns")
| Type | Definition | Example |
| :--- | :--- | :--- |
| **Person** | A specific human being mentioned by name or role. | "Elon Musk", "The CTO" |
| **Organization** | A company, team, government body, or institution. | "SpaceX", "Marketing Dept", "NASA" |
| **Topic** | A broad subject, technology, concept, or field of study. | "Artificial Intelligence", "Q3 Budget", "Climate Change" |
| **Project** | A specific initiative, product line, or named effort with a goal. | "Apollo 11", "Website Redesign v2" |
| **Goal** | A target, objective, or desired outcome the user is aiming for. | "Reach 1M ARR", "Learn Rust" |

### B. Cognitive Entities (The "Insights")
| Type | Definition | Example |
| :--- | :--- | :--- |
| **Decision** | A firm conclusion, choice, or mandate agreed upon. | "We decided to migrate to Next.js." |
| **Action** | A specific task, to-do item, or future step assigned to someone. | "John needs to email the client by Friday." |
| **Insight** | A deep realization, a "lightbulb moment", or a synthesized truth. | "Users drop off because the signup flow is too long." |
| **Hypothesis** | A theory, assumption, or guess that needs testing. | "We believe lowering prices will increase volume." |
| **Question** | An unresolved query or area of uncertainty raised in the text. | "How will this affect our latency?" |

### C. Operational Entities (The "Status")
| Type | Definition | Example |
| :--- | :--- | :--- |
| **Risk** | A potential future negative event or danger. | "Supply chain delays might push the launch." |
| **Blocker** | An active impediment stopping progress right now. | "The server is down.", "Waiting on Legal approval." |
| **Achievement** | A success, milestone reached, or positive result. | "We hit 1M users.", "The bug is fixed." |
| **Feedback** | Specific praise or critique from a user or stakeholder. | "The client hates the blue button." |

---

## 2. EXECUTION PROTOCOL (Step-by-Step)

### Step 1: Deep Reading & Contextualization
Read the entire input. Understand the speaker's intent. Is this a casual brainstorm or a formal review? Adjust your extraction sensitivity accordingly.

### Step 2: Atomic Extraction
Identify every distinct piece of information.
- **Specificity Rule**: Never use generic labels.
    - *Bad:* "Budget"
    - *Good:* "Q3 Marketing Budget Shortfall"
- **De-duplication**: If "The CEO" and "Sarah" are the same person, create ONE node "Sarah" and use the description to mention she is the CEO.

### Step 3: Attribution & Evidence
For every node, you must extract:
- **Description**: A comprehensive summary of *why* this node matters (2-3 sentences).
- **Quote**: The *exact* substring from the text that proves this entity exists.
- **Confidence**: How certain are you this is a distinct, important entity? (0.0 - 1.0)

### Step 4: Relationship Mapping
Connect the nodes using active verbs.
- If "Sarah" (Person) mentioned "The Server is Down" (Blocker), the edge is "Sarah" -> "reports" -> "The Server is Down".
- Use relation types like: *authored, mentions, relates_to, part_of, leads_to, blocks, supports, contradicts, owns, depends_on*.

### Step 5: Smart Retrieval Tags (Search Query Gen)
To help us connect this new data to our existing database, generate 3-5 search queries.
- These should be the "Major Themes" or "Proper Nouns" found in the text.
- Example: If the text is about "Apples", search for ["Fruit", "Agriculture", "iPhone"] (depending on context).

### Step 6: Metadata Extraction (Crucial)
If the input is from the Web or Video, extract the **Main Representative Image URL** (Thumbnail) and the **Correct Title**.

---

## 3. VALIDATION CHECKLIST
Before outputting, verify:
1. [ ] Did I extract *all* decisions and action items? (These are high value).
2. [ ] Are my labels specific? (No single-word labels unless it's a famous Proper Noun).
3. [ ] Do all edges connect two nodes that actually exist in my 'nodes' list?
4. [ ] Is the quote a verbatim copy from the text?

---

## 4. OUTPUT FORMAT
Return valid JSON matching the schema provided.
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
        thumbnailUrl: { type: Type.STRING, description: "URL of the main representative image or video thumbnail." }
      },
      required: ["sourceTitle", "sourceType"]
    },
    searchQueries: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "List of 3-5 keywords/entities to search the DB for context."
    },
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Specific, Title Case Name (e.g. 'Q3 Budget Crisis')" },
          type: { type: Type.STRING, description: "Must match one of the defined Ontology Types." },
          description: { type: Type.STRING, description: "Comprehensive context (2-3 sentences)." },
          confidence: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          quote: { type: Type.STRING, description: "Verbatim evidence from source text." }
        },
        required: ["label", "type", "description", "confidence", "quote"]
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

// Agent 1: Local Extraction + Search Query Generation
export const extractKnowledgeFromText = async (text: string, context?: ExtractionContext): Promise<ExtractedGraph> => {
  const ai = initGenAI();
  
  let contextHeader = "";
  if (context) {
    contextHeader = `
    USER CONTEXT PROVIDED:
    - Input Type: ${context.type}
    - Title: ${context.title || "Unknown"}
    - URL: ${context.url || "None"}
    `;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: `Input Text:\n"""\n${text.slice(0, 30000)}\n"""`,
      config: {
        temperature: 0.1,
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    let jsonString = response.text || '{}';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(jsonString);

    if (context) {
      if (!result.metadata) result.metadata = {};
      result.metadata.sourceType = context.type;
      // Guarantee sourceTitle exists
      if (context.title) {
        result.metadata.sourceTitle = context.title;
      }
      if (context.url) result.metadata.sourceUrl = context.url;
    }
    
    // Fallback if metadata is still missing or sourceTitle wasn't provided by either context or AI
    if (!result.metadata) {
      result.metadata = { sourceTitle: "Untitled Extraction", sourceType: "Other" };
    } else if (!result.metadata.sourceTitle) {
      result.metadata.sourceTitle = "Untitled Extraction";
    }

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    console.error("Agent 1 failed:", error);
    throw error;
  }
};

// NEW: Extract Knowledge From File (Multimodal OCR)
export const extractKnowledgeFromFile = async (base64Data: string, mimeType: string, filename: string): Promise<ExtractedGraph> => {
  const ai = initGenAI();
  
  const contextHeader = `
    USER CONTEXT:
    - Input Source: Uploaded Document / Image
    - Filename: ${filename}
    
    TASK:
    1. Perform OCR (Optical Character Recognition) and Visual Analysis on the provided file.
    2. Extract knowledge nodes and edges directly from the visual/textual content.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          {
            text: "Extract comprehensive knowledge graph nodes and edges from this document."
          }
        ]
      },
      config: {
        temperature: 0.1,
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    let jsonString = response.text || '{}';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(jsonString);

    if (!result.metadata) result.metadata = {};
    result.metadata.sourceType = 'Document';
    result.metadata.sourceTitle = filename;

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    console.error("File Extraction failed:", error);
    throw error;
  }
};

// NEW: Extract Knowledge From Web URL
export const extractKnowledgeFromWeb = async (url: string, title?: string): Promise<ExtractedGraph> => {
  const ai = initGenAI();
  
  const contextHeader = `
    CONTEXT:
    You are analyzing a live web page.
    Target URL: ${url}
    Target Title: ${title || 'Unknown Web Page'}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: `Perform a deep read of the content at this URL: ${url}. Extract knowledge nodes and edges according to the ontology. IMPORTANT: Identify and extract the main representative image or thumbnail URL for this page into the metadata.`,
      config: {
        temperature: 0.1,
        systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION + "\n" + contextHeader,
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA
      }
    });

    let jsonString = response.text || '{}';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(jsonString);

    // Ensure metadata
    if (!result.metadata) result.metadata = {};
    result.metadata.sourceType = 'Research';
    result.metadata.sourceUrl = url;
    if (title) result.metadata.sourceTitle = title;
    if (!result.metadata.sourceTitle) result.metadata.sourceTitle = "Web Research";

    return {
      metadata: result.metadata,
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : [],
      searchQueries: Array.isArray(result.searchQueries) ? result.searchQueries : []
    };
  } catch (error) {
    console.error("Web Extraction failed:", error);
    throw error;
  }
};

// ... [Agents 2, 3, 4, etc. - kept identical] ...
export const generateCrossConnections = async (
  newNodes: { label: string; type: string; description: string }[],
  existingNodes: { label: string; entity_type: string }[],
  anchors: { label: string; entity_type: string; description?: string }[] = []
) => {
  // ... [Content of generateCrossConnections, identical to previous] ...
  if (newNodes.length === 0 || (existingNodes.length === 0 && anchors.length === 0)) return [];

  const ai = initGenAI();

  const systemInstruction = `
# Role: Agent 2 – Knowledge Graph Weaver

Your goal is to connect **NEW** nodes with **EXISTING** nodes and specifically **ANCHORS**.

## Inputs
1. **New Nodes**: Entities just discovered.
2. **Anchors**: High-priority user defined topics/goals (Gold Standard).
3. **Relevant Context**: Other existing nodes found via search.

## Task
Identify logical connections.
- **PRIORITY 1**: Link New Nodes to ANCHORS if remotely relevant. Anchors are the user's primary interests. Use the Anchor's description to understand its intent and scope.
- **PRIORITY 2**: Link New Nodes to Existing Context nodes.

## Rules
- **Relation Types**: ${COMMON_RELATIONS.join(", ")}.
- **Strictness**: Only create a link if there is a logical connection.

## Output Schema
Return a JSON array of edges.
  `;

  const newNodesList = newNodes.map(n => `${n.label} (${n.type}): ${n.description}`).join("\n");
  const existingNodesList = existingNodes.map(n => `${n.label} (${n.entity_type})`).join("\n");
  const anchorsList = anchors.map(n => `[ANCHOR] ${n.label} (${n.entity_type}): ${n.description || 'No description'}`).join("\n");

  const prompt = `
    NEW NODES:
    ${newNodesList}

    USER ANCHORS (High Priority Context):
    ${anchorsList}

    RELEVANT EXISTING NODES (Context):
    ${existingNodesList}

    Generate connections.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.2,
        systemInstruction: systemInstruction,
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

    let jsonString = response.text || '[]';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(jsonString) as { source: string; target: string; relation: string; evidence: string }[];
  } catch (error) {
    console.error("Agent 2 (Weaver) failed:", error);
    return [];
  }
};

export const connectAnchorToKnowledge = async (
  anchor: { label: string; type: string; description: string },
  existingNodes: { id: string; label: string; entity_type: string; description?: string }[]
) => {
  // ... [Content identical to previous] ...
  if (existingNodes.length === 0) return [];
  const ai = initGenAI();

  const systemInstruction = `
# Role: Agent 3 – Retroactive Linker

Your goal is to connect a **NEWLY CREATED ANCHOR** to **EXISTING DATABASE NODES**.
The Anchor represents a high-level Goal, Project, or Topic.
The Existing Nodes are extracted snippets of information (Meeting notes, etc.).

## Task
Scan the list of Existing Nodes. If a node is RELEVANT to the Anchor (e.g., belongs to the project, supports the goal, discusses the topic), create a link.

## Rules
- **Relation Types**: ${COMMON_RELATIONS.join(", ")}.
- **Evidence**: Explain WHY you linked them in 5-10 words.
- **Strictness**: Be permissive. If it's related, link it. This helps organize the graph.

## Output Schema
Return a JSON array of connection objects containing the 'target_node_id' (from the input list) and the relation details.
  `;

  const existingNodesList = existingNodes.map(n => 
    `[ID: ${n.id}] ${n.label} (${n.entity_type}): ${n.description ? n.description.slice(0, 150) : 'No description'}`
  ).join("\n");

  const prompt = `
    NEW ANCHOR:
    Label: "${anchor.label}"
    Type: "${anchor.type}"
    Context: "${anchor.description}"

    EXISTING DATABASE NODES (Scan these for relevance):
    ${existingNodesList}

    Identify connections.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.2,
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                target_node_id: { type: Type.STRING },
                relation: { type: Type.STRING },
                evidence: { type: Type.STRING }
              }
            }
        }
      }
    });

    let jsonString = response.text || '[]';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(jsonString) as { target_node_id: string; relation: string; evidence: string }[];
  } catch (error) {
    console.error("Agent 3 (Retroactive Weaver) failed:", error);
    return [];
  }
};

export const mineContextFromRawText = async (
  anchor: { label: string; type: string; description: string },
  source: { id: string; title: string; content: string }
): Promise<{ nodes: any[], edges: any[] }> => {
  // ... [Content identical to previous] ...
  const ai = initGenAI();

  const systemInstruction = `
# Role: Agent 4 – The Deep Miner

Your goal is to perform **RETROACTIVE EXTRACTION** on a specific document for a **NEW ANCHOR**.
The user has defined a new Goal/Project (The Anchor).
You are reading an OLD raw transcript/document.
You must find **NEW** entities or facts in this document that directly relate to the Anchor, which might have been missed previously because the Anchor didn't exist yet.

## Rules
1. **Anchor**: "${anchor.label}" (${anchor.description})
2. **Task**: Extract ANY entities from the text that relate to this Anchor.
3. **Format**: Return NEW Nodes and Edges connecting them to the Anchor (Source of edge = Anchor).

## Ontology
Use standard types: Person, Action, Risk, Decision, Insight, etc.
  `;

  const prompt = `
    ANCHOR: ${anchor.label}
    RAW TEXT SOURCE: "${source.title}"
    ${source.content.slice(0, 25000)} -- Truncated to fit context window

    Extract relevant nodes and connect them to the Anchor.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1,
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nodes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  type: { type: Type.STRING },
                  description: { type: Type.STRING },
                  quote: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                }
              }
            },
            edges: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  target_label: { type: Type.STRING, description: "Must match a label in nodes list" },
                  relation: { type: Type.STRING },
                  evidence: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    let jsonString = response.text || '{}';
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(jsonString);

    return {
      nodes: Array.isArray(result.nodes) ? result.nodes : [],
      edges: Array.isArray(result.edges) ? result.edges : []
    };

  } catch (error) {
    console.error("Agent 4 (Miner) failed:", error);
    return { nodes: [], edges: [] };
  }
};

const generateSearchQueries = async (userQuery: string): Promise<string[]> => {
  // ... [Content identical to previous] ...
  const ai = initGenAI();
  const systemInstruction = `
    You are a Database Retrieval Expert.
    Your job is to translate a user's natural language query into specific KEYWORDS and ENTITY NAMES that might exist in a database.
    
    Database Schema:
    - Nodes have 'label' (Title Case name) and 'entity_type' (e.g. Project, Person, Risk).
    
    Goal:
    - Return a list of 5-8 precise strings to search for.
    - If the user asks "What are the risks?", return ["Risk", "Danger", "Delay", "Blocker", "Hazard"].
    - If the user asks "How is Project Apollo doing?", return ["Project Apollo", "Apollo", "Status", "Update", "Moon Landing"].
    - Focus on finding both the *Type* of entity (Risk, Decision) and the *Specific* names involved.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: userQuery,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            queries: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });
    
    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    return parsed.queries || [userQuery];
  } catch (e) {
    console.error("Query Expansion Failed", e);
    return [userQuery]; // Fallback to raw query
  }
};

export const suggestRelationship = async (
  source: { label: string; type: string; description?: string },
  target: { label: string; type: string; description?: string }
): Promise<{ relation: string; evidence: string }> => {
  // ... [Content identical to previous] ...
  const ai = initGenAI();
  
  const systemInstruction = `
    You are an Ontology Assistant.
    Your task: Identify the most logical relationship type between two entities.
    
    Relation Types: ${COMMON_RELATIONS.join(", ")}.
    
    If 'target' is a Risk/Blocker, 'source' might 'report', 'face', or 'resolve' it.
    If 'source' is a Project and 'target' is a Goal, it likely 'leads_to' or 'supports'.
    
    Output: JSON with 'relation' (snake_case) and 'evidence' (short 1-sentence reasoning).
  `;

  const prompt = `
    Source Node: ${source.label} (${source.type}) - ${source.description || 'No description'}
    Target Node: ${target.label} (${target.type}) - ${target.description || 'No description'}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relation: { type: Type.STRING },
            evidence: { type: Type.STRING }
          }
        }
      }
    });

    const text = response.text || '{}';
    return JSON.parse(text);
  } catch (e) {
    console.error("Relationship Suggestion Failed", e);
    return { relation: 'relates_to', evidence: 'Manually connected.' };
  }
};

// GRAPH RAG CHAT AGENT
export const queryGraphRAG = async (
  query: string,
  mode: 'general' | 'trace',
  traceNodeId?: string
): Promise<{ answer: string; nodes?: any[]; edges?: any[] }> => {
  const ai = initGenAI();
  
  // 1. Context Gathering
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
      
      IMMEDIATE CONNECTIONS (Graph Neighbors):
      ${edges.map(e => {
         const neighborId = e.source_node_id === traceNodeId ? e.target_node_id : e.source_node_id;
         const neighbor = neighbors.find(n => n.id === neighborId);
         const direction = e.source_node_id === traceNodeId ? "->" : "<-";
         return `- ${direction} [${e.relation_type}] ${neighbor?.label} (${neighbor?.entity_type}): "${e.evidence}"`;
      }).join('\n')}
    `;
  } else {
    // B. General Graph RAG (Agentic Keyword Search)
    
    // Step 1: Query Expansion (The "Sophisticated" part)
    // We use the AI to determine what to search for, rather than just using the user's raw text.
    const searchTerms = await generateSearchQueries(query);
    console.log("Agentic Search Terms:", searchTerms);

    // Step 2: Database Retrieval
    const nodes = await fetchRelevantNodes(searchTerms);
    
    if (nodes.length === 0) {
      return { answer: "I scanned the knowledge graph using agentic retrieval but didn't find specific nodes matching your query. This might mean the database is empty or the terms don't match existing entities." };
    }

    // Step 3: Local Graph Expansion (Fetch edges for top results)
    const topNodes = nodes.slice(0, 10); // Expanded context to 10 nodes
    const edgesPromises = topNodes.map(n => fetchNodeNeighbors(n.id));
    const results = await Promise.all(edgesPromises);
    
    // Flatten results for artifacts
    const allEdges = results.flatMap(r => r.edges);
    const allNodes = [...nodes, ...results.flatMap(r => r.nodes)];
    
    // Deduplicate nodes
    const uniqueNodesMap = new Map();
    allNodes.forEach(n => uniqueNodesMap.set(n.id, n));
    dataArtifacts = { nodes: Array.from(uniqueNodesMap.values()), edges: allEdges };

    contextText = `
      RELEVANT NODES FOUND (Via Search Terms: ${searchTerms.join(', ')}):
      ${nodes.map(n => `- ${n.label} (${n.entity_type}): ${n.description}`).join('\n')}

      LOCAL CONNECTIVITY SAMPLES:
      ${results.map((r, i) => {
         const node = topNodes[i];
         if(!node) return "";
         return `Node: ${node.label}\nConnections: ${r.edges.slice(0, 3).map(e => `[${e.relation_type}]`).join(', ')}`;
      }).join('\n')}
    `;
  }

  // 2. Synthesis with Structured Output
  const systemInstruction = `
    You are SYNAPSE, an AI interface for a Knowledge Graph.
    Your job is to answer the user's query based **strictly** on the provided GRAPH CONTEXT.

    CONTEXT EXPLANATION:
    - You will see a list of Nodes (Entities) and Edges (Relationships).
    - Use this structural information to explain connections, dependencies, and insights.
    
    CITATION PROTOCOL (EXTREMELY STRICT):
    - **EVERY SINGLE TIME** you mention a specific entity (Person, Project, Risk, Goal, etc.) from the context, you **MUST** format it as a clickable reference: [[Node Label]].
    - **DO NOT** simply write "Project Alpha". You MUST write "[[Project Alpha]]".
    - **DO NOT** write "Sarah said...". You MUST write "[[Sarah]] said...".
    - This formatting is critical for the UI to render the interactive links correctly.
    - If a node label is "Q3 Budget", you must output "[[Q3 Budget]]".
    - Do not create fake citations for things not in the context list.

    FORMATTING:
    - Return a JSON object containing the textual 'answer'.
    - The text answer should be concise Markdown.
    - Focus the text on the *analysis* and *synthesis* of the relationships. Connect the dots.
  `;

  const prompt = `
    USER QUERY: "${query}"

    GRAPH CONTEXT:
    ${contextText}

    Synthesize an answer utilizing the relationships found. Remember to cite sources using [[Node Label]].
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
          }
        }
      }
    });

    const jsonText = response.text || '{}';
    const parsed = JSON.parse(jsonText);

    return {
      answer: parsed.answer || "Analysis complete.",
      nodes: dataArtifacts.nodes,
      edges: dataArtifacts.edges
    };

  } catch (error) {
    console.error("Chat Error", error);
    return { answer: "I encountered an error querying the neural network." };
  }
};