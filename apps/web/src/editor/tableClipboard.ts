import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';

export type CellAlign = 'left' | 'center' | 'right' | null;

export interface TableMatrixCell {
  text: string;
  isHeader: boolean;
  align: CellAlign;
  colspan: number;
  rowspan: number;
}

export interface TableExportMatrix {
  rows: TableMatrixCell[][];
  colCount: number;
}

function splitMarkdownRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isMarkdownSeparatorRow(line: string): boolean {
  const cells = splitMarkdownRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')));
}

function parseMarkdownAlignments(separatorLine: string): CellAlign[] {
  return splitMarkdownRow(separatorLine).map((cell) => {
    const clean = cell.replace(/\s+/g, '');
    const left = clean.startsWith(':');
    const right = clean.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/**
 * Detects GitHub-Flavored Markdown pipe tables:
 *   | Header 1 | Header 2 |
 *   | :--- | ---: |
 *   | Cell 1 | 42 |
 */
export function looksLikeMarkdownTable(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return false;
  if (!lines[0].includes('|') || !lines[1].includes('|')) return false;

  const headerCols = splitMarkdownRow(lines[0]).length;
  const sepCols = splitMarkdownRow(lines[1]).length;
  return headerCols >= 2 && sepCols >= 2 && isMarkdownSeparatorRow(lines[1]);
}

export function parseMarkdownTableToContent(markdown: string): JSONContent | null {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const lines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2 || !isMarkdownSeparatorRow(lines[1])) {
    return null;
  }

  const headerCells = splitMarkdownRow(lines[0]);
  const alignments = parseMarkdownAlignments(lines[1]);
  const bodyLines = lines.slice(2).filter((line) => line.includes('|'));

  const allRawRows = [headerCells, ...bodyLines.map(splitMarkdownRow)];
  const maxCols = allRawRows.reduce((max, row) => Math.max(max, row.length), headerCells.length);

  const tableRows: JSONContent[] = allRawRows.map((row, rowIdx) => {
    const isHeader = rowIdx === 0;
    const cellType = isHeader ? 'tableHeader' : 'tableCell';
    const cells: JSONContent[] = [];

    for (let col = 0; col < maxCols; col++) {
      const value = row[col] ?? '';
      const align = alignments[col] ?? null;
      cells.push({
        type: cellType,
        attrs: align ? { align } : undefined,
        content: [
          {
            type: 'paragraph',
            content: value.length > 0 ? [{ type: 'text', text: value }] : [],
          },
        ],
      });
    }

    return {
      type: 'tableRow',
      content: cells,
    };
  });

  return {
    type: 'table',
    content: tableRows,
  };
}

/**
 * Parses TSV with support for Excel-style double-quoted cells containing newlines or tabs.
 */
function parseTsvRows(tsv: string): string[][] {
  const normalized = tsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"' && currentCell.length === 0) {
      inQuotes = true;
      continue;
    }

    if (ch === '\t') {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (ch === '\n') {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += ch;
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

export function looksLikeTsv(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized.includes('\t')) {
    return false;
  }
  const rows = parseTsvRows(normalized);
  if (rows.length >= 2) {
    return rows[0].length >= 2 && rows.slice(1).some((r) => r.length >= 2);
  }
  // Also allow pasting a single spreadsheet row when it has 3+ columns (2+ tabs)
  if (rows.length === 1 && rows[0].length >= 3) {
    return true;
  }
  return false;
}

export function parseTsvToTableContent(tsv: string): JSONContent {
  const rawRows = parseTsvRows(tsv.trim());
  const maxCols = rawRows.reduce((max, row) => Math.max(max, row.length), 1);

  const tableRows: JSONContent[] = rawRows.map((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    const cellType = isHeader ? 'tableHeader' : 'tableCell';
    const cells: JSONContent[] = [];

    for (let col = 0; col < maxCols; col++) {
      const value = row[col] ?? '';
      cells.push({
        type: cellType,
        content: [
          {
            type: 'paragraph',
            content: value.length > 0 ? [{ type: 'text', text: value }] : [],
          },
        ],
      });
    }

    return {
      type: 'tableRow',
      content: cells,
    };
  });

  return {
    type: 'table',
    content: tableRows,
  };
}

export function looksLikeRawHtmlTable(text: string): boolean {
  const trimmed = text.trim();
  return /^<table[\s>]/i.test(trimmed) && /<\/table>/i.test(trimmed);
}

export function parseHtmlTableToContent(rawHtml: string): JSONContent | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(cleanPastedTableHtml(rawHtml), 'text/html');
  const tableEl = doc.querySelector('table');
  if (!tableEl) return null;

  const rowEls = Array.from(tableEl.querySelectorAll('tr'));
  if (rowEls.length === 0) return null;

  const tableRows: JSONContent[] = rowEls.map((tr) => {
    const cellEls = Array.from(tr.querySelectorAll('th, td'));
    const cells: JSONContent[] = cellEls.map((cell) => {
      const isHeader = cell.tagName.toLowerCase() === 'th';
      const alignRaw =
        (cell as HTMLElement).style?.textAlign || cell.getAttribute('align') || null;
      const align: CellAlign =
        alignRaw === 'left' || alignRaw === 'center' || alignRaw === 'right'
          ? alignRaw
          : null;
      const colspan = Number(cell.getAttribute('colspan') ?? 1) || 1;
      const rowspan = Number(cell.getAttribute('rowspan') ?? 1) || 1;
      const text = (cell.textContent ?? '').replace(/\s+/g, ' ').trim();

      return {
        type: isHeader ? 'tableHeader' : 'tableCell',
        attrs: {
          ...(align ? { align } : {}),
          ...(colspan > 1 ? { colspan } : {}),
          ...(rowspan > 1 ? { rowspan } : {}),
        },
        content: [
          {
            type: 'paragraph',
            content: text.length > 0 ? [{ type: 'text', text }] : [],
          },
        ],
      };
    });
    return {
      type: 'tableRow',
      content: cells,
    };
  });

  return {
    type: 'table',
    content: tableRows,
  };
}

/**
 * Strips Microsoft Excel, Word, and Google Sheets clipboard HTML wrapper noise
 * so pasted tables keep clean structure without inline office styling bloat.
 */
export function cleanPastedTableHtml(html: string): string {
  if (!/<table[\s>]/i.test(html)) {
    return html;
  }

  return html
    .replace(/<!--StartFragment-->|<!--EndFragment-->/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<meta[^>]*>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<o:p>\s*<\/o:p>/gi, '')
    .replace(/<\/?google-sheets-html-origin[^>]*>/gi, '')
    .replace(/\s+(class|x:str|x:num|data-sheets-[a-z-]+)="[^"]*"/gi, '');
}

/**
 * Extracts either the active rectangular CellSelection or the full enclosing table
 * as a clean normalized matrix for Markdown, HTML, and Excel TSV copy.
 */
export function extractTableMatrixFromEditor(editor: Editor): TableExportMatrix | null {
  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;

  let tableDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'table') {
      tableDepth = d;
      break;
    }
  }
  if (tableDepth === -1) {
    return null;
  }

  const tableNode = $from.node(tableDepth);
  const selectedPositions = new Set<number>();

  if (selection instanceof CellSelection) {
    selection.forEachCell((_node, pos) => {
      selectedPositions.add(pos);
    });
  }

  const tableStart = $from.start(tableDepth);
  const rows: TableMatrixCell[][] = [];
  let rowOffset = tableStart;

  for (let r = 0; r < tableNode.childCount; r++) {
    const rowNode = tableNode.child(r);
    let cellOffset = rowOffset + 1;
    const rowCells: TableMatrixCell[] = [];

    for (let c = 0; c < rowNode.childCount; c++) {
      const cellNode = rowNode.child(c);
      const isIncluded = selectedPositions.size === 0 || selectedPositions.has(cellOffset);
      if (isIncluded) {
        const align = (cellNode.attrs?.align as CellAlign | undefined) ?? null;
        rowCells.push({
          text: cellNode.textContent.replace(/\s+/g, ' ').trim(),
          isHeader: cellNode.type.name === 'tableHeader',
          align,
          colspan: Number(cellNode.attrs?.colspan ?? 1) || 1,
          rowspan: Number(cellNode.attrs?.rowspan ?? 1) || 1,
        });
      }
      cellOffset += cellNode.nodeSize;
    }

    if (rowCells.length > 0) {
      rows.push(rowCells);
    }
    rowOffset += rowNode.nodeSize;
  }

  if (rows.length === 0) return null;
  const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return { rows, colCount };
}

function escapeMarkdownCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function serializeMatrixToMarkdown(matrix: TableExportMatrix): string {
  const { rows, colCount } = matrix;
  if (rows.length === 0 || colCount === 0) return '';

  const formatRow = (row: TableMatrixCell[]) => {
    const padded: string[] = [];
    for (let i = 0; i < colCount; i++) {
      padded.push(escapeMarkdownCell(row[i]?.text ?? ''));
    }
    return `| ${padded.join(' | ')} |`;
  };

  const headerRow = rows[0];
  const sepCells: string[] = [];
  for (let i = 0; i < colCount; i++) {
    const align = headerRow[i]?.align;
    if (align === 'center') sepCells.push(':---:');
    else if (align === 'right') sepCells.push('---:');
    else if (align === 'left') sepCells.push(':---');
    else sepCells.push('---');
  }

  const lines = [formatRow(headerRow), `| ${sepCells.join(' | ')} |`];
  for (let r = 1; r < rows.length; r++) {
    lines.push(formatRow(rows[r]));
  }
  return lines.join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serializeMatrixToHtml(matrix: TableExportMatrix): string {
  const { rows } = matrix;
  if (rows.length === 0) return '';

  const headerRows: string[] = [];
  const bodyRows: string[] = [];

  for (const row of rows) {
    const isHeaderRow = row.every((cell) => cell.isHeader);
    const cellsHtml = row
      .map((cell) => {
        const tag = cell.isHeader ? 'th' : 'td';
        const attrs: string[] = [];
        if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
        if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
        if (cell.align) attrs.push(`style="text-align: ${cell.align};"`);
        const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
        return `<${tag}${attrStr}>${escapeHtml(cell.text)}</${tag}>`;
      })
      .join('');

    const rowHtml = `    <tr>${cellsHtml}</tr>`;
    if (isHeaderRow && bodyRows.length === 0) {
      headerRows.push(rowHtml);
    } else {
      bodyRows.push(rowHtml);
    }
  }

  const sections: string[] = [];
  if (headerRows.length > 0) {
    sections.push(`  <thead>\n${headerRows.join('\n')}\n  </thead>`);
  }
  if (bodyRows.length > 0) {
    sections.push(`  <tbody>\n${bodyRows.join('\n')}\n  </tbody>`);
  }
  return `<table>\n${sections.join('\n')}\n</table>`;
}

function escapeTsvCell(text: string): string {
  if (/[\t\n\r"]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeMatrixToTsv(matrix: TableExportMatrix): string {
  return matrix.rows
    .map((row) => row.map((cell) => escapeTsvCell(cell.text)).join('\t'))
    .join('\n');
}

function fallbackCopyText(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export type TableCopyFormat = 'markdown' | 'html' | 'excel';

export async function copyTableToClipboard(
  editor: Editor,
  format: TableCopyFormat,
): Promise<{ format: TableCopyFormat; rows: number; cols: number } | null> {
  const matrix = extractTableMatrixFromEditor(editor);
  if (!matrix) return null;

  const markdown = serializeMatrixToMarkdown(matrix);
  const html = serializeMatrixToHtml(matrix);
  const tsv = serializeMatrixToTsv(matrix);

  const plainPayload =
    format === 'markdown' ? markdown : format === 'html' ? html : tsv;

  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function' &&
      (format === 'excel' || format === 'html')
    ) {
      const item = new ClipboardItem({
        'text/plain': new Blob([plainPayload], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
    } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(plainPayload);
    } else {
      fallbackCopyText(plainPayload);
    }
  } catch {
    fallbackCopyText(plainPayload);
  }

  return {
    format,
    rows: matrix.rows.length,
    cols: matrix.colCount,
  };
}
