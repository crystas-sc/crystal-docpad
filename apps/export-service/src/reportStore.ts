import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  normalizePageSetup,
  type PageSetupConfig,
  type ReportDocument,
  type SaveReportRequest,
  type StoredReportRecord,
  type StoredReportSummary,
} from '@report-studio/shared';

interface ReportRow {
  id: string;
  title: string;
  author: string;
  content_json: string;
  page_setup_json: string | null;
  word_count: number;
  chart_count: number;
  table_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

interface DocumentMetrics {
  searchText: string;
  wordCount: number;
  chartCount: number;
  tableCount: number;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,80}$/;

export function isValidReportId(id: string): boolean {
  return VALID_ID_REGEX.test(id);
}

export function resolveSafeDbPath(customPath?: string): string {
  if (customPath === ':memory:') {
    return ':memory:';
  }
  const dataDir = path.resolve(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  if (!customPath) {
    return path.join(dataDir, 'reports.sqlite');
  }

  const resolved = path.resolve(dataDir, path.basename(customPath));
  if (!resolved.startsWith(dataDir + path.sep)) {
    throw new Error('Database path must stay confined inside the data directory.');
  }
  return resolved;
}

function analyzeDocument(doc: ReportDocument): DocumentMetrics {
  const textParts: string[] = [];
  let chartCount = 0;
  let tableCount = 0;

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 32) return;
    const rec = node as {
      type?: string;
      text?: string;
      attrs?: Record<string, unknown>;
      content?: unknown[];
    };

    if (rec.type === 'text' && typeof rec.text === 'string') {
      textParts.push(rec.text);
    } else if (rec.type === 'tanstackChart') {
      chartCount += 1;
      if (typeof rec.attrs?.title === 'string') {
        textParts.push(rec.attrs.title);
      }
      if (typeof rec.attrs?.subtitle === 'string') {
        textParts.push(rec.attrs.subtitle);
      }
    } else if (rec.type === 'table') {
      tableCount += 1;
    }

    if (Array.isArray(rec.content)) {
      for (const child of rec.content) {
        walk(child, depth + 1);
      }
    }
  };

  walk(doc, 0);

  const searchText = textParts.join(' ').replace(/\s+/g, ' ').trim();
  const wordCount = searchText ? searchText.split(/\s+/).length : 0;

  return {
    searchText,
    wordCount,
    chartCount,
    tableCount,
  };
}

function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, '\\$&');
}

function parsePageSetup(raw: string | null | undefined): PageSetupConfig {
  if (!raw) return normalizePageSetup(null);
  try {
    return normalizePageSetup(JSON.parse(raw) as Partial<PageSetupConfig>);
  } catch {
    return normalizePageSetup(null);
  }
}

function mapSummary(row: Omit<ReportRow, 'content_json'>): StoredReportSummary {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    wordCount: row.word_count,
    chartCount: row.chart_count,
    tableCount: row.table_count,
    version: row.version,
    pageSetup: parsePageSetup(row.page_setup_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ReportStore {
  private readonly db: DatabaseSync;

  constructor(dbPath?: string) {
    const resolvedPath = resolveSafeDbPath(dbPath);
    this.db = new DatabaseSync(resolvedPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Crystal DocPad',
        content_json TEXT NOT NULL CHECK (json_valid(content_json)),
        page_setup_json TEXT,
        search_text TEXT NOT NULL DEFAULT '',
        word_count INTEGER NOT NULL DEFAULT 0,
        chart_count INTEGER NOT NULL DEFAULT 0,
        table_count INTEGER NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reports_updated_at ON reports (updated_at DESC);
    `);

    const cols = this.db.prepare('PRAGMA table_info(reports)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'page_setup_json')) {
      this.db.exec('ALTER TABLE reports ADD COLUMN page_setup_json TEXT');
    }
  }

  listReports(searchQuery?: string): StoredReportSummary[] {
    const query = searchQuery?.trim() ?? '';
    if (!query) {
      const stmt = this.db.prepare(`
        SELECT id, title, author, page_setup_json, word_count, chart_count, table_count, version, created_at, updated_at
        FROM reports
        ORDER BY updated_at DESC
        LIMIT 100
      `);
      return (stmt.all() as unknown as Array<Omit<ReportRow, 'content_json'>>).map(mapSummary);
    }

    const pattern = `%${escapeLikePattern(query)}%`;
    const stmt = this.db.prepare(`
      SELECT id, title, author, page_setup_json, word_count, chart_count, table_count, version, created_at, updated_at
      FROM reports
      WHERE title LIKE ? ESCAPE '\\'
         OR author LIKE ? ESCAPE '\\'
         OR search_text LIKE ? ESCAPE '\\'
      ORDER BY updated_at DESC
      LIMIT 100
    `);
    return (stmt.all(pattern, pattern, pattern) as unknown as Array<Omit<ReportRow, 'content_json'>>).map(
      mapSummary,
    );
  }

  countReports(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM reports').get() as
      | { count: number }
      | undefined;
    return Number(row?.count ?? 0);
  }

  getReport(id: string): StoredReportRecord | null {
    if (!isValidReportId(id)) return null;
    const stmt = this.db.prepare(`
      SELECT id, title, author, content_json, page_setup_json, word_count, chart_count, table_count, version, created_at, updated_at
      FROM reports
      WHERE id = ?
    `);
    const row = stmt.get(id) as unknown as ReportRow | undefined;
    if (!row) return null;

    return {
      ...mapSummary(row),
      documentJson: JSON.parse(row.content_json) as ReportDocument,
    };
  }

  createReport(input: SaveReportRequest): StoredReportRecord {
    const id = `rep-${crypto.randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();
    const title = input.title.trim() || 'Untitled Report';
    const author = input.author?.trim() || 'Crystal DocPad';
    const contentJson = JSON.stringify(input.documentJson);
    const pageSetup = normalizePageSetup(input.pageSetup);
    const pageSetupJson = JSON.stringify(pageSetup);
    const metrics = analyzeDocument(input.documentJson);

    const stmt = this.db.prepare(`
      INSERT INTO reports (
        id, title, author, content_json, page_setup_json, search_text,
        word_count, chart_count, table_count, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    stmt.run(
      id,
      title,
      author,
      contentJson,
      pageSetupJson,
      metrics.searchText,
      metrics.wordCount,
      metrics.chartCount,
      metrics.tableCount,
      now,
      now,
    );

    return {
      id,
      title,
      author,
      wordCount: metrics.wordCount,
      chartCount: metrics.chartCount,
      tableCount: metrics.tableCount,
      version: 1,
      pageSetup,
      createdAt: now,
      updatedAt: now,
      documentJson: input.documentJson,
    };
  }

  updateReport(id: string, input: SaveReportRequest): StoredReportRecord | null {
    if (!isValidReportId(id)) return null;

    const existing = this.db
      .prepare('SELECT version, created_at FROM reports WHERE id = ?')
      .get(id) as { version: number; created_at: string } | undefined;

    if (!existing) return null;

    const now = new Date().toISOString();
    const nextVersion = existing.version + 1;
    const title = input.title.trim() || 'Untitled Report';
    const author = input.author?.trim() || 'Crystal DocPad';
    const contentJson = JSON.stringify(input.documentJson);
    const pageSetup = normalizePageSetup(input.pageSetup);
    const pageSetupJson = JSON.stringify(pageSetup);
    const metrics = analyzeDocument(input.documentJson);

    const stmt = this.db.prepare(`
      UPDATE reports
      SET title = ?,
          author = ?,
          content_json = ?,
          page_setup_json = ?,
          search_text = ?,
          word_count = ?,
          chart_count = ?,
          table_count = ?,
          version = ?,
          updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      title,
      author,
      contentJson,
      pageSetupJson,
      metrics.searchText,
      metrics.wordCount,
      metrics.chartCount,
      metrics.tableCount,
      nextVersion,
      now,
      id,
    );

    return {
      id,
      title,
      author,
      wordCount: metrics.wordCount,
      chartCount: metrics.chartCount,
      tableCount: metrics.tableCount,
      version: nextVersion,
      pageSetup,
      createdAt: existing.created_at,
      updatedAt: now,
      documentJson: input.documentJson,
    };
  }

  deleteReport(id: string): boolean {
    if (!isValidReportId(id)) return false;
    const result = this.db.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}
