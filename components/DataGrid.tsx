import React, { useState, useEffect, useMemo } from 'react';
import { TableRow } from '../types';
import { 
  AlertCircle, Plus, Search, RefreshCw, Filter, ArrowUpDown, 
  ChevronLeft, ChevronRight, Download, Trash2, CheckSquare, Square,
  MoreHorizontal, FileSpreadsheet, X, Save, Database
} from 'lucide-react';
import { fetchTableData, insertRows, deleteRows } from '../services/supabase';
import clsx from 'clsx';

interface DataGridProps {
  data: TableRow[] | null;
  loading: boolean; // Initial loading state from parent (can be ignored if we manage our own fetch)
  error: string | null;
  tableName?: string; // Optional, useful for refreshing
}

// Helper to guess column types based on value
const guessType = (value: any): string => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'object') return 'json';
  if (typeof value === 'string') {
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) return 'date';
    if (value.length > 36) return 'text';
    return 'varchar';
  }
  return 'unknown';
};

export const DataGrid: React.FC<DataGridProps> = ({ data: initialData, loading: initialLoading, error: initialError, tableName }) => {
  // Local Data State (to handle pagination/refresh internally)
  const [tableData, setTableData] = useState<TableRow[]>(initialData || []);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [loadError, setLoadError] = useState(initialError);

  // View State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [sort, setSort] = useState<{ column: string, ascending: boolean } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filterText, setFilterText] = useState('');
  
  // Modal State
  const [showInsertModal, setShowInsertModal] = useState(false);

  // Sync initial props
  useEffect(() => {
    if (initialData) {
      setTableData(initialData);
      setTotalCount(initialData.length); // Approximation if count not provided
    }
  }, [initialData]);

  // Fetch Data Wrapper
  const refreshData = async () => {
    if (!tableName) return;
    setIsLoading(true);
    try {
      const { data, count, error } = await fetchTableData(tableName, page, pageSize, sort);
      if (error) throw error;
      setTableData(data || []);
      setTotalCount(count || 0);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [page, pageSize, sort, tableName]);

  // Columns derivation
  const columns = useMemo(() => {
    if (tableData.length > 0) return Object.keys(tableData[0]);
    return ['id', 'created_at']; // Fallback common defaults
  }, [tableData]);

  // Filtering (Client-side for active page)
  const filteredData = useMemo(() => {
    if (!filterText) return tableData;
    return tableData.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(filterText.toLowerCase())
      )
    );
  }, [tableData, filterText]);

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedRows.size === filteredData.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredData.map(r => r.id || JSON.stringify(r))));
    }
  };

  const toggleSelectRow = (id: string) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRows(newSet);
  };

  const handleDeleteSelected = async () => {
    if (!tableName || selectedRows.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedRows.size} rows?`)) return;

    setIsLoading(true);
    try {
      await deleteRows(tableName, Array.from(selectedRows));
      setSelectedRows(new Set());
      await refreshData();
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Render Helpers
  const formatCell = (value: any) => {
    if (value === null || value === undefined) return <span className="text-slate-500 italic">NULL</span>;
    if (typeof value === 'boolean') return <span className={clsx("px-1.5 py-0.5 rounded text-[10px] font-bold", value ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400")}>{String(value)}</span>;
    if (typeof value === 'object') return <span className="text-slate-400 font-mono text-[10px]">{JSON.stringify(value).slice(0, 30)}...</span>;
    return String(value);
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 p-8">
        <AlertCircle size={32} className="mb-2" />
        <p className="font-mono text-sm">{loadError}</p>
        <button onClick={refreshData} className="mt-4 px-4 py-2 bg-slate-800 rounded hover:bg-slate-700">Retry</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-cyber-dark text-slate-300 font-sans">
      
      {/* 1. TOOLBAR */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-cyber-slate">
        <div className="flex items-center gap-4">
           {/* Table Tabs (Visual only for now since Sidebar controls active) */}
           <div className="flex items-center gap-2 bg-black/20 p-1 rounded-lg">
              <button className="px-3 py-1.5 rounded-md bg-cyber-cyan/10 text-cyber-cyan text-xs font-bold border border-cyber-cyan/30 shadow-sm flex items-center gap-2">
                 <Database size={12} />
                 {tableName || 'Table'}
              </button>
              <div className="h-4 w-px bg-white/10 mx-1"></div>
              <span className="text-xs text-slate-500 font-mono">{totalCount} records</span>
           </div>
           
           {/* Filter */}
           <div className="relative group">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500 group-focus-within:text-cyber-cyan"/>
              <input 
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter rows..."
                className="pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-md text-xs focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/50 outline-none w-48 transition-all"
              />
           </div>
        </div>

        <div className="flex items-center gap-2">
           {selectedRows.size > 0 && (
             <button 
               onClick={handleDeleteSelected}
               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900 transition-all animate-in fade-in"
             >
               <Trash2 size={14} /> Delete ({selectedRows.size})
             </button>
           )}

           <button 
             onClick={refreshData} 
             className={clsx("p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded transition-colors", isLoading && "animate-spin")}
             title="Refresh Data"
           >
             <RefreshCw size={16} />
           </button>
           
           <div className="h-4 w-px bg-white/10 mx-1"></div>

           <button 
             onClick={() => setShowInsertModal(true)}
             className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg shadow-emerald-900/20 transition-all hover:translate-y-[-1px]"
           >
             <Plus size={14} /> Insert
           </button>
        </div>
      </div>

      {/* 2. TABLE AREA */}
      <div className="flex-1 overflow-auto relative custom-scrollbar bg-cyber-black">
        <table className="min-w-full text-left border-collapse">
          <thead className="bg-cyber-slate sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Checkbox Col */}
              <th className="w-10 px-4 py-3 border-b border-white/10 bg-cyber-slate">
                <button onClick={toggleSelectAll} className="text-slate-500 hover:text-cyber-cyan transition-colors">
                  {selectedRows.size > 0 && selectedRows.size === filteredData.length ? <CheckSquare size={14}/> : <Square size={14}/>}
                </button>
              </th>
              
              {/* Data Cols */}
              {columns.map(col => (
                <th 
                  key={col} 
                  className="px-4 py-2 border-b border-white/10 border-r border-white/5 text-xs font-mono font-medium text-slate-400 uppercase tracking-wider group hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => setSort({ column: col, ascending: sort?.column === col ? !sort.ascending : true })}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-cyber-cyan opacity-50 text-[10px]">{guessType(filteredData[0]?.[col])}</span>
                    <span className="group-hover:text-slate-200">{col}</span>
                    {sort?.column === col && <ArrowUpDown size={12} className={clsx("text-cyber-cyan", !sort.ascending && "rotate-180")} />}
                  </div>
                </th>
              ))}
              <th className="w-10 border-b border-white/10 bg-cyber-slate"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredData.length === 0 ? (
               <tr>
                 <td colSpan={columns.length + 2} className="py-20 text-center text-slate-600">
                    <div className="flex flex-col items-center">
                       <Database size={32} className="mb-3 opacity-20"/>
                       <p className="text-sm">No records found.</p>
                       <button onClick={() => setShowInsertModal(true)} className="mt-2 text-cyber-cyan text-xs hover:underline">Add a new record</button>
                    </div>
                 </td>
               </tr>
            ) : (
              filteredData.map((row, idx) => {
                const rowId = row.id || JSON.stringify(row);
                const isSelected = selectedRows.has(rowId);
                return (
                  <tr key={idx} className={clsx("group transition-colors", isSelected ? "bg-cyber-cyan/5" : "hover:bg-white/[0.02]")}>
                    <td className="px-4 py-2">
                      <button onClick={() => toggleSelectRow(rowId)} className={clsx("text-slate-600 hover:text-cyber-cyan", isSelected && "text-cyber-cyan")}>
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    {columns.map(col => (
                      <td key={col} className="px-4 py-2 text-xs font-mono text-slate-400 border-r border-white/5 max-w-[200px] truncate group-hover:text-slate-300">
                        {formatCell(row[col])}
                      </td>
                    ))}
                    <td className="px-2 text-center">
                       <button className="text-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                         <MoreHorizontal size={14}/>
                       </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. PAGINATION FOOTER */}
      <div className="h-10 border-t border-white/10 bg-cyber-slate flex items-center justify-between px-4 text-xs text-slate-500">
         <div className="flex items-center gap-4">
            <span>
              Showing {Math.min(filteredData.length, pageSize)} of {totalCount} rows
            </span>
            <select 
              value={pageSize} 
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-black/40 border border-white/10 rounded px-2 py-0.5 focus:border-cyber-cyan outline-none"
            >
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={500}>500 rows</option>
            </select>
         </div>

         <div className="flex items-center gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-mono text-slate-300">Page {page}</span>
            <button 
              onClick={() => setPage(p => p + 1)}
              disabled={filteredData.length < pageSize}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
         </div>
      </div>

      {/* INSERT MODAL */}
      {showInsertModal && tableName && (
        <InsertModal 
          columns={columns} 
          tableName={tableName} 
          onClose={() => setShowInsertModal(false)} 
          onSuccess={() => {
            setShowInsertModal(false);
            refreshData();
          }} 
        />
      )}
    </div>
  );
};

// --- INSERT MODAL COMPONENT ---

interface InsertModalProps {
  columns: string[];
  tableName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const InsertModal: React.FC<InsertModalProps> = ({ columns, tableName, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'manual' | 'csv'>('manual');
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [csvContent, setCsvContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form data with nulls except ID (auto)
  useEffect(() => {
    const init: Record<string, any> = {};
    columns.forEach(col => {
      if (col !== 'id' && col !== 'created_at') init[col] = '';
    });
    setFormData(init);
  }, [columns]);

  const handleManualSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // Filter out empty strings to allow defaults to trigger
      const payload: any = {};
      Object.entries(formData).forEach(([k, v]) => {
         if (v !== '') payload[k] = v;
      });

      const { error } = await insertRows(tableName, [payload]);
      if (error) throw error;
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvSubmit = async () => {
    if (!csvContent) return;
    setIsSubmitting(true);
    setError(null);

    try {
      // Simple CSV Parse
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) throw new Error("CSV must have header and at least one row");
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((h, i) => {
          if (values[i] !== undefined && values[i] !== '') row[h] = values[i];
        });
        return row;
      });

      const { error } = await insertRows(tableName, rows);
      if (error) throw error;
      onSuccess();
    } catch (e: any) {
      setError("CSV Import Failed: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in">
       <div className="bg-cyber-slate border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
             <div className="flex items-center gap-3">
               <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-500">
                 {mode === 'manual' ? <Plus size={18} /> : <FileSpreadsheet size={18} />}
               </div>
               <div>
                  <h3 className="text-white font-bold">Insert into <span className="text-cyber-cyan">{tableName}</span></h3>
                  <p className="text-xs text-slate-500">Add new records to the database.</p>
               </div>
             </div>
             <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20}/></button>
          </div>

          <div className="flex border-b border-white/5">
             <button 
               onClick={() => setMode('manual')}
               className={clsx("flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors", mode === 'manual' ? "border-cyber-cyan text-cyber-cyan bg-cyber-cyan/5" : "border-transparent text-slate-500 hover:bg-white/5")}
             >
               Row Form
             </button>
             <button 
               onClick={() => setMode('csv')}
               className={clsx("flex-1 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors", mode === 'csv' ? "border-emerald-500 text-emerald-500 bg-emerald-500/5" : "border-transparent text-slate-500 hover:bg-white/5")}
             >
               CSV Upload
             </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
             {error && (
               <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded flex gap-2 text-red-400 text-sm">
                 <AlertCircle size={16} className="mt-0.5 shrink-0"/>
                 <p>{error}</p>
               </div>
             )}

             {mode === 'manual' ? (
                <div className="grid grid-cols-2 gap-4">
                   {Object.keys(formData).map(key => (
                     <div key={key}>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{key}</label>
                        <input 
                          value={formData[key]}
                          onChange={(e) => setFormData({...formData, [key]: e.target.value})}
                          placeholder="NULL"
                          className="w-full bg-black/40 border border-white/10 rounded p-2 text-sm text-slate-200 focus:border-cyber-cyan focus:ring-1 focus:ring-cyber-cyan outline-none transition-all"
                        />
                     </div>
                   ))}
                </div>
             ) : (
                <div className="h-full flex flex-col">
                   <p className="text-sm text-slate-400 mb-2">Paste CSV content below. First row must be headers matching column names.</p>
                   <textarea 
                     value={csvContent}
                     onChange={(e) => setCsvContent(e.target.value)}
                     className="flex-1 min-h-[200px] bg-black/40 border border-white/10 rounded p-4 font-mono text-xs text-slate-300 focus:border-emerald-500 outline-none"
                     placeholder={`label,entity_type,description\n"Project X","Project","A top secret initiative..."`}
                   />
                </div>
             )}
          </div>

          <div className="p-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
             <button onClick={onClose} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
             <button 
               onClick={mode === 'manual' ? handleManualSubmit : handleCsvSubmit}
               disabled={isSubmitting}
               className={clsx(
                 "px-6 py-2 rounded font-bold text-sm text-white shadow-lg flex items-center gap-2",
                 mode === 'manual' ? "bg-cyber-cyan hover:bg-cyan-400 shadow-cyan-900/20" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20",
                 isSubmitting && "opacity-50 cursor-wait"
               )}
             >
               {isSubmitting ? <RefreshCw className="animate-spin" size={16}/> : <Save size={16}/>}
               {mode === 'manual' ? 'Save Record' : 'Import CSV'}
             </button>
          </div>

       </div>
    </div>
  );
}