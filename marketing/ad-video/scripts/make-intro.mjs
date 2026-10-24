// Generates the presenter intro clips with OpenAI's video model (Sora).
// Usage: OPENAI_API_KEY=… node scripts/make-intro.mjs [en|es ...]
// The key is read from the environment only — never store it in the repo.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error('Set OPENAI_API_KEY');

const MODEL = process.env.SORA_MODEL ?? 'sora-2-pro';
const SIZE = process.env.SORA_SIZE ?? '1024x1792';

const SCENE = `Vertical selfie-style video, handheld phone camera, shallow depth of field.
A friendly, confident man in his late 20s wearing a dark grey hoodie sits in a dim home office at night.
Behind him, two monitors show green and red candlestick trading charts; cool blue ambient light, subtle green glow from the screens.
He looks straight into the camera, raises his eyebrows slightly on the question, then smiles and nods on the answer.
Natural lip movement, clear studio-quality voice, no background music, no on-screen text, no logos.`;

const LINES = {
  en: `He says in English, energetic and clear: "Still guessing the market? Let AI do the analysis."`,
  es: `He says in Spanish with a neutral Latin American accent, energetic and clear: "¿Sigues adivinando el mercado? Deja que la IA analice por ti."`,
};

async function api(path, init = {}) {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res;
}

async function generate(lang) {
  const job = await (await api('/videos', { method: 'POST', body: JSON.stringify({ model: MODEL, prompt: `${SCENE}\n${LINES[lang]}`, size: SIZE, seconds: '4' }) })).json();
  console.log(`[${lang}] job ${job.id} ${job.status}`);
  let v = job;
  while (v.status === 'queued' || v.status === 'in_progress') {
    await new Promise((r) => setTimeout(r, 10_000));
    v = await (await api(`/videos/${job.id}`)).json();
    console.log(`[${lang}] ${v.status} ${v.progress ?? ''}%`);
  }
  if (v.status !== 'completed') throw new Error(`[${lang}] ${v.status}: ${JSON.stringify(v.error ?? v)}`);
  const mp4 = Buffer.from(await (await api(`/videos/${job.id}/content`)).arrayBuffer());
  const out = join(import.meta.dirname, '..', 'public', `intro-${lang}.mp4`);
  await writeFile(out, mp4);
  console.log(`[${lang}] saved ${out} (${(mp4.length / 1e6).toFixed(1)} MB)`);
}

const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'es'];
await Promise.all(langs.map(generate));
