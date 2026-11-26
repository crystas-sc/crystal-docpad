import fs from 'node:fs';
import path from 'node:path';

interface FontFaceSpec {
  family: string;
  weight: string;
  style: string;
  fileName: string;
}

const FONT_SPECS: FontFaceSpec[] = [
  { family: 'Plus Jakarta Sans', weight: '400', style: 'normal', fileName: 'plus-jakarta-sans-400.woff2' },
  { family: 'Plus Jakarta Sans', weight: '600', style: 'normal', fileName: 'plus-jakarta-sans-600.woff2' },
  { family: 'Plus Jakarta Sans', weight: '700', style: 'normal', fileName: 'plus-jakarta-sans-700.woff2' },
  { family: 'Fraunces', weight: '600', style: 'normal', fileName: 'fraunces-600.woff2' },
  { family: 'JetBrains Mono', weight: '400', style: 'normal', fileName: 'jetbrains-mono-400.woff2' },
];

let cachedFontCss: string | null = null;

/**
 * Loads local .woff2 font files from apps/export-service/fonts as base64 data URIs
 * so Playwright renders deterministic typography with zero external network requests.
 */
export function getEmbeddedFontCss(): string {
  if (cachedFontCss !== null) {
    return cachedFontCss;
  }

  const fontDir = path.resolve(process.cwd(), 'apps', 'export-service', 'fonts');
  const rules: string[] = [];

  for (const spec of FONT_SPECS) {
    const filePath = path.join(fontDir, spec.fileName);
    if (fs.existsSync(filePath)) {
      const base64 = fs.readFileSync(filePath).toString('base64');
      rules.push(`
@font-face {
  font-family: '${spec.family}';
  font-style: ${spec.style};
  font-weight: ${spec.weight};
  font-display: swap;
  src: url('data:font/woff2;base64,${base64}') format('woff2');
}`.trim());
    }
  }

  cachedFontCss = rules.join('\n');
  return cachedFontCss;
}
