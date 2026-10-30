// functions/api/contact.js — form handler for Good Karma Magic (Cloudflare Pages Function)
// Receives Sell / Contact form POSTs and forwards them as email via Resend.
//
// Required env vars (set in the Pages project: Settings → Environment variables):
//   RESEND_API_KEY  — API key from resend.com (starts with re_)
//   FORM_RECIPIENT  — where notifications go, e.g. web@goodkarmamagic.com
//   FORM_FROM       — optional sender, e.g. "Good Karma Magic <notifications@goodkarmamagic.com>"
//                     The domain in FORM_FROM MUST be verified in Resend, or every send
//                     will fail. Until then, leave unset to use Resend's onboarding@resend.dev
//                     test sender (which can only deliver to the Resend account owner's inbox).
//
// Optional:
//   FORM_FALLBACK_EMAIL — shown to users when sending fails (default web@goodkarmamagic.com)
//
// Error codes returned to the page as ?error=<code>, so the banner can say something useful:
//   not_configured | invalid_form | missing_fields | bad_attachment | resend_auth
//   resend_domain  | resend_rate  | send_failed | timeout

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB per photo
const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB combined
const RESEND_TIMEOUT_MS = 10_000;
const ALLOWED_IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif|heic|heif|avif)$/i;

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function backPath(form, suffix) {
  const page = form && form.get('page') === 'contact' ? 'contact' : 'sell';
  return `/${page}.html?${suffix}`;
}

function done(request, form) {
  if (wantsJson(request)) return json({ ok: true });
  return Response.redirect(new URL(backPath(form, 'sent=1'), request.url).href, 303);
}

function fail(request, form, code, status = 500) {
  if (wantsJson(request)) return json({ ok: false, error: code }, status);
  return Response.redirect(
    new URL(backPath(form, `error=${encodeURIComponent(code)}`), request.url).href,
    303
  );
}

// Collapse CR/LF and other control characters out of a single-line value.
// Without this, a name like "Alex\r\nBcc: victim@x.com" is interpolated straight
// into the Subject header and becomes a header-injection vector.
function oneLine(value, max) {
  return (value || '')
    .toString()
    .replace(/[\r\n\t\v\f\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Free-text body fields keep their newlines but drop other control characters.
function multiLine(value, max) {
  return (value || '')
    .toString()
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

const EMAIL_RE = /^[^\s@,;:<>()[\]\\]+@[^\s@,;:<>()[\]\\]+\.[a-z]{2,}$/i;

function base64FromBytes(buf) {
  // btoa() explodes on large strings; encode in chunks.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail(request, null, 'invalid_form', 400);
  }

  // Honeypot: humans never see the "website" field, bots fill it.
  if ((form.get('website') || '').toString().trim() !== '') {
    return done(request, form); // pretend success, send nothing
  }

  const name = oneLine(form.get('name'), 120);
  const email = oneLine(form.get('email'), 200);
  const size = oneLine(form.get('size'), 120);
  const message = multiLine(form.get('message'), 5000);
  const notes = multiLine(form.get('notes'), 5000);
  const page = oneLine(form.get('page'), 40) || 'site';

  if (!name || !EMAIL_RE.test(email) || (!message && !notes)) {
    return fail(request, form, 'missing_fields', 400);
  }

  const apiKey = env.RESEND_API_KEY;
  const recipient = env.FORM_RECIPIENT;
  const from = env.FORM_FROM || 'Good Karma Magic <onboarding@resend.dev>';
  if (!apiKey || !recipient) {
    console.error('contact: missing RESEND_API_KEY or FORM_RECIPIENT in the Pages environment.');
    return fail(request, form, 'not_configured');
  }

  // Optional photo attachments, capped in count, size and type.
  const attachments = [];
  let totalBytes = 0;
  for (const [, value] of form.entries()) {
    if (attachments.length >= MAX_ATTACHMENTS) break;
    if (!value || typeof value !== 'object' || typeof value.arrayBuffer !== 'function') continue;
    if (!value.size) continue;
    if (value.size > MAX_ATTACHMENT_BYTES) {
      return fail(request, form, 'bad_attachment', 413);
    }
    if (totalBytes + value.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      return fail(request, form, 'bad_attachment', 413);
    }
    if (value.type && !ALLOWED_IMAGE_TYPES.test(value.type)) {
      return fail(request, form, 'bad_attachment', 415);
    }
    const buf = new Uint8Array(await value.arrayBuffer());
    totalBytes += buf.length;
    attachments.push({
      filename: oneLine(value.name, 100) || 'photo',
      content: base64FromBytes(buf),
      content_type: value.type || 'application/octet-stream',
    });
  }

  const lines = [
    `New submission from the ${page} page`,
    '',
    `Name: ${name}`,
    `Email: ${email}`,
  ];
  if (size) lines.push(`Collection size: ${size}`);
  if (notes) lines.push('', 'Notes:', notes);
  if (message) lines.push('', 'Message:', message);
  if (attachments.length) {
    lines.push('', `(${attachments.length} photo${attachments.length > 1 ? 's' : ''} attached)`);
  }

  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: email,
        subject: `Card form: ${name}${size ? ' — ' + size : ''}`,
        text: lines.join('\n'),
        ...(attachments.length ? { attachments } : {}),
      }),
      // A hung upstream would otherwise burn the whole request budget and the
      // browser would show a network error instead of our friendly banner.
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
  } catch (e) {
    const aborted = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    console.error('contact: resend fetch failed:', aborted ? 'timeout' : e && e.message);
    return fail(request, form, aborted ? 'timeout' : 'send_failed', 504);
  }

  if (res.ok) return done(request, form);

  const detail = await res.text().catch(() => '');
  console.error('contact: resend rejected:', res.status, detail.slice(0, 500));

  // Translate Resend's own errors into codes the page can explain.
  let code = 'send_failed';
  if (res.status === 401) {
    code = 'resend_auth';
  } else if (res.status === 403) {
    code = 'resend_domain';
  } else if (res.status === 429) {
    code = 'resend_rate';
  } else if (res.status === 422 || res.status === 400) {
    // The most common 422/403 body here is "domain is not verified".
    code = /domain|verif|not allowed|from/i.test(detail) ? 'resend_domain' : 'send_failed';
  }

  return fail(request, form, code);
}
