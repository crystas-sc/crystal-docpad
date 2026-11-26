import type { PageSetupConfig } from './pageSetup.ts';

export type ChartType = 'line' | 'bar' | 'area';

export type CurveTension = 'catmullRom' | 'monotoneX' | 'linear';

export interface CustomCurveOptions {
  enabled: boolean;
  /** Optional horizontal target / benchmark line drawn via custom SVG path mark */
  targetValue?: number;
  targetLabel?: string;
  /** Draws a translucent linear-regression confidence envelope using custom area path */
  showConfidenceBand?: boolean;
  /** Draws a smooth Bezier trendline overlay using custom polyline path */
  showTrendCurve?: boolean;
  curveTension?: CurveTension;
  connectorStyle?: 'dashed' | 'solid';
  accentColor?: string;
}

export type ChartDatum = Record<string, string | number>;

export interface ChartConfig {
  id?: string;
  chartType: ChartType;
  title: string;
  subtitle?: string;
  xKey: string;
  yKeys: string[];
  data: ChartDatum[];
  customCurveOptions?: CustomCurveOptions;
  width?: number;
  height?: number;
}

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapTextNode {
  type: 'text';
  text: string;
  marks?: TiptapMark[];
}

export interface ParagraphNode {
  type: 'paragraph';
  attrs?: Record<string, unknown>;
  content?: Array<TiptapTextNode | { type: 'hardBreak' }>;
}

export interface HeadingNode {
  type: 'heading';
  attrs: {
    level: 1 | 2 | 3 | 4 | 5 | 6;
    [key: string]: unknown;
  };
  content?: TiptapTextNode[];
}

export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}

export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number };
  content: ListItemNode[];
}

export interface ListItemNode {
  type: 'listItem';
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface BlockquoteNode {
  type: 'blockquote';
  content: Array<ParagraphNode | HeadingNode | BulletListNode | OrderedListNode>;
}

export interface CodeBlockNode {
  type: 'codeBlock';
  attrs?: { language?: string | null };
  content?: TiptapTextNode[];
}

export interface HorizontalRuleNode {
  type: 'horizontalRule';
}

export interface TableCellAttrs {
  colspan?: number;
  rowspan?: number;
  colwidth?: number[] | null;
  align?: 'left' | 'center' | 'right' | null;
}

export interface TableCellNode {
  type: 'tableCell';
  attrs?: TableCellAttrs;
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface TableHeaderNode {
  type: 'tableHeader';
  attrs?: TableCellAttrs;
  content: Array<ParagraphNode | BulletListNode | OrderedListNode>;
}

export interface TableRowNode {
  type: 'tableRow';
  content: Array<TableHeaderNode | TableCellNode>;
}

export interface TableNode {
  type: 'table';
  content: TableRowNode[];
}

export type ColumnLayoutPreset = '50-50' | '33-33-33' | '66-34' | '34-66';

export interface ColumnSectionAttrs {
  columns?: 2 | 3;
  layout?: ColumnLayoutPreset;
}

export interface ColumnBlockNode {
  type: 'columnBlock';
  content: ReportDocumentNode[];
}

export interface ColumnSectionNode {
  type: 'columnSection';
  attrs?: ColumnSectionAttrs;
  content: ColumnBlockNode[];
}

export interface PageBreakNode {
  type: 'pageBreak';
}

export interface TanStackChartNode {
  type: 'tanstackChart';
  attrs: ChartConfig;
}

export type ReportDocumentNode =
  | ParagraphNode
  | HeadingNode
  | BulletListNode
  | OrderedListNode
  | BlockquoteNode
  | CodeBlockNode
  | HorizontalRuleNode
  | TableNode
  | TanStackChartNode
  | ColumnSectionNode
  | PageBreakNode;

export interface ReportDocument {
  type: 'doc';
  content: ReportDocumentNode[];
}

export type ExportFormat = 'pdf' | 'docx';

export interface ExportRequest {
  documentJson: ReportDocument;
  format: ExportFormat;
  signPdf?: boolean;
  title?: string;
  author?: string;
  pageSetup?: PageSetupConfig;
}

export interface SaveReportRequest {
  title: string;
  author?: string;
  documentJson: ReportDocument;
  pageSetup?: PageSetupConfig;
}

export interface StoredReportSummary {
  id: string;
  title: string;
  author: string;
  wordCount: number;
  chartCount: number;
  tableCount: number;
  version: number;
  pageSetup?: PageSetupConfig;
  createdAt: string;
  updatedAt: string;
}

export interface StoredReportRecord extends StoredReportSummary {
  documentJson: ReportDocument;
}

export type AiGeneratedBlock =
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'heading';
      level?: 1 | 2 | 3;
      text: string;
    }
  | {
      type: 'tanstackChart';
      title: string;
      subtitle?: string;
      chartType: ChartType;
      xKey: string;
      yKeys: string[];
      data: ChartDatum[];
      customCurveOptions?: CustomCurveOptions;
    };

export interface AiReportDraftPayload {
  blocks: AiGeneratedBlock[];
}
