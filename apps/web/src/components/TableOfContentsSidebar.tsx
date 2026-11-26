import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ListTree, BarChart2, PanelLeftClose } from 'lucide-react';

interface TocHeadingItem {
  kind: 'heading';
  id: string;
  pos: number;
  level: 1 | 2 | 3;
  text: string;
}

interface TocChartItem {
  kind: 'chart';
  id: string;
  pos: number;
  title: string;
  chartType: string;
}

export interface TableOfContentsSidebarProps {
  editor: Editor | null;
  onCollapse?: () => void;
}

function extractTocItems(editor: Editor): {
  headings: TocHeadingItem[];
  charts: TocChartItem[];
} {
  const headings: TocHeadingItem[] = [];
  const charts: TocChartItem[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2))) as 1 | 2 | 3;
      const text = node.textContent.trim();
      if (text) {
        headings.push({
          kind: 'heading',
          id: `h-${pos}`,
          pos,
          level,
          text,
        });
      }
    } else if (node.type.name === 'tanstackChart') {
      const title = String(node.attrs?.title ?? 'Untitled Chart').trim() || 'Untitled Chart';
      const chartType = String(node.attrs?.chartType ?? 'line');
      charts.push({
        kind: 'chart',
        id: `c-${pos}`,
        pos,
        title,
        chartType,
      });
    }
  });

  return { headings, charts };
}

function resolveDomElementAtPos(editor: Editor, pos: number, isAtomNode: boolean): HTMLElement | null {
  try {
    if (isAtomNode) {
      const nodeDom = editor.view.nodeDOM(pos);
      if (nodeDom instanceof HTMLElement) return nodeDom;
    }
    const domPos = editor.view.domAtPos(Math.min(pos + 1, editor.state.doc.content.size));
    let el: Node | null = domPos.node;
    while (el && !(el instanceof HTMLElement)) {
      el = el.parentNode;
    }
    if (el instanceof HTMLElement) {
      return (el.closest('h1, h2, h3, [data-node-view-wrapper]') as HTMLElement | null) ?? el;
    }
  } catch {
    return null;
  }
  return null;
}

export const TableOfContentsSidebar: React.FC<TableOfContentsSidebarProps> = ({
  editor,
  onCollapse,
}) => {
  const [headings, setHeadings] = useState<TocHeadingItem[]>([]);
  const [charts, setCharts] = useState<TocChartItem[]>([]);
  const [activePos, setActivePos] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      setCharts([]);
      setActivePos(null);
      return;
    }

    const syncToc = () => {
      const extracted = extractTocItems(editor);
      setHeadings(extracted.headings);
      setCharts(extracted.charts);

      // Determine active heading or chart from current cursor position
      const cursorPos = editor.state.selection.from;
      let currentHeadingPos: number | null = null;
      for (const h of extracted.headings) {
        if (h.pos <= cursorPos) {
          currentHeadingPos = h.pos;
        } else {
          break;
        }
      }
      const selectedChart = extracted.charts.find((c) => c.pos === cursorPos);
      setActivePos(selectedChart ? selectedChart.pos : currentHeadingPos);
    };

    syncToc();
    editor.on('update', syncToc);
    editor.on('selectionUpdate', syncToc);

    return () => {
      editor.off('update', syncToc);
      editor.off('selectionUpdate', syncToc);
    };
  }, [editor]);

  // Also track visible heading on page scroll
  useEffect(() => {
    if (!editor || headings.length === 0) return;

    const handleScroll = () => {
      const thresholdY = 160;
      let visiblePos: number | null = headings[0]?.pos ?? null;

      for (const item of headings) {
        const el = resolveDomElementAtPos(editor, item.pos, false);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= thresholdY) {
          visiblePos = item.pos;
        } else {
          break;
        }
      }

      if (visiblePos !== null) {
        setActivePos(visiblePos);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [editor, headings]);

  const navigateToHeading = (item: TocHeadingItem) => {
    if (!editor) return;
    setActivePos(item.pos);

    const targetPos = Math.min(item.pos + 1, editor.state.doc.content.size);
    editor.chain().focus().setTextSelection(targetPos).run();

    const el = resolveDomElementAtPos(editor, item.pos, false);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 132;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  const navigateToChart = (item: TocChartItem) => {
    if (!editor) return;
    setActivePos(item.pos);

    editor.chain().focus().setNodeSelection(item.pos).run();

    const el = resolveDomElementAtPos(editor, item.pos, true);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 132;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sidebar Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-blue-800" />
          <h2 className="text-xs font-semibold text-slate-900">Table of Contents</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            {headings.length}
          </span>
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse Table of Contents"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Scrollable Outline */}
      <nav aria-label="Document Table of Contents" className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {headings.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-500 leading-relaxed">
            Add <span className="font-medium text-slate-700">H1</span>,{' '}
            <span className="font-medium text-slate-700">H2</span>, or{' '}
            <span className="font-medium text-slate-700">H3</span> headings in the document to
            build a live outline.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((item) => {
              const isActive = activePos === item.pos;
              const indentClass =
                item.level === 1
                  ? 'pl-2.5 font-semibold text-slate-900'
                  : item.level === 2
                    ? 'pl-4 font-medium text-slate-700'
                    : 'pl-6 font-normal text-slate-600';

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigateToHeading(item)}
                    title={item.text}
                    className={`flex w-full items-center rounded-md py-1.5 pr-2.5 text-left text-xs transition-colors ${indentClass} ${
                      isActive
                        ? 'bg-blue-50 text-blue-900'
                        : 'hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <span className="truncate">{item.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Quick-Jump Charts Section */}
        {charts.length > 0 ? (
          <div className="border-t border-slate-200 pt-3">
            <div className="mb-1.5 flex items-center justify-between px-2 text-[11px] font-semibold text-slate-500">
              <span>Charts</span>
              <span className="font-mono tabular-nums">{charts.length}</span>
            </div>
            <ul className="space-y-0.5">
              {charts.map((chart) => {
                const isActive = activePos === chart.pos;
                return (
                  <li key={chart.id}>
                    <button
                      type="button"
                      onClick={() => navigateToChart(chart)}
                      title={chart.title}
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-900 font-medium'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <BarChart2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{chart.title}</span>
                      <span className="font-mono text-[10px] capitalize text-slate-400 shrink-0">
                        {chart.chartType}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </nav>
    </div>
  );
};
