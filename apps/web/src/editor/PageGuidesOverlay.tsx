import React from 'react';
import type { PageGeometry } from '@report-studio/shared';
import { PAGE_GAP_PX } from './PagePaginationExtension.ts';

export interface PageSheetStackBackgroundProps {
  geometry: PageGeometry;
  pageCount: number;
  pageGapPx?: number;
  showRulers?: boolean;
}

/**
 * Renders MS Word-style physical paper sheets stacked vertically with inter-page desk gaps,
 * optional margin guide frames, and quiet page numbers in each bottom margin.
 */
export const PageSheetStackBackground: React.FC<PageSheetStackBackgroundProps> = ({
  geometry,
  pageCount,
  pageGapPx = PAGE_GAP_PX,
  showRulers = true,
}) => {
  const safeCount = Math.max(1, pageCount);
  const {
    sheetWidthPx,
    sheetHeightPx,
    marginTopPx,
    marginRightPx,
    marginBottomPx,
    marginLeftPx,
    setup,
    spec,
  } = geometry;
  const stride = sheetHeightPx + pageGapPx;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {Array.from({ length: safeCount }).map((_, idx) => {
        const isFirst = idx === 0;
        const cornerClass = isFirst && showRulers ? 'rounded-br-md' : 'rounded-md';

        return (
          <div
            key={`page-sheet-${idx}`}
            className={`absolute left-0 right-0 border border-slate-200 bg-white shadow-xs ${cornerClass}`}
            style={{
              top: `${idx * stride}px`,
              width: `${sheetWidthPx}px`,
              height: `${sheetHeightPx}px`,
            }}
          >
            {/* Dashed Margin Boundary Frame when Page Guides are enabled */}
            {setup.showPageGuides ? (
              <div
                className="pointer-events-none absolute border border-dashed border-slate-200/90"
                style={{
                  top: `${marginTopPx}px`,
                  right: `${marginRightPx}px`,
                  bottom: `${marginBottomPx}px`,
                  left: `${marginLeftPx}px`,
                }}
              />
            ) : null}

            {/* Page Number Footer inside Bottom Margin */}
            <div
              className="absolute inset-x-0 flex items-center justify-center font-mono text-[10px] tabular-nums text-slate-400"
              style={{
                bottom: `${Math.max(10, Math.round(marginBottomPx / 2 - 7))}px`,
              }}
            >
              <span>
                Page {idx + 1} of {safeCount} · {spec.shortLabel}{' '}
                {setup.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export interface ResponsivePageBreaksOverlayProps {
  geometry: PageGeometry;
  breaks: Array<{ y: number; endedPage: number }>;
}

/**
 * Lightweight responsive page-break overlay used on tablet/mobile viewports (< 1024px)
 * where rulers and fixed multi-sheet paper stacks collapse to a fluid column.
 */
export const ResponsivePageBreaksOverlay: React.FC<ResponsivePageBreaksOverlayProps> = ({
  geometry,
  breaks,
}) => {
  if (!geometry.setup.showPageGuides || breaks.length === 0) {
    return null;
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {breaks.map((guide) => (
        <div
          key={`resp-break-${guide.endedPage}-${guide.y}`}
          className="absolute left-0 right-0 flex items-center"
          style={{ top: `${guide.y}px` }}
        >
          <div className="h-px flex-1 border-t border-dashed border-slate-300" />
          <span className="bg-white px-2.5 font-mono text-[10px] tabular-nums text-slate-400">
            Page {guide.endedPage} · {geometry.spec.shortLabel}{' '}
            {geometry.setup.orientation === 'landscape' ? 'Landscape' : 'Portrait'} · Page{' '}
            {guide.endedPage + 1}
          </span>
          <div className="h-px w-8 border-t border-dashed border-slate-300" />
        </div>
      ))}
    </div>
  );
};
