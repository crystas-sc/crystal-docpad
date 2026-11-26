import React from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Scissors, Trash2 } from 'lucide-react';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType;
    };
  }
}

const PageBreakNodeView: React.FC<NodeViewProps> = ({ deleteNode, selected }) => {
  return (
    <NodeViewWrapper
      data-page-break="true"
      className={`my-5 select-none ${selected ? 'ring-2 ring-blue-700/20 rounded' : ''}`}
      contentEditable={false}
    >
      <div className="group flex items-center gap-3 py-1.5">
        <div className="h-px flex-1 border-t border-dashed border-blue-400" />
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-800 whitespace-nowrap">
          <Scissors className="h-3 w-3" />
          <span>Manual Page Break</span>
          <button
            type="button"
            onClick={deleteNode}
            title="Remove page break"
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
        <div className="h-px flex-1 border-t border-dashed border-blue-400" />
      </div>
    </NodeViewWrapper>
  );
};

export const PageBreakExtension = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }, { tag: 'div.page-break' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-page-break': 'true',
        class: 'page-break',
      }),
    ];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageBreakNodeView);
  },
});
