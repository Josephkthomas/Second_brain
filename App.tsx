import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

import { Sidebar } from './components/Sidebar';
import { DataGrid } from './components/DataGrid';
import { AIAnalyst } from './components/AIAnalyst';
import { GraphView } from './components/GraphView';
import { InjectionHub } from './components/InjectionHub';
import { ChatInterface } from './components/ChatInterface';
import { SourcesSidebar } from './components/SourcesSidebar';
import { SettingsPanel } from './components/SettingsPanel';
import { fetchTableData } from './services/supabase';
import { TableRow, LensType, GraphNode } from './types';
import { AutomatePanel } from './components/AutomatePanel';
import { HistoryPanel } from './components/HistoryPanel';
import { OrientationCenter } from './components/OrientationCenter';
import QueueHub from './components/QueueHub';
import {
  RefreshCw, Sparkles, X, Database,
  Plus, MessageSquare, BookOpen, LogOut, Settings, Workflow, Compass, ListTodo
} from 'lucide-react';
import clsx from 'clsx';

const MainApp: React.FC = () => {
  const { signOut, user } = useAuth();
  // Navigation State
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');
  const [showDataVault, setShowDataVault] = useState(false);
  const [showInjectionHub, setShowInjectionHub] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAutomatePanel, setShowAutomatePanel] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showOrientation, setShowOrientation] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentLens, setCurrentLens] = useState<LensType>('All');

  // Source Explorer State
  const [showSourceExplorer, setShowSourceExplorer] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Refresh coordination
  const [graphRefreshTrigger, setGraphRefreshTrigger] = useState(0);

  // Trace State
  const [traceNode, setTraceNode] = useState<GraphNode | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [focusedSource, setFocusedSource] = useState<string | null>(null);

  // Data State
  const [currentTable, setCurrentTable] = useState<string>('');
  const [recentTables, setRecentTables] = useState<string[]>([]);
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [data, setData] = useState<TableRow[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnalystOpen, setIsAnalystOpen] = useState<boolean>(false);
  
  // Refs for shortcuts
  const chatInputRef = useRef<HTMLInputElement>(null);

  const loadData = async (table: string) => {
    if (!table) return;

    setLoading(true);
    setError(null);
    try {
      const { data: tableData, error: apiError } = await fetchTableData(table);
      if (apiError) throw apiError;
      setData(tableData);
      
      setRecentTables(prev => {
        const newRecent = [table, ...prev.filter(t => t !== table)].slice(0, 5);
        return newRecent;
      });
    } catch (err: any) {
      console.error("Data load error:", err);
      let errorMessage = 'Failed to fetch data';
      if (typeof err === 'object') {
        errorMessage = err.message || JSON.stringify(err);
      }
      setError(errorMessage);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'table' && currentTable) {
      loadData(currentTable);
    }
  }, [currentTable, viewMode]);

  // GLOBAL SHORTCUTS LISTENER
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
        // Ignore if typing in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        switch(e.key) {
            case '[':
                e.preventDefault();
                setShowDataVault(prev => !prev);
                break;
            case ']':
                e.preventDefault();
                setIsChatOpen(prev => !prev);
                break;
            case 'o':
            case 'O':
                if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    setShowOrientation(prev => !prev);
                }
                break;
            case 'i':
            case 'I':
                if (!e.metaKey && !e.ctrlKey) {
                    e.preventDefault();
                    setShowInjectionHub(true);
                }
                break;
            case '/':
                e.preventDefault();
                setIsChatOpen(true);
                // Slight delay to allow render
                setTimeout(() => {
                    const input = document.querySelector('input[name="chat-input"]') as HTMLInputElement;
                    if(input) input.focus();
                }, 100);
                break;
        }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const handleTableSelect = (table: string) => {
    setCurrentTable(table);
    setViewMode('table');
  };

  const handleGraphUpdate = () => {
    setGraphRefreshTrigger(prev => prev + 1);
  };

  const handleTraceNode = (node: GraphNode) => {
    setTraceNode(node);
    setIsChatOpen(true);
  };

  const handleChatNodeSelect = (nodeId: string) => {
     setFocusedNodeId(nodeId);
     if (viewMode !== 'graph') setViewMode('graph');
  };

  const handleSourceSelect = (sourceId: string | null) => {
    setSelectedSourceId(sourceId);
    setFocusedSource(sourceId);
  };

  return (
    <div className="relative w-full h-screen bg-cyber-black text-slate-200 overflow-hidden font-sans selection:bg-cyber-cyan selection:text-black">
      
      {/* 1. THREE-PANEL LAYOUT (Sources Sidebar + Graph + Detail Panel) */}
      <div className="absolute inset-0 z-0 flex">
        {/* Left: Sources Sidebar */}
        <SourcesSidebar
          isOpen={showSourceExplorer}
          selectedSourceId={selectedSourceId}
          onSelectSource={handleSourceSelect}
          onClose={() => {
            setShowSourceExplorer(false);
            setSelectedSourceId(null);
            setFocusedSource(null);
          }}
        />

        {/* Center: Graph */}
        <div className="flex-1 relative">
          <GraphView
            discoveredTables={discoveredTables}
            refreshTrigger={graphRefreshTrigger}
            activeLens={currentLens}
            onLensChange={setCurrentLens}
            onTraceNode={handleTraceNode}
            focusNodeId={focusedNodeId}
            focusSource={focusedSource}
            onClearSourceFilter={() => { setFocusedSource(null); setSelectedSourceId(null); }}
          />
        </div>
      </div>

      {/* 2. OVERLAY LAYER (Floating UI) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        
        {/* --- TOP LEFT ISLAND (Primary Actions) --- */}
        <div className={clsx(
          "absolute top-6 z-50 pointer-events-auto transition-all duration-300",
          showSourceExplorer ? "left-[304px]" : "left-6"
        )}>
            <div className="bg-cyber-slate/90 backdrop-blur-md border border-white/10 rounded-lg p-1.5 flex items-center gap-2 shadow-xl">

              {/* Inject — Cyan (Primary CTA) */}
              <button
                onClick={() => setShowInjectionHub(true)}
                className="flex items-center gap-2 bg-cyber-cyan hover:bg-cyan-400 text-black px-4 py-2 rounded-md text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-105"
                title="Quick Inject [Key: I]"
              >
                 <Plus size={16} strokeWidth={3} />
                 <span className="hidden sm:inline">Inject</span>
              </button>

              {/* Sources — Indigo */}
              <button
                onClick={() => setShowSourceExplorer(prev => !prev)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border group",
                  showSourceExplorer
                    ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/50"
                    : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                )}
                title="Source Explorer"
              >
                <BookOpen size={16} />
                <span className="hidden sm:inline">Sources</span>
              </button>

              {/* Automate — Purple */}
              <button
                onClick={() => setShowAutomatePanel(true)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border group",
                  showAutomatePanel
                    ? "bg-purple-500/20 text-purple-400 border-purple-500/50"
                    : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                )}
                title="Automated Pipelines"
              >
                <Workflow size={16} />
                <span className="hidden sm:inline">Automate</span>
              </button>

              {/* Queue — Amber */}
              <button
                onClick={() => setShowQueuePanel(true)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border group",
                  showQueuePanel
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                    : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                )}
                title="Processing Queue"
              >
                <ListTodo size={16} />
                <span className="hidden sm:inline">Queue</span>
              </button>

              {/* Orientation — Violet */}
              <button
                onClick={() => setShowOrientation(true)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold transition-all border group",
                  showOrientation
                    ? "bg-violet-500/20 text-violet-400 border-violet-500/50"
                    : "bg-transparent text-slate-400 border-transparent hover:bg-white/5 hover:text-white"
                )}
                title="Orientation Center [Key: O]"
              >
                <Compass size={16} />
                <span className="hidden sm:inline">Orientation</span>
              </button>

            </div>
        </div>

        {/* --- TOP RIGHT ISLAND (Profile, Settings) --- */}
        <div className="absolute top-6 right-6 z-50 pointer-events-auto flex items-center gap-3">
            {/* Context Actions (Table Mode) */}
            {viewMode === 'table' && currentTable && (
                 <div className="bg-cyber-slate/90 backdrop-blur-md border border-white/10 rounded-lg p-1.5 flex items-center gap-1 shadow-xl">
                    <button onClick={() => loadData(currentTable)} className="p-2 hover:bg-white/10 rounded-md text-slate-400 hover:text-white">
                       <RefreshCw size={18} className={clsx(loading && "animate-spin")} />
                    </button>
                    <button
                      onClick={() => setIsAnalystOpen(!isAnalystOpen)}
                      className={clsx(
                        "p-2 rounded-md transition-all text-slate-400 hover:text-indigo-400",
                        isAnalystOpen && "text-indigo-400 bg-indigo-500/10"
                      )}
                    >
                      <Sparkles size={18} />
                    </button>
                 </div>
            )}

            {/* User & Sign Out */}
            <div className="bg-cyber-slate/90 backdrop-blur-md border border-white/10 rounded-lg p-1.5 flex items-center gap-2 shadow-xl">
               <div className="w-8 h-8 rounded-full bg-indigo-500 border-2 border-slate-900 flex items-center justify-center text-xs font-bold">
                 {user?.email?.charAt(0).toUpperCase() || 'U'}
               </div>
               <button
                 onClick={() => setShowSettings(true)}
                 className="p-2 hover:bg-white/10 rounded-md text-slate-400 hover:text-cyan-400 transition-colors"
                 title="Settings"
               >
                  <Settings size={16} />
               </button>
               <button
                 onClick={signOut}
                 className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                 title="Sign out"
               >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Sign Out</span>
               </button>
            </div>
        </div>

        {/* --- BOTTOM RIGHT CHAT FAB --- */}
        <div className="fixed bottom-6 right-6 z-50 pointer-events-auto">
            <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={clsx(
                    "flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 hover:scale-110",
                    isChatOpen 
                        ? "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white rotate-90" 
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)]"
                )}
                title="Neural Chat [Key: ]]"
            >
                {isChatOpen ? <X size={24} /> : <MessageSquare size={24} fill="currentColor" />}
            </button>
        </div>

      </div>

      {/* 3. MODAL LAYER (Table View) */}
      {viewMode === 'table' && (
        <div className="absolute inset-0 z-20 bg-cyber-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300 pt-24 px-4 pb-4">
              <div className="absolute top-6 right-8 z-30">
                 <button onClick={() => setViewMode('graph')} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition-colors">
                    <X size={24} />
                 </button>
              </div>
              
              <div className="h-full border border-white/10 rounded-xl overflow-hidden bg-cyber-slate/50 shadow-2xl relative">
                  {currentTable ? (
                    <DataGrid data={data} loading={loading} error={error} tableName={currentTable} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                       <Database size={48} className="mb-4 opacity-20" />
                       <p className="font-mono text-sm">SELECT A SCHEMA FROM THE DATA VAULT</p>
                       <button onClick={() => setShowDataVault(true)} className="mt-4 text-cyber-cyan hover:underline text-xs">OPEN VAULT</button>
                    </div>
                  )}
                  
                  {/* AI Analyst Overlay */}
                  {isAnalystOpen && (
                    <div className="absolute top-0 right-0 bottom-0 w-96 border-l border-white/10 shadow-2xl z-30">
                       <AIAnalyst 
                          tableName={currentTable}
                          data={data}
                          isOpen={isAnalystOpen}
                          onClose={() => setIsAnalystOpen(false)}
                        />
                    </div>
                  )}
              </div>
        </div>
      )}

      {/* 4. MODAL LAYER (Injection Hub) */}
      {showInjectionHub && (
        <div className="absolute inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in slide-in-from-bottom-10">
           <div className="absolute top-6 right-6 z-50">
              <button 
                onClick={() => setShowInjectionHub(false)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
           </div>
           <div className="h-full pt-24 pb-6 px-6">
              <InjectionHub 
                onComplete={() => { setShowInjectionHub(false); handleGraphUpdate(); }} 
                onGraphUpdate={handleGraphUpdate}
              />
           </div>
        </div>
      )}

      {/* 4b. MODAL LAYER (Automate Panel) */}
      {showAutomatePanel && (
        <div className="absolute inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in slide-in-from-bottom-10">
           <div className="absolute top-6 right-6 z-50">
              <button
                onClick={() => setShowAutomatePanel(false)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
           </div>
           <div className="h-full pt-20 pb-6 px-6">
              <AutomatePanel
                onGraphUpdate={handleGraphUpdate}
                onNavigateToQueue={() => {
                  setShowAutomatePanel(false);
                  setShowQueuePanel(true);
                }}
              />
           </div>
        </div>
      )}

      {/* 4d. MODAL LAYER (Queue Panel) */}
      {showQueuePanel && (
        <div className="absolute inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in slide-in-from-bottom-10">
           <div className="absolute top-6 right-6 z-50">
              <button
                onClick={() => setShowQueuePanel(false)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
           </div>
           <div className="h-full pt-20 pb-6 px-6 overflow-y-auto">
              <div className="max-w-4xl mx-auto w-full h-full">
                <QueueHub
                  onGraphUpdate={handleGraphUpdate}
                  onViewSource={(sourceId) => {
                    handleSourceSelect(sourceId);
                    setShowQueuePanel(false);
                  }}
                />
              </div>
           </div>
        </div>
      )}

      {/* 4c. MODAL LAYER (History Panel) */}
      {showHistoryPanel && (
        <div className="absolute inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in slide-in-from-bottom-10">
           <div className="absolute top-6 right-6 z-50">
              <button
                onClick={() => setShowHistoryPanel(false)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
           </div>
           <div className="h-full pt-20 pb-6 px-6">
              <HistoryPanel />
           </div>
        </div>
      )}

      {/* 4d. MODAL LAYER (Orientation Center) */}
      {showOrientation && (
        <div className="absolute inset-0 z-50 bg-cyber-black/95 backdrop-blur-xl animate-in slide-in-from-bottom-10">
           <div className="absolute top-6 right-6 z-50">
              <button
                onClick={() => setShowOrientation(false)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
           </div>
           <div className="h-full pt-20 pb-6 px-6">
              <OrientationCenter isOpen={showOrientation} onClose={() => setShowOrientation(false)} />
           </div>
        </div>
      )}

      {/* 5. DRAWER LAYER (Data Vault) */}
      <Sidebar 
        isOpen={showDataVault}
        onClose={() => setShowDataVault(false)}
        currentTable={currentTable}
        onSelectTable={handleTableSelect}
        recentTables={recentTables}
        onDiscoveredTables={setDiscoveredTables}
      />


      {/* 7. CHAT INTERFACE */}
      <ChatInterface
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        traceNode={traceNode}
        onNodeSelect={handleChatNodeSelect}
      />

      {/* 8. UNIFIED SETTINGS PANEL */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onAnchorUpdate={() => setGraphRefreshTrigger(prev => prev + 1)}
      />
    </div>
  );
};

// Main App component with routing
const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Redirect root to login */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected dashboard/app route */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <MainApp />
              </ProtectedRoute>
            }
          />

          {/* Legacy redirect */}
          <Route
            path="/dashboard"
            element={<Navigate to="/app" replace />}
          />

          {/* Catch-all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;