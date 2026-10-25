const MAX_PER_SOURCE = 4000;
const MAX_ITEMS = 12;

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // Feeds often escape their HTML, so unescape before stripping tags.
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tag = (xml: string, names: string[]) => {
  for (const n of names) {
    const m = new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, 'i').exec(xml);
    if (m) return decode(m[1]);
  }
  return '';
};

/** Headlines from an RSS or Atom document: "date — title: summary" per item. Empty if it isn't a feed. */
export function parseFeed(xml: string): string[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return items.slice(0, MAX_ITEMS).map((item) => {
    const title = tag(item, ['title']);
    const summary = tag(item, ['description', 'summary', 'content']).slice(0, 280);
    const date = tag(item, ['pubDate', 'published', 'updated', 'dc:date']);
    return [date, title && `${title}${summary ? `: ${summary}` : ''}`].filter(Boolean).join(' — ');
  });
}

/** Plain text of an HTML page or JSON payload, for the AI to pick the news from. */
export function toPlainText(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed)).slice(0, MAX_PER_SOURCE);
    } catch {
      /* not JSON after all */
    }
  }
  return decode(trimmed.replace(/<(script|style|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')).slice(0, MAX_PER_SOURCE);
}

export const parseSourceUrls = (value: string) =>
  value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\/\S+$/.test(s));

/** Fetches every source; failures are reported, not thrown. */
export async function collectSources(urls: string[]) {
  const texts: string[] = [];
  const errors: string[] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'Mozilla/5.0 (MultiAI news bot)' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        const feed = parseFeed(body);
        texts.push(`Source: ${url}\n${(feed.length ? feed.join('\n') : toPlainText(body)).slice(0, MAX_PER_SOURCE)}`);
      } catch (err: any) {
        errors.push(`${url}: ${err.message}`);
      }
    }),
  );
  return { text: texts.join('\n\n'), errors };
}
