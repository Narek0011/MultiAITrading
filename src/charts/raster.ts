import { esc, svgToJpeg } from './brand';

/** TikTok photo posts take JPEG/WebP up to 1080p. */
const MAX_W = 1080;
const MAX_H = 1920;

/** Reads the pixel size from a PNG, JPEG or WebP header (null if unknown). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0–SOF15 except DHT/JPG/DAC carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString();
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

/**
 * Any uploaded PNG/JPEG/WebP → JPEG no larger than 1080×1920 (aspect kept), so TikTok accepts it.
 * The image is drawn into an SVG and rendered, which avoids a native image library.
 */
export function toPostJpeg(buf: Buffer, mime: string): Buffer {
  const size = imageSize(buf);
  if (!size) throw new Error('Unsupported image — use JPG, PNG or WebP');
  const scale = Math.min(1, MAX_W / size.width, MAX_H / size.height);
  const w = Math.max(1, Math.round(size.width * scale));
  const h = Math.max(1, Math.round(size.height * scale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#000"/><image xlink:href="data:${esc(mime)};base64,${buf.toString('base64')}" width="${w}" height="${h}"/></svg>`;
  return svgToJpeg(svg, w, 92);
}
