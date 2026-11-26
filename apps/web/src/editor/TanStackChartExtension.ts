import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { ChartConfig, ChartDatum, ChartType, CustomCurveOptions } from '@report-studio/shared';
import { TanStackChartNodeView } from './TanStackChartNodeView.tsx';

export interface TanStackChartAttributes {
  id: string;
  chartType: ChartType;
  title: string;
  subtitle: string;
  xKey: string;
  yKeys: string[];
  data: ChartDatum[];
  customCurveOptions: CustomCurveOptions;
  width: number;
  height: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tanstackChart: {
      insertTanStackChart: (config?: Partial<ChartConfig>) => ReturnType;
    };
  }
}

const DEFAULT_DATA: ChartDatum[] = [
  { quarter: 'Q1 25', revenue: 42.5, cost: 26.1 },
  { quarter: 'Q2 25', revenue: 48.2, cost: 28.4 },
  { quarter: 'Q3 25', revenue: 54.8, cost: 30.2 },
  { quarter: 'Q4 25', revenue: 63.4, cost: 32.8 },
  { quarter: 'Q1 26', revenue: 71.9, cost: 34.5 },
];

export const TanStackChartExtension = Node.create({
  name: 'tanstackChart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: () => `chart-${Math.random().toString(36).slice(2, 9)}`,
      },
      chartType: {
        default: 'line' as ChartType,
      },
      title: {
        default: 'Revenue vs. Operating Cost ($M)',
      },
      subtitle: {
        default: 'Quarterly performance with linear regression trend overlay',
      },
      xKey: {
        default: 'quarter',
      },
      yKeys: {
        default: ['revenue', 'cost'],
      },
      data: {
        default: DEFAULT_DATA,
      },
      customCurveOptions: {
        default: {
          enabled: true,
          showTrendCurve: true,
          showConfidenceBand: false,
          curveTension: 'monotoneX',
          connectorStyle: 'dashed',
          targetValue: 65,
          targetLabel: 'Target',
        } satisfies CustomCurveOptions,
      },
      width: {
        default: 680,
      },
      height: {
        default: 310,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-tanstack-chart]',
        getAttrs: (element) => {
          if (typeof element === 'string') return false;
          const raw = element.getAttribute('data-chart-config');
          if (!raw) return {};
          try {
            return JSON.parse(raw) as Partial<TanStackChartAttributes>;
          } catch {
            return {};
          }
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-tanstack-chart': 'true',
        'data-chart-config': JSON.stringify(HTMLAttributes),
      }),
    ];
  },

  addCommands() {
    return {
      insertTanStackChart:
        (config = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              id: config.id ?? `chart-${Date.now()}`,
              chartType: config.chartType ?? 'line',
              title: config.title ?? 'New Analytical Chart',
              subtitle: config.subtitle ?? '',
              xKey: config.xKey ?? 'quarter',
              yKeys: config.yKeys ?? ['revenue', 'cost'],
              data: config.data ?? DEFAULT_DATA,
              customCurveOptions: config.customCurveOptions ?? {
                enabled: true,
                showTrendCurve: true,
                showConfidenceBand: false,
                curveTension: 'monotoneX',
                connectorStyle: 'dashed',
              },
              width: config.width ?? 680,
              height: config.height ?? 310,
            },
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(TanStackChartNodeView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        return Boolean(
          target.closest('.chart-node-interactive') ||
            ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'LABEL'].includes(target.tagName),
        );
      },
    });
  },
});
