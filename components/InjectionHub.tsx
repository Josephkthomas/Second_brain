import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Bot, ArrowRight, CheckCircle2, AlertCircle, Database, GitMerge, FileText, 
  UploadCloud, Loader2, Sparkles, Cpu, BrainCircuit, User, Gavel, Lightbulb, 
  Target, Building, HelpCircle, AlertTriangle, CheckSquare, Square, X,
  ShieldAlert, Flag, Zap, BookOpen, Microscope, Tag, Video, MessageSquare, Newspaper,
  Youtube, StickyNote, Users, Link as LinkIcon, Calendar, Quote, PieChart, Network, Share2, Search,
  Anchor, Plus, Trophy, Hash, Save, Globe, GraduationCap, LayoutGrid, Upload, Copy, Mic, Paperclip, ChevronDown, File,
  Library, MonitorPlay, FilePlus, PenTool, Layers, Edit3
} from 'lucide-react';
import { extractKnowledgeFromText, extractKnowledgeFromWeb, extractKnowledgeFromFile, generateCrossConnections, connectAnchorToKnowledge, mineContextFromRawText, performDeepResearch, transcribeAudio, generateSmartSuggestions, ExtractedGraph, ExtractionContext, generateEmbedding, resolveEntityMatch } from '../services/gemini';
import { getSupabase, fetchExistingNodes, fetchRelevantNodes, fetchAnchors, createAnchor, saveKnowledgeSource, updateKnowledgeSource, searchKnowledgeSources, getCurrentUserId, semanticSearchNodes } from '../services/supabase';
import { getEntityConfig } from '../utils/theme';
import clsx from 'clsx';

interface InjectionHubProps {
  onComplete: () => void;
  onGraphUpdate?: () => void;
}

type Step = 'input' | 'processing' | 'sources' | 'review' | 'saving' | 'done';
type SourceType = 'Meeting' | 'YouTube' | 'Note' | 'Anchor' | 'Research' | 'Document';
type ReviewTab = 'entities' | 'relationships';
type ResearchFocus = 'web' | 'academic' | 'video' | 'social';
type ResearchDepth = 'fast' | 'deep';
type HubMode = 'research' | 'input';

// Add helper to detect icon from URI
const getSourceTypeIcon = (uri?: string) => {
  const u = (uri || '').toLowerCase();
  if (u.includes('youtube') || u.includes('youtu.be')) return Youtube;
  if (u.includes('meet.google') || u.includes('zoom')) return Users;
  if (u.endsWith('.pdf')) return FileText;
  if (u.includes('wikipedia') || u.includes('arxiv')) return Globe;
  return Globe;
};

export const InjectionHub: React.FC<InjectionHubProps> = ({ onComplete, onGraphUpdate }) => {
  const [step, setStep] = useState<Step>('input');
  const [hubMode, setHubMode] = useState<HubMode>('research');
  
  // Input State
  const [sourceType, setSourceType] = useState<SourceType>('Research');
  const [inputText, setInputText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');

  // Research State
  const [researchQuery, setResearchQuery] = useState('');
  const [researchFocus, setResearchFocus] = useState<ResearchFocus>('web');
  const [researchDepth, setResearchDepth] = useState<ResearchDepth>('fast');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showFocusMenu, setShowFocusMenu] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Document Upload Hidden Input
  const documentUploadRef = useRef<HTMLInputElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Source Selection State
  const [foundSources, setFoundSources] = useState<{ title: string; uri: string }[]>([]);
  const [selectedSourceIndices, setSelectedSourceIndices] = useState<Set<number>>(new Set());
  const [researchSummary, setResearchSummary] = useState(''); 

  // Suggestions State
  const [suggestions, setSuggestions] = useState<{label: string, type: string, reason: string}[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

  // Anchor Form State
  const [anchorName, setAnchorName] = useState('');
  const [anchorType, setAnchorType] = useState('Project');
  const [anchorDescription, setAnchorDescription] = useState('');
  const [isSavingAnchor, setIsSavingAnchor] = useState(false);
  const [anchorStatusMessage, setAnchorStatusMessage] = useState('');

  const [extractedData, setExtractedData] = useState<ExtractedGraph | null>(null);
  
  // New: Captured Source ID for Foreign Key
  const [currentSourceId, setCurrentSourceId] = useState<string | null>(null);

  // Selection & View State
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [reviewTab, setReviewTab] = useState<ReviewTab>('entities');
  
  const [logs, setLogs] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string>('Agent 1');

  // USER TAGS MANAGEMENT
  const [globalTags, setGlobalTags] = useState<string[]>([]);
  const [globalTagInput, setGlobalTagInput] = useState('');
  const [userTagsMap, setUserTagsMap] = useState<Record<number, string[]>>({});
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [newTagInput, setNewTagInput] = useState('');

  // Existing Anchors (Loaded for reference/context)
  const [anchors, setAnchors] = useState<{ label: string; entity_type: string; id: string; description?: string }[]>([]);

  useEffect(() => {
    loadAnchors();
    generateSuggestions();
  }, []);

  const loadAnchors = async () => {
    const data = await fetchAnchors();
    setAnchors(data);
  };

  const generateSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        const nodes = await fetchExistingNodes();
        const smartSuggestions = await generateSmartSuggestions(nodes);
        setSuggestions(smartSuggestions);
      } catch (e) {
        console.error("Failed to generate smart suggestions", e);
      } finally {
        setIsLoadingSuggestions(false);
      }
  };

  const handleCreateAnchor = async () => {
    if (!anchorName.trim() || !anchorDescription.trim()) return;
    setIsSavingAnchor(true);
    setSaveError(null);
    setAnchorStatusMessage('Creating Anchor...');

    try {
        const supabase = getSupabase();

        // Get current user for authenticated inserts
        const userId = await getCurrentUserId();
        if (!userId) {
          throw new Error('Not authenticated');
        }

        // 1. Create the Anchor
        const { data: newAnchor, error } = await createAnchor(anchorName.trim(), anchorType, anchorDescription.trim());
        if (error) throw error;

        // 2. Vectorize the Anchor (Immediate Neural Pathway)
        setAnchorStatusMessage('Generating Neural Pathway...');
        const embedding = await generateEmbedding(`${newAnchor.label}: ${newAnchor.description}`);
        if (embedding.length > 0) {
             await supabase.from('knowledge_nodes').update({ embedding }).eq('id', newAnchor.id);
        }

        // 3. Retroactive Scan
        setAnchorStatusMessage('Scanning for existing connections...');
        const existingNodes = await fetchExistingNodes();

        if (existingNodes.length > 0) {
             const connections = await connectAnchorToKnowledge(
                 { label: anchorName, type: anchorType, description: anchorDescription },
                 existingNodes
             );

             if (connections.length > 0) {
                 const edgesToInsert = connections.map(c => ({
                    source_node_id: newAnchor.id,
                    target_node_id: c.target_node_id,
                    relation_type: c.relation.toLowerCase().replace(/\s+/g, '_'),
                    evidence: c.evidence,
                    weight: 1,
                    user_id: userId,
                 }));

                 await supabase.from('knowledge_edges').insert(edgesToInsert);
                 setAnchorStatusMessage(`Linked ${connections.length} existing nodes.`);
             }
        }

        // B. DEEP MINING (Agent 4 - Raw Text Search)
        setAnchorStatusMessage('Deep mining raw sources...');

        // Search for raw transcripts that mention the anchor name or keywords
        const relevantSources = await searchKnowledgeSources(anchorName);

        if (relevantSources.length > 0) {
            setAnchorStatusMessage(`Mining ${relevantSources.length} raw docs...`);
            let minedCount = 0;

            for (const source of relevantSources) {
               const miningResult = await mineContextFromRawText(
                 { label: anchorName, type: anchorType, description: anchorDescription },
                 source
               );

               if (miningResult.nodes.length > 0) {
                  // Insert Mined Nodes
                  const { data: insertedMinedNodes } = await supabase
                    .from('knowledge_nodes')
                    .insert(miningResult.nodes.map(n => ({
                        label: n.label,
                        entity_type: n.type,
                        description: n.description,
                        confidence: n.confidence || 0.8,
                        source: source.title || 'Retroactive Mining',
                        source_type: 'Inferred',
                        source_id: source.id,
                        quote: n.quote,
                        user_id: userId,
                    })))
                    .select('id, label');

                  // Insert Mined Edges (Link Anchor -> New Node)
                  if (insertedMinedNodes) {
                     const minedEdges = miningResult.edges.map(e => {
                        const targetNode = insertedMinedNodes.find(n => n.label === e.target_label);
                        if (targetNode) {
                            return {
                                source_node_id: newAnchor.id,
                                target_node_id: targetNode.id,
                                relation_type: e.relation.toLowerCase().replace(/\s+/g, '_'),
                                evidence: e.evidence,
                                weight: 1,
                                user_id: userId,
                            };
                        }
                        return null;
                     }).filter(e => e !== null);

                     if (minedEdges.length > 0) {
                         await supabase.from('knowledge_edges').insert(minedEdges);
                         minedCount += minedEdges.length;
                     }
                  }
               }
            }
            setAnchorStatusMessage(`Deep mining complete. Added ${minedCount} new insights.`);
        }
        
        if (onGraphUpdate) onGraphUpdate();
        setStep('done');

    } catch (err: any) {
        setSaveError(err.message || "Failed to create anchor");
        setAnchorStatusMessage('');
    } finally {
        setIsSavingAnchor(false);
    }
  };

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const typeStats = useMemo(() => {
    if (!extractedData) return [];
    const counts: Record<string, number> = {};
    extractedData.nodes.forEach((node, idx) => {
      if (selectedIndices.has(idx)) {
        counts[node.type] = (counts[node.type] || 0) + 1;
      }
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([type, count]) => ({ type, count }));
  }, [extractedData, selectedIndices]);

  const extractErrorMessage = (err: any): string => {
    if (!err) return "Unknown error occurred";
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object') {
       return err.message || err.error_description || err.details || JSON.stringify(err);
    }
    return String(err);
  };

  const handleResearchSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!researchQuery.trim() && !attachedFile) return;
      setStep('processing');
      setLogs([]);
      setActiveAgent('System');
      setCurrentSourceId(null);
      addLog(`Initiating ${researchDepth.toUpperCase()} research protocol...`);
      try {
          let effectiveQuery = researchQuery;
          if (attachedFile) effectiveQuery += ` (Context: ${attachedFile.name})`;
          const result = await performDeepResearch(effectiveQuery, researchFocus, researchDepth);
          setResearchSummary(result.content);
          setTitle(result.title);
          setUrl(result.sourceUrl);
          if (result.sources && result.sources.length > 0) {
              setFoundSources(result.sources);
              setSelectedSourceIndices(new Set(result.sources.map((_, i) => i)));
              setStep('sources'); 
          } else {
              setInputText(result.content);
              setSourceType('Research');
              await executePipeline(result.content, { type: 'Research', title: result.title, url: result.sourceUrl });
          }
      } catch (err: any) {
          setSaveError(extractErrorMessage(err));
          setStep('input');
      }
  };

  const handleSourcesIngest = async () => {
      if (selectedSourceIndices.size === 0) return;
      setStep('processing');
      addLog(`Preparing to ingest ${selectedSourceIndices.size} sources...`);
      try {
          const metadata = {
              focus: researchFocus,
              depth: researchDepth,
              query: researchQuery,
              child_source_count: selectedSourceIndices.size,
              tags: globalTags
          };

          addLog("Archiving research session...");
          const { id: researchSourceId } = await saveKnowledgeSource(
              title || `Deep Research: ${researchQuery}`,
              researchSummary,
              'Research',
              url,
              metadata
          );

          setCurrentSourceId(researchSourceId);
          const sourcesToProcess = foundSources.filter((_, i) => selectedSourceIndices.has(i));
          const graphs: ExtractedGraph[] = [];
          
          addLog(`[Agent 1] Analyzing research summary...`);
          graphs.push(await extractKnowledgeFromText(researchSummary, { type: 'Research', title: title + " (Summary)", url: url }));

          for (const source of sourcesToProcess) {
              addLog(`[Agent 1] Reading source: ${source.title.slice(0, 30)}...`);
              try {
                  graphs.push(await extractKnowledgeFromWeb(source.uri, source.title));
              } catch (e) { addLog(`[Warning] Failed to read ${source.title}. Skipping.`); }
          }
          mergeAndContinue(graphs);
      } catch (err: any) { setSaveError(extractErrorMessage(err)); }
  };

  const mergeAndContinue = async (graphs: ExtractedGraph[]) => {
      addLog(`Merging ${graphs.length} extractions...`);
      const mergedGraph: ExtractedGraph = {
          metadata: { sourceTitle: graphs[0].metadata.sourceTitle, sourceType: graphs[0].metadata.sourceType, sourceUrl: graphs[0].metadata.sourceUrl },
          nodes: [], edges: [], searchQueries: []
      };
      const uniqueNodes = new Map<string, any>();
      const uniqueEdges = new Set<string>();
      graphs.forEach(g => {
          g.nodes.forEach(n => { if (!uniqueNodes.has(n.label)) uniqueNodes.set(n.label, n); });
          g.edges.forEach(e => {
              const key = `${e.source}-${e.relation}-${e.target}`;
              if (!uniqueEdges.has(key)) { uniqueEdges.add(key); mergedGraph.edges.push(e); }
          });
          mergedGraph.searchQueries.push(...g.searchQueries);
      });
      mergedGraph.nodes = Array.from(uniqueNodes.values());
      mergedGraph.searchQueries = Array.from(new Set(mergedGraph.searchQueries)).slice(0, 8);
      setActiveAgent('System');
      let existingNodes: any[] = [];
      if (mergedGraph.searchQueries.length > 0) {
        existingNodes = await fetchRelevantNodes(mergedGraph.searchQueries);
      } else { existingNodes = await fetchExistingNodes(); }
      if ((existingNodes.length > 0 || anchors.length > 0) && mergedGraph.nodes.length > 0) {
        setActiveAgent('Agent 2');
        const crossEdges = await generateCrossConnections(
          mergedGraph.nodes.map(n => ({ label: n.label, type: n.type, description: n.description })),
          existingNodes,
          anchors.map(a => ({ label: a.label, entity_type: a.entity_type, description: a.description }))
        );
        mergedGraph.edges = [...mergedGraph.edges, ...crossEdges];
      }
      setExtractedData(mergedGraph);
      setSelectedIndices(new Set<number>(mergedGraph.nodes.map((_, i) => i)));
      setUserTagsMap({}); setGlobalTags([]); 
      setStep('review');
  };

  const toggleSourceSelection = (index: number) => {
      const newSet = new Set(selectedSourceIndices);
      if (newSet.has(index)) newSet.delete(index); else newSet.add(index);
      setSelectedSourceIndices(newSet);
  };
  const toggleAllSources = () => {
      if (selectedSourceIndices.size === foundSources.length) setSelectedSourceIndices(new Set()); else setSelectedSourceIndices(new Set(foundSources.map((_, i) => i)));
  };
  
  const handleManualUpload = (type: SourceType) => {
      setSourceType(type);
      setCustomInstructions(''); // Reset instructions on new open
      setStep('input');
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) setAttachedFile(e.target.files[0]); };
  
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0]) return;
      const file = e.target.files[0];
      setAttachedFile(file);
      setSourceType('Document');
      setTitle(file.name);
      setCustomInstructions(''); // Reset
      setStep('input');
  };

  const handleDocumentProcess = async () => {
      if (!attachedFile) return;
      
      setStep('processing');
      setLogs([]);
      setActiveAgent('System');
      setCurrentSourceId(null);
      
      try {
          addLog(`Reading file: ${attachedFile.name}...`);
          const base64String = await blobToBase64(attachedFile);
          const base64Data = base64String.split(',')[1];

          const metadata = { filename: attachedFile.name, filetype: attachedFile.type, size: attachedFile.size, tags: globalTags };
          const { id: sourceId } = await saveKnowledgeSource(
              attachedFile.name,
              "Binary Document Data",
              'Document',
              undefined,
              metadata
          );
          setCurrentSourceId(sourceId);
          
          setActiveAgent('Agent 1');
          addLog("Using Gemini Vision Pro for extraction...");
          // Pass custom instructions to document extractor
          const extracted = await extractKnowledgeFromFile(base64Data, attachedFile.type, attachedFile.name, customInstructions);
          
          mergeAndContinue([extracted]);
      } catch (err: any) { 
          setSaveError(extractErrorMessage(err)); 
          setStep('input'); 
      }
  };

  const startRecording = async () => { /* ... */ }; 
  const stopRecording = () => { /* ... */ };
  const handleMicClick = async () => { alert("Mic feature placeholder"); };

  const executePipeline = async (text: string, context: ExtractionContext) => {
    addLog("Initializing Extraction Pipeline...");
    try {
      addLog("Persisting source to database...");
      const { id: sourceId, error: sourceError } = await saveKnowledgeSource(
          context.title || `Untitled ${context.type}`,
          text,
          context.type,
          context.url,
          { processed_at: new Date().toISOString(), agent_version: 'v2.0', tags: globalTags }
      );

      if (sourceError) {
          console.error("Source Save Error:", sourceError);
          throw new Error(`Database Error: ${sourceError.message || 'Failed to save source'}. Check connection keys.`);
      }

      setCurrentSourceId(sourceId);
      setActiveAgent('Agent 1');
      
      addLog(`Sending to Gemini (${text.length} chars) for analysis...`);
      // Pass the context (including customInstructions)
      const localGraph = await extractKnowledgeFromText(text, context);
      
      addLog(`Extraction complete. Found ${localGraph.nodes.length} nodes and ${localGraph.edges.length} edges.`);
      
      setActiveAgent('System');
      addLog("Fetching context from knowledge graph...");

      const existingNodes = localGraph.searchQueries.length > 0 ? await fetchRelevantNodes(localGraph.searchQueries) : await fetchExistingNodes();
      
      if ((existingNodes.length > 0 || anchors.length > 0) && localGraph.nodes.length > 0) {
        setActiveAgent('Agent 2');
        addLog(`Weaving ${localGraph.nodes.length} new nodes with ${existingNodes.length} existing nodes...`);
        const crossEdges = await generateCrossConnections(
          localGraph.nodes.map(n => ({ label: n.label, type: n.type, description: n.description })),
          existingNodes,
          anchors.map(a => ({ label: a.label, entity_type: a.entity_type, description: a.description }))
        );
        localGraph.edges = [...localGraph.edges, ...crossEdges];
        addLog(`Generated ${crossEdges.length} cross-connections.`);
      }

      setExtractedData(localGraph);
      setSelectedIndices(new Set<number>(localGraph.nodes.map((_, i) => i)));
      setUserTagsMap({}); setGlobalTags([]); setStep('review'); 
    } catch (err: any) { 
        console.error("Pipeline Error:", err);
        setSaveError(extractErrorMessage(err)); 
        // We do not reset to 'input' immediately so the user can see the error in the log/UI
        setStep('input'); 
    }
  };

  const handleAnalyze = async () => {
      if (sourceType === 'Document') {
          await handleDocumentProcess();
          return;
      }

      if (!inputText.trim()) return;
      setStep('processing');
      setLogs([]);
      setActiveAgent('Agent 1');
      setCurrentSourceId(null);
      setReviewTab('entities');
      
      await executePipeline(inputText, { 
          type: sourceType as any, 
          title: title.trim() || undefined, 
          url: url.trim() || undefined,
          customInstructions: customInstructions.trim() || undefined
      });
  };

  const toggleSelection = (index: number) => {
    const newSet = new Set<number>(selectedIndices);
    if (newSet.has(index)) newSet.delete(index); else newSet.add(index);
    setSelectedIndices(newSet);
  };
  const toggleAll = () => {
    if (!extractedData) return;
    if (selectedIndices.size === extractedData.nodes.length) setSelectedIndices(new Set());
    else setSelectedIndices(new Set<number>(extractedData.nodes.map((_, i) => i)));
  };

  // --- TAG MANAGEMENT ---
  const handleAddGlobalTag = () => { if (globalTagInput.trim() && !globalTags.includes(globalTagInput.trim())) { setGlobalTags([...globalTags, globalTagInput.trim()]); setGlobalTagInput(''); } };
  const handleRemoveGlobalTag = (tag: string) => { setGlobalTags(globalTags.filter(t => t !== tag)); };
  const handleAddTag = (index: number) => { 
      if (!newTagInput.trim()) { setEditingTagIndex(null); return; }
      const currentTags = userTagsMap[index] || [];
      if (!currentTags.includes(newTagInput.trim()) && !globalTags.includes(newTagInput.trim())) { setUserTagsMap({ ...userTagsMap, [index]: [...currentTags, newTagInput.trim()] }); }
      setNewTagInput(''); setEditingTagIndex(null);
  };
  const handleRemoveTag = (index: number, tagToRemove: string) => { setUserTagsMap({ ...userTagsMap, [index]: (userTagsMap[index] || []).filter(t => t !== tagToRemove) }); };

  const handleCommit = async () => {
    if (!extractedData) return;
    setStep('saving');
    setSaveError(null);
    const supabase = getSupabase();

    // Get current user for authenticated inserts
    const userId = await getCurrentUserId();
    if (!userId) {
      setSaveError('Not authenticated');
      setStep('review');
      return;
    }

    try {
      const selectedNodes = extractedData.nodes.filter((_, i) => selectedIndices.has(i));
      
      if (selectedNodes.length === 0) {
        throw new Error("No entities selected for injection.");
      }

      addLog(`[Gatekeeper] Processing ${selectedNodes.length} candidate nodes...`);

      const finalNodesToInsert = [];
      const labelRemap = new Map<string, string>(); 

      for (let i = 0; i < selectedNodes.length; i++) {
         const node = selectedNodes[i];
         addLog(`[Agent 1] Generating Neural Pathway for "${node.label}"...`);
         
         const embedding = await generateEmbedding(`${node.label}: ${node.description}`);
         
         if (embedding.length === 0) {
             addLog(`[Warning] Embedding generation failed for ${node.label}. Skipping vector checks.`);
         }

         let isDuplicate = false;
         if (embedding.length > 0) {
             const similarNodes = await semanticSearchNodes(embedding, 0.85, 1);
             if (similarNodes.length > 0) {
                 const match = similarNodes[0];
                 const confirmed = await resolveEntityMatch(node, match);
                 if (confirmed) {
                     addLog(`[Gatekeeper] MERGING "${node.label}" into existing "${match.label}".`);
                     isDuplicate = true;
                     labelRemap.set(node.label, match.id); 
                 }
             }
         }

         if (!isDuplicate) {
             const originalIndex = extractedData.nodes.findIndex(orig => orig.label === node.label);
             const localTags = userTagsMap[originalIndex] || [];
             const finalUserTags = Array.from(new Set([...globalTags, ...localTags]));

             finalNodesToInsert.push({
                label: node.label,
                entity_type: node.type,
                description: node.description,
                confidence: node.confidence,
                source: extractedData.metadata.sourceTitle,
                source_type: extractedData.metadata.sourceType,
                source_url: extractedData.metadata.sourceUrl || null,
                source_id: currentSourceId,
                tags: node.tags || [],
                user_tags: finalUserTags,
                quote: node.quote || null,
                user_id: userId,
                embedding: embedding.length > 0 ? embedding : null
             });
         }
      }

      if (finalNodesToInsert.length > 0) {
        addLog(`[System] Inserting ${finalNodesToInsert.length} new unique nodes...`);
        const { data: insertedNodes, error: insertError } = await supabase
          .from('knowledge_nodes')
          .insert(finalNodesToInsert)
          .select('id, label');
        
        if (insertError) throw insertError;
        insertedNodes?.forEach(n => labelRemap.set(n.label, n.id));
      }

      addLog(`[System] Re-wiring synaptic connections...`);
      const edgesToInsert = extractedData.edges
        .map(edge => {
          let sourceId = labelRemap.get(edge.source);
          let targetId = labelRemap.get(edge.target);

          if (sourceId && targetId) {
             if (sourceId === targetId) return null;
             return {
              source_node_id: sourceId,
              target_node_id: targetId,
              relation_type: edge.relation.toLowerCase().replace(/\s+/g, '_'),
              evidence: edge.evidence,
              weight: 1,
              user_id: userId,
            };
          }
          return null;
        })
        .filter(e => e !== null);

      if (edgesToInsert.length > 0) {
        const uniqueEdges = new Map<string, any>();
        edgesToInsert.forEach(e => {
            const key = `${e.source_node_id}-${e.target_node_id}-${e.relation_type}`;
            uniqueEdges.set(key, e);
        });
        const finalEdges = Array.from(uniqueEdges.values());
        await supabase.from('knowledge_edges').insert(finalEdges);
      }

      addLog("Injection Protocol Complete.");
      if (onGraphUpdate) onGraphUpdate();
      setStep('done');

    } catch (err: any) {
      console.error("Injection Error:", err);
      const msg = extractErrorMessage(err);
      setSaveError(msg);
      addLog(`CRITICAL FAILURE: ${msg}`);
      setStep('review'); 
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'meeting': return Users;
      case 'youtube': return Youtube;
      case 'video': return Video;
      case 'note': return StickyNote;
      case 'research': return Globe;
      case 'document': return FileText;
      default: return FileText;
    }
  };

  const SourceIcon = extractedData ? getSourceIcon(extractedData.metadata.sourceType) : FileText;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full">
        
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
             <BrainCircuit className="text-cyan-400" />
            Knowledge Injection Hub
          </h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Where knowledge begins. Expand the graph by conducting deep research or analyzing documents.
          </p>
        </div>

        {/* PROGRESS BAR */}
        <div className="flex items-center justify-between mb-8 relative px-10">
          <div className="absolute top-1/2 left-10 right-10 h-0.5 bg-slate-800 -z-10"></div>
          
          {(() => {
            const allSteps = ['input', 'sources', 'processing', 'review', 'done'];
            const stepLabels = ['input', 'source select', 'processing', 'review', 'done'];
            
            const visibleSteps = allSteps.filter(s => {
               if (hubMode === 'input' && s === 'sources') return false;
               return true;
            });

            return visibleSteps.map((s, idx) => {
               const originalIndex = allSteps.indexOf(s);
               const label = stepLabels[originalIndex];
               const effectiveCurrentStep = step === 'saving' ? 'review' : step;
               const currentStepIndex = visibleSteps.indexOf(effectiveCurrentStep);
               const isCurrent = effectiveCurrentStep === s;
               const isCompleted = currentStepIndex > idx;
               
               return (
                 <div key={s} className={clsx("flex flex-col items-center gap-2 bg-slate-950 px-2", isCurrent ? "text-cyan-400" : (isCompleted ? "text-emerald-500" : "text-slate-600"))}>
                   <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all", 
                      isCurrent ? "border-cyan-400 bg-cyan-900/20 shadow-[0_0_10px_rgba(34,211,238,0.3)]" : 
                      (isCompleted ? "border-emerald-500 bg-emerald-900/20" : "border-slate-700 bg-slate-900")
                   )}>
                     {isCompleted ? <CheckCircle2 size={16} /> : <span className="text-xs font-mono">{idx + 1}</span>}
                   </div>
                   <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
                 </div>
               )
            });
          })()}
        </div>

        {step === 'input' && (
           <div className="animate-in fade-in slide-in-from-bottom-4">
             <div className="flex justify-center mb-8">
                <div className="flex bg-slate-900 border border-slate-800 rounded-full p-1 shadow-lg">
                    <button onClick={() => setHubMode('research')} className={clsx("flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all", hubMode === 'research' ? "bg-cyan-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200")}>
                        <Globe size={16} /> Deep Research
                    </button>
                    <button onClick={() => setHubMode('input')} className={clsx("flex items-center gap-2 px-6 py-2 rounded-full text-sm font-bold transition-all", hubMode === 'input' ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200")}>
                        <UploadCloud size={16} /> Standard Input
                    </button>
                </div>
             </div>

             {hubMode === 'research' && (
                <div className="space-y-8 animate-in fade-in">
                    <div className="relative group">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 shadow-xl transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/20">
                            <form onSubmit={handleResearchSubmit}>
                                <textarea value={researchQuery} onChange={(e) => setResearchQuery(e.target.value)} className="w-full bg-transparent border-none text-lg text-white placeholder-slate-500 focus:ring-0 resize-none h-20" placeholder="Explore a topic, market trend, or technical concept..." onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleResearchSubmit(e); } }} />
                                {attachedFile && <div className="flex items-center gap-2 mb-3 bg-slate-800 w-fit px-3 py-1.5 rounded-lg text-xs text-slate-300"><FileText size={14} className="text-cyan-400" />{attachedFile.name}<button type="button" onClick={() => setAttachedFile(null)} className="ml-2 hover:text-white"><X size={12}/></button></div>}
                                <div className="flex justify-between items-center pt-2">
                                    <div className="relative">
                                        <button type="button" onClick={() => setShowFocusMenu(!showFocusMenu)} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-cyan-400 bg-slate-800/50 hover:bg-slate-800 px-3 py-1.5 rounded-full transition-colors">
                                            {researchFocus === 'web' && <Globe size={14} />}{researchFocus === 'academic' && <GraduationCap size={14} />}{researchFocus === 'video' && <Youtube size={14} />}{researchFocus === 'social' && <MessageSquare size={14} />}<span className="uppercase">{researchFocus}</span><ChevronDown size={12} />
                                        </button>
                                        {showFocusMenu && <div className="absolute top-full left-0 mt-2 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-2">{(['web', 'academic', 'video', 'social'] as ResearchFocus[]).map(f => (<button key={f} type="button" onClick={() => { setResearchFocus(f); setShowFocusMenu(false); }} className={clsx("w-full text-left px-4 py-2 text-xs font-bold uppercase hover:bg-slate-800 flex items-center gap-2", researchFocus === f ? "text-cyan-400 bg-slate-800" : "text-slate-400")}>{f === 'web' && <Globe size={14} />}{f === 'academic' && <GraduationCap size={14} />}{f === 'video' && <Youtube size={14} />}{f === 'social' && <MessageSquare size={14} />}{f}</button>))}</div>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileAttach}/><button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors" title="Attach File"><Paperclip size={18} /></button>
                                        <button type="button" onClick={handleMicClick} disabled={isTranscribing} className={clsx("p-2 rounded-full transition-colors relative", isRecording ? "bg-red-500/20 text-red-500 animate-pulse" : "text-slate-400 hover:text-white hover:bg-slate-800", isTranscribing && "cursor-wait opacity-70")} title="Voice Input">{isTranscribing ? <Loader2 size={18} className="animate-spin text-cyan-400"/> : <Mic size={18} />}</button>
                                        <div className="h-4 w-px bg-slate-700 mx-1"></div>
                                        <button type="submit" disabled={!researchQuery.trim() && !attachedFile} className="p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(6,182,212,0.3)]"><ArrowRight size={18} /></button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
             )}

             {hubMode === 'input' && (
                 <div className="space-y-6 animate-in fade-in">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <button onClick={() => handleManualUpload('Anchor')} className="flex flex-col items-center justify-center gap-3 p-6 bg-amber-950/10 border border-amber-900/50 hover:border-amber-500/50 hover:bg-amber-900/20 rounded-xl transition-all group h-40 col-span-2 md:col-span-1"><div className="w-12 h-12 rounded-full bg-amber-900/30 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-all shadow-[0_0_15px_rgba(245,158,11,0.1)]"><Anchor size={24} /></div><span className="text-sm font-bold text-amber-400/80 group-hover:text-amber-300">Strategic Anchor</span></button>
                        <button onClick={() => handleManualUpload('Note')} className="flex flex-col items-center justify-center gap-3 p-6 bg-emerald-950/10 border border-emerald-900/50 hover:border-emerald-500/50 hover:bg-emerald-900/20 rounded-xl transition-all group h-40"><div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)]"><StickyNote size={24} /></div><span className="text-sm font-bold text-emerald-400/80 group-hover:text-emerald-300">Personal Note</span></button>
                        <button onClick={() => handleManualUpload('YouTube')} className="flex flex-col items-center justify-center gap-3 p-6 bg-red-950/10 border border-red-900/50 hover:border-red-500/50 hover:bg-red-900/20 rounded-xl transition-all group h-40"><div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center text-red-500 group-hover:scale-110 transition-all shadow-[0_0_15px_rgba(239,68,68,0.1)]"><Youtube size={24} /></div><span className="text-sm font-bold text-red-400/80 group-hover:text-red-300">YouTube Video</span></button>
                        <button onClick={() => handleManualUpload('Meeting')} className="flex flex-col items-center justify-center gap-3 p-6 bg-purple-950/10 border border-purple-900/50 hover:border-purple-500/50 hover:bg-purple-900/20 rounded-xl transition-all group h-40"><div className="w-12 h-12 rounded-full bg-purple-900/30 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-all shadow-[0_0_15px_rgba(168,85,247,0.1)]"><Users size={24} /></div><span className="text-sm font-bold text-purple-400/80 group-hover:text-purple-300">Meeting Transcript</span></button>
                        <button onClick={() => documentUploadRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-6 bg-cyan-950/10 border border-cyan-900/50 hover:border-cyan-500/50 hover:bg-cyan-900/20 rounded-xl transition-all group h-40 md:col-span-2"><input type="file" ref={documentUploadRef} className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.txt,.md" /><div className="w-12 h-12 rounded-full bg-cyan-900/30 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-all shadow-[0_0_15px_rgba(6,182,212,0.1)]"><FilePlus size={24} /></div><div className="text-center"><span className="text-sm font-bold text-cyan-400/80 group-hover:text-cyan-300 block">Upload Document</span><span className="text-[10px] text-cyan-500/50 uppercase tracking-wide">OCR & Analysis Enabled</span></div></button>
                    </div>
                 </div>
             )}

             {sourceType === 'Anchor' && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-2xl relative shadow-2xl">
                        <button onClick={() => setSourceType('Research')} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
                        
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-amber-900/20 rounded-lg text-amber-500 border border-amber-900/50"><Anchor size={24}/></div>
                            <div>
                                <h3 className="text-xl font-bold text-white">Create Strategic Anchor</h3>
                                <p className="text-sm text-slate-400">Establish a high-level entity to organize your graph.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Anchor Name</label>
                                <input value={anchorName} onChange={(e) => setAnchorName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none" placeholder="e.g. Project Apollo"/>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Entity Type</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['Project', 'Goal', 'Topic'].map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => setAnchorType(t)}
                                            className={clsx(
                                                "py-2 rounded-lg text-sm font-bold border transition-all",
                                                anchorType === t 
                                                    ? "bg-amber-600/20 border-amber-500 text-amber-400" 
                                                    : "bg-slate-950 border-slate-700 text-slate-400 hover:bg-slate-900"
                                            )}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Description</label>
                                <textarea value={anchorDescription} onChange={(e) => setAnchorDescription(e.target.value)} className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-amber-500 outline-none resize-none" placeholder="Describe the purpose and scope of this anchor..."/>
                            </div>

                            {saveError && (
                                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex gap-2 text-red-400 text-sm">
                                    <AlertCircle size={16} className="mt-0.5"/> {saveError}
                                </div>
                            )}

                            {anchorStatusMessage && (
                                <div className="p-3 bg-indigo-900/20 border border-indigo-900/50 rounded-lg flex gap-2 text-indigo-400 text-sm items-center justify-center animate-pulse">
                                    <Sparkles size={16}/> {anchorStatusMessage}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSourceType('Research')} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                <button onClick={handleCreateAnchor} disabled={isSavingAnchor || !anchorName || !anchorDescription} className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                                    {isSavingAnchor && <Loader2 size={16} className="animate-spin"/>}
                                    Create Anchor
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
             )}

             {sourceType !== 'Research' && sourceType !== 'Anchor' && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-2xl relative shadow-2xl flex flex-col max-h-[90vh]">
                        <button onClick={() => setSourceType('Research')} className="absolute top-4 right-4 text-slate-500 hover:text-white"><X size={20}/></button>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-slate-800 rounded-lg text-cyan-400">
                                {sourceType === 'YouTube' ? <Youtube size={24}/> : (sourceType === 'Meeting' ? <Users size={24}/> : (sourceType === 'Document' ? <FileText size={24}/> : <FileText size={24}/>))}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">
                                    {sourceType === 'YouTube' ? 'Video Ingestion' : (sourceType === 'Meeting' ? 'Meeting Transcript' : (sourceType === 'Document' ? 'Document Extraction' : 'Direct Text Input'))}
                                </h3>
                                <p className="text-sm text-slate-400">
                                    {sourceType === 'Document' ? "Multimodal Analysis with OCR." : "Manually add knowledge to the graph."}
                                </p>
                            </div>
                        </div>
                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-cyan-500 outline-none"/>
                            
                            {sourceType === 'YouTube' && <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Video URL" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white focus:border-red-500 outline-none"/>}
                            
                            {/* NEW: Custom Instructions Field */}
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block flex items-center gap-1"><Edit3 size={12}/> Custom Extraction Instructions (Optional)</label>
                                <textarea 
                                    value={customInstructions}
                                    onChange={(e) => setCustomInstructions(e.target.value)}
                                    className="w-full h-20 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 font-mono text-xs focus:border-indigo-500 outline-none resize-none" 
                                    placeholder={
                                        sourceType === 'YouTube' ? "e.g. Extract the 5 key takeaways and any book recommendations." :
                                        sourceType === 'Meeting' ? "e.g. Focus on Action Items and assignees. Ignore pleasantries." :
                                        "e.g. Extract all dates and financial figures specifically."
                                    }
                                />
                            </div>

                            {sourceType === 'Document' ? (
                                <div className="bg-slate-950 border border-slate-700 border-dashed rounded-lg p-8 text-center">
                                    <FileText size={32} className="mx-auto mb-2 text-cyan-500"/>
                                    <p className="text-white font-bold">{attachedFile ? attachedFile.name : "No file attached"}</p>
                                    <p className="text-xs text-slate-500 mt-1">Ready for analysis</p>
                                </div>
                            ) : (
                                <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} className="w-full h-48 bg-slate-950 border border-slate-700 rounded-lg p-4 text-slate-300 font-mono text-sm focus:border-cyan-500 outline-none resize-none" placeholder="Paste content here..."/>
                            )}
                            
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setSourceType('Research')} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                <button onClick={handleAnalyze} disabled={sourceType !== 'Document' && !inputText.trim()} className="bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                                    {sourceType === 'Document' ? 'Process Document' : 'Process Data'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
             )}
           </div>
        )}

        {/* PROCESSING STEP */}
        {step === 'processing' && (
           <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center animate-in fade-in relative overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl animate-pulse"></div>
              <div className="relative w-24 h-24 mb-8 flex items-center justify-center transition-all duration-500">
                 <div className={clsx("absolute inset-0 border-4 rounded-full animate-[spin_3s_linear_infinite] transition-colors", activeAgent === 'Agent 2' ? "border-indigo-500/20" : "border-cyan-500/20")}></div>
                 <div className={clsx("absolute inset-2 border-2 rounded-full animate-[spin_2s_linear_infinite_reverse] border-t-transparent transition-colors", activeAgent === 'Agent 2' ? "border-indigo-500/40" : "border-cyan-500/40")}></div>
                 {activeAgent === 'Agent 1' && <Bot size={32} className="text-cyan-400 relative z-10 animate-pulse" />}
                 {activeAgent === 'Agent 2' && <Network size={32} className="text-indigo-400 relative z-10 animate-bounce" />}
                 {activeAgent === 'System' && <Search size={32} className="text-emerald-400 relative z-10 animate-pulse" />}
              </div>
              <h2 className="text-2xl font-bold text-white mb-1 tracking-wide">{activeAgent === 'Agent 1' && "Agent 1: Extraction & Search"}{activeAgent === 'Agent 2' && "Agent 2: Weaving"}{activeAgent === 'System' && "System: Research & Retrieval"}</h2>
              <p className="text-slate-500 text-sm mb-6">Pipeline Active</p>
              <div className="w-full max-w-md bg-slate-950/80 rounded-lg p-4 font-mono text-xs border border-slate-800 shadow-inner h-40 overflow-hidden relative text-left">
                 <div className="space-y-1.5 absolute bottom-4 left-4 right-4">
                    {logs.map((log, i) => (
                      <div key={i} className="animate-in slide-in-from-bottom-2 fade-in flex items-start">
                        <span className="text-cyan-500 mr-2 shrink-0">{'>>'}</span>
                        <span className="text-slate-300">{log}</span>
                      </div>
                    ))}
                 </div>
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent pointer-events-none animate-[shimmer_2s_infinite]"></div>
              </div>
           </div>
        )}

        {/* REVIEW & SAVING */}
        {(step === 'review' || step === 'saving') && extractedData && (
           <div className="space-y-6 animate-in slide-in-from-right-4 fade-in">
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 w-fit mt-6">
                <button onClick={() => setReviewTab('entities')} className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all", reviewTab === 'entities' ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}><Sparkles size={14} /> Entities ({extractedData.nodes.length})</button>
                <button onClick={() => setReviewTab('relationships')} className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all", reviewTab === 'relationships' ? "bg-slate-800 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}><Network size={14} /> Relationships ({extractedData.edges.length})</button>
              </div>

              {reviewTab === 'entities' && (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                   <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col gap-4 sticky top-0 z-10">
                      <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4"><div className="flex items-center gap-2 text-slate-300 font-semibold"><Sparkles size={16} className="text-cyan-500"/> Extracted Entities</div></div>
                          <div className="flex items-center gap-2"><button onClick={toggleAll} className="text-xs flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors">{selectedIndices.size === extractedData.nodes.length ? <CheckSquare size={14}/> : <Square size={14}/>}{selectedIndices.size === extractedData.nodes.length ? 'Deselect All' : 'Select All'}</button><span className="text-xs text-slate-500 font-mono">{selectedIndices.size} / {extractedData.nodes.length}</span></div>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800/50">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 px-2 uppercase tracking-wide"><Layers size={14} className="text-pink-500"/> Global Tags</div>
                          <div className="h-4 w-px bg-slate-800"></div>
                          <div className="flex items-center gap-2 flex-1 flex-wrap">
                              {globalTags.map(tag => (<span key={tag} className="text-[10px] bg-pink-900/40 text-pink-300 px-2 py-0.5 rounded border border-pink-500/40 flex items-center gap-1">{tag}<button onClick={() => handleRemoveGlobalTag(tag)} className="hover:text-white"><X size={10}/></button></span>))}
                              <input value={globalTagInput} onChange={(e) => setGlobalTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddGlobalTag(); }} placeholder={globalTags.length === 0 ? "Add tags to all entities..." : "Add another..."} className="bg-transparent text-xs text-white placeholder-slate-600 outline-none flex-1 min-w-[120px]"/>
                              <button onClick={handleAddGlobalTag} disabled={!globalTagInput.trim()} className="text-slate-500 hover:text-pink-400 disabled:opacity-30"><Plus size={14} /></button>
                          </div>
                      </div>
                   </div>
                   <div className="max-h-[500px] overflow-y-auto p-2 space-y-2 custom-scrollbar bg-slate-950/30">
                      {extractedData.nodes.map((node, i) => {
                         const isSelected = selectedIndices.has(i);
                         const { color, icon: Icon } = getEntityConfig(node.type);
                         const userTags = userTagsMap[i] || [];
                         const isEditing = editingTagIndex === i;
                         return (
                           <div key={i} className={clsx("flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer group select-none relative", isSelected ? "bg-slate-900/80 border-slate-700 hover:border-slate-600" : "bg-slate-950/50 border-transparent opacity-60 hover:opacity-80")} onClick={() => toggleSelection(i)}>
                              <div className={clsx("mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0", isSelected ? "bg-cyan-600 border-cyan-500 text-white" : "border-slate-700 bg-slate-900")}>{isSelected && <CheckSquare size={14} />}</div>
                              <div className="flex-1 min-w-0">
                                 <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2"><span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide border shadow-[0_0_8px_rgba(0,0,0,0.3)]" style={{ backgroundColor: `${color}20`, borderColor: `${color}40`, color: color }}><Icon size={12} />{node.type}</span><span className={clsx("font-medium truncate", isSelected ? "text-slate-200" : "text-slate-500")}>{node.label}</span></div>
                                 </div>
                                 <p className="text-xs text-slate-300 leading-relaxed font-mono mb-2">{node.description}</p>
                                 <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                     {globalTags.map((tag, tIdx) => (<span key={`global-${tIdx}`} className="text-[10px] bg-pink-900/20 text-pink-400/80 px-1.5 py-0.5 rounded border border-pink-500/20 flex items-center gap-1 opacity-80"><Layers size={8} /> {tag}</span>))}
                                     {node.tags && node.tags.map((tag, tIdx) => (<span key={`ai-${tIdx}`} className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1"><Bot size={8} /> {tag}</span>))}
                                     {userTags.map((tag, tIdx) => (<span key={`user-${tIdx}`} className="text-[10px] bg-pink-900/30 text-pink-300 px-1.5 py-0.5 rounded border border-pink-500/30 flex items-center gap-1 group/tag"><User size={8} /> {tag}<button onClick={() => handleRemoveTag(i, tag)} className="ml-1 hover:text-white"><X size={8} /></button></span>))}
                                     {isEditing ? (<div className="flex items-center gap-1"><input autoFocus value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(i); if (e.key === 'Escape') setEditingTagIndex(null); }} onBlur={() => handleAddTag(i)} className="w-24 text-[10px] bg-slate-900 border border-pink-500 text-white px-1.5 py-0.5 rounded outline-none" placeholder="Tag..." /></div>) : (<button onClick={() => { setEditingTagIndex(i); setNewTagInput(''); }} className="text-[10px] bg-slate-800 text-slate-500 hover:text-pink-400 hover:border-pink-500/50 px-1.5 py-0.5 rounded border border-slate-700 flex items-center gap-1 transition-all"><Plus size={8} /> Tag</button>)}
                                 </div>
                              </div>
                           </div>
                         )
                      })}
                   </div>
                </div>
              )}

              {reviewTab === 'relationships' && (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                   <div className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center sticky top-0 z-10">
                      <div className="flex items-center gap-2 text-slate-300 font-semibold">
                          <Network size={16} className="text-cyan-500"/> Detected Connections
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{extractedData.edges.length} Links</span>
                   </div>
                   <div className="max-h-[500px] overflow-y-auto p-2 space-y-2 custom-scrollbar bg-slate-950/30">
                      {extractedData.edges.length === 0 ? (
                          <div className="p-8 text-center text-slate-500 text-sm">No relationships detected in this segment.</div>
                      ) : (
                          extractedData.edges.map((edge, i) => {
                              const sourceNode = extractedData.nodes.find(n => n.label === edge.source);
                              const targetNode = extractedData.nodes.find(n => n.label === edge.target);
                              
                              const sourceConfig = getEntityConfig(sourceNode?.type || 'default');
                              const targetConfig = getEntityConfig(targetNode?.type || 'default');

                              return (
                                  <div key={i} className="p-3 rounded-lg border border-slate-800 bg-slate-950/50 flex flex-col gap-2 hover:border-slate-700 transition-colors">
                                      <div className="flex items-center justify-between gap-2">
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                              <div className="p-1 rounded bg-slate-900 border border-slate-700">
                                                  <sourceConfig.icon size={12} style={{ color: sourceConfig.color }} />
                                              </div>
                                              <span className="text-sm text-slate-200 font-medium truncate" title={edge.source}>{edge.source}</span>
                                          </div>

                                          <div className="flex flex-col items-center shrink-0 px-2">
                                              <span className="text-[10px] text-cyan-400 font-mono uppercase bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-500/20">{edge.relation}</span>
                                              <ArrowRight size={12} className="text-slate-600 mt-0.5"/>
                                          </div>

                                          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                              <span className="text-sm text-slate-200 font-medium truncate text-right" title={edge.target}>{edge.target}</span>
                                              <div className="p-1 rounded bg-slate-900 border border-slate-700">
                                                  <targetConfig.icon size={12} style={{ color: targetConfig.color }} />
                                              </div>
                                          </div>
                                      </div>
                                      {edge.evidence && (
                                          <div className="text-[10px] text-slate-500 italic border-l-2 border-slate-700 pl-2 ml-1">
                                              "{edge.evidence}"
                                          </div>
                                      )}
                                  </div>
                              );
                          })
                      )}
                   </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-slate-800/50">
                 <button onClick={() => setStep('input')} className="text-slate-500 hover:text-white transition-colors text-sm hover:underline">Discard & Try Again</button>
                 <button onClick={handleCommit} disabled={step === 'saving' || selectedIndices.size === 0} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 active:scale-95">{step === 'saving' ? <Loader2 className="animate-spin"/> : <CheckCircle2 />} {step === 'saving' ? 'Committing...' : `Confirm & Inject (${selectedIndices.size})`}</button>
              </div>
           </div>
        )}

        {/* DONE STEP */}
        {step === 'done' && (
           <div className="bg-emerald-950/20 border border-emerald-900 rounded-xl p-12 text-center animate-in zoom-in-95 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-50"></div>
              <div className="w-20 h-20 bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400 border border-emerald-800 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                 <Database size={40} />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Ingestion Successful</h2>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">
                 The knowledge graph has been updated. Nodes were vectorized and deduplicated against the existing memory bank.
              </p>
              <div className="flex justify-center gap-4">
                 <button onClick={() => { setStep('input'); setInputText(''); setResearchQuery(''); setExtractedData(null); setTitle(''); setUrl(''); }} className="px-6 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 transition-colors">
                    Ingest Another
                 </button>
                 <button onClick={onComplete} className="px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors shadow-[0_0_15px_rgba(8,145,178,0.4)]">
                    Visualize Graph
                 </button>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};