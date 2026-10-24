import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { clampInterp, Headline } from '../components';
import { Copy } from '../copy';
import signal from '../signal.json';
import { C, enter, FONT } from '../theme';

export const RESULT_AT = 135; // local frame where the TP1 reply arrives

const PHONE_W = 720;
const PHONE_TOP = 545;
const TG = { bg: '#0e1621', header: '#17212b', bubble: '#182533', text: '#f5f5f5', link: '#6ab3f3', meta: '#6d7f8f' };

/** Phone with the Telegram channel: notification → signal post → TP1 reply. */
export const Telegram: React.FC<{ t: Copy }> = ({ t }) => {
  const f = useCurrentFrame();
  const phone = enter(f, 0, 18);
  const notif = clampInterp(f, [4, 14, 36, 46], [0, 1, 1, 0]);
  const post = enter(f, 30, 16);
  const scroll = enter(f, 42, 34) * 190 + enter(f, RESULT_AT - 4, 18) * 250;
  const reply = enter(f, RESULT_AT + 6, 14);
  const titleOut = clampInterp(f, [RESULT_AT - 8, RESULT_AT], [1, 0]);

  const lines: [string, React.ReactNode][] = [
    ['📍', <>{t.entry}: <Code>{signal.entry}</Code></>],
    ['🎯', <>{t.tp1}: <Code>{signal.tp1}</Code> <Dim>(+{signal.tp1Pips} pips)</Dim></>],
    ['🎯', <>{t.tp2}: <Code>{signal.tp2}</Code> <Dim>(+{signal.tp2Pips} pips)</Dim></>],
    ['🛑', <>{t.sl}: <Code>{signal.sl}</Code> <Dim>(−{signal.slPips} pips)</Dim></>],
    ['⏱', <>{t.timeframe}: <b>{signal.timeframe}</b></>],
  ];

  return (
    <AbsoluteFill>
      <div style={{ opacity: titleOut }}>
        <Headline text={t.telegramTitle} top={320} size={62} />
      </div>
      {f >= RESULT_AT - 2 && <Headline text={t.resultTitle} top={320} size={66} start={RESULT_AT} />}

      {/* phone */}
      <div
        style={{
          position: 'absolute',
          top: PHONE_TOP,
          left: (1080 - PHONE_W) / 2,
          width: PHONE_W,
          height: 1300,
          borderRadius: 70,
          padding: 16,
          background: 'linear-gradient(160deg, #2a3140, #0b0f17)',
          boxShadow: '0 0 0 3px rgba(255,255,255,0.08), 0 50px 140px -30px rgba(31,120,255,0.6)',
          opacity: phone,
          transform: `translateY(${(1 - phone) * 120}px)`,
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 56, overflow: 'hidden', background: TG.bg }}>
          {/* channel header */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 150, paddingTop: 54, background: TG.header, display: 'flex', alignItems: 'center', gap: 18, paddingLeft: 28, zIndex: 2 }}>
            <span style={{ fontSize: 40, color: TG.link }}>‹</span>
            <Avatar size={68} />
            <div style={{ fontFamily: FONT }}>
              <div style={{ color: TG.text, fontWeight: 700, fontSize: 30 }}>{t.channelName}</div>
              <div style={{ color: TG.meta, fontSize: 22 }}>{t.subscribers}</div>
            </div>
          </div>

          {/* chat */}
          <div style={{ position: 'absolute', top: 170, left: 18, right: 18, transform: `translateY(${-scroll}px)` }}>
            <div
              style={{
                borderRadius: 22,
                background: TG.bubble,
                overflow: 'hidden',
                opacity: post,
                transform: `translateY(${(1 - post) * 40}px) scale(${0.96 + post * 0.04})`,
                transformOrigin: 'left bottom',
              }}
            >
              <Img src={staticFile('chart.png')} style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: '18px 22px 14px', fontFamily: FONT, fontSize: 27, lineHeight: 1.5, color: TG.text }}>
                <Line f={f} i={0}>
                  🟢 <b>BUY {signal.pair}</b> <span style={{ color: TG.link }}>#{signal.pair.replace('/', '')}</span>
                </Line>
                {lines.map(([icon, content], i) => (
                  <Line key={i} f={f} i={i + 1}>
                    {icon} {content}
                  </Line>
                ))}
                <Line f={f} i={6}>
                  🤖 {t.confidence}: <b>{signal.confidence}%</b>
                </Line>
                <div style={{ textAlign: 'right', color: TG.meta, fontSize: 20 }}>14:32</div>
              </div>
            </div>

            {/* TP1 reply */}
            <div
              style={{
                marginTop: 16,
                borderRadius: 22,
                background: TG.bubble,
                padding: '16px 22px',
                fontFamily: FONT,
                color: TG.text,
                opacity: reply,
                transform: `translateY(${(1 - reply) * 40}px) scale(${0.9 + reply * 0.1})`,
                transformOrigin: 'left top',
                boxShadow: reply > 0.5 ? '0 0 0 2px rgba(34,211,155,0.55), 0 0 50px rgba(34,211,155,0.35)' : 'none',
              }}
            >
              <div style={{ borderLeft: `4px solid ${TG.link}`, paddingLeft: 12, marginBottom: 10, fontSize: 22, color: TG.link }}>
                🟢 BUY {signal.pair}
              </div>
              <div style={{ fontSize: 32, display: 'flex', alignItems: 'center', gap: 14 }}>
                ✅ <b>{t.tp1Hit}</b> <span style={{ color: C.up, fontWeight: 800 }}>+{signal.tp1Pips} pips</span>
                <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: TG.meta, border: `1.5px solid ${TG.meta}`, borderRadius: 8, padding: '2px 8px' }}>{t.example}</span>
              </div>
            </div>
          </div>

          {/* incoming notification */}
          <div
            style={{
              position: 'absolute',
              top: 26,
              left: 22,
              right: 22,
              zIndex: 3,
              borderRadius: 30,
              padding: '20px 22px',
              display: 'flex',
              gap: 16,
              alignItems: 'center',
              background: 'rgba(40,46,58,0.92)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              fontFamily: FONT,
              opacity: notif,
              transform: `translateY(${(notif - 1) * 160}px)`,
            }}
          >
            <Avatar size={64} />
            <div>
              <div style={{ color: TG.text, fontWeight: 700, fontSize: 26 }}>{t.channelName}</div>
              <div style={{ color: '#c8d0dc', fontSize: 25 }}>🟢 {t.notification}</div>
            </div>
          </div>
        </div>
      </div>

      {/* fade the phone into the background above the Reels caption area */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1250, height: 670, background: `linear-gradient(180deg, transparent, ${C.bg} 22%)` }} />
    </AbsoluteFill>
  );
};

const Line: React.FC<{ f: number; i: number; children: React.ReactNode }> = ({ f, i, children }) => {
  const p = enter(f, 38 + i * 4, 10);
  return <div style={{ opacity: p, transform: `translateX(${(1 - p) * -20}px)`, whiteSpace: 'nowrap' }}>{children}</div>;
};

const Code: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontFamily: "'SF Mono', Menlo, monospace", color: '#e8f0ff', fontWeight: 600 }}>{children}</span>
);
const Dim: React.FC<{ children: React.ReactNode }> = ({ children }) => <span style={{ color: '#9fb1c4' }}>{children}</span>;

const Avatar: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(140deg, #0d1a3d, #0a1230)', border: '2px solid rgba(31,182,255,0.4)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <Img src={staticFile('logo-mark.png')} style={{ width: size * 0.66 }} />
  </div>
);
