/** Values filled into {placeholders} of the legal texts. */
export interface LegalVars {
  company: string;
  email: string;
  support: string;
  site: string;
  updated: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LOCALE: Record<string, string> = { en: 'en-GB', ru: 'ru-RU', es: 'es-ES' };

/** "2026-10-27" → "27 October 2026" / "27 октября 2026 г." / "27 de octubre de 2026"; other text is kept as typed. */
export function formatUpdated(value: string, lang: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString(LOCALE[lang] ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Contact shown for {email}: the email if set, otherwise the support link, otherwise the website. */
const contact = (v: LegalVars) => v.email || v.support || v.site;

export function fillVars(text: string, v: LegalVars) {
  const map: Record<string, string> = { company: v.company, email: contact(v), support: v.support || contact(v), site: v.site, updated: v.updated };
  return text.replace(/\{(company|email|support|site|updated)\}/g, (_, k: string) => map[k]);
}

/** Inline markup on already-escaped text: **bold**, links and emails. */
function inline(escaped: string) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, '$1<a href="mailto:$2">$2</a>');
}

/**
 * Renders the admin-editable legal text to safe HTML: "# Title" (first line, returned separately), "## Heading",
 * "- " bullets, blank line = new paragraph, **bold**, links. All text is escaped first, so no markup can be injected.
 */
export function renderLegal(text: string, vars: LegalVars): { title: string; html: string } {
  const lines = fillVars(text.replace(/\r\n?/g, '\n'), vars).split('\n');
  let title = '';
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(escapeHtml(l))).join('<br>')}</p>`);
    if (list.length) out.push(`<ul>${list.map((l) => `<li>${inline(escapeHtml(l))}</li>`).join('')}</ul>`);
    para = [];
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (/^#\s/.test(line) && !title && !out.length && !para.length) {
      title = line.slice(2).trim();
    } else if (/^##\s/.test(line)) {
      flush();
      out.push(`<h2>${inline(escapeHtml(line.replace(/^##\s+/, '')))}</h2>`);
    } else if (/^[-•]\s/.test(line)) {
      if (para.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return { title, html: out.join('\n') };
}
