import React from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { clampInterp } from '../components';
import { Intro as IntroConfig, segmentFrames } from '../intro';
import { C, DISPLAY, enter } from '../theme';

/** The presenter clip, jump-cut between phrases, with word-by-word captions. */
export const Intro: React.FC<{ intro: IntroConfig; captions?: boolean }> = ({ intro, captions = true }) => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {intro.segments.map((seg, i) => {
        const frames = segmentFrames(intro, i);
        const start = from;
        from += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames} layout="none">
            <Segment intro={intro} index={i} frames={frames} captions={captions} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Segment: React.FC<{ intro: IntroConfig; index: number; frames: number; captions: boolean }> = ({ intro, index, frames, captions }) => {
  const f = useCurrentFrame();
  const seg = intro.segments[index];
  // Each cut punches in a little more, which hides the jump cut; a slow push keeps it alive.
  const scale = 1 + index * 0.07 + (f / frames) * 0.03;
  const punch = index > 0 ? clampInterp(f, [0, 4], [1.04, 1]) : 1;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${scale * punch})`, transformOrigin: '50% 38%' }}>
        <OffthreadVideo
          src={staticFile(intro.file)}
          playbackRate={intro.rate}
          trimBefore={Math.round(seg.from * 30)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </AbsoluteFill>
      {/* darken the bottom so captions and the disclaimer read cleanly; captions sit above it */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(4,6,13,0.3) 0%, transparent 16%, transparent 52%, rgba(4,6,13,0.7) 72%, #04060d 100%)' }} />
      {captions && <Caption text={seg.caption} frames={frames} />}
    </AbsoluteFill>
  );
};

/** Words pop in one by one across the segment; *word* is highlighted with the brand gradient. */
const Caption: React.FC<{ text: string; frames: number }> = ({ text, frames }) => {
  const f = useCurrentFrame();
  const words = text.split(' ');
  // Spread word starts over the first ~75% of the segment, weighted by word length (≈ speaking time).
  const weights = words.map((w) => w.replace(/\*/g, '').length + 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const starts = weights.map((w) => {
    const s = (acc / total) * frames * 0.75;
    acc += w;
    return s;
  });
  return (
    <div style={{ position: 'absolute', top: 1190, left: 50, right: 50, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 30px' }}>
      {words.map((raw, i) => {
        const hot = raw.startsWith('*');
        const word = raw.replace(/\*/g, '');
        const p = enter(f, starts[i], 6);
        const active = f >= starts[i] && (i === words.length - 1 || f < starts[i + 1]);
        return (
          <span
            key={i}
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 92,
              lineHeight: 1.1,
              letterSpacing: -1,
              color: hot ? 'transparent' : active ? '#fff' : C.text,
              background: hot ? C.grad : undefined,
              WebkitBackgroundClip: hot ? 'text' : undefined,
              backgroundClip: hot ? 'text' : undefined,
              textShadow: hot ? undefined : '0 6px 30px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.9)',
              filter: hot ? 'drop-shadow(0 6px 24px rgba(0,0,0,0.85))' : undefined,
              opacity: p,
              transform: `translateY(${(1 - p) * 26}px) scale(${0.7 + p * 0.3 + (active ? 0.06 : 0)})`,
              display: 'inline-block',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
