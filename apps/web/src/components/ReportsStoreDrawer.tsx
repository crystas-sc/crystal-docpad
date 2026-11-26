import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  PAGE_SIZE_SPECS,
  type PageSetupConfig,
  type ReportDocument,
  type StoredReportRecord,
  type StoredReportSummary,
} from '@report-studio/shared';
import {
  Database,
  Save,
  FolderOpen,
  Trash2,
  Search,
  Plus,
  CopyPlus,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export interface ReportsStoreDrawerProps {
  editor: Editor | null;
  reportTitle: string;
  onReportTitleChange: (title: string) => void;
  reportAuthor: string;
  onReportAuthorChange: (author: string) => void;
  pageSetup: PageSetupConfig;
  activeReportId: string | null;
  activeReportVersion: number | null;
  isDirty: boolean;
  onReportSaved: (record: StoredReportRecord) => void;
  onReportLoaded: (record: StoredReportRecord) => void;
  onNewBlankReport: () => void;
  onLoadSampleReport?: () => void;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ReportsStoreDrawer: React.FC<ReportsStoreDrawerProps> = ({
  editor,
  reportTitle,
  onReportTitleChange,
  reportAuthor,
  onReportAuthorChange,
  pageSetup,
  activeReportId,
  activeReportVersion,
  isDirty,
  onReportSaved,
  onReportLoaded,
  onNewBlankReport,
  onLoadSampleReport,
}) => {
  const [reports, setReports] = useState<StoredReportSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const fetchReports = async (query = searchQuery) => {
    setLoadingList(true);
    setErrorMsg(null);
    try {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const res = await fetch(`/api/reports${qs}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch saved reports (${res.status})`);
      }
      const data = (await res.json()) as { reports: StoredReportSummary[] };
      setReports(data.reports ?? []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load saved reports.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchReports(searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSave = async (asNew = false) => {
    if (!editor) return;
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const documentJson = editor.getJSON() as ReportDocument;
      const isUpdate = Boolean(activeReportId) && !asNew;
      const endpoint = isUpdate ? `/api/reports/${activeReportId}` : '/api/reports';
      const method = isUpdate ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: reportTitle.trim() || 'Untitled Report',
          author: reportAuthor.trim() || 'Crystal DocPad',
          documentJson,
          pageSetup,
        }),
      });

      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || `Save failed (${res.status})`);
      }

      const data = (await res.json()) as { report: StoredReportRecord };
      onReportSaved(data.report);
      setStatusMsg(
        `Saved "${data.report.title}" (v${data.report.version}) to SQLite.`,
      );
      await fetchReports(searchQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save report.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenReport = async (id: string) => {
    if (!editor) return;
    setOpeningId(id);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || `Failed to load report (${res.status})`);
      }
      const data = (await res.json()) as { report: StoredReportRecord };
      onReportLoaded(data.report);
      setStatusMsg(`Loaded "${data.report.title}" (v${data.report.version}) for editing.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to open report.');
    } finally {
      setOpeningId(null);
    }
  };

  const handleDeleteReport = async (id: string) => {
    setDeletingId(id);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || `Delete failed (${res.status})`);
      }
      setConfirmDeleteId(null);
      setStatusMsg('Removed report from SQLite store.');
      await fetchReports(searchQuery);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete report.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-800" />
            <h3 className="text-sm font-semibold text-slate-900">Report Store (SQLite)</h3>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {onLoadSampleReport ? (
              <button
                type="button"
                onClick={onLoadSampleReport}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline whitespace-nowrap shrink-0"
              >
                Sample
              </button>
            ) : null}
            <button
              type="button"
              onClick={onNewBlankReport}
              className="flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Blank</span>
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Persists full Tiptap JSON (tables, charts, multi-column sections)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Active Draft Metadata & Save Actions */}
        <div className="space-y-3 border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700">Active Document</span>
            <span className="font-mono tabular-nums text-slate-600">
              {activeReportId ? `v${activeReportVersion ?? 1}` : 'Unsaved draft'}
              {isDirty ? ' · Modified' : activeReportId ? ' · Synced' : ''}
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Title</label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => onReportTitleChange(e.target.value)}
              placeholder="Report title..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">Author</label>
            <input
              type="text"
              value={reportAuthor}
              onChange={(e) => onReportAuthorChange(e.target.value)}
              placeholder="Author or team..."
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !editor}
              onClick={() => void handleSave(false)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-blue-800 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5" />
              <span>
                {saving ? 'Saving...' : activeReportId ? 'Update Saved' : 'Save to SQLite'}
              </span>
            </button>

            {activeReportId ? (
              <button
                type="button"
                disabled={saving || !editor}
                onClick={() => void handleSave(true)}
                title="Save as a new copy in SQLite"
                className="flex items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <CopyPlus className="h-3.5 w-3.5" />
                <span>Copy</span>
              </button>
            ) : null}
          </div>
        </div>

        {errorMsg ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-700 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {statusMsg ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{statusMsg}</span>
          </div>
        ) : null}

        {/* Search & Stored Reports List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">Saved Reports</span>
            <span className="font-mono tabular-nums text-slate-500">{reports.length}</span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, author, or text..."
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          {loadingList ? (
            <div className="space-y-2 py-2">
              <div className="h-16 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
              <div className="h-16 rounded-md border border-slate-200 bg-slate-50 animate-pulse" />
            </div>
          ) : reports.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500 leading-relaxed">
              {searchQuery.trim()
                ? 'No saved reports match your search query.'
                : 'No reports stored in SQLite yet. Click "Save to SQLite" above to persist the current document JSON.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
              {reports.map((item) => {
                const isActive = item.id === activeReportId;
                return (
                  <div
                    key={item.id}
                    className={`p-3 transition-colors ${isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {item.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="truncate max-w-[140px]">{item.author}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">v{item.version}</span>
                          {isActive ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-blue-800">Open</span>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                          <span>{item.wordCount}w</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.chartCount}c</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.tableCount}t</span>
                          {item.pageSetup ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-sans">
                                {PAGE_SIZE_SPECS[item.pageSetup.size].shortLabel}{' '}
                                {item.pageSetup.orientation === 'landscape'
                                  ? 'Landscape'
                                  : 'Portrait'}
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{formatTimestamp(item.updatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={openingId === item.id || !editor}
                        onClick={() => void handleOpenReport(item.id)}
                        className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <FolderOpen className="h-3 w-3 text-blue-800" />
                        <span>{openingId === item.id ? 'Loading...' : 'Load for Edit'}</span>
                      </button>

                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={deletingId === item.id}
                            onClick={() => void handleDeleteReport(item.id)}
                            className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-800 hover:bg-rose-100 whitespace-nowrap"
                          >
                            {deletingId === item.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          title="Delete saved report"
                          className="rounded border border-slate-200 bg-white p-1 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
