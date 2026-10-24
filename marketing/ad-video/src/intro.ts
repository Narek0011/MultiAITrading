import { Lang } from './copy';
import { FPS } from './theme';

/**
 * Presenter clip that opens the ad (replaces the text hook). `segments` are the parts of the clip to keep,
 * in source seconds — the pause between the two phrases is cut out. Each segment has the caption spoken in it.
 */
export interface Intro {
  file: string;
  rate: number;
  segments: { from: number; to: number; caption: string }[];
}

export const INTROS: Partial<Record<Lang, Intro>> = {
  es: {
    file: 'intro-es.mp4',
    rate: 1.25,
    segments: [
      { from: 0.6, to: 2.35, caption: '¿Sigues adivinando el mercado?' },
      { from: 3.72, to: 6.45, caption: 'Deja que la *IA* analice por ti.' },
    ],
  },
};

/** Output length of one segment in composition frames. */
export const segmentFrames = (intro: Intro, i: number) => Math.round(((intro.segments[i].to - intro.segments[i].from) / intro.rate) * FPS);

export const introFrames = (intro: Intro) => intro.segments.reduce((sum, _, i) => sum + segmentFrames(intro, i), 0);
