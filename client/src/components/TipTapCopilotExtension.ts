import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const CopilotPluginKey = new PluginKey('copilot-suggestion');

export interface CopilotOptions {
  suggestion: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    copilot: {
      setSuggestion: (suggestion: string) => ReturnType;
      clearSuggestion: () => ReturnType;
    };
  }
}

export const TipTapCopilotExtension = Extension.create<CopilotOptions>({
  name: 'copilot',

  addOptions() {
    return {
      suggestion: '',
    };
  },

  addCommands() {
    return {
      setSuggestion:
        (suggestion: string) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(CopilotPluginKey, { suggestion });
          }
          return true;
        },
      clearSuggestion:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(CopilotPluginKey, { suggestion: '' });
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: CopilotPluginKey,
        state: {
          init() {
            return { suggestion: '' };
          },
          apply(tr, value) {
            const meta = tr.getMeta(CopilotPluginKey);
            if (meta !== undefined) {
              return meta;
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = CopilotPluginKey.getState(state);
            if (!pluginState || !pluginState.suggestion) {
              return DecorationSet.empty;
            }

            const { selection } = state;
            if (!selection.empty) {
              return DecorationSet.empty;
            }

            const cursor = selection.$head;

            const suggestionWidget = document.createElement('span');
            suggestionWidget.className = 'copilot-suggestion';
            suggestionWidget.textContent = pluginState.suggestion;
            // Styling for the ghost text
            suggestionWidget.style.color = '#9ca3af'; // Tailwind text-gray-400
            suggestionWidget.style.pointerEvents = 'none';
            suggestionWidget.style.userSelect = 'none';

            const decoration = Decoration.widget(cursor.pos, suggestionWidget, {
              side: 1, // Render after the cursor
            });

            return DecorationSet.create(state.doc, [decoration]);
          },
          handleKeyDown(view, event) {
            const pluginState = CopilotPluginKey.getState(view.state);
            if (pluginState && pluginState.suggestion && event.key === 'Tab') {
              // Accept the suggestion!
              event.preventDefault();
              const { tr } = view.state;
              tr.insertText(pluginState.suggestion);
              tr.setMeta(CopilotPluginKey, { suggestion: '' }); // Clear
              view.dispatch(tr);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
