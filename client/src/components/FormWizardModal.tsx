import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  ListOrdered,
  Wand2,
  CornerDownLeft,
  FileText
} from 'lucide-react';
import { ClientFacts, FieldDefinition } from '../types';
import { convertToDevanagari } from '../utils/transliterate';

interface FormWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  fields: FieldDefinition[];
  facts: ClientFacts;
  onFactChange: (key: string, value: any) => void;
  activeTemplateTitle?: string;
  apiKey?: string;
}

export const FormWizardModal: React.FC<FormWizardModalProps> = ({
  isOpen,
  onClose,
  fields,
  facts,
  onFactChange,
  activeTemplateTitle = 'Legal Document',
  apiKey = ''
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transliterating, setTransliterating] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  // Filter out any invalid fields
  const validFields = fields && fields.length > 0 ? fields : [];

  // Reset to first field whenever wizard opens or fields change
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
    }
  }, [isOpen, fields.length]);

  // Auto-focus active field input when step changes
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [currentIndex, isOpen]);

  if (!isOpen || validFields.length === 0) return null;

  const currentField = validFields[currentIndex] || validFields[0];
  const totalFields = validFields.length;
  const progressPercent = Math.round(((currentIndex + 1) / totalFields) * 100);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === totalFields - 1;

  const currentValue = facts[currentField.key] ?? currentField.defaultValue ?? '';

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleTransliterate = async () => {
    if (typeof currentValue !== 'string' || !currentValue.trim()) return;
    setTransliterating(true);
    try {
      const devanagari = await convertToDevanagari(currentValue, apiKey);
      if (devanagari) {
        onFactChange(currentField.key, devanagari);
      }
    } catch (err) {
      console.error('Transliteration failed:', err);
    } finally {
      setTransliterating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    // Enter key advances for non-textarea inputs or Ctrl/Cmd + Enter for textareas
    if (e.key === 'Enter') {
      if (currentField.type === 'textarea' && !(e.ctrlKey || e.metaKey)) {
        return; // Allow multiline newline in textarea unless Ctrl/Cmd is pressed
      }
      e.preventDefault();
      handleNext();
    }
  };

  const getGroupBadge = (groupKey?: string) => {
    switch (groupKey) {
      case 'court':
        return { name: 'Court & Jurisdiction', nameMr: 'कोर्ट व अधिकारक्षेत्र', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' };
      case 'party1':
        return { name: 'Party 1 / Applicant', nameMr: 'पक्षकार १ / अर्जदार', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800' };
      case 'party2':
        return { name: 'Party 2 / Opponent', nameMr: 'पक्षकार २ / सामनेवाले', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800' };
      case 'marriage':
        return { name: 'Marriage Details', nameMr: 'विवाह तपशील', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800' };
      case 'terms':
        return { name: 'Terms & Covenant', nameMr: 'अटी व नियम', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' };
      default:
        return { name: 'General Facts', nameMr: 'सामान्य माहिती', color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
    }
  };

  const badge = getGroupBadge(currentField.group);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden transform transition-all duration-200"
        onKeyDown={handleKeyDown}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Step-by-Step Form Wizard
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {activeTemplateTitle}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Answer one by one — updates client particulars & live document draft automatically
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close Wizard (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar Header */}
        <div className="px-6 py-2.5 bg-slate-100/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
              Step {currentIndex + 1} of {totalFields}
            </span>
            <span className="text-slate-400">•</span>
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badge.color}`}>
              {badge.name} {badge.nameMr && <span className="font-marathi">({badge.nameMr})</span>}
            </span>
          </div>

          {/* Quick Jump Selector */}
          <div className="flex items-center gap-1.5">
            <ListOrdered className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={currentIndex}
              onChange={(e) => setCurrentIndex(Number(e.target.value))}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium cursor-pointer"
            >
              {validFields.map((f, idx) => (
                <option key={f.key || idx} value={idx}>
                  {idx + 1}. {f.label} {f.labelMr ? `(${f.labelMr})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Progress Line */}
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Main Card Content */}
        <div className="p-6 md:p-8 flex-1 flex flex-col justify-center min-h-[300px]">
          {/* Question Title & Marathi translation */}
          <div className="mb-6 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase flex items-center gap-1.5">
                <FileText className="w-4 h-4" />
                {currentField.label}
                {currentField.required && <span className="text-rose-500 font-bold">*</span>}
              </label>
              {currentField.placeholder && (
                <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                  {`{${currentField.key}}`}
                </span>
              )}
            </div>

            {currentField.labelMr && (
              <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white font-marathi leading-snug">
                {currentField.labelMr}
              </h2>
            )}
          </div>

          {/* Dynamic Field Inputs */}
          <div className="space-y-4">
            {currentField.type === 'boolean' ? (
              <label className="flex items-center gap-3.5 p-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 bg-slate-50 dark:bg-slate-800/50 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={Boolean(currentValue)}
                  onChange={(e) => onFactChange(currentField.key, e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {currentField.label} {currentField.labelMr && <span className="font-marathi">({currentField.labelMr})</span>}
                </span>
              </label>
            ) : currentField.type === 'select' ? (
              <div className="space-y-2">
                <select
                  ref={inputRef as React.RefObject<HTMLSelectElement>}
                  value={currentValue}
                  onChange={(e) => onFactChange(currentField.key, e.target.value)}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-marathi text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm cursor-pointer"
                >
                  {(!currentValue || (currentField.options || []).length === 0) && (
                    <option value="">-- पर्याय निवडा (Select Option) --</option>
                  )}
                  {(currentField.options || []).map((opt: any, oIdx: number) => {
                    const optVal = typeof opt === 'string' ? opt : opt.value;
                    const optLbl = typeof opt === 'string' ? opt : opt.label;
                    return (
                      <option key={optVal || oIdx} value={optVal}>
                        {optLbl}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : currentField.type === 'textarea' ? (
              <div className="space-y-2 relative">
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  rows={4}
                  value={currentValue}
                  onChange={(e) => onFactChange(currentField.key, e.target.value)}
                  placeholder={currentField.placeholder || `Enter ${currentField.label}...`}
                  className="w-full p-3.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-marathi text-sm md:text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm resize-y leading-relaxed"
                />
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <CornerDownLeft className="w-3 h-3" /> Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-[10px]">Ctrl+Enter</kbd> to save & next
                  </span>
                  <button
                    type="button"
                    onClick={handleTransliterate}
                    disabled={transliterating || !String(currentValue).trim()}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg font-semibold text-xs transition cursor-pointer disabled:opacity-50"
                    title="Convert English typing to Marathi Devanagari script using AI"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>{transliterating ? 'रूपांतर होत आहे...' : 'म Transliterate'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 relative">
                <div className="relative flex items-center">
                  <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type={currentField.type === 'date' ? 'date' : 'text'}
                    value={currentValue}
                    onChange={(e) => onFactChange(currentField.key, e.target.value)}
                    placeholder={currentField.placeholder || `Enter ${currentField.label}...`}
                    className="w-full p-3.5 pr-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-marathi text-base focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none shadow-sm"
                  />
                  {currentField.type !== 'date' && (
                    <button
                      type="button"
                      onClick={handleTransliterate}
                      disabled={transliterating || !String(currentValue).trim()}
                      className="absolute right-2 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg font-bold text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-sm"
                      title="Convert English typing to Marathi Devanagari script using AI"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>{transliterating ? '...' : 'म'}</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 text-[11px]">
                    <CornerDownLeft className="w-3 h-3" /> Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-[10px]">Enter</kbd> to move to next field
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirstStep}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/70 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous (मागे)</span>
          </button>

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <button
                type="button"
                onClick={handleNext}
                className="px-3.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
              >
                Skip (वगळा)
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-95 transition cursor-pointer"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Finish & View Draft (पूर्ण करा)</span>
                </>
              ) : (
                <>
                  <span>Next Field (पुढील)</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
