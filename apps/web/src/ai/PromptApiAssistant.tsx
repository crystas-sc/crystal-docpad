import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { ChartConfig } from '@report-studio/shared';
import {
  Cpu,
  AlertCircle,
  Send,
  CheckCircle2,
  FileText,
  BarChart2,
  ArrowLeft,
  ClipboardPaste,
} from 'lucide-react';
import type { SelectedChartInfo } from '../editor/ReportEditor.tsx';
import {
  chartToMarkdownTable,
  markdownToTiptapNodes,
  parseMarkdownChartUpdate,
} from '../editor/markdownImport.ts';
import {
  getPromptApi,
  promptWithStats,
  type PromptLanguageModelSession,
} from './promptApi.ts';

const DOCUMENT_MARKDOWN_SYSTEM_PROMPT = `You are a financial and business report writer.
Output clean GitHub-Flavored Markdown ONLY (never JSON).
Use Markdown headings (##, ###), concise analytical paragraphs, bullet lists, and Markdown pipe tables (| Col | ... |) for quantitative figures.
Do not wrap the entire response in code fences.`;

const CHART_CHAT_SYSTEM_PROMPT = `You are a data visualization assistant editing an existing chart.
Respond in Markdown ONLY using this exact format (include only lines that change, and ALWAYS include the full updated Markdown table when data values, X-axis, or Y-axis columns change):

Title: <optional updated chart title>
Chart Type: <line | bar | area>
X-Axis: <x column header>
Y-Axis: <comma-separated numeric column headers>

| <X-Axis header> | <Y1 header> | <Y2 header> |
| :--- | ---: | ---: |
| ... | ... | ... |

Keep all numeric cells plain numbers without currency symbols unless part of the column header.`;

const PRESET_MARKDOWN_PROMPTS = [
  'Draft a 2-paragraph Markdown analysis of SaaS gross margin expansion with a Markdown table comparing Gross Margin % and Cloud Infra Cost across Q1–Q4.',
  'Write an executive summary on enterprise retention cohorts with a bullet list of key drivers and a Markdown table of Net Dollar Retention by segment.',
  'Summarize EMEA expansion milestones with a Markdown table of Monthly Active Workspaces from Jan to Jun.',
];

const CHART_CHAT_SUGGESTIONS = [
  'Switch to bar chart',
  'Rename X-axis to Fiscal Period',
  'Change Y-axis to Revenue, Margin',
];

const SAMPLE_MARKDOWN_OUTPUT = `## Cloud Efficiency & Unit Economics

Compute optimization initiatives reduced cost per million API inferences by **29%** across FY 2026, lifting infrastructure gross margin from **71.4%** to **78.2%** while supporting **2.1x** higher enterprise concurrency.

| Quarter | Gross Margin % | Unit Cost ($K) |
| :--- | ---: | ---: |
| Q1 26 | 71.4 | 44.0 |
| Q2 26 | 73.6 | 39.2 |
| Q3 26 | 76.1 | 34.5 |
| Q4 26 | 78.2 | 31.1 |`;

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  appliedSummary?: string;
}

export interface PromptApiAssistantProps {
  editor: Editor | null;
  selectedChart: SelectedChartInfo | null;
  onClearChartSelection?: () => void;
}

export const PromptApiAssistant: React.FC<PromptApiAssistantProps> = ({
  editor,
  selectedChart,
  onClearChartSelection,
}) => {
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'downloadable' | 'downloading' | 'unavailable'
  >('checking');

  // Document Markdown drafting state
  const [promptText, setPromptText] = useState(PRESET_MARKDOWN_PROMPTS[0]);
  const [markdownBuffer, setMarkdownBuffer] = useState(SAMPLE_MARKDOWN_OUTPUT);
  const [showMarkdownBox, setShowMarkdownBox] = useState(false);

  // Selected Chart chat state (keyed by chart id)
  const [chartChatInput, setChartChatInput] = useState('');
  const [chatHistoryByChartId, setChatHistoryByChartId] = useState<Record<string, ChatEntry[]>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const checkAvailability = async () => {
    setAvailability('checking');
    const api = getPromptApi();
    if (!api) {
      setAvailability('unavailable');
      return;
    }
    try {
      const result = await api.availability();
      setAvailability(result);
    } catch {
      setAvailability('unavailable');
    }
  };

  useEffect(() => {
    void checkAvailability();
  }, []);

  const activeChartId = selectedChart
    ? selectedChart.config.id || `chart-pos-${selectedChart.pos}`
    : null;

  const currentChartMessages: ChatEntry[] = activeChartId
    ? chatHistoryByChartId[activeChartId] ?? []
    : [];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChartMessages.length, activeChartId]);

  const pasteMarkdownIntoEditor = (markdown: string) => {
    if (!editor) return;
    const nodes = markdownToTiptapNodes(markdown);
    if (nodes.length === 0) {
      throw new Error('Markdown output was empty and produced no document blocks.');
    }
    editor.chain().focus().insertContent(nodes).run();
    setStatusMsg(`Pasted ${nodes.length} Markdown block(s) into the editor.`);
  };

  const handleGenerateDocumentMarkdown = async () => {
    if (!editor || !promptText.trim()) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const api = getPromptApi();
    if (!api) {
      setErrorMsg('Chrome Prompt API (LanguageModel) is not available in this browser.');
      return;
    }

    setRunning(true);
    let session: PromptLanguageModelSession | null = null;
    try {
      const currentAvailability = await api.availability();
      if (currentAvailability === 'unavailable') {
        setAvailability('unavailable');
        throw new Error('On-device LanguageModel reports unavailable on this device.');
      }

      session = await api.create({
        systemPrompt: DOCUMENT_MARKDOWN_SYSTEM_PROMPT,
        initialPrompts: [{ role: 'system', content: DOCUMENT_MARKDOWN_SYSTEM_PROMPT }],
      });

      const markdownOutput = await promptWithStats(
        session,
        promptText.trim(),
        'document-markdown',
      );
      setMarkdownBuffer(markdownOutput.trim());
      pasteMarkdownIntoEditor(markdownOutput);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate Markdown output.');
    } finally {
      session?.destroy?.();
      setRunning(false);
    }
  };

  const handlePasteMarkdownBuffer = () => {
    if (!editor) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      pasteMarkdownIntoEditor(markdownBuffer);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not parse Markdown content.');
    }
  };

  const applyChartPatch = (chartInfo: SelectedChartInfo, patch: Partial<ChartConfig>) => {
    if (!editor) return;
    const nextAttrs: ChartConfig = {
      ...chartInfo.config,
      ...patch,
    };
    const tr = editor.state.tr.setNodeMarkup(chartInfo.pos, undefined, nextAttrs);
    tr.setSelection(NodeSelection.create(tr.doc, chartInfo.pos));
    editor.view.dispatch(tr);
  };

  const appendChartMessage = (chartId: string, entry: ChatEntry) => {
    setChatHistoryByChartId((prev) => ({
      ...prev,
      [chartId]: [...(prev[chartId] ?? []), entry],
    }));
  };

  const handleSendChartChat = async (overrideMessage?: string) => {
    if (!editor || !selectedChart) return;
    const message = (overrideMessage ?? chartChatInput).trim();
    if (!message) return;

    setErrorMsg(null);
    setStatusMsg(null);
    if (!overrideMessage) {
      setChartChatInput('');
    }

    const chartId = selectedChart.config.id || `chart-pos-${selectedChart.pos}`;
    appendChartMessage(chartId, {
      id: `user-${Date.now()}`,
      role: 'user',
      text: message,
    });

    // Try on-device LanguageModel first when available
    const api = getPromptApi();
    if (api && availability !== 'unavailable') {
      setRunning(true);
      let session: PromptLanguageModelSession | null = null;
      try {
        const currentAvailability = await api.availability();
        if (currentAvailability !== 'unavailable') {
          session = await api.create({
            systemPrompt: CHART_CHAT_SYSTEM_PROMPT,
            initialPrompts: [{ role: 'system', content: CHART_CHAT_SYSTEM_PROMPT }],
          });

          const chartContextPrompt = [
            `Current Chart State:`,
            `Title: ${selectedChart.config.title}`,
            `Chart Type: ${selectedChart.config.chartType}`,
            `X-Axis: ${selectedChart.config.xKey}`,
            `Y-Axis: ${selectedChart.config.yKeys.join(', ')}`,
            ``,
            chartToMarkdownTable(selectedChart.config),
            ``,
            `User request: ${message}`,
          ].join('\n');

          const markdownReply = await promptWithStats(
            session,
            chartContextPrompt,
            'chart-chat',
          );
          const parsed = parseMarkdownChartUpdate(markdownReply, selectedChart.config);

          if (parsed) {
            applyChartPatch(selectedChart, parsed.patch);
            setStatusMsg(parsed.summary);
          }

          appendChartMessage(chartId, {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: markdownReply.trim(),
            appliedSummary: parsed?.summary,
          });
          return;
        }
        setAvailability('unavailable');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Chart chat request failed.');
        return;
      } finally {
        session?.destroy?.();
        setRunning(false);
      }
    }

    // Direct Markdown / axis command parsing fallback (works even when LanguageModel is unavailable)
    const directParsed = parseMarkdownChartUpdate(message, selectedChart.config);
    if (directParsed) {
      applyChartPatch(selectedChart, directParsed.patch);
      setStatusMsg(directParsed.summary);
      appendChartMessage(chartId, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: directParsed.summary,
        appliedSummary: directParsed.summary,
      });
    } else {
      const fallbackNote =
        'Chrome LanguageModel is unavailable for open-ended requests. You can still send Markdown directives (`X-Axis: Month`, `Y-Axis: Sales, Margin`, `Chart Type: bar`) or paste a Markdown table directly here.';
      appendChartMessage(chartId, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: fallbackNote,
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Assistant Header */}
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {selectedChart ? (
              <BarChart2 className="h-4 w-4 text-blue-800" />
            ) : (
              <Cpu className="h-4 w-4 text-blue-800" />
            )}
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedChart ? 'Chart Chat Assistant' : 'On-Device Prompt API'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void checkAvailability()}
            className="text-xs font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
          >
            Re-check
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {selectedChart
            ? 'Chat to modify selected chart data, X-axis, or Y-axis'
            : 'Markdown output from LanguageModel pasted directly into the editor'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Availability Banner */}
        {availability === 'unavailable' ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2">
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <span>Browser does not expose LanguageModel API</span>
            </div>
            <p className="text-amber-900 leading-relaxed">
              Chrome&apos;s built-in Prompt API requires Chrome 138+ desktop with{' '}
              <code className="font-mono bg-amber-100/80 px-1 rounded">
                chrome://flags/#prompt-api-for-gemini-nano
              </code>{' '}
              enabled.
            </p>
            <p className="text-amber-900 leading-relaxed">
              {selectedChart
                ? 'You can still enter axis/type directives or paste a Markdown table below to update the chart.'
                : 'You can still paste or edit Markdown below to insert formatted sections and tables.'}
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 flex items-center justify-between">
            <span>LanguageModel availability</span>
            <span className="font-mono font-medium text-slate-900 capitalize">{availability}</span>
          </div>
        )}

        {/* Mode Switch: Chart Chat vs. Document Markdown */}
        {selectedChart ? (
          <div className="space-y-3">
            {/* Selected Chart Context */}
            <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {selectedChart.config.title}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 font-mono tabular-nums">
                    <span className="capitalize font-sans">{selectedChart.config.chartType}</span>
                    <span aria-hidden="true">·</span>
                    <span>X: {selectedChart.config.xKey}</span>
                    <span aria-hidden="true">·</span>
                    <span>Y: {selectedChart.config.yKeys.join(', ')}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedChart.config.data.length} rows</span>
                  </div>
                </div>
                {onClearChartSelection ? (
                  <button
                    type="button"
                    onClick={onClearChartSelection}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    <span>Doc Mode</span>
                  </button>
                ) : null}
              </div>

              <details className="pt-1">
                <summary className="cursor-pointer text-[11px] font-medium text-slate-600 hover:text-slate-900">
                  Current Markdown table snapshot
                </summary>
                <pre className="mt-1.5 overflow-x-auto rounded border border-slate-200 bg-white p-2 font-mono text-[10px] leading-relaxed text-slate-700">
                  {chartToMarkdownTable(selectedChart.config)}
                </pre>
              </details>
            </div>

            {/* Chat Conversation History */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-0.5">
              {currentChartMessages.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-500 leading-relaxed">
                  Ask to rename the X-axis or Y-axis, switch chart type, update numbers, or paste a
                  Markdown table to replace the chart&apos;s series.
                </div>
              ) : (
                currentChartMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-md px-3 py-2 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'ml-4 bg-blue-800 text-white'
                        : 'mr-2 border border-slate-200 bg-slate-50 text-slate-800'
                    }`}
                  >
                    <pre className="whitespace-pre-wrap font-sans text-xs">{msg.text}</pre>
                    {msg.appliedSummary ? (
                      <div className="mt-1.5 border-t border-slate-200 pt-1 text-[11px] font-medium text-emerald-800">
                        {msg.appliedSummary}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Axis & Data Suggestions */}
            <div className="flex flex-wrap gap-1.5">
              {CHART_CHAT_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setChartChatInput(suggestion)}
                  className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Chart Chat Input */}
            <div className="space-y-2">
              <textarea
                rows={4}
                value={chartChatInput}
                onChange={(e) => setChartChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleSendChartChat();
                  }
                }}
                placeholder="e.g. Change X-Axis to Month, Y-Axis to ARR ($M), or paste a Markdown table..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 leading-relaxed focus:border-blue-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={running || !editor || !chartChatInput.trim()}
                onClick={() => void handleSendChartChat()}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{running ? 'Updating Chart...' : 'Apply Chat Update'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Document Mode: Markdown Prompt Composer */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Markdown Section Prompt
              </label>
              <textarea
                rows={4}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Describe a report section or table to generate in Markdown and paste at cursor..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 leading-relaxed focus:border-blue-700 focus:outline-none"
              />

              <div className="flex flex-wrap gap-1.5">
                {PRESET_MARKDOWN_PROMPTS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(preset)}
                    className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    Preset {idx + 1}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={running || availability === 'unavailable' || !editor}
                onClick={() => void handleGenerateDocumentMarkdown()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {running ? 'Generating Markdown...' : 'Generate Markdown & Paste at Cursor'}
                </span>
              </button>

              <p className="text-[11px] text-slate-500">
                Tip: Click any chart in the document to switch into Chart Chat Mode.
              </p>
            </div>

            {/* Markdown Output Buffer / Manual Markdown Paste Tester */}
            <div className="border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => setShowMarkdownBox((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-medium text-slate-700 hover:text-slate-900"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  <span>Markdown Output / Paste Buffer</span>
                </span>
                <span className="text-blue-800">{showMarkdownBox ? 'Hide' : 'Open'}</span>
              </button>

              {(showMarkdownBox || availability === 'unavailable') && (
                <div className="mt-2.5 space-y-2">
                  <textarea
                    rows={9}
                    value={markdownBuffer}
                    onChange={(e) => setMarkdownBuffer(e.target.value)}
                    spellCheck={false}
                    className="w-full rounded-md border border-slate-300 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-800 focus:border-blue-700 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!editor}
                    onClick={handlePasteMarkdownBuffer}
                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5 text-blue-800" />
                    <span>Paste Markdown at Cursor</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {errorMsg ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            {errorMsg}
          </div>
        ) : null}

        {statusMsg ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            <span>{statusMsg}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};
