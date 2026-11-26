import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
} from 'docx';
import {
  getPageGeometry,
  mmToTwips,
  type PageSetupConfig,
  type ReportDocument,
  type ReportDocumentNode,
  type TableCellNode,
  type TableHeaderNode,
  type TiptapTextNode,
} from '@report-studio/shared';

export interface BuildDocxMetadata {
  title?: string;
  author?: string;
  documentHash: string;
  pageSetup?: PageSetupConfig;
}

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: 'CBD5E1',
};

function buildTextRuns(
  content?: Array<TiptapTextNode | { type: 'hardBreak' }>,
  baseOptions: { italics?: boolean; bold?: boolean; color?: string; size?: number } = {},
): TextRun[] {
  if (!content || content.length === 0) {
    return [new TextRun({ text: '' })];
  }
  const runs: TextRun[] = [];
  for (const item of content) {
    if (item.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }
    if (item.type === 'text') {
      const marks = item.marks ?? [];
      const isBold = baseOptions.bold || marks.some((m) => m.type === 'bold');
      const isItalic = baseOptions.italics || marks.some((m) => m.type === 'italic');
      const isStrike = marks.some((m) => m.type === 'strike');
      const isCode = marks.some((m) => m.type === 'code');

      runs.push(
        new TextRun({
          text: item.text ?? '',
          bold: isBold,
          italics: isItalic,
          strike: isStrike,
          font: isCode ? 'JetBrains Mono' : 'Plus Jakarta Sans',
          color: baseOptions.color ?? '0F172A',
          size: baseOptions.size ?? 21,
        }),
      );
    }
  }
  return runs;
}

function mapHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  switch (level) {
    case 1:
      return HeadingLevel.HEADING_1;
    case 2:
      return HeadingLevel.HEADING_2;
    case 3:
      return HeadingLevel.HEADING_3;
    default:
      return HeadingLevel.HEADING_4;
  }
}

function extractCellParagraphs(cell: TableCellNode | TableHeaderNode, isHeader: boolean): Paragraph[] {
  const alignment =
    cell.attrs?.align === 'center'
      ? AlignmentType.CENTER
      : cell.attrs?.align === 'right'
        ? AlignmentType.RIGHT
        : AlignmentType.LEFT;

  const paragraphs: Paragraph[] = [];
  for (const child of cell.content ?? []) {
    if (child.type === 'paragraph') {
      paragraphs.push(
        new Paragraph({
          alignment,
          children: buildTextRuns(child.content, {
            bold: isHeader,
            size: 19,
            color: isHeader ? '0F172A' : '1E293B',
          }),
          spacing: { before: 40, after: 40 },
        }),
      );
    }
  }
  if (paragraphs.length === 0) {
    paragraphs.push(new Paragraph({ text: '' }));
  }
  return paragraphs;
}

export async function buildDocxBuffer(
  doc: ReportDocument,
  chartImages: Map<number, Buffer>,
  metadata: BuildDocxMetadata,
): Promise<Buffer> {
  const geometry = getPageGeometry(metadata.pageSetup);
  const defaultMaxChartWidth = geometry.setup.orientation === 'landscape' ? 720 : 560;
  const children: Array<Paragraph | Table> = [];
  let chartIndex = 0;

  const appendNodeToChildren = (
    node: ReportDocumentNode,
    target: Array<Paragraph | Table>,
    maxChartWidth = defaultMaxChartWidth,
  ) => {
    switch (node.type) {
      case 'heading': {
        const level = node.attrs?.level ?? 2;
        target.push(
          new Paragraph({
            heading: mapHeadingLevel(level),
            children: buildTextRuns(node.content, {
              bold: true,
              size: level === 1 ? 38 : level === 2 ? 28 : 23,
              color: '0F172A',
            }),
            spacing: {
              before: level === 1 ? 120 : 220,
              after: 100,
            },
          }),
        );
        break;
      }
      case 'paragraph': {
        target.push(
          new Paragraph({
            children: buildTextRuns(node.content),
            spacing: { after: 120, line: 340 },
          }),
        );
        break;
      }
      case 'bulletList': {
        for (const item of node.content ?? []) {
          for (const sub of item.content ?? []) {
            if (sub.type === 'paragraph') {
              target.push(
                new Paragraph({
                  bullet: { level: 0 },
                  children: buildTextRuns(sub.content),
                  spacing: { after: 80 },
                }),
              );
            }
          }
        }
        break;
      }
      case 'orderedList': {
        let ordinal = node.attrs?.start ?? 1;
        for (const item of node.content ?? []) {
          for (const sub of item.content ?? []) {
            if (sub.type === 'paragraph') {
              target.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${ordinal}. `,
                      bold: true,
                      font: 'Plus Jakarta Sans',
                      size: 21,
                      color: '1E3A8A',
                    }),
                    ...buildTextRuns(sub.content),
                  ],
                  indent: { left: 360 },
                  spacing: { after: 80 },
                }),
              );
              ordinal += 1;
            }
          }
        }
        break;
      }
      case 'blockquote': {
        for (const sub of node.content ?? []) {
          if (sub.type === 'paragraph') {
            target.push(
              new Paragraph({
                indent: { left: 360, right: 200 },
                children: buildTextRuns(sub.content, {
                  italics: true,
                  color: '334155',
                }),
                spacing: { before: 100, after: 100 },
              }),
            );
          }
        }
        break;
      }
      case 'codeBlock': {
        const text = (node.content ?? []).map((t) => t.text ?? '').join('');
        target.push(
          new Paragraph({
            shading: {
              type: ShadingType.CLEAR,
              fill: 'F8FAFC',
            },
            children: [
              new TextRun({
                text,
                font: 'JetBrains Mono',
                size: 18,
                color: '0F172A',
              }),
            ],
            spacing: { before: 120, after: 140 },
          }),
        );
        break;
      }
      case 'horizontalRule': {
        target.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0' },
            },
            spacing: { before: 120, after: 160 },
          }),
        );
        break;
      }
      case 'table': {
        const rows = (node.content ?? []).map((row) => {
          const cells = (row.content ?? []).map((cell) => {
            const isHeader = cell.type === 'tableHeader';
            return new TableCell({
              columnSpan: cell.attrs?.colspan,
              rowSpan: cell.attrs?.rowspan,
              shading: isHeader
                ? { type: ShadingType.CLEAR, fill: 'F1F5F9' }
                : undefined,
              borders: {
                top: CELL_BORDER,
                bottom: CELL_BORDER,
                left: CELL_BORDER,
                right: CELL_BORDER,
              },
              margins: {
                top: 100,
                bottom: 100,
                left: 140,
                right: 140,
              },
              children: extractCellParagraphs(cell, isHeader),
            });
          });
          return new TableRow({
            tableHeader: (row.content ?? []).some((c) => c.type === 'tableHeader'),
            children: cells,
          });
        });

        if (rows.length > 0) {
          target.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows,
            }),
          );
          target.push(new Paragraph({ text: '', spacing: { after: 120 } }));
        }
        break;
      }
      case 'tanstackChart': {
        const currentIndex = chartIndex;
        chartIndex += 1;

        if (node.attrs?.title) {
          target.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: node.attrs.title,
                  bold: true,
                  size: 22,
                  color: '0F172A',
                  font: 'Plus Jakarta Sans',
                }),
              ],
              spacing: { before: 180, after: 40 },
            }),
          );
        }
        if (node.attrs?.subtitle) {
          target.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: node.attrs.subtitle,
                  size: 18,
                  color: '475569',
                  font: 'Plus Jakarta Sans',
                }),
              ],
              spacing: { after: 100 },
            }),
          );
        }

        const pngBuffer = chartImages.get(currentIndex);
        if (pngBuffer) {
          const origW = node.attrs?.width ?? 680;
          const origH = node.attrs?.height ?? 320;
          const targetWidth = maxChartWidth;
          const targetHeight = Math.round((origH / origW) * targetWidth);

          target.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: pngBuffer,
                  transformation: {
                    width: targetWidth,
                    height: targetHeight,
                  },
                  type: 'png',
                }),
              ],
              spacing: { after: 160 },
            }),
          );
        }
        break;
      }
      case 'columnSection': {
        const cols = node.content ?? [];
        if (cols.length === 0) break;

        const layout = node.attrs?.layout ?? (cols.length === 3 ? '33-33-33' : '50-50');
        const colWidthsPct =
          layout === '66-34'
            ? [66, 34]
            : layout === '34-66'
              ? [34, 66]
              : layout === '33-33-33' || cols.length === 3
                ? [33, 33, 34]
                : [50, 50];

        const cellChildrenList = cols.map((col, idx) => {
          const pct = colWidthsPct[idx] ?? Math.floor(100 / cols.length);
          const colMaxChartWidth = Math.max(150, Math.round((520 * pct) / 100));
          const colChildren: Array<Paragraph | Table> = [];
          for (const childNode of col.content ?? []) {
            appendNodeToChildren(childNode, colChildren, colMaxChartWidth);
          }
          if (colChildren.length === 0) {
            colChildren.push(new Paragraph({ text: '' }));
          }
          return new TableCell({
            width: { size: pct, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            margins: {
              top: 40,
              bottom: 40,
              left: idx === 0 ? 0 : 160,
              right: idx === cols.length - 1 ? 0 : 160,
            },
            children: colChildren,
          });
        });

        target.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            rows: [
              new TableRow({
                children: cellChildrenList,
              }),
            ],
          }),
        );
        target.push(new Paragraph({ text: '', spacing: { after: 140 } }));
        break;
      }
      case 'pageBreak': {
        target.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        break;
      }
      default:
        break;
    }
  };

  for (const node of doc.content ?? []) {
    appendNodeToChildren(node, children);
  }

  const reportTitle = metadata.title || 'Executive Report';
  const reportAuthor = metadata.author || 'Crystal DocPad';

  const document = new Document({
    creator: reportAuthor,
    title: reportTitle,
    description: `SHA-256 Verified Document (${metadata.documentHash})`,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: mmToTwips(geometry.spec.widthMm),
              height: mmToTwips(geometry.spec.heightMm),
              orientation:
                geometry.setup.orientation === 'landscape'
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
            },
            margin: {
              top: mmToTwips(geometry.marginsMm.top),
              right: mmToTwips(geometry.marginsMm.right),
              bottom: mmToTwips(geometry.marginsMm.bottom),
              left: mmToTwips(geometry.marginsMm.left),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${reportTitle}  |  ${reportAuthor}`,
                    size: 16,
                    color: '64748B',
                    font: 'Plus Jakarta Sans',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: `Verification SHA-256: ${metadata.documentHash}`,
                    size: 15,
                    color: '475569',
                    font: 'JetBrains Mono',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  return Buffer.from(buffer);
}
