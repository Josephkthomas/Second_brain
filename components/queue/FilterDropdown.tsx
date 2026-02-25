// FilterDropdown — Excel-style multi-select dropdown with checkboxes
// Click to open, select/deselect options, click outside to close

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
  icon?: React.ReactNode;
  color?: string; // accent color class like 'text-red-400'
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  selected: Set<string>;             // empty = "all"
  onChange: (selected: Set<string>) => void;
  icon?: React.ReactNode;
}

export default function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  icon,
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const allSelected = selected.size === 0;
  const totalCount = options.reduce((sum, o) => sum + o.count, 0);

  const toggleAll = () => {
    onChange(new Set());
  };

  const toggleOption = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    // If all options are selected, reset to empty (= "all")
    if (next.size === options.length) {
      onChange(new Set());
    } else {
      onChange(next);
    }
  };

  // Display text for the button
  const displayText = allSelected
    ? `All ${label}`
    : selected.size === 1
      ? options.find(o => o.value === Array.from(selected)[0])?.label || label
      : `${selected.size} ${label}`;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
          !allSelected
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            : 'bg-slate-900 border-white/10 text-slate-400 hover:text-slate-200'
        )}
      >
        {icon}
        <span>{displayText}</span>
        <span className="text-slate-600">({allSelected ? totalCount : options.filter(o => selected.has(o.value)).reduce((s, o) => s + o.count, 0)})</span>
        <ChevronDown size={14} className={clsx('transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-slate-900 border border-white/10 rounded-lg shadow-2xl py-1 animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Select All */}
          <button
            onClick={toggleAll}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
              allSelected ? 'text-cyan-400 bg-cyan-500/5' : 'text-slate-400 hover:bg-white/5'
            )}
          >
            <div className={clsx(
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
              allSelected ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'
            )}>
              {allSelected && <Check size={12} className="text-white" />}
            </div>
            <span className="font-medium">Select All</span>
            <span className="ml-auto text-slate-600">{totalCount}</span>
          </button>

          <div className="h-px bg-white/5 my-1" />

          {/* Individual options */}
          {options.map(option => {
            const isChecked = allSelected || selected.has(option.value);
            return (
              <button
                key={option.value}
                onClick={() => toggleOption(option.value)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                  isChecked && !allSelected ? 'text-white bg-white/5' : 'text-slate-400 hover:bg-white/5'
                )}
              >
                <div className={clsx(
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  isChecked ? 'bg-cyan-500 border-cyan-500' : 'border-slate-600'
                )}>
                  {isChecked && <Check size={12} className="text-white" />}
                </div>
                {option.icon && <span className={option.color || 'text-slate-400'}>{option.icon}</span>}
                <span>{option.label}</span>
                <span className="ml-auto text-slate-600">{option.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
