// Applies the donation total from data/site.json into index.html and charity.html.
// Values live between marker comments so this is safe to re-run any time:
//   <!--donation-total-start-->$1,691.06<!--donation-total-end-->
//   <!--donation-asof-start-->September 2026<!--donation-asof-end-->
import { readFile, writeFile } from 'node:fs/promises';

const site = JSON.parse(await readFile('data/site.json', 'utf8'));
if (!site.donation_total || !site.donation_asof) {
  console.error('data/site.json must contain donation_total and donation_asof');
  process.exit(1);
}

function swap(html, name, value) {
  const re = new RegExp(`(<!--${name}-start-->)[\\s\\S]*?(<!--${name}-end-->)`, 'g');
  // Function-form replacement so "$" in values like "$1,691.06" is never
  // interpreted as a capture-group reference.
  return html.replace(re, (_m, open, close) => `${open}${value}${close}`);
}

for (const file of ['index.html', 'charity.html']) {
  let html = await readFile(file, 'utf8');
  html = swap(html, 'donation-total', site.donation_total);
  html = swap(html, 'donation-asof', site.donation_asof);
  await writeFile(file, html);
}

console.log(`Updated donation to ${site.donation_total} (as of ${site.donation_asof})`);
