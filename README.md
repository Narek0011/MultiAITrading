# MultiAITrading

A NestJS app that:

- serves a **landing page** (`/`) in English, Russian and Spanish (`?lang=en|ru|es`)
- runs a **forex signal bot** that analyses 17 pairs and posts BUY/SELL signals with a real chart to a Telegram channel
- has an **admin panel** (`/admin`) to configure everything: AI or Custom mode, pairs, keys, timing, risk, Telegram and the landing links

## Quick start (local)

Requirements: Node 20+ and PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
createdb multiaitrading
npm install
npm run start:dev             # http://localhost:3000  and  http://localhost:3000/admin
```

Tables are created automatically on the first start.

## Docker

```bash
cp .env.example .env          # edit the admin credentials and JWT_SECRET
docker compose up -d --build  # app on :3000, Postgres in a volume
```

## First-time setup in `/admin`

1. **Market data**: paste your [Twelve Data](https://twelvedata.com) API key and press **Test connection**.
2. **AI settings**: paste your OpenAI API key, press **Load models**, and pick a model.
3. **Telegram**: create a bot with @BotFather, add it as an admin of your channel, then fill in the token and channel ID and press **Send test message**.
4. **Landing page**: fill in the signals channel URL and the support URL (your Telegram).
5. **Pairs → Analyze** shows what the bot would post for any pair, without posting.
6. **General**: turn on **Bot enabled**.

Each admin section has an explanation block describing what its settings do.

## How it works

```
every N minutes (Admin → General)
 ├─ ResultTracker: open signals vs. latest candles → TP1 / TP2 / SL / BE / expiry → reply in Telegram
 └─ Scanner: for each enabled pair (session filter, daily cap, cooldown)
     ├─ Twelve Data candles (throttled to your plan's req/min)
     ├─ Strategy: AI (OpenAI JSON decision) or Custom (EMA/RSI/MACD confluence)
     ├─ ChartRenderer: SVG → PNG from the same candles (entry, TP, SL zones, EMAs, RSI)
     └─ Telegram sendPhoto + caption in EN/RU/ES
```

| Path | What |
|---|---|
| `src/analysis/` | AI strategy, indicator strategy, indicators, ATR levels |
| `src/charts/` | Server-side chart renderer (no native canvas dependency) |
| `src/signals/` | Scan pipeline, result tracker, stats, activity log |
| `src/scheduler/` | Interval job; rescheduled live when the admin changes it |
| `src/settings/` | DB-backed settings with defaults; secrets are masked in the UI |
| `src/admin/` | Login (JWT cookie), admin pages and JSON API |
| `src/landing/` | Landing controller and EN/RU/ES dictionaries |
| `views/`, `public/` | Handlebars templates, CSS and JS |

## Scripts

```bash
npm test                      # unit tests (strategy, result tracking, chart, captions, sessions)
npx ts-node --transpile-only scripts/render-sample.ts sample.png   # render a demo chart
DATABASE_URL=postgres://localhost/multiaitrading_smoke \
  npx ts-node --transpile-only scripts/smoke.ts                    # end-to-end test with stubbed APIs (uses its own DB)
```

## Notes

- The admin account always matches `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. To change the password, edit `.env` and restart.
- Twelve Data's free plan is 8 requests/min and 800/day. The Market data page estimates your daily usage from your current settings.
- The landing page only shows **closed** results, never open signals, so the channel stays exclusive.
