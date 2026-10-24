import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { pulse } from '../components';
import { Copy } from '../copy';
import { C, DISPLAY, enter, FONT } from '../theme';

/** Logo, promise, a pulsing Telegram button and an arrow pointing at Meta's CTA button below. */
export const Cta: React.FC<{ t: Copy }> = ({ t }) => {
  const f = useCurrentFrame();
  const logo = enter(f, 0, 16);
  const title = enter(f, 8, 16);
  const btn = enter(f, 18, 14);
  const glow = pulse(f, 24);
  const arrow = enter(f, 30, 12);
  const bounce = Math.abs(Math.sin((f / 18) * Math.PI)) * 26;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 42%, rgba(31,155,255,0.30), transparent 60%)', opacity: logo }} />

      <div style={{ position: 'absolute', top: 280, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: logo, transform: `scale(${0.85 + logo * 0.15})` }}>
        <Img src={staticFile('logo-full.png')} style={{ width: 400 }} />
      </div>

      <div style={{ position: 'absolute', top: 680, left: 60, right: 60, textAlign: 'center', opacity: title, transform: `translateY(${(1 - title) * 40}px)` }}>
        {t.ctaTitle.split('\n').map((line, i) => (
          <div key={i} style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 76, lineHeight: 1.12, letterSpacing: -1, color: C.text }}>
            {line}
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', top: 900, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: btn, transform: `scale(${(0.8 + btn * 0.2) * (1 + glow * 0.03)})` }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '30px 60px',
            borderRadius: 999,
            background: 'linear-gradient(100deg, #1f8bff, #1fc1ff)',
            boxShadow: `0 0 0 ${6 + glow * 14}px rgba(31,182,255,${0.25 - glow * 0.15}), 0 24px 70px rgba(31,155,255,0.6)`,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 50,
            color: '#fff',
          }}
        >
          <TelegramIcon />
          {t.ctaButton}
        </div>
      </div>

      <div style={{ position: 'absolute', top: 1100 + bounce, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: arrow }}>
        <svg width="70" height="90" viewBox="0 0 70 90" fill="none">
          <path d="M35 6v70M10 52l25 26 25-26" stroke={C.cyan} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

const TelegramIcon = () => (
  <svg width="58" height="58" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="12" fill="#fff" />
    <path d="M5.4 11.7l11.1-4.3c.5-.2 1 .1.8.9l-1.9 8.9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.4-.1l-6.5 4.1-2.8-.9c-.6-.2-.6-.6.1-.9z" fill="#1f9bff" />
  </svg>
);
