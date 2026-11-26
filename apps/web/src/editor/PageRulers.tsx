import React, { useMemo } from 'react';
import type { PageGeometry, RulerUnit } from '@report-studio/shared';

export const RULER_GUTTER_PX = 26;
const PX_PER_MM = 96 / 25.4;
const PX_PER_IN = 96;

interface RulerTick {
  pos: number;
  kind: 'major' | 'half' | 'quarter' | 'minor';
  label?: string;
}

function buildTicks(lengthPx: number, unit: RulerUnit): RulerTick[] {
  const ticks: RulerTick[] = [];

  if (unit === 'cm') {
    const stepMm = 2;
    const totalSteps = Math.floor(lengthPx / (stepMm * PX_PER_MM));
    for (let i = 0; i <= totalSteps; i += 1) {
      const mm = i * stepMm;
      const pos = mm * PX_PER_MM;
      if (pos > lengthPx - 1) break;

      if (mm % 10 === 0) {
        ticks.push({ pos, kind: 'major', label: String(mm / 10) });
      } else if (mm % 5 === 0) {
        ticks.push({ pos, kind: 'half' });
      } else {
        ticks.push({ pos, kind: 'minor' });
      }
    }
  } else {
    // 1/8 inch steps (0.125 in)
    const totalEighths = Math.floor((lengthPx / PX_PER_IN) * 8);
    for (let i = 0; i <= totalEighths; i += 1) {
      const pos = (i / 8) * PX_PER_IN;
      if (pos > lengthPx - 1) break;

      if (i % 8 === 0) {
        ticks.push({ pos, kind: 'major', label: String(i / 8) });
      } else if (i % 4 === 0) {
        ticks.push({ pos, kind: 'half' });
      } else if (i % 2 === 0) {
        ticks.push({ pos, kind: 'quarter' });
      } else {
        ticks.push({ pos, kind: 'minor' });
      }
    }
  }

  return ticks;
}

export interface RulerCornerBoxProps {
  unit: RulerUnit;
  onToggleUnit: () => void;
}

export const RulerCornerBox: React.FC<RulerCornerBoxProps> = ({ unit, onToggleUnit }) => {
  return (
    <button
      type="button"
      onClick={onToggleUnit}
      title={`Ruler unit: ${unit === 'cm' ? 'Centimeters (click for inches)' : 'Inches (click for centimeters)'}`}
      aria-label={`Switch ruler units, currently ${unit}`}
      className="flex shrink-0 items-center justify-center border-t border-l border-b border-r border-slate-300 bg-slate-100 font-mono text-[10px] font-semibold text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors select-none rounded-tl-md"
      style={{ width: `${RULER_GUTTER_PX}px`, height: `${RULER_GUTTER_PX}px` }}
    >
      {unit}
    </button>
  );
};

export interface HorizontalPageRulerProps {
  geometry: PageGeometry;
  unit: RulerUnit;
  pointerX?: number | null;
}

export const HorizontalPageRuler: React.FC<HorizontalPageRulerProps> = ({
  geometry,
  unit,
  pointerX,
}) => {
  const { sheetWidthPx, marginLeftPx, marginRightPx } = geometry;
  const rightContentEdgePx = Math.max(marginLeftPx, sheetWidthPx - marginRightPx);

  const ticks = useMemo(() => buildTicks(sheetWidthPx, unit), [sheetWidthPx, unit]);

  return (
    <div
      aria-hidden="true"
      className="relative shrink-0 select-none overflow-hidden border-t border-r border-b border-slate-300 bg-white rounded-tr-md"
      style={{ width: `${sheetWidthPx}px`, height: `${RULER_GUTTER_PX}px` }}
    >
      <svg
        width={sheetWidthPx}
        height={RULER_GUTTER_PX}
        className="block"
        shapeRendering="crispEdges"
      >
        {/* Shaded Left & Right Margins */}
        <rect x={0} y={0} width={marginLeftPx} height={RULER_GUTTER_PX} fill="#e2e8f0" fillOpacity={0.7} />
        <rect
          x={rightContentEdgePx}
          y={0}
          width={Math.max(0, sheetWidthPx - rightContentEdgePx)}
          height={RULER_GUTTER_PX}
          fill="#e2e8f0"
          fillOpacity={0.7}
        />

        {/* Calibrated Scale Ticks */}
        {ticks.map((tick, idx) => {
          const y1 =
            tick.kind === 'major'
              ? 13
              : tick.kind === 'half'
                ? 17
                : tick.kind === 'quarter'
                  ? 19
                  : 22;
          const stroke = tick.kind === 'major' ? '#64748b' : tick.kind === 'half' ? '#94a3b8' : '#cbd5e1';

          return (
            <g key={`${tick.pos}-${idx}`}>
              <line x1={tick.pos} y1={y1} x2={tick.pos} y2={RULER_GUTTER_PX} stroke={stroke} strokeWidth={1} />
              {tick.label !== undefined ? (
                <text
                  x={tick.pos === 0 ? 4 : tick.pos + 3}
                  y={10.5}
                  fill="#475569"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                >
                  {tick.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Left & Right Margin Stop Markers */}
        <line
          x1={marginLeftPx}
          y1={0}
          x2={marginLeftPx}
          y2={RULER_GUTTER_PX}
          stroke="#1e40af"
          strokeOpacity={0.65}
          strokeWidth={1}
        />
        <polygon
          points={`${marginLeftPx - 3.5},20 ${marginLeftPx + 3.5},20 ${marginLeftPx},25`}
          fill="#1e40af"
        />

        <line
          x1={rightContentEdgePx}
          y1={0}
          x2={rightContentEdgePx}
          y2={RULER_GUTTER_PX}
          stroke="#1e40af"
          strokeOpacity={0.65}
          strokeWidth={1}
        />
        <polygon
          points={`${rightContentEdgePx - 3.5},20 ${rightContentEdgePx + 3.5},20 ${rightContentEdgePx},25`}
          fill="#1e40af"
        />

        {/* Live Pointer Tracking Hairline */}
        {typeof pointerX === 'number' && pointerX >= 0 && pointerX <= sheetWidthPx ? (
          <line
            x1={pointerX}
            y1={0}
            x2={pointerX}
            y2={RULER_GUTTER_PX}
            stroke="#1d4ed8"
            strokeWidth={1.25}
          />
        ) : null}
      </svg>
    </div>
  );
};

export interface VerticalPageRulerProps {
  geometry: PageGeometry;
  unit: RulerUnit;
  pageCount: number;
  pageGapPx?: number;
  pointerY?: number | null;
}

export const VerticalPageRuler: React.FC<VerticalPageRulerProps> = ({
  geometry,
  unit,
  pageCount,
  pageGapPx = 28,
  pointerY,
}) => {
  const { sheetHeightPx, marginTopPx, marginBottomPx } = geometry;
  const bottomContentEdgePx = Math.max(marginTopPx, sheetHeightPx - marginBottomPx);
  const safePageCount = Math.max(1, pageCount);
  const stride = sheetHeightPx + pageGapPx;

  const ticks = useMemo(() => buildTicks(sheetHeightPx, unit), [sheetHeightPx, unit]);

  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 flex-col select-none"
      style={{ width: `${RULER_GUTTER_PX}px` }}
    >
      {Array.from({ length: safePageCount }).map((_, pageIndex) => {
        const pageTop = pageIndex * stride;
        const localPointerY =
          typeof pointerY === 'number' && pointerY >= pageTop && pointerY <= pageTop + sheetHeightPx
            ? pointerY - pageTop
            : null;

        return (
          <div
            key={`vruler-${pageIndex}`}
            className="relative shrink-0 overflow-hidden border border-slate-300 bg-white rounded-l-md"
            style={{
              width: `${RULER_GUTTER_PX}px`,
              height: `${sheetHeightPx}px`,
              marginTop: pageIndex > 0 ? `${pageGapPx}px` : undefined,
            }}
          >
            <svg
              width={RULER_GUTTER_PX}
              height={sheetHeightPx}
              className="block"
              shapeRendering="crispEdges"
            >
              {/* Shaded Top & Bottom Margins */}
              <rect
                x={0}
                y={0}
                width={RULER_GUTTER_PX}
                height={marginTopPx}
                fill="#e2e8f0"
                fillOpacity={0.7}
              />
              <rect
                x={0}
                y={bottomContentEdgePx}
                width={RULER_GUTTER_PX}
                height={Math.max(0, sheetHeightPx - bottomContentEdgePx)}
                fill="#e2e8f0"
                fillOpacity={0.7}
              />

              {/* Calibrated Scale Ticks */}
              {ticks.map((tick, idx) => {
                const x1 =
                  tick.kind === 'major'
                    ? 14
                    : tick.kind === 'half'
                      ? 18
                      : tick.kind === 'quarter'
                        ? 20
                        : 22;
                const stroke =
                  tick.kind === 'major'
                    ? '#64748b'
                    : tick.kind === 'half'
                      ? '#94a3b8'
                      : '#cbd5e1';

                return (
                  <g key={`${tick.pos}-${idx}`}>
                    <line
                      x1={x1}
                      y1={tick.pos}
                      x2={RULER_GUTTER_PX}
                      y2={tick.pos}
                      stroke={stroke}
                      strokeWidth={1}
                    />
                    {tick.label !== undefined ? (
                      <text
                        x={11}
                        y={tick.pos === 0 ? 9 : tick.pos + 9}
                        textAnchor="end"
                        fill="#475569"
                        fontSize={8.5}
                        fontFamily="var(--font-mono)"
                      >
                        {tick.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {/* Top & Bottom Margin Stop Markers */}
              <line
                x1={0}
                y1={marginTopPx}
                x2={RULER_GUTTER_PX}
                y2={marginTopPx}
                stroke="#1e40af"
                strokeOpacity={0.65}
                strokeWidth={1}
              />
              <polygon
                points={`20,${marginTopPx - 3.5} 20,${marginTopPx + 3.5} 25,${marginTopPx}`}
                fill="#1e40af"
              />

              <line
                x1={0}
                y1={bottomContentEdgePx}
                x2={RULER_GUTTER_PX}
                y2={bottomContentEdgePx}
                stroke="#1e40af"
                strokeOpacity={0.65}
                strokeWidth={1}
              />
              <polygon
                points={`20,${bottomContentEdgePx - 3.5} 20,${bottomContentEdgePx + 3.5} 25,${bottomContentEdgePx}`}
                fill="#1e40af"
              />

              {/* Live Pointer Tracking Hairline */}
              {localPointerY !== null ? (
                <line
                  x1={0}
                  y1={localPointerY}
                  x2={RULER_GUTTER_PX}
                  y2={localPointerY}
                  stroke="#1d4ed8"
                  strokeWidth={1.25}
                />
              ) : null}
            </svg>
          </div>
        );
      })}
    </div>
  );
};
