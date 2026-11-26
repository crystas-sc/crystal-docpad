import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  DEFAULT_PAGE_SETUP,
  normalizePageSetup,
  PAGE_MARGIN_SPECS,
  PAGE_SIZE_SPECS,
  type PageSetupConfig,
  type StoredReportRecord,
} from '@report-studio/shared';
import { ReportEditor, type SelectedChartInfo } from './editor/ReportEditor.tsx';
import { PromptApiAssistant } from './ai/PromptApiAssistant.tsx';
import { ExportDrawer } from './components/ExportDrawer.tsx';
import { ReportsStoreDrawer } from './components/ReportsStoreDrawer.tsx';
import { TableOfContentsSidebar } from './components/TableOfContentsSidebar.tsx';
import { UsernameModal } from './components/UsernameModal.tsx';
import {
  getRoomIdFromUrl,
  pickRandomCollabColor,
  useCollaboration,
  type CollabUser,
} from './collab/useCollaboration.ts';
import { SAMPLE_REPORT_DOCUMENT } from './editor/sampleReport.ts';
import {
  Check,
  Link2,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  X,
} from 'lucide-react';

const COLLAB_USER_STORAGE_KEY = 'crystal-docpad:collab-user';

function loadSessionCollabUser(): CollabUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(COLLAB_USER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CollabUser>;
    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      return {
        name: parsed.name.trim(),
        color: typeof parsed.color === 'string' && parsed.color ? parsed.color : pickRandomCollabColor(),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

type SidePanel = 'none' | 'store' | 'ai' | 'export';

export function App() {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [panel, setPanel] = useState<SidePanel>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'none' : 'store',
  );
  const [lastPanel, setLastPanel] = useState<Exclude<SidePanel, 'none'>>('store');

  const openPanel = (next: Exclude<SidePanel, 'none'>) => {
    setLastPanel(next);
    setPanel(next);
  };
  const [reportTitle, setReportTitle] = useState(
    'FY 2026 Enterprise Infrastructure & Margin Review',
  );
  const [reportAuthor, setReportAuthor] = useState('Corporate FP&A · Crystal DocPad');
  const [stats, setStats] = useState({ words: 0, charts: 0, tables: 0 });
  const [selectedChart, setSelectedChart] = useState<SelectedChartInfo | null>(null);

  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeReportVersion, setActiveReportVersion] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [showToc, setShowToc] = useState(true);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [pageSetup, setPageSetup] = useState<PageSetupConfig>(DEFAULT_PAGE_SETUP);
  const [pageCount, setPageCount] = useState(1);

  const [roomId, setRoomId] = useState<string>(() => getRoomIdFromUrl());
  const pendingInitialContentRef = useRef<Record<string, unknown> | null>(null);
  const [collabUser, setCollabUser] = useState<CollabUser | null>(() => loadSessionCollabUser());
  const [editingUsername, setEditingUsername] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const switchCollabRoom = (nextRoomId: string, seedContent?: Record<string, unknown> | null) => {
    pendingInitialContentRef.current = seedContent ?? null;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('room', nextRoomId);
      window.history.replaceState({}, '', url.toString());
    }
    setRoomId(nextRoomId);
  };

  const {
    ydoc,
    provider,
    status: collabStatus,
    synced: collabSynced,
    collaborators,
  } = useCollaboration(roomId, collabUser);

  useEffect(() => {
    const metaMap = ydoc.getMap<string>('meta');
    const syncTitleFromMeta = () => {
      const remoteTitle = metaMap.get('title');
      if (typeof remoteTitle === 'string' && remoteTitle !== reportTitle) {
        setReportTitle(remoteTitle);
      }
    };
    metaMap.observe(syncTitleFromMeta);
    return () => {
      metaMap.unobserve(syncTitleFromMeta);
    };
  }, [ydoc, reportTitle]);

  const updateSharedReportTitle = (nextTitle: string) => {
    setReportTitle(nextTitle);
    setIsDirty(true);
    ydoc.getMap<string>('meta').set('title', nextTitle);
  };

  const handleSaveCollabUser = (nextUser: CollabUser) => {
    setCollabUser(nextUser);
    setEditingUsername(false);
    try {
      window.sessionStorage.setItem(COLLAB_USER_STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // Ignore storage errors
    }
  };

  const handleCopyShareLink = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('room', roomId);
    try {
      await navigator.clipboard.writeText(shareUrl.toString());
      setCopiedShareLink(true);
      window.setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // Fallback: update URL bar so user can copy it manually
      window.history.replaceState({}, '', shareUrl.toString());
    }
  };

  const handlePageSetupChange = (next: PageSetupConfig) => {
    const layoutChanged =
      next.size !== pageSetup.size ||
      next.orientation !== pageSetup.orientation ||
      next.margins !== pageSetup.margins;
    setPageSetup(next);
    if (layoutChanged) {
      setIsDirty(true);
    }
  };

  useEffect(() => {
    const handleOpenAi = () => openPanel('ai');
    window.addEventListener('folio:open-ai-panel', handleOpenAi);
    return () => {
      window.removeEventListener('folio:open-ai-panel', handleOpenAi);
    };
  }, []);

  const handleClearChartSelection = () => {
    if (editor && selectedChart) {
      const nextPos = Math.min(editor.state.doc.content.size, selectedChart.pos + 1);
      editor.chain().focus().setTextSelection(nextPos).run();
    }
    setSelectedChart(null);
  };

  const handleResetSample = () => {
    switchCollabRoom(
      `sample-${Date.now().toString(36)}`,
      SAMPLE_REPORT_DOCUMENT as unknown as Record<string, unknown>,
    );
    setReportTitle('FY 2026 Enterprise Infrastructure & Margin Review');
    setReportAuthor('Corporate FP&A · Crystal DocPad');
    setPageSetup(DEFAULT_PAGE_SETUP);
    setActiveReportId(null);
    setActiveReportVersion(null);
    setIsDirty(false);
  };

  const handleNewBlankReport = () => {
    const blankDoc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Untitled Report' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    };
    switchCollabRoom(`draft-${Date.now().toString(36)}`, blankDoc);
    setReportTitle('Untitled Report');
    setPageSetup(DEFAULT_PAGE_SETUP);
    setActiveReportId(null);
    setActiveReportVersion(null);
    setIsDirty(false);
  };

  const handleReportSaved = (record: StoredReportRecord) => {
    const targetRoom = `report-${record.id}`;
    if (roomId !== targetRoom) {
      switchCollabRoom(
        targetRoom,
        (editor?.getJSON() as unknown as Record<string, unknown>) ?? null,
      );
    }
    setActiveReportId(record.id);
    setActiveReportVersion(record.version);
    setReportTitle(record.title);
    setReportAuthor(record.author);
    setPageSetup(normalizePageSetup(record.pageSetup));
    setIsDirty(false);
  };

  const handleReportLoaded = (record: StoredReportRecord) => {
    const targetRoom = `report-${record.id}`;
    const docJson = record.documentJson as unknown as Record<string, unknown>;
    if (roomId === targetRoom) {
      editor?.commands.setContent(docJson);
    } else {
      switchCollabRoom(targetRoom, docJson);
    }
    setActiveReportId(record.id);
    setActiveReportVersion(record.version);
    setReportTitle(record.title);
    setReportAuthor(record.author);
    setPageSetup(normalizePageSetup(record.pageSetup));
    setIsDirty(false);
    setSelectedChart(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-2.5">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="font-serif text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Crystal DocPad
          </a>

          {/* Zone 2: Editable Document Name */}
          <div className="group flex min-w-0 flex-1 max-w-[480px] items-center justify-center gap-1.5">
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => updateSharedReportTitle(e.target.value)}
              aria-label="Document title"
              placeholder="Untitled Report"
              className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-3 py-1.5 text-center text-sm font-medium text-slate-900 hover:border-slate-200 hover:bg-slate-50/70 focus:border-blue-700 focus:bg-white focus:outline-none transition-colors truncate"
            />
            <Pencil
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-0 transition-opacity pointer-events-none"
            />
          </div>

          {/* Zone 3: Collaborators, Share & Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5">
              <span
                title={`Collaboration status: ${collabStatus}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${
                  collabStatus === 'connected'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : collabStatus === 'connecting'
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    collabStatus === 'connected'
                      ? 'bg-emerald-500'
                      : collabStatus === 'connecting'
                        ? 'bg-amber-500 animate-pulse'
                        : 'bg-red-500'
                  }`}
                />
                <span>{collabStatus === 'connected' ? 'Live' : collabStatus === 'connecting' ? 'Syncing' : 'Offline'}</span>
              </span>

              {collaborators.slice(0, 4).map((person) => (
                <button
                  key={person.clientId}
                  type="button"
                  onClick={person.isLocal ? () => setEditingUsername(true) : undefined}
                  title={person.isLocal ? `${person.name} (You) — click to rename` : person.name}
                  className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 ${
                    person.isLocal ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: person.color }}
                  />
                  <span className="max-w-[90px] truncate">
                    {person.name}
                    {person.isLocal ? ' (You)' : ''}
                  </span>
                </button>
              ))}
              {collaborators.length > 4 ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  +{collaborators.length - 4}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              title="Copy collaboration invite link"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              {copiedShareLink ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Share</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => openPanel('export')}
              className="rounded-md bg-blue-800 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-900 transition-colors whitespace-nowrap shrink-0"
            >
              Export Report
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {/* Sticky Left Table of Contents Sidebar */}
        {showToc ? (
          <aside className="hidden lg:block w-[248px] shrink-0 border-r border-slate-200 bg-white">
            <div className="sticky top-[57px] h-[calc(100vh-57px)]">
              <TableOfContentsSidebar
                editor={editor}
                onCollapse={() => setShowToc(false)}
              />
            </div>
          </aside>
        ) : null}

        {/* Document Authoring Canvas */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
          {/* Quiet Unboxed Document Metadata Line */}
          <div className="mx-auto mb-4 flex max-w-[960px] flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              {!showToc ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowToc(true)}
                    className="hidden lg:inline-flex items-center gap-1 font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
                  >
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                    <span>Contents</span>
                  </button>
                  <span className="hidden lg:inline" aria-hidden="true">
                    ·
                  </span>
                </>
              ) : null}
              <span className="font-mono tabular-nums">
                {activeReportId ? `SQLite v${activeReportVersion ?? 1}` : 'Draft'}
                {isDirty ? ' (edited)' : ''}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {PAGE_SIZE_SPECS[pageSetup.size].shortLabel}{' '}
                {pageSetup.orientation === 'landscape' ? 'Landscape' : 'Portrait'} ·{' '}
                {PAGE_MARGIN_SPECS[pageSetup.margins].label}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {pageCount} {pageCount === 1 ? 'page' : 'pages'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{stats.words} words</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{stats.tables} tables</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{stats.charts} charts</span>
            </div>

            {panel === 'none' ? (
              <button
                type="button"
                onClick={() => setPanel(lastPanel)}
                title="Open right sidebar"
                aria-label="Open right sidebar"
                className="hidden md:inline-flex items-center gap-1 font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
              >
                <span>Sidebar</span>
                <PanelRightOpen className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <div className="flex items-center gap-3 md:hidden">
              <button
                type="button"
                onClick={() => setMobileTocOpen((v) => !v)}
                className="font-medium text-blue-800"
              >
                Contents
              </button>
              <button
                type="button"
                onClick={() => (panel === 'store' ? setPanel('none') : openPanel('store'))}
                className="font-medium text-blue-800"
              >
                Saved
              </button>
              <button
                type="button"
                onClick={() => (panel === 'ai' ? setPanel('none') : openPanel('ai'))}
                className="font-medium text-blue-800"
              >
                AI
              </button>
              <button
                type="button"
                onClick={() => (panel === 'export' ? setPanel('none') : openPanel('export'))}
                className="font-medium text-blue-800"
              >
                Export
              </button>
            </div>
          </div>

          {mobileTocOpen ? (
            <div className="mx-auto mb-4 max-w-[960px] rounded-lg border border-slate-200 bg-white lg:hidden max-h-[280px] overflow-hidden flex flex-col">
              <TableOfContentsSidebar
                editor={editor}
                onCollapse={() => setMobileTocOpen(false)}
              />
            </div>
          ) : null}

          <ReportEditor
            onEditorReady={setEditor}
            onStatsChange={setStats}
            onSelectedChartChange={setSelectedChart}
            onDocumentDirty={() => setIsDirty(true)}
            pageSetup={pageSetup}
            onPageSetupChange={handlePageSetupChange}
            onPageCountChange={setPageCount}
            ydoc={ydoc}
            collabProvider={provider}
            collabSynced={collabSynced}
            collabUser={collabUser}
            consumeInitialContent={() => {
              const next = pendingInitialContentRef.current;
              pendingInitialContentRef.current = null;
              return next;
            }}
          />
        </main>

        {/* Collapsible Right Drawer (Saved Reports, AI Draft, or Signed Export) */}
        {panel !== 'none' ? (
          <aside className="fixed inset-x-0 top-[57px] bottom-0 z-40 w-full bg-white md:static md:w-[360px] md:shrink-0 md:border-l md:border-slate-200">
            <div className="h-full md:sticky md:top-[57px] md:h-[calc(100vh-57px)] flex flex-col">
              {/* Segmented Drawer Switcher */}
              <div className="flex items-center border-b border-slate-200 bg-slate-50 p-1.5 gap-1">
                <button
                  type="button"
                  onClick={() => openPanel('store')}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    panel === 'store'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Saved
                </button>
                <button
                  type="button"
                  onClick={() => openPanel('ai')}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    panel === 'ai'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  AI Assistant
                </button>
                <button
                  type="button"
                  onClick={() => openPanel('export')}
                  className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    panel === 'export'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  title="Collapse right sidebar"
                  aria-label="Collapse right sidebar"
                  className="hidden md:inline-flex rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors shrink-0"
                >
                  <PanelRightClose className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPanel('none')}
                  title="Close drawer"
                  aria-label="Close drawer"
                  className="md:hidden rounded p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1">
                {panel === 'store' ? (
                  <ReportsStoreDrawer
                    editor={editor}
                    reportTitle={reportTitle}
                    onReportTitleChange={(val) => {
                      setReportTitle(val);
                      setIsDirty(true);
                    }}
                    reportAuthor={reportAuthor}
                    onReportAuthorChange={(val) => {
                      setReportAuthor(val);
                      setIsDirty(true);
                    }}
                    pageSetup={pageSetup}
                    activeReportId={activeReportId}
                    activeReportVersion={activeReportVersion}
                    isDirty={isDirty}
                    onReportSaved={handleReportSaved}
                    onReportLoaded={handleReportLoaded}
                    onNewBlankReport={handleNewBlankReport}
                    onLoadSampleReport={handleResetSample}
                  />
                ) : panel === 'ai' ? (
                  <PromptApiAssistant
                    editor={editor}
                    selectedChart={selectedChart}
                    onClearChartSelection={handleClearChartSelection}
                  />
                ) : (
                  <ExportDrawer
                    editor={editor}
                    reportTitle={reportTitle}
                    onReportTitleChange={(val) => {
                      setReportTitle(val);
                      setIsDirty(true);
                    }}
                    reportAuthor={reportAuthor}
                    onReportAuthorChange={(val) => {
                      setReportAuthor(val);
                      setIsDirty(true);
                    }}
                    pageSetup={pageSetup}
                    onPageSetupChange={handlePageSetupChange}
                  />
                )}
              </div>
            </div>
          </aside>
        ) : null}
      </div>

      {collabUser === null || editingUsername ? (
        <UsernameModal
          initialUser={collabUser ?? { name: '', color: pickRandomCollabColor() }}
          roomId={roomId}
          isEditing={editingUsername}
          onSubmit={handleSaveCollabUser}
          onCancel={editingUsername ? () => setEditingUsername(false) : undefined}
        />
      ) : null}
    </div>
  );
}

export default App;
