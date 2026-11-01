// functions/api/contact.js — form handler for Good Karma Magic (Cloudflare Pages Function)
// Receives Sell / Contact form POSTs and forwards them as email via Resend.
// Required env vars (set in Pages project settings):
//   RESEND_API_KEY  — API key from resend.com
//   FORM_RECIPIENT  — where notifications go, e.g. you@yourdomain.com
//   FORM_FROM       — optional, e.g. "Good Karma Magic <notifications@goodkarmamagic.com>"
//                     (until the sending domain is verified in Resend, leave unset to
//                     use Resend's onboarding@resend.dev test sender)

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB per photo

function wantsJson(request) {
  return (request.headers.get('accept') || '').includes('application/json');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
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
  return Response.redirect(new URL(backPath(form, 'error=1'), request.url).href, 303);
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

  const name = (form.get('name') || '').toString().trim().slice(0, 120);
  const email = (form.get('email') || '').toString().trim().slice(0, 200);
  const message = (form.get('message') || '').toString().trim().slice(0, 5000);
  const notes = (form.get('notes') || '').toString().trim().slice(0, 5000);
  const size = (form.get('size') || '').toString().trim().slice(0, 120);
  const page = (form.get('page') || '').toString().slice(0, 40) || 'site';

  if (!name || !/.+@.+\..+/.test(email) || (!message && !notes)) {
    return fail(request, form, 'missing_fields', 400);
  }

  const apiKey = env.RESEND_API_KEY;
  const recipient = env.FORM_RECIPIENT;
  const from = env.FORM_FROM || 'Good Karma Magic <onboarding@resend.dev>';
  if (!apiKey || !recipient) {
    console.error('form handler not configured: missing RESEND_API_KEY or FORM_RECIPIENT');
    return fail(request, form, 'not_configured');
  }

  // Optional photo attachments, capped in count and size.
  const attachments = [];
  for (const [, value] of form.entries()) {
    if (attachments.length >= MAX_ATTACHMENTS) break;
    if (value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && value.size > 0) {
      if (value.size > MAX_ATTACHMENT_BYTES) continue;
      const buf = new Uint8Array(await value.arrayBuffer());
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < buf.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
      }
      attachments.push({
        filename: value.name || 'photo',
        content: btoa(binary),
        content_type: value.type || 'application/octet-stream',
      });
    }
  }

  const lines = [`New submission from the ${page} page`, '', `Name: ${name}`, `Email: ${email}`];
  if (size) lines.push(`Collection size: ${size}`);
  if (notes) lines.push('', 'Notes:', notes);
  if (message) lines.push('', 'Message:', message);
  if (attachments.length) lines.push('', `(${attachments.length} photo${attachments.length > 1 ? 's' : ''} attached)`);

  let sent = false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
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
    });
    sent = r.ok;
    if (!sent) console.error('resend send failed:', r.status, (await r.text()).slice(0, 300));
  } catch (e) {
    console.error('resend fetch error:', e && e.message);
  }

  return sent ? done(request, form) : fail(request, form, 'send_failed');
}
