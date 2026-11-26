import {
  areaY,
  barY,
  colorLegend,
  d3Curve,
  defineChart,
  group,
  lineY,
  stack,
  type ChartCurve,
  type ChartMark,
  type ChartTheme,
} from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip as domTooltip } from '@tanstack/charts/tooltip';
import { curveCatmullRom, curveLinear, curveMonotoneX } from 'd3-shape';
import type { ChartConfig, ChartDatum, CurveTension } from '../types/document.ts';
import { createAnnotationOverlayMark } from './customMark.ts';

export const REPORT_CHART_PALETTE = [
  '#1e3a8a', // Deep Lapis
  '#0f766e', // Forest Teal
  '#b45309', // Warm Bronze
  '#4338ca', // Indigo Ink
  '#be123c', // Crimson Accent
  '#0369a1', // Slate Cyan
] as const;

export const REPORT_CHART_THEME: ChartTheme = {
  foreground: '#0f172a',
  muted: '#475569',
  grid: '#e2e8f0',
  background: '#ffffff',
  palette: REPORT_CHART_PALETTE,
  focusRing: {
    radius: 5,
    fill: '#ffffff',
    strokeWidth: 2,
  },
};

interface FlattenedSeriesDatum {
  category: string;
  series: string;
  value: number;
}

function resolveCurve(tension: CurveTension | undefined): ChartCurve {
  switch (tension) {
    case 'linear':
      return d3Curve(curveLinear);
    case 'catmullRom':
      return d3Curve(curveCatmullRom.alpha(0.5));
    case 'monotoneX':
    default:
      return d3Curve(curveMonotoneX);
  }
}

function normalizeChartData(config: ChartConfig): {
  categories: string[];
  yKeys: string[];
  flatData: FlattenedSeriesDatum[];
  cleanRows: ChartDatum[];
} {
  const safeRows = Array.isArray(config.data) && config.data.length > 0
    ? config.data
    : [{ [config.xKey || 'period']: 'N/A', [config.yKeys?.[0] || 'value']: 0 }];

  const xKey = config.xKey || Object.keys(safeRows[0])[0] || 'x';
  const yKeys =
    Array.isArray(config.yKeys) && config.yKeys.length > 0
      ? config.yKeys
      : Object.keys(safeRows[0]).filter((k) => k !== xKey);

  const effectiveYKeys = yKeys.length > 0 ? yKeys : ['value'];
  const flatData: FlattenedSeriesDatum[] = [];
  const categories: string[] = [];

  for (const row of safeRows) {
    const category = String(row[xKey] ?? '');
    if (!categories.includes(category)) {
      categories.push(category);
    }
    for (const series of effectiveYKeys) {
      const rawVal = row[series];
      const numeric = typeof rawVal === 'number' ? rawVal : Number(String(rawVal ?? 0).replace(/[^0-9.-]/g, ''));
      flatData.push({
        category,
        series,
        value: Number.isFinite(numeric) ? numeric : 0,
      });
    }
  }

  return { categories, yKeys: effectiveYKeys, flatData, cleanRows: safeRows };
}

function formatCompactNumber(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? '');
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

export interface BuildChartDefinitionOptions {
  interactive?: boolean;
}

export function buildChartDefinition(
  config: ChartConfig,
  options: BuildChartDefinitionOptions = {},
) {
  const { yKeys, flatData, cleanRows } = normalizeChartData(config);
  const curve = resolveCurve(config.customCurveOptions?.curveTension);
  const marks: ChartMark<any, any, any, any, any, any, any>[] = [];
  const isMultiSeries = yKeys.length > 1;

  if (config.chartType === 'bar') {
    marks.push(
      barY(flatData, {
        id: 'bars',
        x: 'category',
        y: 'value',
        color: 'series',
        layout: isMultiSeries ? group({ padding: 0.16 }) : undefined,
        inset: isMultiSeries ? 2 : 6,
        radius: [3, 3, 0, 0],
      }),
    );
  } else if (config.chartType === 'area') {
    marks.push(
      areaY(flatData, {
        id: 'areas',
        x: 'category',
        y: 'value',
        color: 'series',
        fillOpacity: 0.24,
        strokeWidth: 2,
        curve,
        layout: isMultiSeries ? stack({ order: 'input' }) : undefined,
      }),
    );
    marks.push(
      lineY(flatData, {
        id: 'area-lines',
        x: 'category',
        y: 'value',
        color: 'series',
        strokeWidth: 2,
        points: true,
        curve,
      }),
    );
  } else {
    marks.push(
      lineY(flatData, {
        id: 'lines',
        x: 'category',
        y: 'value',
        color: 'series',
        strokeWidth: 2.5,
        points: true,
        curve,
      }),
    );
  }

  if (config.customCurveOptions?.enabled) {
    marks.push(
      createAnnotationOverlayMark({
        data: cleanRows,
        xKey: config.xKey,
        primaryYKey: yKeys[0],
        options: config.customCurveOptions,
      }),
    );
  }

  const xScaleFactory = config.chartType === 'bar' ? scaleBand : scalePoint;

  return defineChart({
    marks,
    theme: REPORT_CHART_THEME,
    margin: {
      top: isMultiSeries ? 44 : 24,
      right: 24,
      bottom: 42,
      left: 56,
    },
    scales: {
      x: {
        scale: xScaleFactory,
        grid: false,
        axis: {
          line: { stroke: '#cbd5e1', strokeWidth: 1 },
          ticks: {
            size: 4,
            padding: 8,
            line: { stroke: '#cbd5e1', strokeWidth: 1 },
          },
          tickLabels: {
            fontSize: 11,
            fontWeight: 500,
            thin: { minGap: 8, priority: 'ends' },
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: {
          stroke: '#e2e8f0',
          strokeWidth: 1,
          strokeDasharray: '2 3',
        },
        axis: {
          line: false,
          ticks: {
            count: 5,
            size: 0,
            padding: 8,
            format: (v) => formatCompactNumber(v),
          },
          tickLabels: {
            fontSize: 11,
            fontWeight: 500,
          },
        },
      },
    },
    color: {
      domain: yKeys,
      range: REPORT_CHART_PALETTE.slice(0, Math.max(1, yKeys.length)),
      legend: isMultiSeries
        ? colorLegend({
            placement: 'top',
          })
        : undefined,
    },
    pointer: options.interactive ?? false,
    tooltip: options.interactive
      ? {
          use: domTooltip,
          format: (point) => {
            const datum = point.datum as FlattenedSeriesDatum;
            return `${datum.series}: ${Number(datum.value).toLocaleString()}`;
          },
        }
      : false,
  });
}
