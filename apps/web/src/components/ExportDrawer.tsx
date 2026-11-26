import React, { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  PAGE_MARGIN_SPECS,
  PAGE_SIZE_SPECS,
  type ExportFormat,
  type PageMarginPreset,
  type PageOrientation,
  type PageSetupConfig,
  type PageSizePreset,
  type ReportDocument,
} from '@report-studio/shared';
import { Download, ShieldCheck, FileText, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ExportHealth {
  status: string;
  signingCertAvailable: boolean;
  signingCertSource: string;
  browserPool?: {
    ready: boolean;
    totalJobs: number;
    maxConcurrent: number;
  };
}

export interface ExportDrawerProps {
  editor: Editor | null;
  reportTitle: string;
  onReportTitleChange: (title: string) => void;
  reportAuthor: string;
  onReportAuthorChange: (author: string) => void;
  pageSetup: PageSetupConfig;
  onPageSetupChange?: (next: PageSetupConfig) => void;
}

export const ExportDrawer: React.FC<ExportDrawerProps> = ({
  editor,
  reportTitle,
  onReportTitleChange,
  reportAuthor,
  onReportAuthorChange,
  pageSetup,
  onPageSetupChange,
}) => {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [signPdf, setSignPdf] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [health, setHealth] = useState<ExportHealth | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    filename: string;
    sha256: string;
    signed: boolean;
    format: ExportFormat;
  } | null>(null);

  const loadHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = (await res.json()) as ExportHealth;
        setHealth(data);
      }
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    void loadHealth();
  }, []);

  const handleExport = async () => {
    if (!editor) return;
    setExporting(true);
    setErrorMsg(null);

    try {
      const documentJson = editor.getJSON() as ReportDocument;
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentJson,
          format,
          signPdf: format === 'pdf' && signPdf,
          title: reportTitle,
          author: reportAuthor,
          pageSetup,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || `Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const sha256 = response.headers.get('X-Document-SHA256') ?? 'unavailable';
      const signed = response.headers.get('X-PDF-Signed') === 'true';
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] ?? `report.${format}`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLastResult({ filename, sha256, signed, format });
      void loadHealth();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export request failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-800" />
          <h3 className="text-sm font-semibold text-slate-900">
            Verified Export Pipeline
          </h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Fastify + Playwright + PKCS#12 PDF &amp; High-DPI DOCX
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Document Title
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => onReportTitleChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Author / Issuing Entity
            </label>
            <input
              type="text"
              value={reportAuthor}
              onChange={(e) => onReportAuthorChange(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
            />
          </div>
        </div>

        {/* Page Setup Summary & Quick Controls */}
        <div className="space-y-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">Page Setup</span>
            <span className="font-mono text-[11px] tabular-nums text-slate-500">
              {PAGE_SIZE_SPECS[pageSetup.size].shortLabel} ·{' '}
              {pageSetup.orientation === 'landscape' ? 'Landscape' : 'Portrait'} ·{' '}
              {PAGE_MARGIN_SPECS[pageSetup.margins].label}
            </span>
          </div>

          {onPageSetupChange ? (
            <div className="grid grid-cols-3 gap-1.5">
              <select
                aria-label="Export paper size"
                value={pageSetup.size}
                onChange={(e) =>
                  onPageSetupChange({ ...pageSetup, size: e.target.value as PageSizePreset })
                }
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
              >
                {(['a4', 'letter', 'legal'] as PageSizePreset[]).map((preset) => (
                  <option key={preset} value={preset}>
                    {PAGE_SIZE_SPECS[preset].shortLabel}
                  </option>
                ))}
              </select>

              <select
                aria-label="Export orientation"
                value={pageSetup.orientation}
                onChange={(e) =>
                  onPageSetupChange({
                    ...pageSetup,
                    orientation: e.target.value as PageOrientation,
                  })
                }
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>

              <select
                aria-label="Export margins"
                value={pageSetup.margins}
                onChange={(e) =>
                  onPageSetupChange({ ...pageSetup, margins: e.target.value as PageMarginPreset })
                }
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 focus:border-blue-700 focus:outline-none"
              >
                {(['normal', 'narrow', 'wide'] as PageMarginPreset[]).map((m) => (
                  <option key={m} value={m}>
                    {PAGE_MARGIN_SPECS[m].label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Format Selection */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-2">
            Output Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-colors ${
                format === 'pdf'
                  ? 'border-blue-800 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Print PDF ({PAGE_SIZE_SPECS[pageSetup.size].shortLabel})</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('docx')}
              className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-xs font-medium transition-colors ${
                format === 'docx'
                  ? 'border-blue-800 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Native DOCX</span>
            </button>
          </div>
        </div>

        {/* Cryptographic Signature Option */}
        {format === 'pdf' ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={signPdf}
                onChange={(e) => setSignPdf(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-800"
              />
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Cryptographically sign PDF (.p12)
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600 leading-relaxed">
                  Embeds a PKCS#12 X.509 signature via{' '}
                  <code className="font-mono">@signpdf/signer-p12</code> and{' '}
                  <code className="font-mono">pdf-lib</code>.
                </div>
              </div>
            </label>

            <div className="border-t border-slate-200 pt-2 text-[11px] text-slate-600 flex items-center justify-between">
              <span>Signing certificate</span>
              <span className="font-mono font-medium text-slate-900">
                {health?.signingCertAvailable ? 'Configured (.p12)' : 'Not found'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 leading-relaxed">
            Captures each chart via Playwright at <span className="font-mono">2x</span> DPI and
            embeds a SHA-256 verification digest in the Word document footer.
          </div>
        )}

        <button
          type="button"
          disabled={exporting || !editor}
          onClick={() => void handleExport()}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          <Download className="h-4 w-4" />
          <span>
            {exporting
              ? `Rendering ${format.toUpperCase()}...`
              : `Export ${format.toUpperCase()}${format === 'pdf' && signPdf ? ' (Signed)' : ''}`}
          </span>
        </button>

        {errorMsg ? (
          <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-700 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        ) : null}

        {lastResult ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span>Exported {lastResult.filename}</span>
            </div>
            <div className="text-[11px] text-emerald-900">
              Signature: {lastResult.signed ? 'PKCS#12 X.509 Signed' : 'Unsigned'}
            </div>
            <div className="break-all font-mono text-[10px] text-emerald-900">
              SHA-256: {lastResult.sha256}
            </div>
          </div>
        ) : null}

        {health?.browserPool ? (
          <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 space-y-1">
            <div className="flex justify-between">
              <span>Worker Pool</span>
              <span className="font-mono tabular-nums text-slate-700">
                {health.browserPool.ready ? 'Warm' : 'Standby'} · Max {health.browserPool.maxConcurrent}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Completed Jobs</span>
              <span className="font-mono tabular-nums text-slate-700">
                {health.browserPool.totalJobs}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
