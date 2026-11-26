import { createMark, type SceneNode } from '@tanstack/charts';
import type { ChartDatum, CustomCurveOptions } from '../types/document.ts';

export interface AnnotationOverlayInput {
  data: readonly ChartDatum[];
  xKey: string;
  primaryYKey: string;
  options: CustomCurveOptions;
}

function buildSmoothSvgPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M${x.toFixed(2)},${y.toFixed(2)}`;
  }
  if (points.length === 2) {
    const [x0, y0] = points[0];
    const [x1, y1] = points[1];
    return `M${x0.toFixed(2)},${y0.toFixed(2)} L${x1.toFixed(2)},${y1.toFixed(2)}`;
  }

  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function buildConfidenceBandPath(
  upper: readonly (readonly [number, number])[],
  lower: readonly (readonly [number, number])[],
): string {
  if (upper.length < 2 || lower.length < 2) return '';
  const topCmd = upper
    .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const bottomCmd = [...lower]
    .reverse()
    .map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  return `${topCmd} ${bottomCmd} Z`;
}

function computeLinearRegression(ys: number[]): { slope: number; intercept: number; stdErr: number } {
  const n = ys.length;
  if (n < 2) {
    return { slope: 0, intercept: ys[0] ?? 0, stdErr: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += ys[i];
    sumXY += i * ys[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  let residualSq = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    residualSq += (ys[i] - pred) ** 2;
  }
  const stdErr = n > 2 ? Math.sqrt(residualSq / (n - 2)) : Math.abs(slope) * 0.5;
  return { slope, intercept, stdErr };
}

/**
 * Custom @tanstack/charts mark built with `createMark` that emits deterministic
 * `polyline`, `area`, `dot`, and `label` scene nodes with explicit SVG path strings.
 */
export function createAnnotationOverlayMark(input: AnnotationOverlayInput) {
  const { data, xKey, primaryYKey, options } = input;

  return createMark<ChartDatum, string | number, number>(({ markIndex }) => {
    const id = `custom-annotation-${markIndex}`;
    const xValues: Array<string | number> = [];
    const yValues: number[] = [];

    for (const row of data) {
      const xVal = row[xKey];
      const yVal = Number(row[primaryYKey]);
      if (xVal !== undefined && Number.isFinite(yVal)) {
        xValues.push(xVal);
        yValues.push(yVal);
      }
    }

    if (typeof options.targetValue === 'number' && Number.isFinite(options.targetValue)) {
      yValues.push(options.targetValue);
    }

    return {
      id,
      channels: {
        x: { scale: 'x', values: xValues },
        y: { scale: 'y', values: yValues },
      },
      render: ({ scales, chart }) => {
        const xScale = scales.x;
        const yScale = scales.y;
        if (!xScale || !yScale) {
          return { nodes: [] };
        }

        const nodes: SceneNode[] = [];
        const accent = options.accentColor || '#b45309';
        const dash = options.connectorStyle === 'solid' ? undefined : '5 4';

        const mappedPoints: Array<[number, number]> = [];
        const rawYs: number[] = [];

        for (const row of data) {
          const xVal = row[xKey];
          const yVal = Number(row[primaryYKey]);
          if (xVal === undefined || !Number.isFinite(yVal)) continue;
          const px = xScale.map(xVal) + (xScale.bandwidth ? xScale.bandwidth * 0.5 : 0);
          const py = yScale.map(yVal);
          if (Number.isFinite(px) && Number.isFinite(py)) {
            mappedPoints.push([px, py]);
            rawYs.push(yVal);
          }
        }

        // 1. Confidence envelope emitted as a custom SVG `area` path node
        if (options.showConfidenceBand && mappedPoints.length >= 2) {
          const { slope, intercept, stdErr } = computeLinearRegression(rawYs);
          const upper: Array<[number, number]> = [];
          const lower: Array<[number, number]> = [];
          const spread = Math.max(stdErr * 0.85, (Math.max(...rawYs) - Math.min(...rawYs)) * 0.08);

          for (let i = 0; i < mappedPoints.length; i++) {
            const pred = slope * i + intercept;
            const px = mappedPoints[i][0];
            const pyUpper = yScale.map(pred + spread);
            const pyLower = yScale.map(Math.max(0, pred - spread));
            upper.push([px, pyUpper]);
            lower.push([px, pyLower]);
          }

          const bandPath = buildConfidenceBandPath(upper, lower);
          if (bandPath) {
            nodes.push({
              kind: 'area',
              key: `${id}:confidence-band`,
              points: [...upper, ...lower.slice().reverse()],
              path: bandPath,
              ariaHidden: true,
              style: {
                fill: accent,
                fillOpacity: 0.1,
                stroke: 'none',
              },
            });
          }
        }

        // 2. Smooth Bezier trendline connector emitted as a custom SVG `polyline` path node
        if (options.showTrendCurve !== false && mappedPoints.length >= 2) {
          const { slope, intercept } = computeLinearRegression(rawYs);
          const trendPoints: Array<[number, number]> = mappedPoints.map(([px], idx) => [
            px,
            yScale.map(slope * idx + intercept),
          ]);
          const pathD = buildSmoothSvgPath(trendPoints);
          if (pathD) {
            nodes.push({
              kind: 'polyline',
              key: `${id}:trend-curve`,
              points: trendPoints,
              path: pathD,
              ariaHidden: true,
              style: {
                fill: 'none',
                stroke: accent,
                strokeWidth: 2,
                strokeOpacity: 0.85,
                strokeDasharray: dash,
                lineCap: 'round',
                lineJoin: 'round',
              },
            });

            const lastPt = trendPoints[trendPoints.length - 1];
            nodes.push({
              kind: 'dot',
              key: `${id}:trend-endpoint`,
              x: lastPt[0],
              y: lastPt[1],
              radius: 3.5,
              ariaHidden: true,
              style: {
                fill: accent,
                stroke: '#ffffff',
                strokeWidth: 1.5,
              },
            });
          }
        }

        // 3. Target benchmark path emitted as a custom SVG `polyline` + inline label
        if (typeof options.targetValue === 'number' && Number.isFinite(options.targetValue)) {
          const targetY = yScale.map(options.targetValue);
          if (Number.isFinite(targetY) && targetY >= chart.y && targetY <= chart.y + chart.height) {
            const xStart = chart.x;
            const xEnd = chart.x + chart.width;
            const targetPath = `M${xStart.toFixed(2)},${targetY.toFixed(2)} L${xEnd.toFixed(2)},${targetY.toFixed(2)}`;
            nodes.push({
              kind: 'polyline',
              key: `${id}:target-line`,
              points: [
                [xStart, targetY],
                [xEnd, targetY],
              ],
              path: targetPath,
              ariaHidden: true,
              style: {
                fill: 'none',
                stroke: '#be123c',
                strokeWidth: 1.5,
                strokeDasharray: '4 3',
                strokeOpacity: 0.9,
              },
            });

            const labelText = options.targetLabel
              ? `${options.targetLabel} (${options.targetValue})`
              : `Target: ${options.targetValue}`;
            nodes.push({
              kind: 'label',
              key: `${id}:target-label`,
              x: xEnd - 4,
              y: Math.max(chart.y + 12, targetY - 6),
              text: labelText,
              anchor: 'end',
              baseline: 'auto',
              fontSize: 10,
              fontWeight: 600,
              ariaHidden: true,
              style: {
                fill: '#be123c',
              },
            });
          }
        }

        return { nodes };
      },
    };
  });
}
