import { Lang } from './copy';

/**
 * Voiceover after the opening. The file is cut at its sentence pauses (`from`/`to`, seconds in the file) and each
 * sentence starts `at` seconds after the opening ends, so every line lands on its scene.
 */
export interface Voiceover {
  file: string;
  volume: number;
  /** Longer AI-scan scene (frames) so the first sentence fits it; default 120. */
  scanFrames?: number;
  lines: { from: number; to: number; at: number }[];
}

export const VOICEOVERS: Partial<Record<Lang, Voiceover>> = {
  es: {
    file: 'vo-es.mp3',
    volume: 1.26, // +2 dB to match the presenter
    scanFrames: 180,
    // Scenes after the opening start at 0 (scan), 6.0 (signal), 10.5 (Telegram; TP1 at 15.0), 17.0 (CTA).
    lines: [
      { from: 0.0, to: 5.95, at: 0.05 }, // Nuestra IA analiza 17 pares… → AI scan
      { from: 6.2, to: 9.0, at: 6.5 }, // Y solo te envía las señales… → signal chart
      { from: 9.2, to: 12.85, at: 10.8 }, // Entrada, objetivos y stop loss… → Telegram post
      { from: 13.0, to: 15.2, at: 15.0 }, // Un plan claro… → TP1 reached
      { from: 15.35, to: 17.8, at: 17.2 }, // Escríbenos ahora… → final button
    ],
  },
};
