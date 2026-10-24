import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check, clampInterp, Headline } from '../components';
import { Copy, PAIRS } from '../copy';
import { C, enter, FONT } from '../theme';

const COLS = 4;
const CHIP_W = 222;
const CHIP_H = 66;
const GAP = 16;
const GRID_TOP = 590;
const GRID_W = COLS * CHIP_W + (COLS - 1) * GAP;

/** Pair chips light up as a scan line sweeps down, then the 5 analysis layers check in. */
export const Scan: React.FC<{ t: Copy; dur?: number }> = ({ t, dur = 120 }) => {
  // Animations are authored for 120 frames and stretched when the scene runs longer.
  const f = useCurrentFrame() * (120 / dur);
  const rows = Math.ceil(PAIRS.length / COLS);
  const gridH = rows * CHIP_H + (rows - 1) * GAP;
  const sweep = clampInterp(f, [10, 62], [-40, gridH + 40]);

  return (
    <AbsoluteFill>
      <Headline text={t.scanTitle} top={330} size={70} />

      <div style={{ position: 'absolute', top: GRID_TOP, left: (1080 - GRID_W) / 2, width: GRID_W, height: gridH }}>
        {PAIRS.map((p, i) => {
          const row = Math.floor(i / COLS);
          const inRow = Math.min(COLS, PAIRS.length - row * COLS);
          const col = (i % COLS) + (COLS - inRow) / 2;
          const y = row * (CHIP_H + GAP);
          const appear = enter(f, 2 + i * 1.2, 10);
          const lit = clampInterp(sweep - y, [0, 30], [0, 1]);
          const isMain = p === 'EUR/USD';
          return (
            <div
              key={p}
              style={{
                position: 'absolute',
                left: col * (CHIP_W + GAP),
                top: y,
                width: CHIP_W,
                height: CHIP_H,
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 30,
                color: lit > 0.5 ? C.text : C.muted,
                background: `rgba(${isMain ? '34,211,155' : '31,155,255'},${0.04 + lit * 0.12})`,
                border: `2px solid rgba(${isMain ? '34,211,155' : '31,155,255'},${0.12 + lit * 0.5})`,
                boxShadow: lit > 0.5 && isMain ? '0 0 40px rgba(34,211,155,0.45)' : 'none',
                opacity: appear,
                transform: `scale(${0.85 + appear * 0.15})`,
              }}
            >
              {p}
            </div>
          );
        })}
        {/* scan beam */}
        <div
          style={{
            position: 'absolute',
            left: -30,
            right: -30,
            top: sweep,
            height: 4,
            borderRadius: 2,
            background: C.grad,
            boxShadow: '0 0 30px 8px rgba(31,182,255,0.55)',
            opacity: clampInterp(f, [8, 14, 60, 68], [0, 1, 1, 0]),
          }}
        />
      </div>

      {/* analysis layers */}
      <div style={{ position: 'absolute', top: 1040, left: 60, right: 60, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
        {t.layers.map((name, i) => {
          const p = enter(f, 58 + i * 8, 12);
          return (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 26px 14px 16px',
                borderRadius: 999,
                background: 'rgba(34,211,155,0.10)',
                border: '2px solid rgba(34,211,155,0.45)',
                fontFamily: FONT,
                fontWeight: 700,
                fontSize: 32,
                color: C.text,
                opacity: p,
                transform: `translateY(${(1 - p) * 30}px) scale(${0.9 + p * 0.1})`,
              }}
            >
              <Check size={38} />
              {name}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
