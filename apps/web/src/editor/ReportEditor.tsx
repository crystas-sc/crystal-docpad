import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import type * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import {
  getPageGeometry,
  PAGE_MARGIN_SPECS,
  PAGE_SIZE_SPECS,
  type ChartConfig,
  type PageMarginPreset,
  type PageOrientation,
  type PageSetupConfig,
  type PageSizePreset,
  type ReportDocument,
  type RulerUnit,
} from '@report-studio/shared';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  BarChart2,
  Plus,
  Minus,
  Trash2,
  Undo2,
  Redo2,
  ClipboardPaste,
  Copy,
  Check,
  Columns2,
  Columns3,
  Scissors,
  SlidersHorizontal,
  Eye,
  EyeOff,
  Ruler,
} from 'lucide-react';
import { ColumnBlockExtension, ColumnSectionExtension } from './ColumnsExtension.ts';
import { PageBreakExtension } from './PageBreakExtension.tsx';
import {
  PageSheetStackBackground,
  ResponsivePageBreaksOverlay,
} from './PageGuidesOverlay.tsx';
import {
  PAGE_GAP_PX,
  PagePaginationExtension,
  type PaginationLayoutSettings,
} from './PagePaginationExtension.ts';
import {
  HorizontalPageRuler,
  RulerCornerBox,
  RULER_GUTTER_PX,
  VerticalPageRuler,
} from './PageRulers.tsx';
import { TanStackChartExtension } from './TanStackChartExtension.ts';
import {
  cleanPastedTableHtml,
  copyTableToClipboard,
  extractTableMatrixFromEditor,
  looksLikeMarkdownTable,
  looksLikeRawHtmlTable,
  looksLikeTsv,
  parseHtmlTableToContent,
  parseMarkdownTableToContent,
  parseTsvToTableContent,
  serializeMatrixToTsv,
  type TableCopyFormat,
} from './tableClipboard.ts';
import { extractChartFromCurrentTable } from './tableToChart.ts';
import { looksLikeMarkdownDocument, markdownToTiptapNodes } from './markdownImport.ts';
import { SAMPLE_REPORT_DOCUMENT } from './sampleReport.ts';
import { SelectionBubbleMenu } from './SelectionBubbleMenu.tsx';
import { TextColorExtension } from './TextColorExtension.ts';
import type { CollabUser } from '../collab/useCollaboration.ts';

export interface SelectedChartInfo {
  pos: number;
  config: ChartConfig;
}

export interface ReportEditorProps {
  onEditorReady: (editor: Editor | null) => void;
  onStatsChange?: (stats: { words: number; charts: number; tables: number }) => void;
  onSelectedChartChange?: (chart: SelectedChartInfo | null) => void;
  onDocumentDirty?: () => void;
  pageSetup: PageSetupConfig;
  onPageSetupChange: (next: PageSetupConfig) => void;
  onPageCountChange?: (pages: number) => void;
  ydoc: Y.Doc;
  collabProvider: WebsocketProvider;
  collabSynced: boolean;
  collabUser: CollabUser | null;
  consumeInitialContent?: () => Record<string, unknown> | null;
}

const SAMPLE_TSV = `Metric\tQ1 26\tQ2 26\tQ3 26\tQ4 26
Compute Spend ($K)\t410\t388\t362\t345
API Requests (M)\t142\t178\t219\t268
Cache Hit Rate (%)\t81.4\t84.9\t87.6\t90.2`;

const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) =>
          element.style.textAlign || element.getAttribute('align') || null,
        renderHTML: (attributes) =>
          attributes.align ? { style: `text-align: ${attributes.align}` } : {},
      },
    };
  },
});

const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) =>
          element.style.textAlign || element.getAttribute('align') || null,
        renderHTML: (attributes) =>
          attributes.align ? { style: `text-align: ${attributes.align}` } : {},
      },
    };
  },
});

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export const ReportEditor: React.FC<ReportEditorProps> = ({
  onEditorReady,
  onStatsChange,
  onSelectedChartChange,
  onDocumentDirty,
  pageSetup,
  onPageSetupChange,
  onPageCountChange,
  ydoc,
  collabProvider,
  collabSynced,
  collabUser,
  consumeInitialContent,
}) => {
  const isDesktop = useIsDesktop();
  const [inTable, setInTable] = useState(false);
  const [tableNotice, setTableNotice] = useState<string | null>(null);
  const [copiedFormat, setCopiedFormat] = useState<TableCopyFormat | null>(null);
  const [showPageSetupBar, setShowPageSetupBar] = useState(true);
  const [, setSelectionTick] = useState(0);
  const sheetElRef = useRef<HTMLDivElement | null>(null);
  const [localPageCount, setLocalPageCount] = useState(1);
  const [responsiveBreaks, setResponsiveBreaks] = useState<
    Array<{ y: number; endedPage: number }>
  >([]);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  const geometry = useMemo(() => getPageGeometry(pageSetup), [pageSetup]);
  const showRulers = isDesktop && geometry.setup.showRulers !== false;
  const rulerUnit: RulerUnit = geometry.setup.rulerUnit ?? 'cm';

  const onPageCountChangeRef = useRef(onPageCountChange);
  onPageCountChangeRef.current = onPageCountChange;

  const handleInternalPageCount = useRef((pages: number) => {
    setLocalPageCount(pages);
    onPageCountChangeRef.current?.(pages);
  }).current;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        undoRedo: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCaret.configure({
        provider: collabProvider,
        user: collabUser ?? { name: 'Guest', color: '#2563eb' },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'report-table',
        },
      }),
      TableRow,
      AlignedTableHeader,
      AlignedTableCell,
      Placeholder.configure({
        placeholder:
          'Write your report narrative, paste Markdown/HTML/Excel tables, or insert a TanStack chart...',
      }),
      ColumnBlockExtension,
      ColumnSectionExtension,
      PageBreakExtension,
      PagePaginationExtension.configure({
        enabled: isDesktop,
        sheetHeightPx: geometry.sheetHeightPx,
        printableHeightPx: geometry.printableHeightPx,
        pageGapPx: PAGE_GAP_PX,
        onPageCountChange: handleInternalPageCount,
        onResponsiveBreaksChange: setResponsiveBreaks,
      }),
      TanStackChartExtension,
      TextColorExtension,
    ],
    editorProps: {
      attributes: {
        class: 'folio-prose focus:outline-none min-h-[480px]',
      },
      transformPastedHTML: (html) => cleanPastedTableHtml(html),
      clipboardTextSerializer: (slice, view) => {
        // When user presses Cmd/Ctrl+C across table cells, serialize plain text as Excel-ready TSV
        const firstChild = slice.content.firstChild;
        if (firstChild && firstChild.type.name === 'table') {
          const rows: string[] = [];
          firstChild.forEach((row) => {
            const cells: string[] = [];
            row.forEach((cell) => {
              const text = cell.textContent.replace(/\s+/g, ' ').trim();
              cells.push(/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
            });
            rows.push(cells.join('\t'));
          });
          return rows.join('\n');
        }
        const activeEditor = (view as unknown as { editor?: Editor }).editor;
        if (activeEditor?.isActive('table')) {
          const matrix = extractTableMatrixFromEditor(activeEditor);
          if (matrix && slice.content.textBetween(0, slice.content.size, '\n').includes('\n')) {
            return serializeMatrixToTsv(matrix);
          }
        }
        return slice.content.textBetween(0, slice.content.size, '\n\n');
      },
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const html = clipboard.getData('text/html');
        const plain = clipboard.getData('text/plain');

        // Let Tiptap handle native HTML <table> paste (Excel / Google Sheets / Word)
        if (html && /<table[\s>]/i.test(html)) {
          return false;
        }

        // Raw HTML <table> pasted as plain text (e.g. from code editor)
        if (plain && looksLikeRawHtmlTable(plain)) {
          const tableNode = parseHtmlTableToContent(plain);
          if (tableNode) {
            event.preventDefault();
            editor?.chain().focus().insertContent(tableNode).run();
            return true;
          }
        }

        // Markdown GFM pipe table fallback
        if (plain && looksLikeMarkdownTable(plain)) {
          const tableNode = parseMarkdownTableToContent(plain);
          if (tableNode) {
            event.preventDefault();
            editor?.chain().focus().insertContent(tableNode).run();
            return true;
          }
        }

        // Plain-text TSV / Excel fallback
        if (plain && looksLikeTsv(plain)) {
          event.preventDefault();
          const tableNode = parseTsvToTableContent(plain);
          editor?.chain().focus().insertContent(tableNode).run();
          return true;
        }

        // Rich Markdown document / snippet paste fallback
        if (plain && looksLikeMarkdownDocument(plain)) {
          const nodes = markdownToTiptapNodes(plain);
          if (nodes.length > 0) {
            event.preventDefault();
            editor?.chain().focus().insertContent(nodes).run();
            return true;
          }
        }

        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      updateStats(current);
      setInTable(current.isActive('table'));
      syncSelectedChart(current);
      onDocumentDirty?.();
      setSelectionTick((t) => t + 1);
    },
    onSelectionUpdate: ({ editor: current }) => {
      setInTable(current.isActive('table'));
      syncSelectedChart(current);
      setSelectionTick((t) => t + 1);
    },
  }, [ydoc, collabProvider]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !collabSynced) return;
    const fragment = ydoc.getXmlFragment('default');
    if (fragment.length === 0) {
      const seed = consumeInitialContent?.() ?? (SAMPLE_REPORT_DOCUMENT as unknown as Record<string, unknown>);
      editor.commands.setContent(seed);
    }
  }, [editor, collabSynced, ydoc]);

  useEffect(() => {
    if (!editor || editor.isDestroyed || !collabUser) return;
    editor.commands.updateUser(collabUser);
  }, [editor, collabUser]);

  const syncSelectedChart = (current: Editor) => {
    if (!onSelectedChartChange) return;
    const { selection } = current.state;
    if (selection instanceof NodeSelection && selection.node.type.name === 'tanstackChart') {
      onSelectedChartChange({
        pos: selection.from,
        config: selection.node.attrs as ChartConfig,
      });
    } else {
      onSelectedChartChange(null);
    }
  };

  const updateStats = (current: Editor) => {
    if (!onStatsChange) return;
    const text = current.getText().trim();
    const words = text ? text.split(/\s+/).length : 0;
    const json = current.getJSON() as ReportDocument;
    let charts = 0;
    let tables = 0;
    const walkCounts = (nodes: unknown[]) => {
      for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;
        const rec = n as { type?: string; content?: unknown[] };
        if (rec.type === 'tanstackChart') charts += 1;
        if (rec.type === 'table') tables += 1;
        if (Array.isArray(rec.content)) walkCounts(rec.content);
      }
    };
    walkCounts(json.content ?? []);
    onStatsChange({ words, charts, tables });
  };

  useEffect(() => {
    onEditorReady(editor);
    if (editor) {
      updateStats(editor);
      setInTable(editor.isActive('table'));
      syncSelectedChart(editor);
    }
    return () => {
      onEditorReady(null);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const storage = (
      editor.storage as unknown as {
        folioPagination?: {
          settings: PaginationLayoutSettings;
          relayout: () => void;
        };
      }
    ).folioPagination;
    if (!storage) return;

    storage.settings = {
      enabled: isDesktop,
      sheetHeightPx: geometry.sheetHeightPx,
      printableHeightPx: geometry.printableHeightPx,
      pageGapPx: PAGE_GAP_PX,
      onPageCountChange: handleInternalPageCount,
      onResponsiveBreaksChange: setResponsiveBreaks,
    };
    storage.relayout();
  }, [editor, isDesktop, geometry.sheetHeightPx, geometry.printableHeightPx, handleInternalPageCount]);

  const handleTableToChart = () => {
    if (!editor) return;
    const extracted = extractChartFromCurrentTable(editor);
    if (!extracted) {
      setTableNotice('Select a table with at least 1 label column and 1 numeric column.');
      setTimeout(() => setTableNotice(null), 3500);
      return;
    }

    editor
      .chain()
      .focus()
      .insertContentAt(extracted.tableEndPos, {
        type: 'tanstackChart',
        attrs: extracted.config,
      })
      .run();

    setTableNotice(null);
  };

  const handleCopyTable = async (format: TableCopyFormat) => {
    if (!editor) return;
    const result = await copyTableToClipboard(editor, format);
    if (!result) return;
    setCopiedFormat(format);
    const label =
      format === 'markdown' ? 'Markdown' : format === 'html' ? 'HTML' : 'Excel TSV';
    setTableNotice(`Copied ${result.rows}×${result.cols} table as ${label}.`);
    setTimeout(() => {
      setCopiedFormat((prev) => (prev === format ? null : prev));
      setTableNotice(null);
    }, 2200);
  };

  const handleInsertSampleTsv = () => {
    if (!editor) return;
    const tableNode = parseTsvToTableContent(SAMPLE_TSV);
    editor.chain().focus().insertContent(tableNode).run();
  };

  if (!editor) {
    return (
      <div className="mx-auto max-w-[820px] rounded-lg border border-slate-200 bg-white p-12 text-sm text-slate-500">
        Initializing rich-text workbench...
      </div>
    );
  }

  return (
    <div className="mx-auto w-full pb-16">
      {/* Primary Formatting Toolbar */}
      <div className="sticky top-[57px] z-20 mx-auto mb-5 max-w-[960px] rounded-lg border border-slate-200 bg-white/95 backdrop-blur-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2">
          <ToolbarBtn
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            <List className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered List"
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Callout Quote"
          >
            <Quote className="h-4 w-4" />
          </ToolbarBtn>

          <Divider />

          <button
            type="button"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 4, cols: 3, withHeaderRow: true }).run()
            }
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <TableIcon className="h-3.5 w-3.5 text-slate-600" />
            <span>Insert Table</span>
          </button>

          <button
            type="button"
            onClick={handleInsertSampleTsv}
            title="Insert parsed TSV table sample"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-slate-600" />
            <span>Insert TSV Table</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().insertColumnSection('50-50').run()}
            title="Insert 2-column section"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Columns2 className="h-3.5 w-3.5 text-slate-600" />
            <span>2 Cols</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().insertColumnSection('33-33-33').run()}
            title="Insert 3-column section"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Columns3 className="h-3.5 w-3.5 text-slate-600" />
            <span>3 Cols</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().insertPageBreak().run()}
            title="Insert manual page break"
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Scissors className="h-3.5 w-3.5 text-slate-600" />
            <span>Page Break</span>
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().insertTanStackChart().run()}
            className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-blue-800 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
          >
            <BarChart2 className="h-3.5 w-3.5" />
            <span>Insert Chart</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowPageSetupBar((v) => !v)}
              title="Toggle Page Setup & Guides controls"
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                showPageSetupBar
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Page Setup</span>
            </button>

            <Divider />

            <ToolbarBtn
              active={false}
              disabled={!editor.can().undo()}
              onClick={() => editor.chain().focus().undo().run()}
              title="Undo"
            >
              <Undo2 className="h-4 w-4" />
            </ToolbarBtn>
            <ToolbarBtn
              active={false}
              disabled={!editor.can().redo()}
              onClick={() => editor.chain().focus().redo().run()}
              title="Redo"
            >
              <Redo2 className="h-4 w-4" />
            </ToolbarBtn>
          </div>
        </div>

        {/* Collapsible Page Setup & Page Guides Bar */}
        {showPageSetupBar ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              {/* Paper Size */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">Paper</span>
                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                  {(['a4', 'letter', 'legal'] as PageSizePreset[]).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onPageSetupChange({ ...pageSetup, size: preset })}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        pageSetup.size === preset
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {PAGE_SIZE_SPECS[preset].shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              {/* Orientation */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">Orientation</span>
                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                  {(['portrait', 'landscape'] as PageOrientation[]).map((orient) => (
                    <button
                      key={orient}
                      type="button"
                      onClick={() => onPageSetupChange({ ...pageSetup, orientation: orient })}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors whitespace-nowrap ${
                        pageSetup.orientation === orient
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {orient}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-medium text-slate-500">Margins</span>
                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                  {(['normal', 'narrow', 'wide'] as PageMarginPreset[]).map((margin) => (
                    <button
                      key={margin}
                      type="button"
                      onClick={() => onPageSetupChange({ ...pageSetup, margins: margin })}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                        pageSetup.margins === margin
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {PAGE_MARGIN_SPECS[margin].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] tabular-nums text-slate-500 mr-1">
                {geometry.widthMm} × {geometry.heightMm} mm
              </span>

              <button
                type="button"
                onClick={() =>
                  onPageSetupChange({
                    ...pageSetup,
                    showRulers: !(geometry.setup.showRulers !== false),
                  })
                }
                className={`hidden lg:flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  showRulers
                    ? 'border-blue-800 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Ruler className="h-3 w-3" />
                <span>Rulers {showRulers ? 'On' : 'Off'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onPageSetupChange({ ...pageSetup, showPageGuides: !pageSetup.showPageGuides })
                }
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  pageSetup.showPageGuides
                    ? 'border-blue-800 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {pageSetup.showPageGuides ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
                <span>Guides {pageSetup.showPageGuides ? 'On' : 'Off'}</span>
              </button>
            </div>
          </div>
        ) : null}

        {/* Contextual Floating Table Bar (appears whenever cursor is inside a table) */}
        {inTable ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-semibold text-slate-500">Table:</span>
              <button
                type="button"
                onClick={() => editor.chain().focus().addRowAfter().run()}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3 w-3" />
                <span>Row</span>
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3 w-3" />
                <span>Column</span>
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteRow().run()}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Minus className="h-3 w-3" />
                <span>Del Row</span>
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteColumn().run()}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <Minus className="h-3 w-3" />
                <span>Del Col</span>
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().deleteTable().run()}
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </button>

              <div className="mx-1 h-4 w-px bg-slate-200 shrink-0" />

              <button
                type="button"
                onClick={() => void handleCopyTable('markdown')}
                title="Copy selected cells or entire table as Markdown"
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                {copiedFormat === 'markdown' ? (
                  <Check className="h-3 w-3 text-emerald-700" />
                ) : (
                  <Copy className="h-3 w-3 text-slate-500" />
                )}
                <span>Copy Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyTable('html')}
                title="Copy selected cells or entire table as HTML"
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                {copiedFormat === 'html' ? (
                  <Check className="h-3 w-3 text-emerald-700" />
                ) : (
                  <Copy className="h-3 w-3 text-slate-500" />
                )}
                <span>Copy HTML</span>
              </button>
              <button
                type="button"
                onClick={() => void handleCopyTable('excel')}
                title="Copy selected cells or entire table for Excel / Google Sheets"
                className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                {copiedFormat === 'excel' ? (
                  <Check className="h-3 w-3 text-emerald-700" />
                ) : (
                  <Copy className="h-3 w-3 text-slate-500" />
                )}
                <span>Copy Excel</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleTableToChart}
              className="flex items-center gap-1.5 rounded-md bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 transition-colors whitespace-nowrap shrink-0"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>Table to Chart</span>
            </button>
          </div>
        ) : null}

        {tableNotice ? (
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            {tableNotice}
          </div>
        ) : null}
      </div>

      {/* Document Viewport: MS Word Stacked Pages + Rulers on Desktop, Fluid Responsive Page Breaks below lg */}
      {isDesktop ? (
        <div className="overflow-x-auto pb-4">
          <div
            className="mx-auto flex flex-col items-start"
            style={{
              width: `${showRulers ? geometry.sheetWidthPx + RULER_GUTTER_PX : geometry.sheetWidthPx}px`,
            }}
          >
            {showRulers ? (
              <div className="flex items-end">
                <RulerCornerBox
                  unit={rulerUnit}
                  onToggleUnit={() =>
                    onPageSetupChange({
                      ...pageSetup,
                      rulerUnit: rulerUnit === 'cm' ? 'in' : 'cm',
                    })
                  }
                />
                <HorizontalPageRuler
                  geometry={geometry}
                  unit={rulerUnit}
                  pointerX={pointerPos?.x ?? null}
                />
              </div>
            ) : null}

            <div className="flex items-start">
              {showRulers ? (
                <VerticalPageRuler
                  geometry={geometry}
                  unit={rulerUnit}
                  pageCount={localPageCount}
                  pageGapPx={PAGE_GAP_PX}
                  pointerY={pointerPos?.y ?? null}
                />
              ) : null}

              <div
                ref={sheetElRef}
                onMouseMove={(e) => {
                  if (!showRulers || !sheetElRef.current) return;
                  const rect = sheetElRef.current.getBoundingClientRect();
                  setPointerPos({
                    x: Math.round(e.clientX - rect.left),
                    y: Math.round(e.clientY - rect.top),
                  });
                }}
                onMouseLeave={() => setPointerPos(null)}
                className="relative"
                style={{
                  width: `${geometry.sheetWidthPx}px`,
                  minHeight: `${
                    localPageCount * geometry.sheetHeightPx +
                    Math.max(0, localPageCount - 1) * PAGE_GAP_PX
                  }px`,
                }}
              >
                <PageSheetStackBackground
                  geometry={geometry}
                  pageCount={localPageCount}
                  pageGapPx={PAGE_GAP_PX}
                  showRulers={showRulers}
                />

                <div
                  className="relative z-10"
                  style={{
                    padding: `${geometry.marginTopPx}px ${geometry.marginRightPx}px ${geometry.marginBottomPx}px ${geometry.marginLeftPx}px`,
                  }}
                >
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full pb-4">
          <div className="relative w-full rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-xs sm:px-8 sm:py-8">
            <div className="relative">
              <EditorContent editor={editor} />
              <ResponsivePageBreaksOverlay
                geometry={geometry}
                breaks={responsiveBreaks}
              />
            </div>
          </div>
        </div>
      )}
      {editor ? <SelectionBubbleMenu editor={editor} /> : null}
    </div>
  );
};

const Divider: React.FC = () => <div className="mx-1 h-5 w-px bg-slate-200 shrink-0" />;

interface ToolbarBtnProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

const ToolbarBtn: React.FC<ToolbarBtnProps> = ({
  active,
  disabled,
  onClick,
  title,
  children,
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    title={title}
    className={`rounded p-1.5 transition-colors disabled:opacity-35 ${
      active
        ? 'bg-slate-900 text-white'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`}
  >
    {children}
  </button>
);
