// Structural + consistency checks across all pages.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const WS = path.resolve(import.meta.dirname, '..');
const PAGES = ['index.html', 'sell.html', 'contact.html', 'charity.html', 'about.html', 'how-it-works.html', '404.html'];

let fails = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  [' + detail + ']' : ''}`);
};

// Resolve a site-relative href to a real file on disk.
function resolves(href) {
  const clean = href.replace(/^\//, '').split('?')[0];
  if (clean === '' || clean === '.') return existsSync(`${WS}/index.html`);
  const candidates = [clean, clean + '.html', clean + '/index.html'];
  return candidates.some((c) => {
    try {
      return statSync(`${WS}/${c}`).isFile();
    } catch {
      return false;
    }
  });
}

for (const p of PAGES) {
  const html = readFileSync(`${WS}/${p}`, 'utf8');
  console.log(`\n--- ${p} ---`);
  ok(html.includes('<main id="main">'), 'has <main id="main">');
  ok(/class="skip-link" href="#main"/.test(html), 'has skip link');
  ok(html.includes('rel="icon"'), 'has favicon');
  ok(!/onclick=/.test(html), 'no inline event handlers (CSP-safe)');

  // Inline scripts break script-src 'self' — but JSON-LD is data, not script,
  // and CSP does not block application/ld+json.
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    (m) => !/application\/ld\+json/i.test(m[1])
  );
  ok(inlineScripts.length === 0, 'no executable inline <script>', `found ${inlineScripts.length}`);

  const opens = (html.match(/<div\b/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  ok(opens === closes, 'div tags balanced', `${opens}/${closes}`);
  ok(html.trim().endsWith('</html>'), 'ends with </html>');

  if (p !== '404.html') {
    ok(html.includes('rel="canonical"'), 'has canonical');
    ok(html.includes('og:title'), 'has og:title');
  }
}

console.log('\n--- link integrity ---');
for (const p of PAGES) {
  const html = readFileSync(`${WS}/${p}`, 'utf8');
  const hrefs = [...html.matchAll(/href="([^"#:]+)(?:#[^"]*)?"/g)].map((m) => m[1]);
  for (const href of [...new Set(hrefs)]) {
    if (/^(https?|mailto|tel)/.test(href) || href === '') continue;
    ok(resolves(href), `${p}: ${href}`);
  }
}

console.log('\n--- form wiring ---');
for (const p of ['sell.html', 'contact.html']) {
  const html = readFileSync(`${WS}/${p}`, 'utf8');
  ok(html.includes('js/forms.js'), `${p} loads js/forms.js`);
  ok(html.includes('id="form-banner"'), `${p} has #form-banner`);
  ok(/action="\/api\/contact"/.test(html), `${p} posts to /api/contact`);
  ok(html.includes('name="website"'), `${p} keeps honeypot`);
}

console.log('\n--- supporting files ---');
for (const f of ['404.html', 'robots.txt', 'favicon.svg', '_headers', 'js/forms.js', 'css/style.css']) {
  ok(existsSync(`${WS}/${f}`), `exists: ${f}`);
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`);
process.exit(fails ? 1 : 0);
