import { DICTIONARIES, LANG_NAMES, LANGS } from '.';
import { en } from './en';

/** Values the page code relies on (item ids, console sample levels), kept as they are in every language. */
const FIXED = new Set(['key', 'icon']);
const FIXED_SAMPLE = new Set(['pair', 'direction', 'entry', 'tp', 'sl']);

/** Arrays (with their lengths), placeholders, HTML tags and fixed values must match English; only the words change. */
function shape(value: unknown, path = ''): string[] {
  const name = path.split('.').pop()!;
  if (FIXED.has(name) || (FIXED_SAMPLE.has(name) && path.includes('.samples['))) return [`${path}=${String(value)}`];
  if (Array.isArray(value)) return [`${path}[${value.length}]`, ...value.flatMap((v, i) => shape(v, `${path}[${i}]`))];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => shape(v, `${path}.${k}`));
  if (typeof value === 'string') {
    const marks = [...value.matchAll(/\{\w+\}|<[^>]+>/g)].map((m) => m[0]).sort(); // word order may move tags
    return marks.length ? [`${path} ${marks.join(' ')}`] : [];
  }
  return [`${path}=${String(value)}`];
}

describe('landing dictionaries', () => {
  it('has a dictionary and a name for every language', () => {
    for (const lang of LANGS) {
      expect(DICTIONARIES[lang]).toBeDefined();
      expect(LANG_NAMES[lang]).toBeTruthy();
    }
  });

  it.each(LANGS)('%s keeps the structure of English', (lang) => {
    expect(shape(DICTIONARIES[lang])).toEqual(shape(en));
  });
});
