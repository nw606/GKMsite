// Exercise js/forms.js against a minimal DOM stub — no jsdom needed.
// Verifies banner rendering per error code, URL cleanup, validation, and
// double-submit protection.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const SRC = readFileSync(path.resolve(import.meta.dirname, '..', 'js/forms.js'), 'utf8');

function makeEl(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    parentNode: null,
    _attrs: {},
    appendChild(c) {
      this.children.push(c);
      c.parentNode = this;
      return c;
    },
    setAttribute(k, v) {
      this._attrs[k] = String(v);
    },
    getAttribute(k) {
      return this._attrs[k] ?? null;
    },
    removeAttribute(k) {
      delete this._attrs[k];
    },
    querySelector(sel) {
      const cls = sel.replace(/^\./, '');
      return this.children.find((c) => (c.className || '').split(/\s+/).includes(cls)) || null;
    },
    querySelectorAll() {
      return [];
    },
    remove() {
      if (this.parentNode) {
        this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      }
    },
    focus() {
      this.focused = true;
    },
    scrollIntoView() {
      this.scrolled = true;
    },
    addEventListener() {},
    dataset: {},
  };
  return el;
}

const results = [];
const rec = (name, pass, detail = '') => results.push({ name, pass, detail });

function run({ search = '', formFields = null } = {}) {
  const banner = makeEl();
  banner._attrs.id = 'form-banner';

  // A fake form with optional fields
  const formEls = [];
  if (formFields) {
    for (const spec of formFields) {
      const inner = makeEl('div');
      const input = makeEl(spec.tag || 'input');
      input.type = spec.type || 'text';
      input.value = spec.value ?? '';
      input._attrs.id = spec.id;
      inner.appendChild(input);
      // prime error slot
      formEls.push(inner);
    }
  }
  const submitBtn = makeEl('button');
  submitBtn.textContent = 'Send';

  const form = makeEl('form');
  form._attrs.class = 'form-card';
  form.querySelectorAll = (sel) => {
    if (sel.includes('required')) {
      return formFields
        ? formEls.map((w) => w.children[0]).filter((i) => i.tagName === 'INPUT' || i.tagName === 'TEXTAREA')
        : [];
    }
    if (sel.includes('button')) return [submitBtn];
    return [];
  };
  form.querySelector = (sel) => {
    if (sel === 'button[type="submit"]') return submitBtn;
    const id = sel.replace(/^#/, '');
    if (formFields) {
      for (const w of formEls) if (w.children[0]._attrs.id === id) return w.children[0];
    }
    return null;
  };

  const listeners = {};
  form.addEventListener = (ev, fn) => {
    (listeners[ev] = listeners[ev] || []).push(fn);
  };

  const url = new URL('https://goodkarmamagic.com/sell.html' + search);
  let replacedUrl = null;
  let prevented = false;

  const doc = {
    readyState: 'complete',
    getElementById: (id) => (id === 'form-banner' ? banner : null),
    querySelectorAll: (sel) => (sel.includes('form-card') ? [form] : []),
    createElement: (t) => makeEl(t),
    addEventListener() {},
  };

  const ctx = {
    document: doc,
    window: {
      location: { search, pathname: url.pathname, hash: '' },
      history: {
        replaceState(_s, _t, u) {
          replacedUrl = u;
        },
      },
      setTimeout: () => 0,
    },
    URLSearchParams,
    console,
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  return { banner, form, listeners, get replacedUrl() { return replacedUrl; }, submitBtn, formEls, preventDefaultSet: () => prevented };
}

// --- banner rendering ------------------------------------------------------
for (const [code, expect] of [
  ['resend_domain', /web@goodkarmamagic\.com/],
  ['not_configured', /web@goodkarmamagic\.com/],
  ['timeout', /web@goodkarmamagic\.com/],
  ['bad_attachment', /4 MB/],
  ['resend_rate', /try again in a minute/i],
  ['missing_fields', /valid email/i],
  ['totally_unknown_code', /went wrong/i],
  ['error=1', /went wrong/i], // legacy code from the old handler
]) {
  const search = code.startsWith('error=') ? '?' + code : `?error=${code}`;
  const r = run({ search });
  const hasBanner = r.banner.children.length === 1;
  const text = r.banner.children[0]?.textContent || '';
  const cls = r.banner.children[0]?.className || '';
  rec(
    `banner for ${code}`,
    hasBanner && expect.test(text) && cls.includes('form-banner--error'),
    text.slice(0, 60)
  );
}

// success banner
{
  const r = run({ search: '?sent=1' });
  const c = r.banner.children[0];
  rec('success banner', !!c && /Thanks/.test(c.textContent) && c.className.includes('success'), c?.textContent.slice(0, 40));
}

// no query string -> no banner
{
  const r = run({ search: '' });
  rec('no banner without query', r.banner.children.length === 0, `${r.banner.children.length}`);
}

// URL cleaned after error
{
  const r = run({ search: '?error=resend_domain&keep=1' });
  rec('error removed from URL', r.replacedUrl === '/sell.html?keep=1', String(r.replacedUrl));
}

// --- validation ------------------------------------------------------------
{
  const r = run({
    search: '',
    formFields: [
      { id: 'name', value: 'Alex' },
      { id: 'email', value: 'not-an-email', type: 'email' },
      { id: 'notes', tag: 'textarea', value: 'stuff' },
    ],
  });
  const submit = r.listeners.submit[0];
  let prevented = false;
  submit({ preventDefault: () => (prevented = true) });
  const emailWrap = r.formEls[1];
  const err = emailWrap.querySelector('.field-error');
  rec('invalid email blocked', prevented && !!err, err?.textContent || 'no error');
  rec('invalid email focuses field', r.formEls[1].children[0].focused === true);
}

{
  const r = run({
    search: '',
    formFields: [
      { id: 'name', value: 'Alex' },
      { id: 'email', value: 'a@b.com', type: 'email' },
      { id: 'message', tag: 'textarea', value: 'hello there' },
    ],
  });
  let prevented = false;
  r.listeners.submit[0]({ preventDefault: () => (prevented = true) });
  rec('valid form allowed through', !prevented);
  rec('button disabled on submit', r.submitBtn.disabled === true && /Sending/.test(r.submitBtn.textContent), r.submitBtn.textContent);
}

{
  const r = run({
    search: '',
    formFields: [
      { id: 'name', value: '' },
      { id: 'email', value: 'a@b.com', type: 'email' },
      { id: 'message', tag: 'textarea', value: 'hi' },
    ],
  });
  let prevented = false;
  r.listeners.submit[0]({ preventDefault: () => (prevented = true) });
  rec('empty name blocked', prevented && !!r.formEls[0].querySelector('.field-error'));
}

for (const t of results) console.log(`${t.pass ? 'PASS' : 'FAIL'}  ${t.name}${t.detail ? '  [' + t.detail + ']' : ''}`);
const passed = results.filter((t) => t.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
