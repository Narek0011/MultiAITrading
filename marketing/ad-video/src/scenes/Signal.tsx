import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { clampInterp, Headline } from '../components';
import { Copy } from '../copy';
import signal from '../signal.json';
import { C, DISPLAY, enter, FONT } from '../theme';

const CARD_W = 1000;
const CARD_H = Math.round((CARD_W * 1080) / 1920);

/** The real chart wipes in with a slow push, then the confidence ring counts up. */
export const Signal: React.FC<{ t: Copy }> = ({ t }) => {
  const f = useCurrentFrame();
  const appear = enter(f, 4, 18);
  const wipe = clampInterp(f, [8, 44], [100, 0]);
  const zoom = clampInterp(f, [0, 135], [1, 1.05]);
  const conf = Math.round(clampInterp(f, [50, 86], [0, signal.confidence]));
  const ring = enter(f, 46, 12);

  return (
    <AbsoluteFill>
      <Headline text={t.signalTitle} top={300} size={70} />

      <div
        style={{
          position: 'absolute',
          top: 555,
          left: (1080 - CARD_W) / 2,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 26,
          padding: 6,
          background: 'linear-gradient(140deg, rgba(31,107,255,0.7), rgba(31,182,255,0.25), rgba(46,229,157,0.7))',
          boxShadow: '0 40px 120px -30px rgba(31,120,255,0.75)',
          opacity: appear,
          transform: `translateY(${(1 - appear) * 60}px) scale(${zoom})`,
        }}
      >
        <div style={{ width: '100%', height: '100%', borderRadius: 21, overflow: 'hidden', clipPath: `inset(0 ${wipe}% 0 0)` }}>
          <Img src={staticFile('chart.png')} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      </div>

      {/* confidence + direction */}
      <div style={{ position: 'absolute', top: 1160, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 34, opacity: ring, transform: `translateY(${(1 - ring) * 30}px)` }}>
        <Gauge value={conf} label={t.confidence} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 30px', borderRadius: 20, border: `3px solid ${C.up}`, background: 'rgba(34,211,155,0.14)', fontFamily: DISPLAY, fontWeight: 800, fontSize: 44, color: C.up }}>
          ▲ {signal.direction} <span style={{ color: C.text }}>{signal.pair}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Gauge: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const r = 46;
  const len = 2 * Math.PI * r;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={112} height={112} viewBox="0 0 112 112">
        <circle cx={56} cy={56} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={10} fill="none" />
        <circle cx={56} cy={56} r={r} stroke={C.up} strokeWidth={10} fill="none" strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - value / 100)} transform="rotate(-90 56 56)" />
        <text x={56} y={66} textAnchor="middle" fontFamily={DISPLAY} fontWeight={800} fontSize={30} fill={C.text}>
          {value}%
        </text>
      </svg>
      <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 28, color: C.muted, lineHeight: 1.2, maxWidth: 170 }}>{label}</div>
    </div>
  );
};
