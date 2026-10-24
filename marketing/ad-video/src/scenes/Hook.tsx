import React from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';
import { clampInterp, GradText } from '../components';
import { Copy } from '../copy';
import { C, DISPLAY, enter } from '../theme';

const CUT = 40; // chaos → answer

/** Chaotic, flickering candles + the question; then a clean cut to the answer. */
export const Hook: React.FC<{ t: Copy }> = ({ t }) => {
  const f = useCurrentFrame();
  const chaos = clampInterp(f, [CUT - 6, CUT], [1, 0]);
  const shakeX = chaos * (random(`sx${f}`) - 0.5) * 18;
  const shakeY = chaos * (random(`sy${f}`) - 0.5) * 18;
  const flash = clampInterp(f, [CUT - 1, CUT, CUT + 8], [0, 0.55, 0]);
  const answer = enter(f, CUT + 2, 16);

  return (
    <AbsoluteFill>
      {/* noisy market */}
      <AbsoluteFill style={{ opacity: chaos, transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        <Candles frame={f} />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(255,77,106,0.18), transparent 65%)' }} />
      </AbsoluteFill>

      {chaos > 0 && (
        <div style={{ position: 'absolute', top: 560, left: 60, right: 60, textAlign: 'center', transform: `translate(${shakeX * 0.6}px, ${shakeY * 0.6}px) scale(${0.92 + enter(f, 0, 10) * 0.08})`, opacity: enter(f, 0, 8) * chaos }}>
          {t.hookQuestion.split('\n').map((line, i) => (
            <div key={i} style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 104, lineHeight: 1.08, color: C.text, letterSpacing: -2, textShadow: '0 10px 60px rgba(0,0,0,0.9)' }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {f >= CUT && (
        <div style={{ position: 'absolute', top: 600, left: 60, right: 60, textAlign: 'center', opacity: answer, transform: `scale(${1.08 - answer * 0.08})`, filter: `blur(${(1 - answer) * 12}px)` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 100, lineHeight: 1.1, color: C.text, letterSpacing: -2 }}>
            {t.hookAnswer[0]}
            <GradText>{t.hookAnswer[1]}</GradText>
            <br />
            {t.hookAnswer[2].trim()}
          </div>
        </div>
      )}

      <AbsoluteFill style={{ background: '#fff', opacity: flash, mixBlendMode: 'overlay' }} />
    </AbsoluteFill>
  );
};

/** A field of random candles that re-randomise every few frames. */
const Candles: React.FC<{ frame: number }> = ({ frame }) => {
  const tick = Math.floor(frame / 3);
  const n = 26;
  const step = 1080 / n;
  let price = 960;
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      {Array.from({ length: n }, (_, i) => {
        const r = (k: string) => random(`${k}-${i}-${tick}`);
        const move = (r('m') - 0.5) * 260;
        const open = price;
        const close = price + move;
        price = Math.min(1350, Math.max(500, close));
        const high = Math.min(open, close) - r('h') * 120;
        const low = Math.max(open, close) + r('l') * 120;
        const up = close < open; // y grows downward
        const color = up ? C.up : C.down;
        const x = i * step + step / 2;
        return (
          <g key={i} opacity={0.75}>
            <line x1={x} x2={x} y1={high} y2={low} stroke={color} strokeWidth={3} />
            <rect x={x - step * 0.3} y={Math.min(open, close)} width={step * 0.6} height={Math.max(6, Math.abs(close - open))} rx={3} fill={color} />
          </g>
        );
      })}
    </svg>
  );
};
