import React, { useState } from 'react';
import { GitFork, Sparkles, X, Check, Copy, RefreshCw, Layers, Edit3, Eye, FileText, ArrowDown } from 'lucide-react';

interface FamilyTreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTree: (treeHtml: string, treeData?: any) => void;
  initialFacts?: Record<string, any>;
  apiKey?: string;
}

const SAMPLE_TREE_NOTES = `A) राघो मोतीराम महाजन (मूळ पुरुष - मयत)
मुले व मुली:
- ब्रह्मा.
- B-विष्णू (अविवाहित मयत)
- लक्ष्मीबाई.
- C-काशीराम.
- D-जीवराम.
- E-जसूबाई

शाखा 1: B-विष्णू अविवाहित मयत
वारसदार: ब्रह्मा., लक्ष्मीबाई., C-काशीराम., D-जीवराम., E-जसूबाई

शाखा 2: C-काशीराम.
मुले व मुली:
- मधुकर.
- लखीचंद.
- सुमनबाई.
- नर्मदाबाई.
- साहूबाई

शाखा 3: D-जीवराम.
मुले व मुली:
- नंदलाल
- F- प्रभाकर.
- नंदाबाई
- मंदाबाई
- कौशल्याबाई

शाखा 4: F- प्रभाकर.
मुले व मुली:
- मनीष.
- शितल.
- पुष्पाबाई

शाखा 5: E-जसूबाई
- पती - श्रीधर
- मुले - नाहीत.
- मुली - नाहीत.`;

export const FamilyTreeModal: React.FC<FamilyTreeModalProps> = ({
  isOpen,
  onClose,
  onInsertTree,
  initialFacts = {},
  apiKey,
}) => {
  const [inputText, setInputText] = useState<string>(() => {
    if (initialFacts?.familyTreeNotes) return initialFacts.familyTreeNotes;
    if (initialFacts?.deceasedName) {
      let draft = `${initialFacts.deceasedName} (मयत)\nवारसदार:\n`;
      for (let i = 1; i <= 6; i++) {
        if (initialFacts[`party${i}Name`]) {
          draft += `- ${initialFacts[`party${i}Name`]} (${initialFacts[`relation${i}`] || 'वारस'})\n`;
        }
      }
      return draft;
    }
    return '';
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'json'>('preview');
  const [generatedHtml, setGeneratedHtml] = useState<string>('');
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError('कृपया वंशावळीची माहिती (कुटुंब प्रमुख व वारसदार) प्रविष्ट करा.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch('/api/copilot/family-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: inputText,
          apiKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'वंशावळ तयार करता आली नाही.');
      }

      const data = await res.json();
      setGeneratedHtml(data.html || '');
      setGeneratedData(data.treeData || null);
      setActiveTab('preview');
    } catch (err: any) {
      console.error('Family Tree error:', err);
      setError(err.message || 'त्रुटी आढळली.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (!generatedHtml) {
      handleGenerate();
      return;
    }
    onInsertTree(generatedHtml, generatedData);
    onClose();
  };

  const handleCopyHtml = () => {
    if (!generatedHtml) return;
    navigator.clipboard.writeText(generatedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadSample = () => {
    setInputText(SAMPLE_TREE_NOTES);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                कोर्ट वंशावृक्ष / वंशावळ जनरेटर
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                  AI Pedigree Generator
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                वारस प्रमाणपत्र, वाटप दावा व दिवाणी अर्जांसाठी अचूक वंशावळ तक्ता तयार करा.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body (2-Column Grid) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Column: Input Notes & Actions */}
          <div className="md:col-span-5 p-5 border-r border-slate-200 dark:border-slate-800 flex flex-col gap-4 bg-slate-50/50 dark:bg-slate-900/50 overflow-y-auto">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                कुटुंब / वारस माहिती (Notes)
              </label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> नमुना भरा (Sample)
              </button>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="येथे मूळ पुरुष/मयत व त्यांच्या मुलांची/वारसांची माहिती लिहा... उदा.:&#10;राघो महाजन (मूळ पुरुष)&#10;मुले: विष्णू, काशीराम, जीवराम, जसूबाई&#10;काशीराम यांची मुले: मधुकर, लखीचंद"
              className="flex-1 min-h-[220px] p-3 text-xs leading-relaxed bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-slate-800 dark:text-slate-200 font-marathi resize-none shadow-inner"
            />

            {error && (
              <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl">
                {error}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !inputText.trim()}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  वंशावळ तयार होत आहे...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  AI वंशावळ तयार करा (Generate Tree)
                </>
              )}
            </button>
          </div>

          {/* Right Column: Visual Preview / Code */}
          <div className="md:col-span-7 flex flex-col overflow-hidden bg-white dark:bg-slate-950">
            {/* View Tabs */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  कोर्ट फॉरमॅट प्रिव्ह्यू (Live Preview)
                </button>
                <button
                  onClick={() => setActiveTab('json')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeTab === 'json'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  JSON डेटा
                </button>
              </div>

              {generatedHtml && (
                <button
                  onClick={handleCopyHtml}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'कॉपी झाले!' : 'HTML कॉपी करा'}
                </button>
              )}
            </div>

            {/* Preview Container */}
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30">
              {generatedHtml ? (
                activeTab === 'preview' ? (
                  <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm text-slate-900 dark:text-slate-100 font-marathi">
                    <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                  </div>
                ) : (
                  <pre className="p-4 bg-slate-900 text-slate-200 text-xs font-mono rounded-xl overflow-x-auto">
                    {JSON.stringify(generatedData, null, 2)}
                  </pre>
                )
              ) : (
                <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center">
                  <GitFork className="w-12 h-12 stroke-[1.5] text-slate-300 dark:text-slate-700" />
                  <div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">वंशावळ अजून तयार केलेली नाही</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                      डावीकडे कुटुंबाचा तपशील भरा किंवा &quot;नमुना भरा&quot; वर क्लिक करून AI जनरेटर चालवा.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {generatedHtml ? '✅ वंशावळ तयार आहे. दस्तऐवजात समाविष्ट करा.' : '💡 {familyTree} व्हेरिएबल आपोआप या तक्त्याने बदलले जाईल.'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              रद्द करा (Cancel)
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!generatedHtml && !inputText.trim()}
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2 transition-all active:scale-[0.98]"
            >
              <Check className="w-4 h-4" />
              दस्तऐवजात समाविष्ट करा (Insert into Draft)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
