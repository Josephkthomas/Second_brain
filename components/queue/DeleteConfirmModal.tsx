// DeleteConfirmModal — Styled confirmation for queue item deletion
// Supports force-cancel for processing items and toggle for node/edge cascade deletion

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { UnifiedQueueItem, DeleteOptions } from '../../types/queue';

interface DeleteConfirmModalProps {
  item: UnifiedQueueItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: DeleteOptions) => void;
  isDeleting: boolean;
}

export default function DeleteConfirmModal({
  item,
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: DeleteConfirmModalProps) {
  const isProcessing = item.status === 'processing';
  const hasExtractedData = item.sourceId && (item.nodesCreated > 0 || item.edgesCreated > 0);
  const [deleteNodes, setDeleteNodes] = useState(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      deleteNodesAndEdges: deleteNodes && !!item.sourceId,
      forceCancel: isProcessing,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-6">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-slate-500 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        {/* Icon */}
        <div className={clsx(
          'w-12 h-12 rounded-full flex items-center justify-center mb-4',
          isProcessing ? 'bg-amber-500/10' : 'bg-red-500/10'
        )}>
          {isProcessing ? (
            <AlertTriangle size={24} className="text-amber-400" />
          ) : (
            <Trash2 size={24} className="text-red-400" />
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-white mb-1">
          {isProcessing ? 'Force Delete' : 'Delete Item'}
        </h3>
        <p className="text-sm text-slate-400 mb-4 line-clamp-1">
          {item.title}
        </p>

        {/* Processing warning */}
        {isProcessing && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-4">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-300 leading-relaxed">
              This item is currently being processed. Deleting now will stop processing and remove all extracted data.
            </p>
          </div>
        )}

        {/* Node deletion toggle */}
        {(hasExtractedData || item.sourceId) && (
          <label className="flex items-start gap-3 p-3 bg-slate-800/50 border border-white/5 rounded-lg mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={deleteNodes}
              onChange={(e) => setDeleteNodes(e.target.checked)}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm text-white">Also delete extracted knowledge</span>
              {hasExtractedData && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {item.nodesCreated} nodes and {item.edgesCreated} edges will be removed from your graph
                </p>
              )}
            </div>
          </label>
        )}

        {/* Info text */}
        <p className="text-xs text-slate-500 mb-5">
          This action cannot be undone.
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            Keep
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isDeleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            {isProcessing ? 'Force Delete' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
