import React from 'react';
import { AbsoluteFill, continueRender, delayRender, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, DISPLAY, enter, FONT } from './theme';

const FONTS: [string, string, string][] = [
  ['Inter', 'Inter-Regular.ttf', '400'],
  ['Inter', 'Inter-SemiBold.ttf', '600'],
  ['Inter', 'Inter-Bold.ttf', '700'],
  ['Inter', 'Inter-ExtraBold.ttf', '800'],
  ['Montserrat', 'Montserrat-SemiBold.ttf', '600'],
  ['Montserrat', 'Montserrat-ExtraBold.ttf', '800'],
];

// Block rendering until the brand fonts are loaded, so no frame uses a fallback font.
const fontHandle = typeof document !== 'undefined' ? delayRender('fonts') : null;
if (fontHandle !== null) {
  Promise.all(
    FONTS.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight });
      document.fonts.add(face);
      return face.load();
    }),
  ).then(() => continueRender(fontHandle));
}

/** Dark navy backdrop with slow-moving aurora glows and a faint grid. */
export const Background: React.FC = () => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 70) * 120;
  const b = Math.cos(f / 90) * 140;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', width: 1300, height: 1300, left: -420 + a, top: -380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(31,107,255,0.42), transparent 62%)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', width: 1200, height: 1200, right: -520 + b, top: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(46,229,157,0.22), transparent 60%)', filter: 'blur(30px)' }} />
      <div style={{ position: 'absolute', width: 1100, height: 1100, left: -300 - b / 2, bottom: -560, borderRadius: '50%', background: 'radial-gradient(circle, rgba(165,123,255,0.22), transparent 60%)', filter: 'blur(30px)' }} />
      <AbsoluteFill
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
          backgroundSize: '90px 90px',
          backgroundPosition: `0 ${(f * 0.6) % 90}px`,
          maskImage: 'radial-gradient(ellipse at 50% 40%, #000 30%, transparent 75%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Big two-line headline that rises in word-group by line. */
export const Headline: React.FC<{ text: string; start?: number; top?: number; size?: number }> = ({ text, start = 0, top = 300, size = 76 }) => {
  const f = useCurrentFrame();
  const lines = text.split('\n');
  return (
    <div style={{ position: 'absolute', top, left: 70, right: 70, textAlign: 'center' }}>
      {lines.map((line, i) => {
        const p = enter(f, start + i * 5, 16);
        return (
          <div key={i} style={{ overflow: 'hidden', paddingBottom: 8 }}>
            <div
              style={{
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: size,
                lineHeight: 1.12,
                letterSpacing: -1,
                color: C.text,
                transform: `translateY(${(1 - p) * 110}%)`,
                opacity: p,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const GradText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ background: C.grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{children}</span>
);

/** Small brand mark at the top, kept below the Stories header area. */
export const Brand: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', top: 160, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: enter(f, 0, 12) * 0.95 }}>
      <Img src={staticFile('logo-full.png')} style={{ height: 70 }} />
    </div>
  );
};

/** Compliance line, always on screen, placed above the Reels caption area. */
export const Disclaimer: React.FC<{ text: string }> = ({ text }) => (
  <div style={{ position: 'absolute', top: 1330, left: 60, right: 60, textAlign: 'center', fontFamily: FONT, fontSize: 24, fontWeight: 600, color: 'rgba(152,162,189,0.75)', letterSpacing: 0.2 }}>
    {text}
  </div>
);

export const Check: React.FC<{ size?: number; color?: string }> = ({ size = 34, color = C.up }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="11" fill={color} fillOpacity="0.16" stroke={color} strokeWidth="1.5" />
    <path d="M7 12.5l3.2 3.2L17 9" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const pulse = (f: number, period = 30) => 0.5 + 0.5 * Math.sin((f / period) * Math.PI * 2);

export const clampInterp = (f: number, input: number[], output: number[]) =>
  interpolate(f, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
