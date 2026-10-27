import { Injectable } from '@nestjs/common';
import { background, BRAND_DEFS, C, esc, logoMark, svgOpen, svgToJpeg, textWidth, wordmark, wrapText } from './brand';

/** One slide of a vertical social post (TikTok photo carousel). */
export interface SocialSlide {
  kind: 'cover' | 'points' | 'stat' | 'chart' | 'cta';
  /** Small label above the headline on the cover, e.g. "FOREX · AI". */
  kicker: string;
  headline: string;
  text: string;
  bullets: string[];
  /** Big number on a stat slide, e.g. "84%". */
  stat: string;
  /** Pair for a chart slide, e.g. "EUR/USD". */
  pair: string;
}

export const SW = 1080;
export const SH = 1920;
const PAD = 90;
/** TikTok covers the bottom and right edge with its buttons and caption, so content stays above this line. */
const SAFE_BOTTOM = 1450;
const MAX_W = SW - PAD * 2 - 60;

/** Branded 1080×1920 slides in the MultiAI look, as JPEG (what TikTok photo posts accept). */
@Injectable()
export class SocialCardRendererService {
  renderJpeg(slide: SocialSlide, index: number, total: number, opts: { chartPng?: Buffer | null; site?: string } = {}) {
    return svgToJpeg(this.renderSvg(slide, index, total, opts), SW);
  }

  renderSvg(slide: SocialSlide, index: number, total: number, opts: { chartPng?: Buffer | null; site?: string } = {}) {
    const out = [svgOpen(SW, SH), BRAND_DEFS, background(SW, SH), this.decor(), wordmark(SW, 1.7, 40)];
    if (total > 1) out.push(this.pager(index, total));
    switch (slide.kind) {
      case 'points':
        out.push(this.points(slide));
        break;
      case 'stat':
        out.push(this.stat(slide));
        break;
      case 'chart':
        out.push(this.chart(slide, opts.chartPng ?? null));
        break;
      case 'cta':
        out.push(this.cta(slide, opts.site ?? ''));
        break;
      default:
        out.push(this.cover(slide));
    }
    out.push('</svg>');
    return out.join('\n');
  }

  private cover(s: SocialSlide) {
    const out: string[] = [];
    let y = 560;
    if (s.kicker) {
      const k = s.kicker.toUpperCase();
      const w = k.length * (30 * 0.7 + 2) + 64;
      out.push(`<rect x="${PAD}" y="${y - 52}" width="${w}" height="68" rx="34" fill="#3B5BFF" fill-opacity="0.2" stroke="#5B8CFF" stroke-opacity="0.7" stroke-width="2"/>`);
      out.push(`<text x="${PAD + 32}" y="${y - 7}" font-size="30" font-weight="800" fill="#9DB6FF" letter-spacing="2">${esc(k)}</text>`);
      y += 150;
    }
    const size = s.headline.length <= 40 ? 112 : s.headline.length <= 80 ? 96 : 80;
    const lines = wrapText(s.headline, size, MAX_W, 6);
    out.push(`<rect x="${PAD - 34}" y="${y - size * 0.82}" width="10" height="${lines.length * size * 1.12}" rx="5" fill="url(#brandAI)"/>`);
    lines.forEach((l, i) => out.push(`<text x="${PAD}" y="${y + i * size * 1.12}" font-size="${size}" font-weight="800" fill="${C.text}" letter-spacing="-1">${esc(l)}</text>`));
    y += lines.length * size * 1.12 + 40;
    out.push(this.paragraph(s.text, PAD, y, 46, C.axis, 5));
    return out.join('\n');
  }

  private points(s: SocialSlide) {
    const out: string[] = [];
    let y = 400;
    const lines = wrapText(s.headline, 84, MAX_W, 3);
    lines.forEach((l, i) => out.push(`<text x="${PAD}" y="${y + i * 96}" font-size="84" font-weight="800" fill="${C.text}" letter-spacing="-1">${esc(l)}</text>`));
    y += lines.length * 96 + 70;
    s.bullets.slice(0, 5).forEach((b, i) => {
      const rows = wrapText(b, 46, MAX_W - 120, 3);
      const h = Math.max(110, rows.length * 58 + 46);
      if (y + h > SAFE_BOTTOM + 60) return;
      out.push(`<rect x="${PAD - 20}" y="${y}" width="${SW - PAD * 2 + 40}" height="${h}" rx="28" fill="rgba(255,255,255,0.045)" stroke="rgba(255,255,255,0.08)"/>`);
      out.push(`<circle cx="${PAD + 40}" cy="${y + h / 2}" r="32" fill="url(#brandAI)"/>`);
      out.push(`<text x="${PAD + 40}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="34" font-weight="800" fill="#FFFFFF">${i + 1}</text>`);
      const top = y + h / 2 - ((rows.length - 1) * 58) / 2 + 16;
      rows.forEach((r, j) => out.push(`<text x="${PAD + 100}" y="${top + j * 58}" font-size="46" font-weight="600" fill="${C.text}">${esc(r)}</text>`));
      y += h + 24;
    });
    return out.join('\n');
  }

  private stat(s: SocialSlide) {
    const out: string[] = [];
    const value = s.stat || '—';
    const size = Math.min(300, (MAX_W / Math.max(1, value.length)) / 0.62);
    out.push(`<text x="${SW / 2}" y="760" text-anchor="middle" font-size="${size}" font-weight="800" fill="url(#brandAI)" letter-spacing="-4">${esc(value)}</text>`);
    const lines = wrapText(s.headline, 70, MAX_W, 3);
    lines.forEach((l, i) => out.push(`<text x="${SW / 2}" y="${900 + i * 84}" text-anchor="middle" font-size="70" font-weight="800" fill="${C.text}">${esc(l)}</text>`));
    out.push(this.paragraph(s.text, SW / 2, 900 + lines.length * 84 + 60, 44, C.axis, 5, 'middle'));
    return out.join('\n');
  }

  private chart(s: SocialSlide, png: Buffer | null) {
    const out: string[] = [];
    const lines = wrapText(s.headline, 80, MAX_W, 3);
    lines.forEach((l, i) => out.push(`<text x="${PAD}" y="${380 + i * 92}" font-size="80" font-weight="800" fill="${C.text}" letter-spacing="-1">${esc(l)}</text>`));
    const top = 380 + lines.length * 92 + 20;
    const w = SW - PAD * 2 + 40;
    const h = Math.round((w * 720) / 1280);
    out.push(`<rect x="${PAD - 24}" y="${top - 4}" width="${w + 8}" height="${h + 8}" rx="30" fill="none" stroke="#5B8CFF" stroke-opacity="0.5" stroke-width="3"/>`);
    if (png) out.push(`<image href="data:image/png;base64,${png.toString('base64')}" x="${PAD - 20}" y="${top}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`);
    else out.push(`<text x="${SW / 2}" y="${top + h / 2}" text-anchor="middle" font-size="64" font-weight="800" fill="${C.axis}">${esc(s.pair)}</text>`);
    out.push(this.paragraph(s.text, PAD, top + h + 90, 46, C.text, 4));
    return out.join('\n');
  }

  private cta(s: SocialSlide, site: string) {
    const out: string[] = [];
    const logo = logoMark();
    if (logo) out.push(`<image href="${logo}" x="${SW / 2 - 170}" y="330" width="340" height="236" preserveAspectRatio="xMidYMid meet"/>`);
    const lines = wrapText(s.headline, 92, MAX_W, 4);
    lines.forEach((l, i) => out.push(`<text x="${SW / 2}" y="${700 + i * 104}" text-anchor="middle" font-size="92" font-weight="800" fill="${C.text}" letter-spacing="-1">${esc(l)}</text>`));
    let y = 700 + lines.length * 104 + 30;
    out.push(this.paragraph(s.text, SW / 2, y, 46, C.axis, 3, 'middle'));
    y += 3 * 58 + 60;
    const label = site || 'link in bio';
    const bw = Math.min(MAX_W, textWidth(label, 48) + 140);
    out.push(`<rect x="${SW / 2 - bw / 2}" y="${y}" width="${bw}" height="112" rx="56" fill="url(#brandAI)"/>`);
    out.push(`<text x="${SW / 2}" y="${y + 72}" text-anchor="middle" font-size="48" font-weight="800" fill="#FFFFFF">${esc(label)}</text>`);
    return out.join('\n');
  }

  /** Wrapped body text; `anchor` middle centres it on x. */
  private paragraph(text: string, x: number, y: number, size: number, color: string, maxLines: number, anchor: 'start' | 'middle' = 'start') {
    if (!text) return '';
    return wrapText(text, size, MAX_W, maxLines)
      .map((l, i) => `<text x="${x}" y="${y + i * size * 1.3}" text-anchor="${anchor}" font-size="${size}" font-weight="500" fill="${color}">${esc(l)}</text>`)
      .join('\n');
  }

  private pager(index: number, total: number) {
    const label = `${index + 1}/${total}`;
    return `<rect x="${PAD - 20}" y="70" width="${label.length * 22 + 50}" height="64" rx="32" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)"/>` +
      `<text x="${PAD + 5}" y="114" font-size="34" font-weight="800" fill="${C.text}">${label}</text>`;
  }

  /** Soft glow and a faint grid so plain slides still look like a trading app. */
  private decor() {
    const out = [`<circle cx="${SW * 0.15}" cy="${SH * 0.82}" r="520" fill="#22D39B" fill-opacity="0.05"/>`];
    for (let x = 0; x <= SW; x += 120) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${SH}" stroke="${C.grid}"/>`);
    for (let y = 0; y <= SH; y += 120) out.push(`<line x1="0" y1="${y}" x2="${SW}" y2="${y}" stroke="${C.grid}"/>`);
    return out.join('\n');
  }
}
