import React, { useCallback, useEffect, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  EditorState,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
} from 'lexical';
import { $generateHtmlFromNodes } from '@lexical/html';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { Bold, Italic, Underline as UnderlineIcon, Indent, Outdent } from 'lucide-react';

// ─── AI Ghost-Text Autocomplete Plugin ────────────────────────────────────────
function AutocompletePlugin({
  apiKey,
  contextParams,
}: {
  apiKey: string;
  contextParams: { templateTitle: string; clientFacts: any };
}) {
  const [editor] = useLexicalComposerContext();
  const suggestionRef = useRef<string>('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostRef = useRef<HTMLSpanElement | null>(null);

  const removeSuggestion = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
    suggestionRef.current = '';
  }, []);

  const showSuggestion = useCallback(
    (text: string) => {
      removeSuggestion();
      const nativeSel = window.getSelection();
      if (!nativeSel || nativeSel.rangeCount === 0) return;
      const range = nativeSel.getRangeAt(0).cloneRange();
      range.collapse(false);
      const span = document.createElement('span');
      span.textContent = text;
      span.style.cssText =
        'color:#9ca3af;pointer-events:none;user-select:none;font-style:italic;';
      range.insertNode(span);
      ghostRef.current = span;
      suggestionRef.current = text;
    },
    [removeSuggestion],
  );

  // Tab → accept suggestion
  useEffect(
    () =>
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          if (!suggestionRef.current) return false;
          event.preventDefault();
          const text = suggestionRef.current;
          removeSuggestion();
          editor.update(() => {
            const sel = $getSelection();
            if ($isRangeSelection(sel)) sel.insertText(text);
          });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, removeSuggestion],
  );

  // Debounced autocomplete trigger
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        removeSuggestion();
        if (!apiKey) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(async () => {
          let textBefore = '';
          editorState.read(() => {
            const sel = $getSelection();
            if (!$isRangeSelection(sel) || !sel.isCollapsed()) return;
            const allText = $getRoot().getTextContent();
            textBefore = allText.slice(Math.max(0, allText.length - 200));
          });
          if (!textBefore.trim()) return;
          try {
            const res = await fetch('/api/copilot/autocomplete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                textBefore,
                templateTitle: contextParams.templateTitle,
                clientFacts: contextParams.clientFacts,
                apiKey,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.suggestion?.trim()) showSuggestion(data.suggestion.trim());
            }
          } catch {
            // silently ignore
          }
        }, 700);
      }),
    [editor, apiKey, contextParams, removeSuggestion, showSuggestion],
  );

  return null;
}

// ─── HTML Output Plugin (export Lexical state → HTML string) ──────────────────
function HtmlOutputPlugin({ onChange }: { onChange: (html: string) => void }) {
  const [editor] = useLexicalComposerContext();
  const lastHtml = useRef<string>('');

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const html = $generateHtmlFromNodes(editor, null);
        if (html !== lastHtml.current) {
          lastHtml.current = html;
          onChange(html);
        }
      });
    },
    [editor, onChange],
  );

  return <OnChangePlugin onChange={handleChange} />;
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function ToolbarPlugin() {
  const [editor] = useLexicalComposerContext();

  const Btn = ({
    icon: Icon,
    title,
    onClick,
  }: {
    icon: React.ElementType;
    title: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded hover:bg-indigo-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex-wrap">
      <Btn icon={Bold} title="Bold (Ctrl+B)" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')} />
      <Btn icon={Italic} title="Italic (Ctrl+I)" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')} />
      <Btn icon={UnderlineIcon} title="Underline (Ctrl+U)" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')} />
      <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
      <Btn icon={Indent} title="Indent" onClick={() => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)} />
      <Btn icon={Outdent} title="Outdent" onClick={() => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)} />
      <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 pr-1 hidden sm:block select-none">
        Lexical (Meta) · Tab → accept AI suggestion
      </span>
    </div>
  );
}

// ─── Lexical ProseMirror theme ─────────────────────────────────────────────────
const lexicalTheme = {
  paragraph: 'mb-3 last:mb-0',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: 'underline line-through',
    code: 'font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs',
  },
  list: {
    ul: 'list-disc pl-5 mb-3',
    ol: 'list-decimal pl-5 mb-3',
    listitem: 'mb-1',
    nested: { listitem: 'list-none' },
  },
  heading: {
    h1: 'text-2xl font-bold mb-3 mt-2',
    h2: 'text-xl font-bold mb-2 mt-2',
    h3: 'text-lg font-semibold mb-2 mt-1',
  },
  quote: 'border-l-4 border-indigo-400 pl-4 italic text-slate-600 dark:text-slate-400 my-2',
};

// ─── Main export ──────────────────────────────────────────────────────────────
interface LexicalEditorProps {
  documentBody: string;
  onChange: (html: string) => void;
  apiKey: string;
  contextParams: { templateTitle: string; clientFacts: any };
}

export const LexicalEditor: React.FC<LexicalEditorProps> = ({
  documentBody,
  onChange,
  apiKey,
  contextParams,
}) => {
  // Derive safe plain text from documentBody for initial seed
  const initialText = React.useMemo(() => {
    if (!documentBody) return '';
    try {
      const div = document.createElement('div');
      div.innerHTML = documentBody;
      return div.textContent || '';
    } catch {
      return '';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on first mount

  const initialConfig = {
    namespace: 'JurisCopilot-Lexical',
    theme: lexicalTheme,
    onError: (error: Error) => {
      console.warn('Lexical editor error (non-fatal):', error.message);
    },
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode],
    editorState: initialText
      ? (editor: any) => {
          const root = $getRoot();
          if (root.isEmpty()) {
            const para = $createParagraphNode();
            para.append($createTextNode(initialText));
            root.append(para);
          }
        }
      : undefined,
  };

  return (
    <div className="w-full flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin />
        <div className="relative">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="min-h-[850px] w-full px-4 py-4 text-slate-900 dark:text-slate-100 focus:outline-none leading-relaxed text-sm md:text-base font-marathi selection:bg-indigo-100 dark:selection:bg-indigo-900/40"
                aria-label="Lexical legal document editor"
              />
            }
            placeholder={
              <div className="absolute top-4 left-4 text-slate-400 dark:text-slate-500 pointer-events-none text-sm italic select-none">
                Start drafting… type to trigger AI ghost-text, Tab to accept.
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <AutoFocusPlugin />
        <ListPlugin />
        <HtmlOutputPlugin onChange={onChange} />
        <AutocompletePlugin apiKey={apiKey} contextParams={contextParams} />
      </LexicalComposer>
    </div>
  );
};
