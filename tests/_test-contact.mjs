// Harness: import the Cloudflare Pages Function directly and exercise it.
import { pathToFileURL } from 'node:url';

import path from 'node:path';

const FN = path.resolve(import.meta.dirname, '..', 'functions/api/contact.js');

let calls = [];
let resendReply = { ok: true, status: 200, text: '{}' };
let hang = false;

globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), opts });
  if (hang) {
    // Mirrors real fetch: honour the abort signal the handler passes in.
    return new Promise((_res, rej) => {
      const sig = opts?.signal;
      const fail = () => {
        const e = new Error('The operation was aborted due to timeout');
        e.name = 'TimeoutError';
        rej(e);
      };
      if (sig?.aborted) return fail();
      sig?.addEventListener('abort', fail, { once: true });
    });
  }
  return {
    ok: resendReply.ok,
    status: resendReply.status,
    text: async () => resendReply.text,
  };
};

const realError = console.error;
const errs = [];
console.error = (...a) => errs.push(a.join(' '));
const { onRequestPost } = await import(pathToFileURL(FN).href);

const ENV = { RESEND_API_KEY: 're_test', FORM_RECIPIENT: 'me@example.com' };
const results = [];
const rec = (name, pass, detail = '') => results.push({ name, pass, detail });

async function call(fields, { accept, env = ENV } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  const request = new Request('https://goodkarmamagic.com/api/contact', {
    method: 'POST',
    body: fd,
    headers: accept ? { accept } : {},
  });
  const res = await onRequestPost({ request, env });
  return { status: res.status, location: res.headers.get('location') || '', text: await res.text() };
}

const sent = () => JSON.parse(calls.at(-1).opts.body);
const code = (loc) => (loc.match(/error=([^&]+)/) || [])[1];
const reset = () => {
  calls = [];
  errs.length = 0;
  resendReply = { ok: true, status: 200, text: '{}' };
  hang = false;
};

// --- happy paths -----------------------------------------------------------
reset();
let r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'two binders' });
rec('sell happy path', r.status === 303 && r.location.endsWith('/sell.html?sent=1'), `${r.status}`);
rec('resend called once', calls.length === 1, `${calls.length}`);

reset();
r = await call({ page: 'contact', name: 'Alex', email: 'a@b.com', message: 'hello' });
rec('contact happy path', r.location.endsWith('/contact.html?sent=1'), r.location);

// --- validation ------------------------------------------------------------
reset();
r = await call({ page: 'contact', name: 'Alex', email: 'a@b.com' });
rec('missing message -> missing_fields', code(r.location) === 'missing_fields', r.location);

reset();
r = await call({ page: 'sell', name: 'Alex', email: 'not-an-email', notes: 'x' });
rec('bad email -> missing_fields', code(r.location) === 'missing_fields', r.location);

reset();
r = await call({ page: 'sell', name: '', email: 'a@b.com', notes: 'x' });
rec('empty name -> missing_fields', code(r.location) === 'missing_fields', r.location);

// --- honeypot --------------------------------------------------------------
reset();
r = await call({ page: 'sell', name: 'Bot', email: 'b@b.com', notes: 'x', website: 'http://spam' });
rec('honeypot fakes success', r.location.includes('sent=1') && calls.length === 0, `calls=${calls.length}`);

// --- config / upstream failures -------------------------------------------
reset();
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' }, { env: {} });
rec('unconfigured -> not_configured', code(r.location) === 'not_configured', r.location);
rec('unconfigured logs reason', errs.some((e) => /RESEND_API_KEY/.test(e)));

reset();
resendReply = { ok: false, status: 401, text: '{"message":"API key is invalid"}' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
rec('401 -> resend_auth', code(r.location) === 'resend_auth', r.location);

reset();
resendReply = { ok: false, status: 403, text: '{"message":"The domain is not verified"}' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
rec('403 -> resend_domain', code(r.location) === 'resend_domain', r.location);

reset();
resendReply = { ok: false, status: 422, text: '{"message":"The goodkarmamagic.com domain is not verified. Please verify the domain before sending."}' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
rec('422 domain -> resend_domain', code(r.location) === 'resend_domain', r.location);

reset();
resendReply = { ok: false, status: 429, text: '{"message":"Too many requests"}' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
rec('429 -> resend_rate', code(r.location) === 'resend_rate', r.location);

reset();
resendReply = { ok: false, status: 500, text: 'boom' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
rec('500 -> send_failed', code(r.location) === 'send_failed', r.location);

// --- timeout ---------------------------------------------------------------
reset();
hang = true;
// AbortSignal.timeout()'s timer is unref'd, so without something on the loop
// Node would exit mid-test instead of waiting out the handler's 10s timeout.
const keepAlive = setInterval(() => {}, 500);
const t0 = Date.now();
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' });
const elapsed = Date.now() - t0;
clearInterval(keepAlive);
rec('hang -> timeout code', code(r.location) === 'timeout', `${r.location} after ${elapsed}ms`);
rec('timeout fires near 10s', elapsed > 9000 && elapsed < 13000, `${elapsed}ms`);

// --- header injection ------------------------------------------------------
reset();
r = await call({ page: 'sell', name: 'Alex\r\nBcc: evil@x.com', email: 'a@b.com', notes: 'x' });
const subj = sent().subject;
rec('CRLF stripped from subject', !/[\r\n]/.test(subj), JSON.stringify(subj));
rec('subject keeps text', /Alex/.test(subj) && /evil@x\.com/.test(subj), JSON.stringify(subj));

reset();
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com\r\nBcc: evil@x.com', notes: 'x' });
rec('CRLF in email rejected', code(r.location) === 'missing_fields', r.location);

// --- attachments -----------------------------------------------------------
reset();
const oneMB = new Uint8Array(1024 * 1024);
for (let i = 0; i < oneMB.length; i++) oneMB[i] = i & 0xff;
r = await call({
  page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'photos',
  photos: [new File([oneMB], 'card.png', { type: 'image/png' })],
});
const got = Buffer.from(sent().attachments?.[0]?.content ?? '', 'base64');
rec('1MB attachment byte-identical', Buffer.from(oneMB).equals(got), `len=${got.length}`);

reset();
r = await call({
  page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'p',
  photos: [
    new File([new Uint8Array(100)], 'a.png', { type: 'image/png' }),
    new File([new Uint8Array(100)], 'b.png', { type: 'image/png' }),
  ],
});
rec('two attachments kept', sent().attachments?.length === 2, `${sent().attachments?.length}`);

reset();
r = await call({
  page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'big',
  photos: [new File([new Uint8Array(5 * 1024 * 1024)], 'big.png', { type: 'image/png' })],
});
rec('5MB photo -> bad_attachment', code(r.location) === 'bad_attachment', r.location);
rec('5MB photo not sent', calls.length === 0, `${calls.length}`);

reset();
r = await call({
  page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'exe',
  photos: [new File([new Uint8Array(10)], 'virus.exe', { type: 'application/x-msdownload' })],
});
rec('non-image type -> bad_attachment', code(r.location) === 'bad_attachment', r.location);

// --- JSON clients ----------------------------------------------------------
reset();
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' }, { accept: 'application/json' });
rec('json success -> 200 ok', r.status === 200 && JSON.parse(r.text).ok === true, r.text);

reset();
resendReply = { ok: false, status: 500, text: 'x' };
r = await call({ page: 'sell', name: 'Alex', email: 'a@b.com', notes: 'x' }, { accept: 'application/json' });
const jbody = JSON.parse(r.text);
rec('json failure -> code in body', r.status === 500 && jbody.error === 'send_failed', r.text);

// --- field truncation ------------------------------------------------------
reset();
r = await call({ page: 'sell', name: 'A'.repeat(500), email: 'a@b.com', notes: 'x' });
rec('long name truncated to 120', sent().subject.includes('A'.repeat(120)) && !sent().subject.includes('A'.repeat(121)), `len=${sent().name ?? ''}`);

console.error = realError;

for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? '  [' + t.detail + ']' : ''}`);
const passed = results.filter((t) => t.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
