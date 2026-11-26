import {
  getPageGeometry,
  renderChartToSvgString,
  type PageSetupConfig,
  type ReportDocument,
  type ReportDocumentNode,
  type TableCellNode,
  type TableHeaderNode,
  type TiptapMark,
  type TiptapTextNode,
} from '@report-studio/shared';
import { getEmbeddedFontCss } from './fonts.ts';

export interface SerializeHtmlOptions {
  title?: string;
  author?: string;
  documentHash: string;
  signed?: boolean;
  generatedAt?: string;
  pageSetup?: PageSetupConfig;
}

export interface SerializedReportHtml {
  html: string;
  chartCount: number;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function wrapWithMarks(html: string, marks?: TiptapMark[]): string {
  if (!marks || marks.length === 0) return html;
  let result = html;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `<strong>${result}</strong>`;
        break;
      case 'italic':
        result = `<em>${result}</em>`;
        break;
      case 'strike':
        result = `<s>${result}</s>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'code':
        result = `<code class="inline-code">${result}</code>`;
        break;
      case 'link': {
        const href = sanitizeHref(mark.attrs?.href);
        if (href) {
          result = `<a href="${escapeHtml(href)}">${result}</a>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return result;
}

function renderInlineContent(
  content?: Array<TiptapTextNode | { type: 'hardBreak' }>,
): string {
  if (!content || content.length === 0) return '';
  return content
    .map((item) => {
      if (item.type === 'hardBreak') return '<br />';
      if (item.type === 'text') {
        return wrapWithMarks(escapeHtml(item.text || ''), item.marks);
      }
      return '';
    })
    .join('');
}

function renderCell(cell: TableCellNode | TableHeaderNode): string {
  const tag = cell.type === 'tableHeader' ? 'th' : 'td';
  const attrs: string[] = [];
  if (cell.attrs?.colspan && cell.attrs.colspan > 1) {
    attrs.push(`colspan="${cell.attrs.colspan}"`);
  }
  if (cell.attrs?.rowspan && cell.attrs.rowspan > 1) {
    attrs.push(`rowspan="${cell.attrs.rowspan}"`);
  }
  if (cell.attrs?.align) {
    attrs.push(`style="text-align:${escapeHtml(cell.attrs.align)}"`);
  }
  const inner = (cell.content ?? [])
    .map((node) => renderNode(node, { chartCounter: { value: 0 } }))
    .join('');
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${tag}>`;
}

function renderNode(
  node: ReportDocumentNode | { type: 'listItem'; content: any[] },
  ctx: { chartCounter: { value: number } },
): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.attrs?.level ?? 2));
      const inner = renderInlineContent(node.content);
      return `<h${level}>${inner || '&nbsp;'}</h${level}>`;
    }
    case 'paragraph': {
      const inner = renderInlineContent(node.content);
      return `<p>${inner || '&nbsp;'}</p>`;
    }
    case 'bulletList': {
      const items = (node.content ?? [])
        .map((item) => `<li>${(item.content ?? []).map((c) => renderNode(c, ctx)).join('')}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }
    case 'orderedList': {
      const start = node.attrs?.start && node.attrs.start !== 1 ? ` start="${node.attrs.start}"` : '';
      const items = (node.content ?? [])
        .map((item) => `<li>${(item.content ?? []).map((c) => renderNode(c, ctx)).join('')}</li>`)
        .join('');
      return `<ol${start}>${items}</ol>`;
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map((c) => renderNode(c, ctx)).join('');
      return `<blockquote>${inner}</blockquote>`;
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((t) => escapeHtml(t.text || '')).join('');
      return `<pre><code>${text}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr />';
    case 'table': {
      const rows = node.content ?? [];
      const headerRows: string[] = [];
      const bodyRows: string[] = [];
      for (const row of rows) {
        const isHeaderRow = (row.content ?? []).some((c) => c.type === 'tableHeader');
        const rowHtml = `<tr>${(row.content ?? []).map((c) => renderCell(c)).join('')}</tr>`;
        if (isHeaderRow && bodyRows.length === 0) {
          headerRows.push(rowHtml);
        } else {
          bodyRows.push(rowHtml);
        }
      }
      const thead = headerRows.length > 0 ? `<thead>${headerRows.join('')}</thead>` : '';
      const tbody = bodyRows.length > 0 ? `<tbody>${bodyRows.join('')}</tbody>` : '';
      return `<div class="table-container"><table>${thead}${tbody}</table></div>`;
    }
    case 'tanstackChart': {
      const chartIndex = ctx.chartCounter.value;
      ctx.chartCounter.value += 1;
      const width = node.attrs?.width ?? 680;
      const height = node.attrs?.height ?? 320;
      const svgMarkup = renderChartToSvgString(
        node.attrs,
        width,
        height,
        `export-chart-${chartIndex}`,
      );
      const titleHtml = node.attrs?.title
        ? `<div class="chart-title">${escapeHtml(node.attrs.title)}</div>`
        : '';
      const subtitleHtml = node.attrs?.subtitle
        ? `<div class="chart-subtitle">${escapeHtml(node.attrs.subtitle)}</div>`
        : '';
      return `
        <figure class="chart-figure">
          ${titleHtml}
          ${subtitleHtml}
          <div id="chart-${chartIndex}" class="chart-wrapper" style="width:${width}px;height:${height}px;">
            ${svgMarkup}
          </div>
        </figure>
      `;
    }
    case 'columnSection': {
      const layout = node.attrs?.layout ?? (node.attrs?.columns === 3 ? '33-33-33' : '50-50');
      const colsHtml = (node.content ?? [])
        .map((col) => {
          const inner = (col.content ?? []).map((child) => renderNode(child, ctx)).join('');
          return `<div class="column-block">${inner || '<p>&nbsp;</p>'}</div>`;
        })
        .join('');
      return `<section class="column-section column-section--${escapeHtml(layout)}">${colsHtml}</section>`;
    }
    case 'pageBreak':
      return '<div class="page-break" aria-hidden="true"></div>';
    default:
      return '';
  }
}

export function serializeDocumentToHtml(
  doc: ReportDocument,
  options: SerializeHtmlOptions,
): SerializedReportHtml {
  const ctx = { chartCounter: { value: 0 } };
  const bodyHtml = (doc.content ?? []).map((node) => renderNode(node, ctx)).join('\n');
  const embeddedFontCss = getEmbeddedFontCss();
  const geometry = getPageGeometry(options.pageSetup);
  const title = escapeHtml(options.title || 'Executive Report');
  const author = escapeHtml(options.author || 'Crystal DocPad');
  const generatedAt = escapeHtml(options.generatedAt || new Date().toISOString().slice(0, 10));
  const hashShort = escapeHtml(options.documentHash.slice(0, 16));

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    ${embeddedFontCss}

    @page {
      size: ${geometry.spec.cssKeyword} ${geometry.setup.orientation};
      margin: ${geometry.marginsMm.top}mm ${geometry.marginsMm.right}mm ${geometry.marginsMm.bottom}mm ${geometry.marginsMm.left}mm;
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Plus Jakarta Sans', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .report-shell {
      max-width: ${geometry.contentWidthMm.toFixed(1)}mm;
      margin: 0 auto;
    }

    .page-break {
      break-before: page;
      page-break-before: always;
      height: 0;
      margin: 0;
      padding: 0;
    }

    .report-meta-bar {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 10px;
      margin-bottom: 20px;
      border-bottom: 1px solid #cbd5e1;
      font-size: 8.5pt;
      color: #475569;
    }

    .report-meta-hash {
      font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
      font-variant-numeric: tabular-nums;
      color: #334155;
    }

    h1 {
      font-family: 'Fraunces', 'Liberation Serif', Georgia, serif;
      font-size: 22pt;
      line-height: 1.2;
      font-weight: 600;
      color: #0f172a;
      margin: 0 0 12px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    h2 {
      font-family: 'Fraunces', 'Liberation Serif', Georgia, serif;
      font-size: 14.5pt;
      line-height: 1.3;
      font-weight: 600;
      color: #0f172a;
      margin: 22px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      page-break-after: avoid;
      break-after: avoid;
    }

    h3 {
      font-size: 11.5pt;
      line-height: 1.35;
      font-weight: 600;
      color: #1e293b;
      margin: 16px 0 6px 0;
      page-break-after: avoid;
      break-after: avoid;
    }

    p {
      margin: 0 0 10px 0;
      color: #1e293b;
    }

    ul, ol {
      margin: 0 0 12px 0;
      padding-left: 20px;
      color: #1e293b;
    }

    li {
      margin-bottom: 4px;
    }

    li > p {
      margin: 0;
    }

    blockquote {
      margin: 14px 0;
      padding: 10px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      color: #334155;
      font-style: italic;
    }

    pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
      font-size: 8.5pt;
      overflow-x: auto;
      margin: 12px 0;
    }

    .inline-code {
      font-family: 'JetBrains Mono', 'DejaVu Sans Mono', monospace;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
    }

    hr {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 18px 0;
    }

    .table-container {
      margin: 14px 0 18px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.2pt;
      font-variant-numeric: tabular-nums;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 7px 10px;
      text-align: left;
      vertical-align: top;
    }

    th {
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 600;
    }

    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .chart-figure {
      margin: 16px 0 20px 0;
      padding: 14px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #ffffff;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .chart-title {
      font-size: 11pt;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 2px;
    }

    .chart-subtitle {
      font-size: 8.8pt;
      color: #475569;
      margin-bottom: 10px;
    }

    .chart-wrapper {
      max-width: 100%;
      overflow: visible;
    }

    .chart-wrapper svg {
      display: block;
      width: 100%;
      height: auto;
    }

    .column-section {
      display: grid;
      gap: 18px;
      align-items: start;
      margin: 14px 0 18px 0;
    }

    .column-section--50-50 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .column-section--66-34 {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    }

    .column-section--34-66 {
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    }

    .column-section--33-33-33 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .column-block {
      min-width: 0;
    }

    .column-block > :first-child {
      margin-top: 0;
    }

    .column-block > :last-child {
      margin-bottom: 0;
    }

    .column-block .chart-wrapper {
      width: 100% !important;
      height: auto !important;
    }

    .report-footer-proof {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <main class="report-shell">
    <div class="report-meta-bar">
      <span>${author} &middot; ${generatedAt}</span>
      <span class="report-meta-hash">SHA-256: ${hashShort}&hellip;${options.signed ? ' &middot; PKCS#12 Signed' : ''}</span>
    </div>
    ${bodyHtml}
    <footer class="report-footer-proof">
      <span>Generated by Crystal DocPad</span>
      <span class="report-meta-hash">Digest: ${escapeHtml(options.documentHash)}</span>
    </footer>
  </main>
</body>
</html>`;

  return {
    html,
    chartCount: ctx.chartCounter.value,
  };
}
