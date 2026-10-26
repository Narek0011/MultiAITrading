import { Resvg } from '@resvg/resvg-js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/** Shared look of every MultiAI image (signal charts, news charts and news cards). */
export const W = 1280;
export const H = 720;
export const FONT = 'Inter, sans-serif';

/**
 * Fonts shipped with the app so charts look identical on any server
 * (minimal Linux/Docker images have no system fonts and would render no text).
 */
const FONTS_DIR = join(process.cwd(), 'assets', 'fonts');
const FONT_FILES = (() => {
  try {
    return readdirSync(FONTS_DIR).filter((f) => f.endsWith('.ttf')).map((f) => join(FONTS_DIR, f));
  } catch {
    return [];
  }
})();

export const C = {
  bg1: '#070B16',
  bg2: '#0E1630',
  grid: 'rgba(148,163,209,0.08)',
  axis: '#7C88A8',
  text: '#E8ECF7',
  up: '#22D39B',
  down: '#FF4D6A',
  entry: '#5B8CFF',
  emaFast: '#F5B83D',
  emaSlow: '#A57BFF',
};

/** Logo mark embedded in the header (optional — images still render without it). */
const LOGO_MARK = (() => {
  try {
    return `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'img', 'logo-mark-256.png')).toString('base64')}`;
  } catch {
    return null;
  }
})();

export const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** Gradients used by every image: background, corner glow, the "AI" of the wordmark and the RSI fill. */
export const BRAND_DEFS = `<defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg2}"/><stop offset="1" stop-color="${C.bg1}"/></linearGradient>
      <radialGradient id="glow" cx="0.85" cy="0.1" r="0.7"><stop offset="0" stop-color="#3B5BFF" stop-opacity="0.22"/><stop offset="1" stop-color="#3B5BFF" stop-opacity="0"/></radialGradient>
      <linearGradient id="brandAI" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2BC4FF"/><stop offset="1" stop-color="#1F6BFF"/></linearGradient>
      <linearGradient id="rsiFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A57BFF" stop-opacity="0.35"/><stop offset="1" stop-color="#A57BFF" stop-opacity="0"/></linearGradient>
    </defs>`;

export const svgOpen = () => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`;

export const background = () => `<rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>`;

/** "Multi AI TRADING" wordmark + logo in the top-right corner. */
export function wordmark() {
  const out = [
    `<text x="${W - 28}" y="48" text-anchor="end" font-family="Montserrat, ${FONT}" font-size="24" font-weight="800" fill="#FFFFFF">Multi<tspan fill="url(#brandAI)">AI</tspan></text>`,
    `<text x="${W - 30}" y="67" text-anchor="end" font-family="Montserrat, ${FONT}" font-size="10.5" font-weight="600" fill="#FFFFFF" fill-opacity="0.82" letter-spacing="5.2">TRADING</text>`,
  ];
  if (LOGO_MARK) out.push(`<image href="${LOGO_MARK}" x="${W - 196}" y="25" width="62" height="43" preserveAspectRatio="xMidYMid meet"/>`);
  return out.join('\n');
}

export function svgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W * 1.5 },
    font: { fontFiles: FONT_FILES, loadSystemFonts: FONT_FILES.length === 0, defaultFontFamily: 'Inter' },
  });
  return resvg.render().asPng();
}
