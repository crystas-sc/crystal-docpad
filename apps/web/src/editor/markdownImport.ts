import type { JSONContent } from '@tiptap/core';
import type { ChartConfig, ChartDatum, ChartType } from '@report-studio/shared';
import { looksLikeMarkdownTable, parseMarkdownTableToContent } from './tableClipboard.ts';

function sanitizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Parses inline Markdown formatting (**bold**, *italic*, `code`, ~~strike~~, [label](url))
 * into Tiptap text nodes with marks.
 */
export function parseInlineMarkdown(text: string): JSONContent[] {
  if (!text) return [];

  const nodes: JSONContent[] = [];
  const tokenRegex =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined && match[3] !== undefined) {
      const href = sanitizeLinkHref(match[3]);
      if (href) {
        nodes.push({
          type: 'text',
          text: match[2],
          marks: [{ type: 'link', attrs: { href } }],
        });
      } else {
        nodes.push({ type: 'text', text: match[2] });
      }
    } else if (match[4] !== undefined || match[5] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[4] ?? match[5],
        marks: [{ type: 'bold' }],
      });
    } else if (match[6] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[6],
        marks: [{ type: 'strike' }],
      });
    } else if (match[7] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[7],
        marks: [{ type: 'code' }],
      });
    } else if (match[8] !== undefined || match[9] !== undefined) {
      nodes.push({
        type: 'text',
        text: match[8] ?? match[9],
        marks: [{ type: 'italic' }],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return nodes;
}

/**
 * Converts Markdown output (headings, paragraphs, blockquotes, lists, code blocks,
 * horizontal rules, and GFM Markdown tables) into Tiptap JSONContent nodes.
 */
export function markdownToTiptapNodes(markdown: string): JSONContent[] {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: JSONContent[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || null;
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      const codeText = codeLines.join('\n');
      blocks.push({
        type: 'codeBlock',
        attrs: { language: lang },
        content: codeText ? [{ type: 'text', text: codeText }] : [],
      });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    // Heading (# through ######, clamped to 1..3 for report hierarchy)
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = Math.min(3, Math.max(1, headingMatch[1].length)) as 1 | 2 | 3;
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i += 1;
      continue;
    }

    // GFM Markdown table block
    if (trimmed.includes('|') && i + 1 < lines.length) {
      const tableLines: string[] = [lines[i]];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().includes('|')) {
        tableLines.push(lines[j]);
        j += 1;
      }
      const candidate = tableLines.join('\n');
      if (looksLikeMarkdownTable(candidate)) {
        const tableNode = parseMarkdownTableToContent(candidate);
        if (tableNode) {
          blocks.push(tableNode);
          i = j;
          continue;
        }
      }
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        content: [
          {
            type: 'paragraph',
            content: parseInlineMarkdown(quoteLines.join(' ').trim()),
          },
        ],
      });
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineMarkdown(itemText),
            },
          ],
        });
        i += 1;
      }
      blocks.push({
        type: 'bulletList',
        content: items,
      });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: JSONContent[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineMarkdown(itemText),
            },
          ],
        });
        i += 1;
      }
      blocks.push({
        type: 'orderedList',
        content: items,
      });
      continue;
    }

    // Paragraph (collect contiguous non-empty lines until next block syntax)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const current = lines[i].trim();
      if (
        !current ||
        current.startsWith('#') ||
        current.startsWith('```') ||
        current.startsWith('>') ||
        /^[-*+]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(current)
      ) {
        break;
      }
      if (
        current.includes('|') &&
        i + 1 < lines.length &&
        looksLikeMarkdownTable(`${lines[i]}\n${lines[i + 1]}`)
      ) {
        break;
      }
      paraLines.push(current);
      i += 1;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        content: parseInlineMarkdown(paraLines.join(' ')),
      });
    }
  }

  return blocks;
}

export function looksLikeMarkdownDocument(text: string): boolean {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return false;
  const lines = normalized.split('\n');

  const hasHeading = lines.some((l) => /^#{1,6}\s+\S/.test(l.trim()));
  const hasFence = /^```/m.test(normalized);
  const hasBlockquote = lines.some((l) => /^>\s+\S/.test(l.trim()));
  const listCount = lines.filter((l) => /^(?:[-*+]|\d+\.)\s+\S/.test(l.trim())).length;
  const hasMarkdownTable = extractFirstMarkdownTable(normalized) !== null;

  return hasHeading || hasFence || hasMarkdownTable || (hasBlockquote && lines.length >= 2) || listCount >= 2;
}

export function chartToMarkdownTable(config: ChartConfig): string {
  const cols = [config.xKey, ...config.yKeys];
  const header = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map((_, idx) => (idx === 0 ? ':---' : '---:')).join(' | ')} |`;
  const rows = (config.data ?? []).map((datum) => {
    const cells = cols.map((col) => {
      const val = datum[col];
      return val === undefined || val === null ? '' : String(val);
    });
    return `| ${cells.join(' | ')} |`;
  });
  return [header, sep, ...rows].join('\n');
}

function parseNumericCell(raw: string): number {
  const cleaned = raw.trim().replace(/[$,%\s,]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) && cleaned.length > 0 ? num : 0;
}

function extractFirstMarkdownTable(markdown: string): string | null {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes('|') && lines[i + 1].includes('|')) {
      const block: string[] = [lines[i]];
      let j = i + 1;
      while (j < lines.length && lines[j].trim().includes('|')) {
        block.push(lines[j]);
        j += 1;
      }
      const candidate = block.join('\n');
      if (looksLikeMarkdownTable(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export interface ChartUpdateResult {
  patch: Partial<ChartConfig>;
  summary: string;
}

/**
 * Parses Markdown output from the on-device Prompt API (or user chat) to update
 * a selected chart's data, X-axis key, Y-axis series keys, chartType, or title.
 */
export function parseMarkdownChartUpdate(
  markdown: string,
  current: ChartConfig,
): ChartUpdateResult | null {
  const text = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) return null;

  const patch: Partial<ChartConfig> = {};
  const changes: string[] = [];

  // 1. Parse optional Markdown directives
  const titleMatch =
    /^(?:Title|Chart\s*Title):\s*(.+)$/im.exec(text) || /^#{1,3}\s+(.+)$/m.exec(text);
  if (titleMatch?.[1]) {
    patch.title = titleMatch[1].trim();
    changes.push(`title "${patch.title}"`);
  }

  const subtitleMatch = /^Subtitle:\s*(.+)$/im.exec(text);
  if (subtitleMatch?.[1]) {
    patch.subtitle = subtitleMatch[1].trim();
  }

  const typeMatch =
    /^(?:Chart\s*Type|Type):\s*(line|bar|area)\b/im.exec(text) ||
    /\b(?:switch|change|convert|make|set)\b[^.\n]*?\bto\s+(?:a\s+)?(line|bar|area)(?:\s+chart)?\b/i.exec(
      text,
    );
  if (typeMatch?.[1]) {
    patch.chartType = typeMatch[1].toLowerCase() as ChartType;
    changes.push(`type=${patch.chartType}`);
  }

  const xAxisDirective = /^(?:X[-\s]?Axis|xKey|X):\s*([^\n]+)$/im.exec(text);
  const xAxisNatural =
    /\b(?:(?:rename|change|set|update)\s+(?:the\s+)?)?x[-\s]?axis(?:\s+label|\s+key|\s+name)?\s+(?:to|as)\s+["'`]?([^\n,."'`]+?)(?=["'`]?(?:\s+and\s+(?:the\s+)?y[-\s]?axis|\s*$|[,.]))/im.exec(
      text,
    );
  const requestedXKey = (xAxisDirective?.[1] ?? xAxisNatural?.[1])
    ?.trim()
    .replace(/^["'`]|["'`]$/g, '');

  const yAxisDirective = /^(?:Y[-\s]?Axis|yKeys|Y):\s*([^\n]+)$/im.exec(text);
  const yAxisNatural =
    /\b(?:(?:rename|change|set|update)\s+(?:the\s+)?)?y[-\s]?axis(?:\s+labels?|\s+series|\s+keys?)?\s+(?:to|as)\s+["'`]?([^\n.]+?)(?=["'`]?(?:\s+and\s+(?:the\s+)?x[-\s]?axis|\s*$|\.)|$)/im.exec(
      text,
    );
  const rawYSpec = (yAxisDirective?.[1] ?? yAxisNatural?.[1])?.trim();
  const requestedYKeys = rawYSpec
    ? rawYSpec
        .split(/,|&|\band\b/i)
        .map((s) => s.trim().replace(/^["'`]|["'`]$/g, ''))
        .filter(Boolean)
    : undefined;

  // 2. Parse Markdown table if present (replaces/updates chart data + axes)
  const tableMd = extractFirstMarkdownTable(text);
  if (tableMd) {
    const tableContent = parseMarkdownTableToContent(tableMd);
    const rows = tableContent?.content ?? [];
    if (rows.length >= 2) {
      const headers = (rows[0].content ?? []).map((cell, idx) => {
        const label = (cell.content?.[0]?.content ?? [])
          .map((t) => t.text ?? '')
          .join('')
          .trim();
        return label || `Col ${idx + 1}`;
      });

      const xKey = requestedXKey || headers[0];
      const detectedYKeys = headers.slice(1);
      const yKeys =
        requestedYKeys && requestedYKeys.length > 0
          ? requestedYKeys.filter((k) => headers.includes(k)).length > 0
            ? requestedYKeys.filter((k) => headers.includes(k))
            : detectedYKeys
          : detectedYKeys;

      if (yKeys.length > 0) {
        const data: ChartDatum[] = rows.slice(1).map((row) => {
          const cells = row.content ?? [];
          const rawVals = cells.map((cell) =>
            (cell.content?.[0]?.content ?? [])
              .map((t) => t.text ?? '')
              .join('')
              .trim(),
          );
          const datum: ChartDatum = {
            [xKey]: rawVals[0] ?? '',
          };
          for (let col = 1; col < headers.length; col++) {
            const headerName = headers[col];
            if (!yKeys.includes(headerName)) continue;
            datum[headerName] = parseNumericCell(rawVals[col] ?? '0');
          }
          return datum;
        });

        patch.xKey = xKey;
        patch.yKeys = yKeys;
        patch.data = data;
        changes.push(`${data.length} data rows`, `X=${xKey}`, `Y=[${yKeys.join(', ')}]`);
      }
    }
  } else {
    // 3. No table in response — apply axis key renames / series edits directly to existing data
    let nextData = current.data.map((row) => ({ ...row }));
    let dataModified = false;

    if (requestedXKey && requestedXKey !== current.xKey) {
      nextData = nextData.map((row) => {
        const updated = { ...row };
        const oldVal = updated[current.xKey];
        delete updated[current.xKey];
        updated[requestedXKey] = oldVal ?? '';
        return updated;
      });
      patch.xKey = requestedXKey;
      dataModified = true;
      changes.push(`X=${requestedXKey}`);
    }

    if (requestedYKeys && requestedYKeys.length > 0) {
      const oldYKeys = current.yKeys;
      nextData = nextData.map((row) => {
        const updated = { ...row };
        requestedYKeys.forEach((newKey, idx) => {
          if (updated[newKey] === undefined) {
            const fallbackOldKey = oldYKeys[idx];
            updated[newKey] =
              fallbackOldKey && updated[fallbackOldKey] !== undefined
                ? updated[fallbackOldKey]
                : 0;
          }
        });
        return updated;
      });
      patch.yKeys = requestedYKeys;
      dataModified = true;
      changes.push(`Y=[${requestedYKeys.join(', ')}]`);
    }

    // Also handle target threshold updates if mentioned
    const targetMatch = /\btarget(?:\s+value|\s+line)?\s*(?:to|=|:)\s*(\d+(?:\.\d+)?)/i.exec(text);
    if (targetMatch) {
      const targetValue = Number(targetMatch[1]);
      if (Number.isFinite(targetValue)) {
        patch.customCurveOptions = {
          ...(current.customCurveOptions ?? { enabled: true }),
          enabled: true,
          targetValue,
        };
        changes.push(`target=${targetValue}`);
      }
    }

    if (dataModified) {
      patch.data = nextData;
    }
  }

  if (Object.keys(patch).length === 0) {
    return null;
  }

  return {
    patch,
    summary: `Updated chart (${changes.join(', ')}).`,
  };
}
