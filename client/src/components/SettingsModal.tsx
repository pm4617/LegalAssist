import React, { useState } from 'react';
import { X, Key, Shield, Building2, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  advocateName: string;
  onSaveAdvocateName: (name: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  advocateName,
  onSaveAdvocateName,
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
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">JurisCopilot Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              Google Gemini API Key (Optional)
            </label>
            <input
              type="password"
              placeholder="AIzaSy... (Leave blank to use built-in offline legal engine)"
              value={localKey}
              onChange={(e) => setLocalKey(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition font-mono"
            />
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              If left blank, JurisCopilot runs seamlessly using its built-in rule-based Indian court drafting engine.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
              <Building2 className="w-4 h-4 text-blue-400" />
              Advocate / Firm Name
            </label>
            <input
              type="text"
              placeholder="e.g. Adv. Sachin Madhukar Mahajan"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-800/30">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
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

