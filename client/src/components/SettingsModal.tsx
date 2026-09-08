import React, { useState } from 'react';
import { X, Key, Shield, Building2, Save, Sun, Moon, Palette } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  advocateName: string;
  onSaveAdvocateName: (name: string) => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  advocateName,
  onSaveAdvocateName,
  theme = 'light',
  onToggleTheme,
}) => {
  const [localKey, setLocalKey] = useState(apiKey);
  const [localName, setLocalName] = useState(advocateName);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveApiKey(localKey);
    onSaveAdvocateName(localName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 text-slate-900 dark:text-white">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">JurisCopilot Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Theme Selection */}
          {onToggleTheme && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <Palette className="w-4 h-4 text-indigo-500" />
                UI Workspace Theme
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => theme !== 'dark' && onToggleTheme()}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition ${
                    theme === 'dark'
                      ? 'bg-indigo-950/60 dark:bg-indigo-950/60 border-indigo-500 text-indigo-200 ring-2 ring-indigo-500/50'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-900 text-amber-400 border border-slate-700">
                      <Moon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">Dark Mode</div>
                      <div className="text-[10px] text-slate-400">High contrast dark</div>
                    </div>
                  </div>
                  {theme === 'dark' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => theme !== 'light' && onToggleTheme()}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition ${
                    theme === 'light'
                      ? 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-500/50'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-750'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-amber-100 text-amber-600 border border-amber-200">
                      <Sun className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Light Mode</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Clean daylight mode</div>
                    </div>
                  </div>
                  {theme === 'light' && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-sm shadow-indigo-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              <Key className="w-4 h-4 text-amber-500" />
              Google Gemini API Key (Optional)
            </label>
            <input
              type="password"
              placeholder="AIzaSy... (Leave blank to use built-in offline legal engine)"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-mono"
            />
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              If left blank, JurisCopilot runs seamlessly using its built-in rule-based Indian court drafting engine.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              <Building2 className="w-4 h-4 text-blue-500" />
              Advocate / Firm Name
            </label>
            <input
              type="text"
              placeholder="e.g. Adv. Sachin Madhukar Mahajan"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 transition"
          >
            <Save className="w-4 h-4" />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

