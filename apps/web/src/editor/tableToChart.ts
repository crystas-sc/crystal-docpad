import type { Editor } from '@tiptap/react';
import type { ChartConfig, ChartDatum } from '@report-studio/shared';

function parseNumericCell(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,%\s,]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export interface TableExtractionResult {
  config: ChartConfig;
  tableEndPos: number;
}

/**
 * Extracts structured series data from the table enclosing the current Tiptap
 * cursor or cell selection, returning a ready-to-insert `ChartConfig` and the
 * ProseMirror position immediately after the table.
 */
export function extractChartFromCurrentTable(editor: Editor): TableExtractionResult | null {
  const { state } = editor;
  const { $from } = state.selection;

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
  const tableEndPos = $from.after(tableDepth);

  // Determine which rows are selected if user made a multi-row cell selection
  const selectedRowIndices = new Set<number>();
  const selection = state.selection as unknown as {
    $anchorCell?: { pos: number };
    $headCell?: { pos: number };
  };

  if (selection.$anchorCell && selection.$headCell) {
    const minPos = Math.min(selection.$anchorCell.pos, selection.$headCell.pos);
    const maxPos = Math.max(selection.$anchorCell.pos, selection.$headCell.pos);
    const tableStart = $from.start(tableDepth);
    let offset = tableStart;
    for (let r = 0; r < tableNode.childCount; r++) {
      const rowNode = tableNode.child(r);
      const rowStart = offset;
      const rowEnd = offset + rowNode.nodeSize;
      if (rowEnd >= minPos && rowStart <= maxPos) {
        selectedRowIndices.add(r);
      }
      offset = rowEnd;
    }
  }

  const rows: string[][] = [];
  for (let r = 0; r < tableNode.childCount; r++) {
    const rowNode = tableNode.child(r);
    const cells: string[] = [];
    for (let c = 0; c < rowNode.childCount; c++) {
      cells.push(rowNode.child(c).textContent.trim());
    }
    rows.push(cells);
  }

  if (rows.length < 2 || rows[0].length < 2) {
    return null;
  }

  const headers = rows[0].map((h, i) => h || `Column ${i + 1}`);
  const xKey = headers[0];

  // If user selected >=2 data rows explicitly, use only those data rows; otherwise use all data rows
  const dataRowIndices: number[] = [];
  for (let r = 1; r < rows.length; r++) {
    if (selectedRowIndices.size >= 2) {
      if (selectedRowIndices.has(r)) dataRowIndices.push(r);
    } else {
      dataRowIndices.push(r);
    }
  }
  const activeRows = (dataRowIndices.length > 0 ? dataRowIndices : rows.slice(1).map((_, idx) => idx + 1))
    .map((idx) => rows[idx])
    .filter(Boolean);

  // Detect numeric columns (yKeys)
  const yKeys: string[] = [];
  for (let col = 1; col < headers.length; col++) {
    const hasNumeric = activeRows.some((row) => parseNumericCell(row[col] ?? '') !== null);
    if (hasNumeric) {
      yKeys.push(headers[col]);
    }
  }

  if (yKeys.length === 0) {
    return null;
  }

  const data: ChartDatum[] = activeRows.map((row, idx) => {
    const datum: ChartDatum = {
      [xKey]: row[0] || `Row ${idx + 1}`,
    };
    for (let col = 1; col < headers.length; col++) {
      const colName = headers[col];
      if (!yKeys.includes(colName)) continue;
      const parsed = parseNumericCell(row[col] ?? '');
      datum[colName] = parsed ?? 0;
    }
    return datum;
  });

  return {
    tableEndPos,
    config: {
      id: `chart-${Date.now()}`,
      chartType: data.length <= 6 && yKeys.length > 1 ? 'bar' : 'line',
      title: `${yKeys.join(' & ')} by ${xKey}`,
      subtitle: `Generated from ${data.length} selected table rows`,
      xKey,
      yKeys,
      data,
      width: 680,
      height: 310,
      customCurveOptions: {
        enabled: true,
        showTrendCurve: true,
        showConfidenceBand: false,
        curveTension: 'monotoneX',
        connectorStyle: 'dashed',
      },
    },
  };
}
