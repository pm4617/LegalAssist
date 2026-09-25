import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TipTapCopilotExtension } from './TipTapCopilotExtension';

interface TipTapEditorProps {
  documentBody: string;
  onChange: (html: string) => void;
  apiKey: string;
  contextParams: {
    templateTitle: string;
    clientFacts: any;
  };
}

// Custom extensions that preserve inline styles and borders on tables
const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
}).configure({ resizable: true });

const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) return {};
          return { style: attributes.style };
        },
      },
    };
  },
});

export const TipTapEditor: React.FC<TipTapEditorProps> = ({
  documentBody,
  onChange,
  apiKey,
  contextParams,
}) => {
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSelfUpdate = useRef(false);

  const editor = useEditor({
    parseOptions: {
      preserveWhitespace: 'full',
    },
    extensions: [
      // Core kit — disable built-ins that we override
      StarterKit.configure({
        // StarterKit includes bold, italic, strike, code, heading, etc.
      }),

      // Formatting not in StarterKit
      Underline,
      TextStyle,   // required by Color
      Color,

      // Text alignment (covers left/center/right/justify on any block)
      TextAlign.configure({
        types: ['heading', 'paragraph'],
        alignments: ['left', 'center', 'right', 'justify'],
      }),

      // Image passthrough (so <img> tags aren't stripped)
      Image.configure({ inline: true, allowBase64: true }),

      // Table support with style attribute retention
      CustomTable,
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell,

      // AI ghost-text extension
      TipTapCopilotExtension,
    ],
    content: documentBody,
    editorProps: {
      attributes: {
        class: [
          'w-full h-auto min-h-[850px]',
          'outline-none border-none bg-transparent',
          'text-slate-900 dark:text-slate-100',
          'font-marathi text-sm md:text-base leading-relaxed',
          'selection:bg-indigo-100 dark:selection:bg-indigo-900/40',
          'p-0 overflow-visible',
          // Table styles via attribute class
          '[&_table]:w-full [&_table]:border-collapse [&_table]:my-3',
          '[&_td]:border [&_td]:border-slate-300 [&_td]:dark:border-slate-600 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
          '[&_th]:border [&_th]:border-slate-300 [&_th]:dark:border-slate-600 [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-slate-100 [&_th]:dark:bg-slate-800 [&_th]:font-semibold [&_th]:text-left',
        ].join(' '),
      },
    },
    onUpdate: ({ editor }) => {
      isSelfUpdate.current = true;
      onChange(editor.getHTML());

      // Clear ghost-text on any keystroke
      editor.commands.clearSuggestion();

      // Debounced AI autocomplete
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(async () => {
        if (!apiKey) return;
        try {
          const { state } = editor;
          const { selection } = state;
          if (!selection.empty) return;

          const textBefore = state.doc.textBetween(
            Math.max(0, selection.from - 200),
            selection.from,
            '\n',
            ' ',
          );
          if (!textBefore.trim()) return;

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
            if (data.suggestion) editor.commands.setSuggestion(data.suggestion);
          }
        } catch (e) {
          console.error('Autocomplete error:', e);
        }
      }, 600);
    },
  });

  // Sync external document changes (e.g. from AI Copilot sidebar)
  useEffect(() => {
    if (!editor) return;
    if (isSelfUpdate.current) {
      isSelfUpdate.current = false;
      return;
    }
    const currentHtml = editor.getHTML();
    if (currentHtml !== documentBody && documentBody !== undefined) {
      editor.commands.setContent(documentBody ?? '', { emitUpdate: false });
    }
  }, [documentBody, editor]);

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Loading TipTap AI Editor…
      </div>
    );
  }

  return (
    <div className="w-full h-full tiptap-wrapper">
      {/* Inject global table + typography CSS for the editor */}
      <style>{`
        .tiptap-wrapper .ProseMirror {
          padding: 0;
        }
        .tiptap-wrapper .ProseMirror p {
          margin-bottom: 0.75em;
        }
        .tiptap-wrapper .ProseMirror p:last-child {
          margin-bottom: 0;
        }
        .tiptap-wrapper .ProseMirror h1,
        .tiptap-wrapper .ProseMirror h2,
        .tiptap-wrapper .ProseMirror h3 {
          font-weight: 700;
          margin-bottom: 0.5em;
          margin-top: 0.75em;
        }
        .tiptap-wrapper .ProseMirror h1 { font-size: 1.5rem; }
        .tiptap-wrapper .ProseMirror h2 { font-size: 1.25rem; }
        .tiptap-wrapper .ProseMirror h3 { font-size: 1.1rem; }
        .tiptap-wrapper .ProseMirror ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75em;
        }
        .tiptap-wrapper .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75em;
        }
        .tiptap-wrapper .ProseMirror blockquote {
          border-left: 4px solid #818cf8;
          padding-left: 1rem;
          font-style: italic;
          color: #64748b;
          margin: 0.75em 0;
        }
        /* Tables */
        .tiptap-wrapper .ProseMirror table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75em 0;
          table-layout: auto;
        }
        .tiptap-wrapper .ProseMirror td,
        .tiptap-wrapper .ProseMirror th {
          border: 1px solid #cbd5e1;
          padding: 6px 10px;
          vertical-align: top;
          min-width: 60px;
        }
        .tiptap-wrapper .ProseMirror th {
          background: #f1f5f9;
          font-weight: 600;
          text-align: left;
        }
        html.dark .tiptap-wrapper .ProseMirror td,
        html.dark .tiptap-wrapper .ProseMirror th {
          border-color: #475569;
        }
        html.dark .tiptap-wrapper .ProseMirror th {
          background: #1e293b;
        }
        /* Selected cell highlight */
        .tiptap-wrapper .ProseMirror .selectedCell::after {
          background: rgba(99, 102, 241, 0.15);
        }
        /* Column resize handle */
        .tiptap-wrapper .ProseMirror .column-resize-handle {
          background-color: #6366f1;
          width: 2px;
        }
        /* Text alignment */
        .tiptap-wrapper .ProseMirror [style*="text-align: center"],
        .tiptap-wrapper .ProseMirror .text-center { text-align: center; }
        .tiptap-wrapper .ProseMirror [style*="text-align: right"],
        .tiptap-wrapper .ProseMirror .text-right { text-align: right; }
        .tiptap-wrapper .ProseMirror [style*="text-align: justify"],
        .tiptap-wrapper .ProseMirror .text-justify { text-align: justify; }
        /* Ghost text suggestion */
        .tiptap-wrapper .ProseMirror .copilot-suggestion {
          color: #9ca3af;
          pointer-events: none;
          user-select: none;
        }
      `}</style>
      <EditorContent editor={editor} className="w-full h-full" />
    </div>
  );
};
