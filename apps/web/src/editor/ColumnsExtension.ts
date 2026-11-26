import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ColumnLayoutPreset } from '@report-studio/shared';
import { ColumnSectionNodeView } from './ColumnSectionNodeView.tsx';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columnSection: {
      insertColumnSection: (layout?: ColumnLayoutPreset) => ReturnType;
    };
  }
}

export const ColumnBlockExtension = Node.create({
  name: 'columnBlock',
  content:
    '(paragraph | heading | bulletList | orderedList | blockquote | codeBlock | horizontalRule | table | tanstackChart)+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-column-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-column-block': 'true',
        class: 'folio-column-block',
      }),
      0,
    ];
  },
});

export const ColumnSectionExtension = Node.create({
  name: 'columnSection',
  group: 'block',
  content: 'columnBlock{2,3}',
  isolating: true,
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      columns: {
        default: 2 as 2 | 3,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute('data-columns'));
          return raw === 3 ? 3 : 2;
        },
        renderHTML: (attributes) => ({
          'data-columns': String(attributes.columns ?? 2),
        }),
      },
      layout: {
        default: '50-50' as ColumnLayoutPreset,
        parseHTML: (element) =>
          (element.getAttribute('data-layout') as ColumnLayoutPreset | null) ?? '50-50',
        renderHTML: (attributes) => ({
          'data-layout': attributes.layout ?? '50-50',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-column-section]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-column-section': 'true',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertColumnSection:
        (layout: ColumnLayoutPreset = '50-50') =>
        ({ commands }) => {
          const colCount: 2 | 3 = layout === '33-33-33' ? 3 : 2;
          const columns = Array.from({ length: colCount }, (_, idx) => ({
            type: 'columnBlock',
            content: [
              {
                type: 'heading',
                attrs: { level: 3 },
                content: [{ type: 'text', text: `Column ${idx + 1}` }],
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'Add narrative, bullet points, a table, or a chart inside this column.',
                  },
                ],
              },
            ],
          }));

          return commands.insertContent({
            type: this.name,
            attrs: {
              columns: colCount,
              layout,
            },
            content: columns,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnSectionNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        return Boolean(target.closest('.column-controls'));
      },
    });
  },
});
