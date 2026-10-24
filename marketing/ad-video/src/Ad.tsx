import React from 'react';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Background, Disclaimer } from './components';
import { Copy, COPY, Lang } from './copy';
import { INTROS, introFrames } from './intro';
import { Cta } from './scenes/Cta';
import { Hook } from './scenes/Hook';
import { Intro } from './scenes/Intro';
import { Scan } from './scenes/Scan';
import { Signal } from './scenes/Signal';
import { Telegram } from './scenes/Telegram';
import { FPS } from './theme';
import { VOICEOVERS } from './voiceover';

const OVERLAP = 8;

type SceneComponent = React.FC<{ t: Copy; dur: number }>;

/** Scene lengths in frames, after the opening. Scenes overlap by OVERLAP frames for a soft cut. */
const BODY: [SceneComponent, number][] = [
  [Scan, 120],
  [Signal, 135],
  [Telegram, 195],
  [Cta, 90],
];
const HOOK_FRAMES = 75;

/** The opening is the presenter clip when the language has one, otherwise the animated text hook. */
function timeline(lang: Lang, introCaptions = true) {
  const intro = INTROS[lang];
  const opening: [SceneComponent, number] = intro ? [() => <Intro intro={intro} captions={introCaptions} />, introFrames(intro)] : [Hook, HOOK_FRAMES];
  const scanFrames = VOICEOVERS[lang]?.scanFrames;
  const body = BODY.map(([Scene, len]): [SceneComponent, number] => [Scene, Scene === Scan && scanFrames ? scanFrames : len]);
  let start = 0;
  return [opening, ...body].map(([Scene, len]) => {
    const item = { Scene, start, len };
    start += len;
    return item;
  });
}

export const adFrames = (lang: Lang) => timeline(lang).reduce((end, s) => Math.max(end, s.start + s.len), 0);

/** `introCaptions: false` = v2, the presenter without the word-by-word captions. */
export const Ad: React.FC<{ lang: Lang; introCaptions?: boolean }> = ({ lang, introCaptions = true }) => {
  const t = COPY[lang];
  const scenes = timeline(lang, introCaptions);
  return (
    <AbsoluteFill style={{ background: '#04060d' }}>
      <Background />
      {scenes.map(({ Scene, start, len }, i) => {
        const last = i === scenes.length - 1;
        const dur = len + (last ? 0 : OVERLAP);
        return (
          <Sequence key={i} from={start} durationInFrames={dur} layout="none">
            <SceneShell dur={dur} fadeIn={i > 0} fadeOut={!last}>
              <Scene t={t} dur={len} />
            </SceneShell>
          </Sequence>
        );
      })}
      <Sequence from={scenes[1].start} layout="none">
        <Disclaimer text={t.disclaimer} />
      </Sequence>
      <VoiceoverTrack lang={lang} bodyStart={scenes[1].start} />
    </AbsoluteFill>
  );
};

/** Fades/zooms a scene in and out so cuts feel smooth. */
const SceneShell: React.FC<{ dur: number; fadeIn: boolean; fadeOut: boolean; children: React.ReactNode }> = ({ dur, fadeIn, fadeOut, children }) => {
  const f = useCurrentFrame();
  const opts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
  // The outgoing scene is gone before the incoming one appears, so texts never blend.
  const inP = fadeIn ? interpolate(f, [OVERLAP * 0.45, OVERLAP], [0, 1], opts) : 1;
  const outP = fadeOut ? interpolate(f, [dur - OVERLAP, dur - OVERLAP * 0.45], [1, 0], opts) : 1;
  return (
    <AbsoluteFill style={{ opacity: Math.min(inP, outP), transform: `scale(${1 + (1 - outP) * 0.04})`, filter: outP < 1 ? `blur(${(1 - outP) * 8}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};

/** Places each voiceover sentence at its scene, with a few ms of fade so cuts never click. */
const VoiceoverTrack: React.FC<{ lang: Lang; bodyStart: number }> = ({ lang, bodyStart }) => {
  const vo = VOICEOVERS[lang];
  if (!vo) return null;
  return (
    <>
      {vo.lines.map((line, i) => {
        const len = Math.round((line.to - line.from) * FPS);
        return (
          <Sequence key={i} from={bodyStart + Math.round(line.at * FPS)} durationInFrames={len} layout="none">
            <Audio
              src={staticFile(vo.file)}
              trimBefore={Math.round(line.from * FPS)}
              trimAfter={Math.round(line.to * FPS)}
              volume={(f) => vo.volume * Math.min(1, f / 2, (len - f) / 2)}
            />
          </Sequence>
        );
      })}
    </>
  );
};
