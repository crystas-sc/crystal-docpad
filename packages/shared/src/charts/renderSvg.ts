import { createChartScene, renderChartSvg } from '@tanstack/charts';
import type { ChartConfig } from '../types/document.ts';
import { buildChartDefinition } from './buildChartDefinition.ts';

/**
 * Deterministic headless SVG renderer shared between Node.js export workers
 * and preview utilities. Produces inline SVG attributes with zero CSS class reliance.
 */
export function renderChartToSvgString(
  config: ChartConfig,
  width = config.width ?? 680,
  height = config.height ?? 320,
  idPrefix = 'report-chart',
): string {
  const definition = buildChartDefinition(config, { interactive: false });
  const scene = createChartScene(
    definition,
    { width, height },
    {
      typography: {
        fontFamily: "'Plus Jakarta Sans', 'Liberation Sans', Arial, sans-serif",
      },
    },
  );

  return renderChartSvg(scene, {
    ariaLabel: config.title || 'Report chart',
    ariaDescription: config.subtitle,
    idPrefix,
    tabIndex: -1,
  });
}
