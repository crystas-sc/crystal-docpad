import React, { useState } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import {
  Bold,
  Italic,
  Palette,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { markdownToTiptapNodes } from './markdownImport.ts';
import {
  getPromptApi,
  promptWithStats,
  type PromptLanguageModelSession,
} from '../ai/promptApi.ts';

const TEXT_COLOR_SWATCHES = [
  { label: 'Slate', value: '#0f172a' },
  { label: 'Muted', value: '#475569' },
  { label: 'Blue', value: '#1d4ed8' },
  { label: 'Emerald', value: '#047857' },
  { label: 'Amber', value: '#b45309' },
  { label: 'Red', value: '#b91c1c' },
  { label: 'Violet', value: '#6d28d9' },
  { label: 'Pink', value: '#be185d' },
];

export interface SelectionBubbleMenuProps {
  editor: Editor;
}

export const SelectionBubbleMenu: React.FC<SelectionBubbleMenuProps> = ({ editor }) => {
  const [showColors, setShowColors] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeColor = (editor.getAttributes('textColor')?.color as string | undefined) || null;

  const handleAiRephrase = async () => {
    if (rephrasing) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;

    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) return;

    const api = getPromptApi();
    if (!api) {
      setAiError('Chrome Prompt API unavailable in this browser.');
      return;
    }

    setAiError(null);
    setRephrasing(true);
    let session: PromptLanguageModelSession | null = null;
    try {
      const availability = await api.availability();
      if (availability === 'unavailable') {
        throw new Error('On-device LanguageModel is unavailable.');
      }

      const rephraseSystemPrompt =
        'Rephrase the user text professionally. Output ONLY a single rephrased version with no options, bullet points, quotes, or commentary.';

      session = await api.create({
        initialPrompts: [{ role: 'system', content: rephraseSystemPrompt }],
      });

      const promptInput = `Rephrase this text professionally (return ONLY the rephrased text):\n\n${selectedText}`;
      const rawRephrased = (await promptWithStats(session, promptInput, 'rephrase')).trim();
      const rephrased = rawRephrased.replace(/^["']|["']$/g, '').trim();
      console.log("rephrased:", rephrased)
      if (!rephrased) {
        throw new Error('Model returned empty text.');
      }

      const blocks = markdownToTiptapNodes(rephrased);
      const contentToInsert =
        blocks.length === 1 && blocks[0].type === 'paragraph' && blocks[0].content
          ? blocks[0].content
          : blocks.length > 0
            ? blocks
            : rephrased;

      editor
        .chain()
        .focus()
        .insertContentAt({ from, to }, contentToInsert)
        .run();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI rephrase failed.');
    } finally {
      session?.destroy?.();
      setRephrasing(false);
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ state, from, to }) => {
        if (state.selection.empty) return false;
        if (state.selection instanceof NodeSelection) return false;
        return state.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
    >
      <div className="relative flex flex-col items-start gap-1">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
            aria-label="Bold"
            className={`rounded-md p-1.5 transition-colors ${editor.isActive('bold')
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
              }`}
          >
            <Bold className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
            aria-label="Italic"
            className={`rounded-md p-1.5 transition-colors ${editor.isActive('italic')
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
              }`}
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <div className="mx-0.5 h-4 w-px bg-slate-200" />

          <button
            type="button"
            onClick={() => setShowColors((v) => !v)}
            title="Text color"
            aria-label="Text color"
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors ${showColors || activeColor
              ? 'bg-slate-100 text-slate-900'
              : 'text-slate-700 hover:bg-slate-100'
              }`}
          >
            <Palette className="h-3.5 w-3.5" />
            <span
              className="h-2.5 w-2.5 rounded-full border border-slate-300"
              style={{ backgroundColor: activeColor ?? '#0f172a' }}
            />
          </button>

          <div className="mx-0.5 h-4 w-px bg-slate-200" />

          <button
            type="button"
            disabled={rephrasing}
            onClick={() => void handleAiRephrase()}
            title="Rephrase selected text with AI"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {rephrasing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{rephrasing ? 'Rephrasing...' : 'AI Rephrase'}</span>
          </button>
        </div>

        {showColors ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {TEXT_COLOR_SWATCHES.map((swatch) => {
              const selected = activeColor === swatch.value;
              return (
                <button
                  key={swatch.value}
                  type="button"
                  title={swatch.label}
                  aria-label={`Text color ${swatch.label}`}
                  onClick={() => {
                    editor.chain().focus().setTextColor(swatch.value).run();
                    setShowColors(false);
                  }}
                  className={`h-5 w-5 rounded-full border border-slate-200 transition-transform ${selected ? 'scale-110 ring-2 ring-slate-900 ring-offset-1' : 'hover:scale-105'
                    }`}
                  style={{ backgroundColor: swatch.value }}
                />
              );
            })}
            <label
              title="Custom color"
              className="flex h-5 w-5 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-gradient-to-tr from-blue-500 via-pink-500 to-amber-400"
            >
              <input
                type="color"
                value={activeColor ?? '#0f172a'}
                onChange={(e) => editor.chain().focus().setTextColor(e.target.value).run()}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              title="Reset color"
              aria-label="Reset text color"
              onClick={() => {
                editor.chain().focus().unsetTextColor().run();
                setShowColors(false);
              }}
              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        {aiError ? (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 shadow-sm">
            <span>{aiError}</span>
            <button
              type="button"
              onClick={() => setAiError(null)}
              className="font-bold hover:underline"
            >
              ×
            </button>
          </div>
        ) : null}
      </div>
    </BubbleMenu>
  );
};
