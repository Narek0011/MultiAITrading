import { Resvg } from '@resvg/resvg-js';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpeg: { encode(img: { data: Buffer; width: number; height: number }, quality: number): { data: Buffer } } = require('jpeg-js');

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

export const svgOpen = (w = W, h = H) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">`;

export const background = (w = W, h = H) => `<rect width="${w}" height="${h}" fill="url(#bg)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>`;

/** "Multi AI TRADING" wordmark + logo in the top-right corner; `scale` enlarges it for big vertical images. */
export function wordmark(w = W, scale = 1, top = 0) {
  const r = (n: number) => w - n * scale;
  const y = (n: number) => top + n * scale;
  const out = [
    `<text x="${r(28)}" y="${y(48)}" text-anchor="end" font-family="Montserrat, ${FONT}" font-size="${24 * scale}" font-weight="800" fill="#FFFFFF">Multi<tspan fill="url(#brandAI)">AI</tspan></text>`,
    `<text x="${r(30)}" y="${y(67)}" text-anchor="end" font-family="Montserrat, ${FONT}" font-size="${10.5 * scale}" font-weight="600" fill="#FFFFFF" fill-opacity="0.82" letter-spacing="${5.2 * scale}">TRADING</text>`,
  ];
  if (LOGO_MARK) out.push(`<image href="${LOGO_MARK}" x="${r(196)}" y="${y(25)}" width="${62 * scale}" height="${43 * scale}" preserveAspectRatio="xMidYMid meet"/>`);
  return out.join('\n');
}

/** The logo mark as a data URI (null if the file is missing). */
export const logoMark = () => LOGO_MARK;

const render = (svg: string, width: number) =>
  new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: FONT_FILES, loadSystemFonts: FONT_FILES.length === 0, defaultFontFamily: 'Inter' },
  }).render();

export function svgToPng(svg: string, width = W * 1.5): Buffer {
  return render(svg, width).asPng();
}

/** JPEG output for platforms that don't take PNG (TikTok photo posts accept JPEG/WebP only). */
export function svgToJpeg(svg: string, width: number, quality = 90): Buffer {
  const img = render(svg, width);
  return jpeg.encode({ data: Buffer.from(img.pixels), width: img.width, height: img.height }, quality).data;
}

/** Rough Inter text width; good enough to wrap and cut text so it never runs off an image. */
export const textWidth = (s: string, size: number) => s.length * size * 0.56;
export const cutText = (s: string, size: number, maxW: number) => {
  if (textWidth(s, size) <= maxW) return s;
  const n = Math.max(1, Math.floor(maxW / (size * 0.56)) - 1);
  return s.slice(0, n).trimEnd() + '…';
};

/** Splits text into at most `maxLines` lines that fit `maxW`; the last line gets "…" if text is left over. */
export function wrapText(text: string, size: number, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (textWidth(next, size) <= maxW || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) {
      lines[maxLines - 1] = cutText(`${lines[maxLines - 1]} ${words.slice(i).join(' ')}`, size, maxW);
      return lines;
    }
  }
  if (line) lines.push(cutText(line, size, maxW));
  return lines;
}
