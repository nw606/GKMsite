// Cross-check CSS: every class used in HTML exists in style.css, and every
// rule in style.css that targets a class is actually used somewhere.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WS = path.resolve(import.meta.dirname, '..');
const PAGES = ['index.html', 'sell.html', 'contact.html', 'charity.html', 'about.html', 'how-it-works.html', '404.html'];

const css = readFileSync(`${WS}/css/style.css`, 'utf8');
// Strip comments, then collect class selectors
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const defined = new Set();
for (const m of cssNoComments.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(m[1]);

const used = new Set();
for (const p of PAGES) {
  const html = readFileSync(`${WS}/${p}`, 'utf8');
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c));
  }
}

// Classes created at runtime by js/forms.js
const js = readFileSync(`${WS}/js/forms.js`, 'utf8');
for (const m of js.matchAll(/className\s*=\s*'([^']+)'/g)) {
  m[1].split(/\s+/).filter(Boolean).forEach((c) => used.add(c.replace(/'\s*\+\s*kind\s*\+\s*'/, '')));
}
const runtimeClasses = ['form-banner--success', 'form-banner--error', 'field-error', 'form-banner'];
runtimeClasses.forEach((c) => used.add(c));

const missing = [...used].filter((c) => !defined.has(c) && !c.startsWith('form-banner--') && c !== 'form-banner--' && c !== '');
const unused = [...defined].filter((c) => !used.has(c));

console.log('CSS classes used but NOT defined:');
console.log(missing.length ? '  ' + missing.join(', ') : '  (none)');
console.log('\nCSS classes defined but never used:');
console.log(unused.length ? '  ' + unused.join(', ') : '  (none)');

// Confirm the new rules landed
console.log('\n--- new rules present ---');
for (const sel of ['.form-banner p', '.form-banner--success', '.form-banner--error', '.field-error', '.skip-link', '.field-help', '.btn[disabled]']) {
  const present = cssNoComments.includes(sel.replace('.btn[disabled]', '.btn[disabled]'));
  console.log(`${present ? 'PASS' : 'FAIL'}  ${sel}`);
}

// LINE LENGTH: the CSS uses a max of one rule per line; flag accidental giant lines
const longest = cssNoComments.split('\n').reduce((a, l) => (l.length > a.length ? l : a), '');
console.log(`\nlongest CSS line: ${longest.length} chars`);

process.exit(missing.length === 0 ? 0 : 1);
