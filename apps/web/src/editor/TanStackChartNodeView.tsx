import React, { useMemo, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Chart, type ChartPoint } from '@tanstack/charts/react';
import {
  buildChartDefinition,
  REPORT_CHART_PALETTE,
  type ChartConfig,
  type ChartDatum,
  type ChartType,
  type CurveTension,
  type CustomCurveOptions,
} from '@report-studio/shared';
import {
  BarChart3,
  LineChart,
  AreaChart,
  SlidersHorizontal,
  Trash2,
  Plus,
  Check,
  X,
  MessageSquare,
} from 'lucide-react';

export const TanStackChartNodeView: React.FC<NodeViewProps> = ({
  editor,
  getPos,
  node,
  updateAttributes,
  deleteNode,
  selected,
}) => {
  const attrs = node.attrs as ChartConfig;
  const [editing, setEditing] = useState(false);
  const [focusedPoint, setFocusedPoint] = useState<ChartPoint<unknown, any, any> | null>(null);

  const [draftTitle, setDraftTitle] = useState(attrs.title ?? '');
  const [draftSubtitle, setDraftSubtitle] = useState(attrs.subtitle ?? '');
  const [draftType, setDraftType] = useState<ChartType>(attrs.chartType ?? 'line');
  const [draftXKey, setDraftXKey] = useState(attrs.xKey ?? 'quarter');
  const [draftYKeys, setDraftYKeys] = useState<string[]>(attrs.yKeys ?? ['value']);
  const [draftData, setDraftData] = useState<ChartDatum[]>(attrs.data ?? []);
  const [draftCurve, setDraftCurve] = useState<CustomCurveOptions>(
    attrs.customCurveOptions ?? {
      enabled: true,
      showTrendCurve: true,
      showConfidenceBand: false,
      curveTension: 'monotoneX',
      connectorStyle: 'dashed',
    },
  );
  const [newSeriesName, setNewSeriesName] = useState('');

  const openEditor = () => {
    setDraftTitle(attrs.title ?? '');
    setDraftSubtitle(attrs.subtitle ?? '');
    setDraftType(attrs.chartType ?? 'line');
    setDraftXKey(attrs.xKey ?? 'quarter');
    setDraftYKeys([...(attrs.yKeys ?? ['value'])]);
    setDraftData((attrs.data ?? []).map((row) => ({ ...row })));
    setDraftCurve({
      enabled: true,
      showTrendCurve: true,
      showConfidenceBand: false,
      curveTension: 'monotoneX',
      connectorStyle: 'dashed',
      ...(attrs.customCurveOptions ?? {}),
    });
    setEditing(true);
  };

  const applyChanges = () => {
    updateAttributes({
      title: draftTitle.trim() || 'Untitled Chart',
      subtitle: draftSubtitle.trim(),
      chartType: draftType,
      xKey: draftXKey.trim() || 'category',
      yKeys: draftYKeys.length > 0 ? draftYKeys : ['value'],
      data: draftData,
      customCurveOptions: draftCurve,
    });
    setEditing(false);
  };

  const chartConfig: ChartConfig = useMemo(
    () => ({
      id: attrs.id,
      chartType: attrs.chartType ?? 'line',
      title: attrs.title ?? 'Chart',
      subtitle: attrs.subtitle,
      xKey: attrs.xKey ?? 'quarter',
      yKeys: attrs.yKeys ?? ['value'],
      data: attrs.data ?? [],
      customCurveOptions: attrs.customCurveOptions,
      width: attrs.width ?? 680,
      height: attrs.height ?? 310,
    }),
    [attrs],
  );

  const definition = useMemo(
    () => buildChartDefinition(chartConfig, { interactive: true }),
    [chartConfig],
  );

  const quickSwitchType = (nextType: ChartType) => {
    updateAttributes({ chartType: nextType });
    setDraftType(nextType);
  };

  const handleCellChange = (rowIdx: number, key: string, rawVal: string) => {
    setDraftData((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) return row;
        if (key === draftXKey) {
          return { ...row, [key]: rawVal };
        }
        const num = Number(rawVal);
        return { ...row, [key]: rawVal === '' ? 0 : Number.isFinite(num) ? num : row[key] };
      }),
    );
  };

  const addDataRow = () => {
    const newRow: ChartDatum = {
      [draftXKey]: `Period ${draftData.length + 1}`,
    };
    for (const yKey of draftYKeys) {
      const lastVal = draftData.length > 0 ? Number(draftData[draftData.length - 1][yKey] ?? 0) : 10;
      newRow[yKey] = Math.round((lastVal * 1.08 + 2) * 10) / 10;
    }
    setDraftData((prev) => [...prev, newRow]);
  };

  const removeDataRow = (rowIdx: number) => {
    if (draftData.length <= 1) return;
    setDraftData((prev) => prev.filter((_, idx) => idx !== rowIdx));
  };

  const addSeriesColumn = () => {
    const clean = newSeriesName.trim();
    if (!clean || draftYKeys.includes(clean) || clean === draftXKey) return;
    setDraftYKeys((prev) => [...prev, clean]);
    setDraftData((prev) => prev.map((row) => ({ ...row, [clean]: 0 })));
    setNewSeriesName('');
  };

  const removeSeriesColumn = (seriesKey: string) => {
    if (draftYKeys.length <= 1) return;
    setDraftYKeys((prev) => prev.filter((k) => k !== seriesKey));
  };

  const focusedDatum = focusedPoint?.datum as
    | { category?: string; series?: string; value?: number }
    | undefined;

  return (
    <NodeViewWrapper
      className={`my-6 rounded-lg border bg-white transition-colors ${
        selected ? 'border-blue-700 ring-2 ring-blue-700/15' : 'border-slate-200'
      }`}
      data-drag-handle
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-semibold text-slate-900 leading-snug">
            {chartConfig.title}
          </h4>
          {chartConfig.subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500">{chartConfig.subtitle}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="capitalize">{chartConfig.chartType} chart</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{chartConfig.data.length} points</span>
            <span aria-hidden="true">·</span>
            <span>{chartConfig.yKeys.join(', ')}</span>
            {chartConfig.customCurveOptions?.enabled ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-700">Custom SVG path overlay</span>
              </>
            ) : null}
            {selected ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-blue-800">Selected for AI chat</span>
              </>
            ) : null}
          </div>
        </div>

        {/* Chart Type Segmented Switch + Edit Actions */}
        <div
          className="chart-node-interactive flex items-center gap-2 shrink-0"
          contentEditable={false}
        >
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => quickSwitchType('line')}
              title="Line chart"
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                chartConfig.chartType === 'line'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LineChart className="h-3.5 w-3.5" />
              <span>Line</span>
            </button>
            <button
              type="button"
              onClick={() => quickSwitchType('bar')}
              title="Bar chart"
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                chartConfig.chartType === 'bar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Bar</span>
            </button>
            <button
              type="button"
              onClick={() => quickSwitchType('area')}
              title="Area chart"
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                chartConfig.chartType === 'area'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <AreaChart className="h-3.5 w-3.5" />
              <span>Area</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const pos = typeof getPos === 'function' ? getPos() : undefined;
              if (typeof pos === 'number') {
                editor.chain().focus().setNodeSelection(pos).run();
              }
              window.dispatchEvent(new CustomEvent('folio:open-ai-panel'));
            }}
            title="Chat with AI to alter data, X-axis, or Y-axis"
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selected
                ? 'border-blue-700 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Chat to Edit</span>
          </button>

          <button
            type="button"
            onClick={() => (editing ? setEditing(false) : openEditor())}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              editing
                ? 'border-blue-700 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{editing ? 'Close Editor' : 'Edit Data'}</span>
          </button>

          <button
            type="button"
            onClick={deleteNode}
            title="Remove chart"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive TanStack Chart Viewport */}
      <div className="px-4 pt-3 pb-2" contentEditable={false}>
        <div className="w-full overflow-hidden">
          <Chart
            definition={definition}
            ariaLabel={chartConfig.title || 'Report chart'}
            height={chartConfig.height ?? 310}
            onFocusChange={(pt) => setFocusedPoint(pt)}
          />
        </div>

        {/* Tabular Hover Readout + Legend Footer */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2.5 px-1 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {chartConfig.yKeys.map((series, idx) => (
              <div key={series} className="flex items-center gap-1.5 text-slate-600">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-xs shrink-0"
                  style={{
                    backgroundColor: REPORT_CHART_PALETTE[idx % REPORT_CHART_PALETTE.length],
                  }}
                />
                <span>{series}</span>
              </div>
            ))}
          </div>

          <div className="font-mono tabular-nums text-slate-600">
            {focusedDatum ? (
              <span>
                {focusedDatum.category} · {focusedDatum.series}:{' '}
                <strong className="text-slate-900">
                  {Number(focusedDatum.value ?? 0).toLocaleString()}
                </strong>
              </span>
            ) : (
              <span className="text-slate-400">Hover chart points to inspect values</span>
            )}
          </div>
        </div>
      </div>

      {/* Inline Chart Data & Custom Curve Editor Drawer */}
      {editing ? (
        <div
          className="chart-node-interactive border-t border-slate-200 bg-slate-50/80 p-5"
          contentEditable={false}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Chart Title
              </label>
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Subtitle / Caption
              </label>
              <input
                type="text"
                value={draftSubtitle}
                onChange={(e) => setDraftSubtitle(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              />
            </div>
          </div>

          {/* Custom SVG Path Mark Controls */}
          <div className="mt-4 rounded-md border border-slate-200 bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Custom SVG Path Mark Overlay (createMark)
                </div>
                <div className="text-xs text-slate-500">
                  Renders deterministic trendline, confidence envelope, and target threshold paths
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(draftCurve.enabled)}
                  onChange={(e) =>
                    setDraftCurve((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                <span>Enable Overlay</span>
              </label>
            </div>

            {draftCurve.enabled ? (
              <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftCurve.showTrendCurve !== false}
                    onChange={(e) =>
                      setDraftCurve((prev) => ({ ...prev, showTrendCurve: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>Bezier Trend Curve</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(draftCurve.showConfidenceBand)}
                    onChange={(e) =>
                      setDraftCurve((prev) => ({ ...prev, showConfidenceBand: e.target.checked }))
                    }
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  <span>Confidence Band</span>
                </label>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Curve Interpolation
                  </label>
                  <select
                    value={draftCurve.curveTension ?? 'monotoneX'}
                    onChange={(e) =>
                      setDraftCurve((prev) => ({
                        ...prev,
                        curveTension: e.target.value as CurveTension,
                      }))
                    }
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                  >
                    <option value="monotoneX">Monotone Smooth</option>
                    <option value="catmullRom">Catmull-Rom</option>
                    <option value="linear">Linear Segments</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Target Threshold Value
                  </label>
                  <input
                    type="number"
                    placeholder="Optional"
                    value={draftCurve.targetValue ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraftCurve((prev) => ({
                        ...prev,
                        targetValue: val === '' ? undefined : Number(val),
                      }));
                    }}
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Series Data Table Editor */}
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">Series Data Table</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="New series name"
                  className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={addSeriesColumn}
                  className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Series</span>
                </button>
                <button
                  type="button"
                  onClick={addDataRow}
                  className="flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Row</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">
                      {draftXKey} (X)
                    </th>
                    {draftYKeys.map((yKey) => (
                      <th key={yKey} className="px-3 py-2 text-left font-semibold text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span>{yKey}</span>
                          {draftYKeys.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeSeriesColumn(yKey)}
                              title={`Remove ${yKey}`}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </th>
                    ))}
                    <th className="w-10 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {draftData.map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={String(row[draftXKey] ?? '')}
                          onChange={(e) => handleCellChange(rowIdx, draftXKey, e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                        />
                      </td>
                      {draftYKeys.map((yKey) => (
                        <td key={yKey} className="px-2 py-1.5">
                          <input
                            type="number"
                            step="any"
                            value={String(row[yKey] ?? 0)}
                            onChange={(e) => handleCellChange(rowIdx, yKey, e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-blue-700 focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeDataRow(rowIdx)}
                          disabled={draftData.length <= 1}
                          className="text-slate-400 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyChanges}
              className="flex items-center gap-1.5 rounded-md bg-blue-800 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-900"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Apply Changes</span>
            </button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
};
