import { fillVars, formatUpdated, renderLegal } from './legal-format';
import { LEGAL_DEFAULTS } from './legal-texts';

const vars = { company: 'MultiAI Trading', email: 'help@multiai.com', support: 'https://t.me/support', site: 'https://multiaitrading.com', updated: 'October 2026' };

describe('legal pages', () => {
  it('renders title, headings, lists, paragraphs, bold and links', () => {
    const { title, html } = renderLegal('# Terms\n\nIntro line one\nline two\n\n## 1. Rules\n- **No** spam\n- see https://example.com/x.\n\nWrite to {email}.', vars);
    expect(title).toBe('Terms');
    expect(html).toBe(
      '<p>Intro line one<br>line two</p>\n<h2>1. Rules</h2>\n' +
        '<ul><li><b>No</b> spam</li><li>see <a href="https://example.com/x" target="_blank" rel="noopener">https://example.com/x</a>.</li></ul>\n' +
        '<p>Write to <a href="mailto:help@multiai.com">help@multiai.com</a>.</p>',
    );
  });

  it('escapes any markup the admin types', () => {
    const { html } = renderLegal('Hi <script>alert(1)</script> & "x"\n## <img src=x onerror=1>', vars);
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  });

  it('uses the support link when there is no email', () => {
    expect(fillVars('{email} / {support} / {company} / {site} / {updated} / {other}', { ...vars, email: '' })).toBe(
      'https://t.me/support / https://t.me/support / MultiAI Trading / https://multiaitrading.com / October 2026 / {other}',
    );
    expect(fillVars('{email}', { ...vars, email: '', support: '' })).toBe('https://multiaitrading.com');
  });

  it('shows the update date in the page language', () => {
    expect(formatUpdated('2026-10-27', 'en')).toBe('27 October 2026');
    expect(formatUpdated('2026-10-27', 'ru')).toMatch(/^27 октября 2026/);
    expect(formatUpdated('2026-10-27', 'es')).toBe('27 de octubre de 2026');
    expect(formatUpdated('Q4 2026', 'ru')).toBe('Q4 2026');
  });

  it('ships full default texts in every language with no unknown placeholders', () => {
    for (const [key, text] of Object.entries(LEGAL_DEFAULTS)) {
      const { title, html } = renderLegal(text, vars);
      expect(title).toBeTruthy();
      expect(html).not.toMatch(/\{\w+\}/);
      expect((html.match(/<h2>/g) ?? []).length).toBeGreaterThanOrEqual(10);
      expect(html).toContain('help@multiai.com');
      expect(key).toMatch(/^(terms|privacy)(En|Ru|Es)$/);
    }
  });
});
