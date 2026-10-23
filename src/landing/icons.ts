const s = (d: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICONS: Record<string, string> = {
  chart: s('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  target: s('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'),
  bell: s('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  shield: s('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>'),
  data: s('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  brain: s('<path d="M9 4a3 3 0 0 0-3 3v.5A3 3 0 0 0 4 13a3 3 0 0 0 2 4.5V18a3 3 0 0 0 6 0V4.5A2.5 2.5 0 0 0 9 4z"/><path d="M15 4a3 3 0 0 1 3 3v.5a3 3 0 0 1 2 5.5 3 3 0 0 1-2 4.5V18a3 3 0 0 1-6 0"/>'),
  send: s('<path d="M21 3L3 10.5l7 2.5 2.5 7z"/><path d="M10 13l11-10"/>'),
  layers: s('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  pulse: s('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  check: s('<path d="M20 6L9 17l-5-5"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  key: s('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>'),
  telegram:
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M21.94 4.3a1.5 1.5 0 0 0-2.05-1.62L2.9 9.33c-1.2.47-1.18 2.18.03 2.63l4.06 1.5 1.58 5.08c.24.78 1.22 1.03 1.8.46l2.33-2.27 4.46 3.27c.84.62 2.04.16 2.26-.86zM9.53 14.03l-.6 3.17-1.1-3.6 9.86-6.73z"/></svg>',
  cpu: s('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>'),
  funnel: s('<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>'),
  spark: s('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 3v4M17 5h4"/>'),
  scan: s('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>'),
  x: s('<path d="M18 6L6 18M6 6l12 12"/>'),
  arrow: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
};
