import React from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Columns2, Columns3, Trash2, Unlink2 } from 'lucide-react';
import type { ColumnLayoutPreset } from '@report-studio/shared';

const LAYOUT_OPTIONS: Array<{
  value: ColumnLayoutPreset;
  label: string;
  columns: 2 | 3;
}> = [
  { value: '50-50', label: '50 / 50', columns: 2 },
  { value: '66-34', label: '2/3 + 1/3', columns: 2 },
  { value: '34-66', label: '1/3 + 2/3', columns: 2 },
  { value: '33-33-33', label: '3 Cols', columns: 3 },
];

export const ColumnSectionNodeView: React.FC<NodeViewProps> = ({
  editor,
  getPos,
  node,
  deleteNode,
  selected,
}) => {
  const layout =
    (node.attrs?.layout as ColumnLayoutPreset | undefined) ??
    (node.childCount === 3 ? '33-33-33' : '50-50');
  const colCount = node.childCount === 3 ? 3 : 2;

  const handleChangeLayout = (nextLayout: ColumnLayoutPreset, nextCols: 2 | 3) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;

    const { state, view } = editor;
    const sectionNode = state.doc.nodeAt(pos);
    if (!sectionNode || sectionNode.type.name !== 'columnSection') return;

    const columnBlockType = state.schema.nodes.columnBlock;
    const paragraphType = state.schema.nodes.paragraph;
    if (!columnBlockType || !paragraphType) return;

    const existingCols: ProseMirrorNode[] = [];
    sectionNode.forEach((child) => existingCols.push(child));

    let nextChildren = [...existingCols];

    if (nextCols === 3 && existingCols.length === 2) {
      const thirdCol = columnBlockType.create(null, [
        paragraphType.create(null, state.schema.text('Column 3 notes...')),
      ]);
      nextChildren.push(thirdCol);
    } else if (nextCols === 2 && existingCols.length === 3) {
      const mergedBlocks: ProseMirrorNode[] = [];
      existingCols[1].forEach((b) => mergedBlocks.push(b));
      existingCols[2].forEach((b) => mergedBlocks.push(b));
      const mergedSecond = columnBlockType.create(null, mergedBlocks);
      nextChildren = [existingCols[0], mergedSecond];
    }

    const updatedSection = sectionNode.type.create(
      { columns: nextCols, layout: nextLayout },
      nextChildren,
    );

    const tr = state.tr.replaceWith(pos, pos + sectionNode.nodeSize, updatedSection);
    view.dispatch(tr);
  };

  const handleUnwrap = () => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos !== 'number') return;

    const { state, view } = editor;
    const sectionNode = state.doc.nodeAt(pos);
    if (!sectionNode || sectionNode.type.name !== 'columnSection') return;

    const flattened: ProseMirrorNode[] = [];
    sectionNode.forEach((col) => {
      col.forEach((block) => flattened.push(block));
    });

    if (flattened.length === 0) {
      deleteNode();
      return;
    }

    const tr = state.tr.replaceWith(pos, pos + sectionNode.nodeSize, flattened);
    view.dispatch(tr);
  };

  return (
    <NodeViewWrapper
      className={`my-6 transition-colors ${
        selected ? 'rounded-md ring-2 ring-blue-700/15' : ''
      }`}
    >
      {/* Column Section Header Controls */}
      <div
        className="column-controls mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2"
        contentEditable={false}
      >
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {colCount === 3 ? (
            <Columns3 className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <Columns2 className="h-3.5 w-3.5 text-slate-500" />
          )}
          <span className="font-medium text-slate-700">Columns</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{colCount}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            {LAYOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleChangeLayout(opt.value, opt.columns)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layout === opt.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleUnwrap}
            title="Convert back to single-column blocks"
            className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Unlink2 className="h-3 w-3" />
            <span>Unwrap</span>
          </button>

          <button
            type="button"
            onClick={deleteNode}
            title="Remove multi-column section"
            className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Borderless Native Editable Columns Grid */}
      <div>
        <NodeViewContent className="folio-columns-grid" data-layout={layout} />
      </div>
    </NodeViewWrapper>
  );
};
