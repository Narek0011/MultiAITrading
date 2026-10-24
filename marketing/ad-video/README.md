# Meta ad video

20-second 9:16 (1080×1920) promo for Instagram/Facebook Reels and Stories, in English and Spanish.
Rendered with [Remotion](https://www.remotion.dev) from React code, so text and timing are easy to change.
The video is silent, so add voiceover and music on top.

## Render

```sh
cd marketing/ad-video
npm install
npm run render      # chart → EN video → ES video → cover images, all in out/
npm run studio      # live preview in the browser while editing
```

## Edit

- **Text:** `src/copy.ts` holds every on-screen string, for both languages.
- **Signal values / chart:** `scripts/make-chart.ts` renders the chart with the app's own renderer
  (`src/charts/chart-renderer.service.ts`) and writes `src/signal.json`.
- **Timing:** `TIMELINE` in `src/Ad.tsx` lists each scene with its start frame and length (30 fps).

Scenes: hook (0–2.5s) → AI scan of 17 pairs (2.5–6.5s) → signal chart + confidence (6.5–11s) →
Telegram post and TP1 reply (11–17.5s) → call to action (17.5–20s).

## Presenter intro

A clip of a person saying the hook can open the ad instead of the animated text hook. It is set per language in
`src/intro.ts`:

1. Save the clip as `public/intro-<lang>.mp4` (vertical, any length).
2. Add an entry with the playback speed (`rate`, e.g. 1.25) and the `segments` to keep, in source seconds,
   each with the caption spoken in it (`*word*` = highlighted). Cutting the pause between phrases keeps it short.
3. `npm run render:<lang>`. The rest of the video shifts automatically and stays at normal speed.

Spanish uses `intro-es.mp4` at 1.25×. English still opens with the text hook until an English clip is added.

## Voiceover

One audio file per language (`public/vo-<lang>.mp3`) covers everything after the presenter. In `src/voiceover.ts`
it is cut at its sentence pauses, and each sentence is placed on its scene (`at` = seconds after the opening).
For a new recording, find the pauses and update `from`/`to`; `volume` matches its loudness to the presenter.
Spanish uses an ElevenLabs recording ("Roger"). The script text is `voice` in `src/copy.ts`.

## Meta ads notes

- Text and key visuals stay above roughly the bottom third, which Reels and Stories cover with UI.
- The video does not name the broker. Meta does not allow binary-options ads.
- The "Example signal · Trading involves risk" line stays on screen; keep it for financial-ad review.
- Remotion is free for individuals and companies with up to 3 people; bigger teams need a company license.
