export type PageSizePreset = 'a4' | 'letter' | 'legal';
export type PageOrientation = 'portrait' | 'landscape';
export type PageMarginPreset = 'normal' | 'narrow' | 'wide';
export type RulerUnit = 'cm' | 'in';

export interface PageSetupConfig {
  size: PageSizePreset;
  orientation: PageOrientation;
  margins: PageMarginPreset;
  showPageGuides: boolean;
  showRulers?: boolean;
  rulerUnit?: RulerUnit;
}

export const DEFAULT_PAGE_SETUP: PageSetupConfig = {
  size: 'a4',
  orientation: 'portrait',
  margins: 'normal',
  showPageGuides: true,
  showRulers: true,
  rulerUnit: 'cm',
};

export interface PageSizeSpec {
  id: PageSizePreset;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
  playwrightFormat: 'A4' | 'Letter' | 'Legal';
  cssKeyword: 'A4' | 'letter' | 'legal';
}

export const PAGE_SIZE_SPECS: Record<PageSizePreset, PageSizeSpec> = {
  a4: {
    id: 'a4',
    label: 'A4 (210 × 297 mm)',
    shortLabel: 'A4',
    widthMm: 210,
    heightMm: 297,
    playwrightFormat: 'A4',
    cssKeyword: 'A4',
  },
  letter: {
    id: 'letter',
    label: 'US Letter (8.5 × 11 in)',
    shortLabel: 'Letter',
    widthMm: 215.9,
    heightMm: 279.4,
    playwrightFormat: 'Letter',
    cssKeyword: 'letter',
  },
  legal: {
    id: 'legal',
    label: 'US Legal (8.5 × 14 in)',
    shortLabel: 'Legal',
    widthMm: 215.9,
    heightMm: 355.6,
    playwrightFormat: 'Legal',
    cssKeyword: 'legal',
  },
};

export interface PageMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
  label: string;
}

export const PAGE_MARGIN_SPECS: Record<PageMarginPreset, PageMarginsMm> = {
  normal: { top: 20, right: 18, bottom: 20, left: 18, label: 'Normal' },
  narrow: { top: 12, right: 12, bottom: 12, left: 12, label: 'Narrow' },
  wide: { top: 25, right: 28, bottom: 25, left: 28, label: 'Wide' },
};

const PX_PER_MM = 96 / 25.4;

export function mmToPx(mm: number): number {
  return Math.round(mm * PX_PER_MM);
}

export function mmToTwips(mm: number): number {
  return Math.round((mm / 25.4) * 1440);
}

export function normalizePageSetup(input?: Partial<PageSetupConfig> | null): PageSetupConfig {
  const size: PageSizePreset =
    input?.size === 'letter' || input?.size === 'legal' || input?.size === 'a4'
      ? input.size
      : DEFAULT_PAGE_SETUP.size;

  const orientation: PageOrientation =
    input?.orientation === 'landscape' || input?.orientation === 'portrait'
      ? input.orientation
      : DEFAULT_PAGE_SETUP.orientation;

  const margins: PageMarginPreset =
    input?.margins === 'narrow' || input?.margins === 'wide' || input?.margins === 'normal'
      ? input.margins
      : DEFAULT_PAGE_SETUP.margins;

  const showPageGuides =
    typeof input?.showPageGuides === 'boolean'
      ? input.showPageGuides
      : DEFAULT_PAGE_SETUP.showPageGuides;

  const showRulers =
    typeof input?.showRulers === 'boolean'
      ? input.showRulers
      : DEFAULT_PAGE_SETUP.showRulers;

  const rulerUnit: RulerUnit =
    input?.rulerUnit === 'in' || input?.rulerUnit === 'cm'
      ? input.rulerUnit
      : size === 'letter' || size === 'legal'
        ? 'in'
        : DEFAULT_PAGE_SETUP.rulerUnit!;

  return { size, orientation, margins, showPageGuides, showRulers, rulerUnit };
}

export interface PageGeometry {
  setup: PageSetupConfig;
  spec: PageSizeSpec;
  widthMm: number;
  heightMm: number;
  marginsMm: PageMarginsMm;
  contentWidthMm: number;
  contentHeightMm: number;
  sheetWidthPx: number;
  sheetHeightPx: number;
  marginTopPx: number;
  marginRightPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  printableWidthPx: number;
  printableHeightPx: number;
}

export function getPageGeometry(input?: Partial<PageSetupConfig> | null): PageGeometry {
  const setup = normalizePageSetup(input);
  const spec = PAGE_SIZE_SPECS[setup.size];
  const marginsMm = PAGE_MARGIN_SPECS[setup.margins];

  const isLandscape = setup.orientation === 'landscape';
  const widthMm = isLandscape ? spec.heightMm : spec.widthMm;
  const heightMm = isLandscape ? spec.widthMm : spec.heightMm;

  const contentWidthMm = Math.max(60, widthMm - marginsMm.left - marginsMm.right);
  const contentHeightMm = Math.max(60, heightMm - marginsMm.top - marginsMm.bottom);

  const sheetWidthPx = mmToPx(widthMm);
  const sheetHeightPx = mmToPx(heightMm);
  const marginTopPx = mmToPx(marginsMm.top);
  const marginRightPx = mmToPx(marginsMm.right);
  const marginBottomPx = mmToPx(marginsMm.bottom);
  const marginLeftPx = mmToPx(marginsMm.left);

  return {
    setup,
    spec,
    widthMm,
    heightMm,
    marginsMm,
    contentWidthMm,
    contentHeightMm,
    sheetWidthPx,
    sheetHeightPx,
    marginTopPx,
    marginRightPx,
    marginBottomPx,
    marginLeftPx,
    printableWidthPx: Math.max(200, sheetWidthPx - marginLeftPx - marginRightPx),
    printableHeightPx: Math.max(200, sheetHeightPx - marginTopPx - marginBottomPx),
  };
}
