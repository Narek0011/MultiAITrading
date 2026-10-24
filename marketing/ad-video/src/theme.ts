import { interpolate, Easing } from 'remotion';

export const C = {
  bg: '#04060d',
  navy: '#0a1230',
  text: '#eef1fa',
  muted: '#98a2bd',
  dim: '#6b7591',
  up: '#22d39b',
  down: '#ff4d6a',
  blue: '#1f9bff',
  cyan: '#1fd1ff',
  violet: '#a57bff',
  gold: '#f5b83d',
  grad: 'linear-gradient(100deg, #1f6bff 0%, #1fb6ff 48%, #2ee59d 100%)',
};

export const FONT = "'Inter', system-ui, sans-serif";
export const DISPLAY = "'Montserrat', 'Inter', sans-serif";

export const FPS = 30;
export const W = 1080;
export const H = 1920;

const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** 0→1 over [start, start+len], eased. */
export const enter = (frame: number, start: number, len = 14) =>
  interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });

/** Opacity for a scene: fades in at the start and out before `dur`. */
export const sceneFade = (frame: number, dur: number, fadeIn = 8, fadeOut = 8) =>
  interpolate(frame, [0, fadeIn, dur - fadeOut, dur], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
