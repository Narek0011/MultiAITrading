// Generates the voiceover lines with OpenAI text-to-speech, one file per scene.
// Usage: OPENAI_API_KEY=… node scripts/make-voice.mjs es [en]
// Lines come from `voice` in src/copy.ts. The key is read from the environment only.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) throw new Error('Set OPENAI_API_KEY');
const VOICE = process.env.TTS_VOICE ?? 'ash';

const STYLE = {
  es: 'Speak in Spanish with a neutral Latin American accent. Young, confident, friendly male trader talking to camera in a social media ad. Energetic, brisk pace, warm and clear, no pauses inside the sentence.',
  en: 'Young, confident, friendly male trader talking to camera in a social media ad. Energetic, brisk pace, warm and clear, natural American English.',
};

// Pull the `voice` arrays out of copy.ts without a TS toolchain.
const src = await readFile(join(import.meta.dirname, '..', 'src', 'copy.ts'), 'utf8');
const linesFor = (lang) => {
  const block = src.slice(src.indexOf(`  ${lang}: {`));
  const voice = block.slice(block.indexOf('voice: ['), block.indexOf('],', block.indexOf('voice: [')));
  return [...voice.matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

for (const lang of process.argv.slice(2).length ? process.argv.slice(2) : ['es']) {
  const lines = linesFor(lang);
  await Promise.all(
    lines.map(async (input, i) => {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOICE, input, instructions: STYLE[lang], response_format: 'wav' }),
      });
      if (!res.ok) throw new Error(`[${lang} ${i + 1}] HTTP ${res.status} ${await res.text()}`);
      const out = join(import.meta.dirname, '..', 'public', `vo-${lang}-${i + 1}.wav`);
      await writeFile(out, Buffer.from(await res.arrayBuffer()));
      console.log(`[${lang} ${i + 1}] ${input}`);
    }),
  );
}
