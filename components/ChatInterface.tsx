import React, { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Sparkles, Network, ArrowRight, Trash2, Box, ChevronRight, Scan, GitMerge, Check, Loader, AlertCircle } from 'lucide-react';
import { queryGraphRAG, ProgressStep } from '../services/gemini';
import { ChatMessage, GraphNode } from '../types';
import { getEntityConfig } from '../utils/theme';
import clsx from 'clsx';

interface ChatInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  traceNode: GraphNode | null; // If set, initiates a specific trace session
  onNodeSelect?: (nodeId: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ isOpen, onClose, traceNode, onNodeSelect }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '## Synapse Online\nI am connected to your Knowledge Graph. Ask me to find connections, identify risks, or explore topics.',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestionNode, setSuggestionNode] = useState<any | null>(null); // Node to potentially contextualize
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Handle Trace Trigger (External)
  useEffect(() => {
    if (isOpen && traceNode) {
      handleTrace(traceNode);
    }
  }, [traceNode]); 

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, suggestionNode, progressSteps]); // Auto-scroll when suggestion/progress appears

  const handleReset = () => {
    setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '## Memory Purged\nReady for new inquiry.',
          timestamp: Date.now()
        }
    ]);
    setSuggestionNode(null);
  };

  // Progress callback — upserts steps by label
  const createProgressCallback = () => (step: ProgressStep) => {
    setProgressSteps(prev => {
      const idx = prev.findIndex(s => s.label === step.label);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = step;
        return updated;
      }
      return [...prev, step];
    });
  };

  const handleTrace = async (node: GraphNode) => {
    const traceId = Date.now().toString();

    // Add User "System" Message
    const userMsg: ChatMessage = {
      id: traceId,
      role: 'user',
      content: `Trace connections for **${node.label}**`,
      timestamp: Date.now(),
      isTrace: true
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setProgressSteps([]);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const response = await queryGraphRAG(`Trace the connections and impact of ${node.label}`, 'trace', node.id, history, createProgressCallback());
      
      const aiMsg: ChatMessage = {
        id: traceId + '_ai',
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now(),
        data: {
          nodes: response.nodes,
          edges: response.edges
        }
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setProgressSteps([]);
    }
  };

  const handleContextualize = async (node: any) => {
    if (!node) return;
    setSuggestionNode(null);
    const traceId = Date.now().toString();

    const userMsg: ChatMessage = {
      id: traceId,
      role: 'user',
      content: `Contextualize **${node.label}** relative to our conversation.`,
      timestamp: Date.now(),
      isTrace: true
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setProgressSteps([]);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const response = await queryGraphRAG(
        `Contextualize "${node.label}" relative to our conversation.`,
        'trace',
        node.id,
        history,
        createProgressCallback()
      );
      
      const aiMsg: ChatMessage = {
        id: traceId + '_ai',
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now(),
        data: {
          nodes: response.nodes,
          edges: response.edges
        }
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Error: Failed to contextualize node.',
        timestamp: Date.now()
      } as ChatMessage]);
    } finally {
      setLoading(false);
      setProgressSteps([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setSuggestionNode(null); // Clear suggestion on new input
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userText,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setProgressSteps([]);

    try {
      // General RAG Query with conversation history
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const response = await queryGraphRAG(userText, 'general', undefined, history, createProgressCallback());
      
      const aiMsg: ChatMessage = {
        id: Date.now().toString() + '_ai',
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now(),
        data: {
            nodes: response.nodes,
            edges: response.edges
        }
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'system',
        content: 'Error: Failed to query graph agent.',
        timestamp: Date.now()
      } as ChatMessage]);
    } finally {
      setLoading(false);
      setProgressSteps([]);
    }
  };

  const handleCitationClick = (label: string, msg: ChatMessage) => {
      if (!msg.data?.nodes) return;
      
      // Look up node by label within the message context data
      const targetNode = msg.data.nodes.find((n: any) => n.label === label);
      
      if (targetNode) {
          if (onNodeSelect) onNodeSelect(targetNode.id);
          // Suggest digging deeper
          setSuggestionNode(targetNode);
      } else {
          console.warn("Node not found in local context:", label);
      }
  };

  const parseContent = (text: string, msg: ChatMessage) => {
    // Regex for both bold (**text**) and citations ([[text]])
    const parts = text.split(/(\*\*.*?\*\*|\[\[.*?\]\])/g);
    
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="text-white font-bold">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('[[') && part.endsWith(']]')) {
            const label = part.slice(2, -2);
            return (
                <button 
                    key={i} 
                    onClick={() => handleCitationClick(label, msg)}
                    className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-200 hover:border-cyan-400 transition-all cursor-pointer text-xs font-bold align-middle group shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                    title={`Locate ${label} on Graph`}
                >
                    <Scan size={10} className="group-hover:scale-110 transition-transform text-cyan-300"/>
                    <span className="underline decoration-cyan-500/30 decoration-dashed underline-offset-2">{label}</span>
                </button>
            );
        }
        return part;
    });
  };

  const renderContent = (content: string, msg: ChatMessage) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
        if (line.startsWith('## ')) {
            return <h3 key={i} className="text-base font-bold text-cyan-200 mt-3 mb-1 border-b border-cyan-500/30 pb-1">{parseContent(line.replace('## ', ''), msg)}</h3>;
        }
        if (line.startsWith('### ')) {
            return <h4 key={i} className="text-sm font-bold text-white mt-2 mb-1">{parseContent(line.replace('### ', ''), msg)}</h4>;
        }
        if (line.trim().startsWith('- ')) {
            return (
                <div key={i} className="flex items-start gap-2 ml-1 mb-1">
                    <span className="text-cyan-400 mt-1.5 w-1 h-1 rounded-full bg-cyan-400 shrink-0"></span>
                    <p className="text-sm text-blue-100">{parseContent(line.replace(/^- /, ''), msg)}</p>
                </div>
            );
        }
        if (line.trim() === '') {
            return <div key={i} className="h-2"></div>;
        }
        return <p key={i} className="text-sm text-blue-50 mb-1 leading-relaxed">{parseContent(line, msg)}</p>;
    });
  };

  const renderDataArtifacts = (data: ChatMessage['data']) => {
    if (!data || !data.nodes || data.nodes.length === 0) return null;

    // HIGH VALUE LOGIC: Sort nodes by number of connections within the returned edges context
    const nodesWithScores = data.nodes.map((node: any) => {
        const connectionCount = data.edges ? data.edges.filter((e: any) => 
            e.source_node_id === node.id || e.target_node_id === node.id ||
            e.source === node.label || e.target === node.label
        ).length : 0;
        return { ...node, score: connectionCount };
    });

    const sortedNodes = nodesWithScores.sort((a, b) => b.score - a.score);
    const displayNodes = sortedNodes.slice(0, 4); // Show top 4 highest value items

    return (
        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
            <div className="text-[10px] uppercase font-bold text-blue-300 mb-1 flex items-center gap-1">
                <Network size={12} /> Neural Context (Top {displayNodes.length})
            </div>
            <div className="grid grid-cols-1 gap-2">
                {displayNodes.map((node: any) => {
                    const { color, icon: Icon } = getEntityConfig(node.entity_type || node.type);
                    const relatedEdge = data.edges?.find((e: any) => 
                        e.source_node_id === node.id || e.target_node_id === node.id ||
                        e.source === node.label || e.target === node.label
                    );

                    return (
                        <button 
                             key={node.id} 
                             onClick={() => {
                                 if (onNodeSelect) onNodeSelect(node.id);
                                 setSuggestionNode(node);
                             }}
                             className="w-full text-left bg-white/5 border border-white/10 p-2 rounded flex items-start gap-3 hover:bg-white/10 hover:border-cyan-500/30 transition-colors group"
                        >
                             <div className="mt-1 shrink-0 text-slate-300">
                                <Icon size={16} style={{ color }} />
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white truncate group-hover:text-cyan-200 transition-colors">{node.label}</span>
                                    <span className="text-[9px] uppercase tracking-wider text-slate-300 border border-slate-600 px-1 rounded">{node.entity_type || node.type}</span>
                                </div>
                                <div className="text-[10px] text-slate-300 truncate mt-0.5">{node.description}</div>
                                <div className="flex items-center gap-3 mt-1.5">
                                    {relatedEdge && (
                                        <div className="flex items-center gap-1 text-[10px] text-cyan-300">
                                            <ArrowRight size={10} /> 
                                            <span className="uppercase">{relatedEdge.relation_type || relatedEdge.relation}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 text-[10px] text-slate-500 ml-auto">
                                        <GitMerge size={10} /> {node.score} Links
                                    </div>
                                </div>
                             </div>
                        </button>
                    );
                })}
            </div>
        </div>
    )
  }

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-24 right-6 w-[450px] h-[600px] max-h-[calc(100vh-120px)] bg-gradient-to-b from-slate-900 to-blue-950 border border-blue-500/30 rounded-2xl shadow-2xl z-40 flex flex-col font-sans animate-in slide-in-from-bottom-10 duration-300 overflow-hidden">
      
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-blue-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="bg-blue-500/20 p-2 rounded-lg text-blue-300 border border-blue-500/30">
             <MessageSquare size={20} />
          </div>
          <div>
            <h2 className="text-white font-bold tracking-wide">Neural Chat</h2>
            <div className="flex items-center gap-1.5">
               <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
               <span className="text-[10px] text-blue-200 uppercase">Graph RAG Active</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={handleReset}
                className="p-2 text-blue-300 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors" 
                title="Clear History"
            >
                <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-2 text-blue-300 hover:text-white transition-colors">
            <X size={20} />
            </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6" ref={scrollRef}>
        {messages.map((msg) => (
          <div key={msg.id} className={clsx("flex flex-col gap-2", msg.role === 'user' ? "items-end" : "items-start")}>
            <div className={clsx(
              "max-w-[90%] rounded-2xl p-4 shadow-lg relative",
              msg.role === 'user' 
                ? (msg.isTrace ? "bg-amber-900/40 border border-amber-500/30 text-amber-100" : "bg-blue-600 text-white")
                : "bg-white/10 border border-white/10 text-slate-100"
            )}>
              {/* Role Indicator */}
              <div className="flex items-center gap-2 mb-2 opacity-70 border-b border-white/10 pb-2">
                 {msg.role === 'assistant' ? <Sparkles size={12} className="text-cyan-300"/> : <div className="w-3 h-3 rounded-full bg-white/50"></div>}
                 <span className="text-[10px] font-bold uppercase tracking-wider">{msg.role === 'assistant' ? 'Synapse AI' : 'User'}</span>
              </div>
              
              {/* Content Rendered with Formatting */}
              <div className="font-sans">
                {renderContent(msg.content, msg)}
              </div>

              {/* Data Artifacts (Cards) */}
              {msg.data && renderDataArtifacts(msg.data)}

              {/* Decorative Corner for AI */}
              {msg.role === 'assistant' && (
                 <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400 opacity-50 rounded-tl-lg"></div>
              )}
            </div>
          </div>
        ))}
        {loading && (
           <div className="flex items-start">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 min-w-[260px] max-w-[90%]">
                 {progressSteps.length > 0 ? (
                   <div className="space-y-2">
                     {progressSteps.map((step, i) => (
                       <div key={step.label} className="flex items-start gap-2.5">
                         <div className="mt-0.5 shrink-0">
                           {step.status === 'done' ? (
                             <Check size={14} className="text-emerald-400" />
                           ) : step.status === 'error' ? (
                             <AlertCircle size={14} className="text-red-400" />
                           ) : (
                             <Loader size={14} className="text-cyan-400 animate-spin" />
                           )}
                         </div>
                         <div className="min-w-0">
                           <div className={clsx(
                             "text-xs font-semibold",
                             step.status === 'done' ? 'text-emerald-300' : step.status === 'error' ? 'text-red-300' : 'text-cyan-300'
                           )}>
                             {step.label}
                           </div>
                           <div className="text-[10px] text-slate-400 truncate">{step.detail}</div>
                         </div>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <div className="flex items-center gap-3">
                     <div className="flex gap-1">
                       <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"></div>
                       <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                       <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                     </div>
                     <span className="text-xs text-blue-300 uppercase tracking-wider">Initializing...</span>
                   </div>
                 )}
              </div>
           </div>
        )}
      </div>

      {/* Suggestion / Contextualize Prompt */}
      {suggestionNode && (
          <div className="mx-4 mb-2 p-3 bg-indigo-900/40 border border-indigo-500/30 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2 backdrop-blur-md">
              <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-300 shrink-0">
                      <GitMerge size={16} />
                  </div>
                  <div className="min-w-0">
                      <div className="text-xs text-indigo-200 font-medium">Focused on <span className="font-bold text-white">{suggestionNode.label}</span></div>
                      <div className="text-[10px] text-indigo-300/70 truncate">Deep dive into connections relative to this chat?</div>
                  </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                  <button 
                      onClick={() => setSuggestionNode(null)}
                      className="p-1.5 text-indigo-400 hover:text-white transition-colors"
                  >
                      <X size={14} />
                  </button>
                  <button 
                      onClick={() => handleContextualize(suggestionNode)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wide rounded-lg transition-all shadow-lg"
                  >
                      Contextualize
                  </button>
              </div>
          </div>
      )}

      {/* Input */}
      <div className="p-4 bg-blue-950/80 border-t border-white/10 backdrop-blur-md">
        <form onSubmit={handleSubmit} className="relative group">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about connections, topics, or risks..."
            className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-blue-300/50 focus:outline-none focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/50 transition-all font-medium"
            autoFocus
          />
          <button 
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-2 top-2 p-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-cyan-500/20"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="mt-2 flex justify-center gap-4 text-[10px] text-blue-300/60 font-medium">
           <span className="flex items-center gap-1"><Network size={10}/> Graph Context Enabled</span>
           <span className="flex items-center gap-1"><Sparkles size={10}/> Gemini 3.0 Flash</span>
        </div>
      </div>

    </div>
  );
};