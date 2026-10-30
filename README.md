# Good Karma Magic — gkmsite

Static marketing site for Good Karma Magic (FCTCard), a Berkeley buyer of Magic: The
Gathering collections. Plain HTML/CSS, no build step, deployed on Cloudflare Pages with
one Pages Function for the Sell and Contact forms.

## Deploying

Cloudflare Pages builds straight from this repo — no build command, no output directory
(publish directory `/`). Push to `main` and the deployment goes live.

The live production URL is <https://gkmsite.pages.dev>.

> **Note:** `www.goodkarmamagic.com` currently resolves to a *different* application
> (a Grav CMS site), not this repo. If this site is meant to own that domain, the custom
> domain needs repointing in the Pages project — until then the pages here are only
> reachable on the `pages.dev` hostname.

## The email form

Both forms POST to `/api/contact`, which is `functions/api/contact.js`. It forwards the
submission to the owner's inbox using [Resend](https://resend.com).

### Configuration (this is what makes the form work)

Set these in the Pages project under **Settings → Environment variables** for the
**Production** environment, then redeploy:

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Resend API key (`re_...`). |
| `FORM_RECIPIENT` | yes | Inbox that receives submissions. |
| `FORM_FROM` | no | Sender address. **The domain in it must be verified in Resend.** |
| `FORM_FALLBACK_EMAIL` | no | Shown to users on failure. Defaults to `web@goodkarmamagic.com`. |

### Why the form was returning "send failed"

The Function was running and its env vars were set — but every send to Resend was being
rejected. The overwhelmingly common cause is an **unverified sending domain**: Resend
refuses any `from` address on a domain that hasn't had DNS records (SPF + DKIM) added and
verified in the Resend dashboard. Until that is done, either:

1. Leave `FORM_FROM` **unset** so it falls back to `onboarding@resend.dev`. Resend's test
   sender only delivers to the email address that owns the Resend account, which is fine
   for verifying the form works end to end.
2. Or verify `goodkarmamagic.com` in Resend (Domains → Add Domain → add the DNS records),
   then set `FORM_FROM="Good Karma Magic <notifications@goodkarmamagic.com>"`.

Note that the `from` domain is independent of the custom domain question above — Resend
verification is DNS-based and works regardless of which hostname serves the site.

### Error codes

On failure the Function redirects back to the form with `?error=<code>`, and
`js/forms.js` turns that into a plain-English banner. The code is also in the JSON body
for programmatic clients.

| Code | Meaning |
| --- | --- |
| `not_configured` | `RESEND_API_KEY` or `FORM_RECIPIENT` missing in the environment. |
| `missing_fields` | Name, valid email, or message/notes absent. |
| `bad_attachment` | Photo over 4 MB, more than 10 MB total, or not an image. |
| `resend_auth` | Resend rejected the API key (401). |
| `resend_domain` | Sending domain not verified (403/422). |
| `resend_rate` | Rate limited (429). |
| `timeout` | Resend didn't answer within 10s. |
| `send_failed` | Anything else. |

Every branch also logs a specific reason to `console.error`, visible in
**Pages → Deployments → Functions → Real-time logs** in the Cloudflare dashboard. Check
there first when diagnosing a live failure.

### Spam protection

There is a honeypot field (`website`) that bots fill and humans never see. Submissions
with it filled are silently discarded with a fake success. There is no CAPTCHA and no
rate limiting — if the form starts attracting real spam, a Cloudflare Turnstile widget is
the natural next step.

## Layout

```
index.html            Home
sell.html             Appraisal form
how-it-works.html     Process + sample report
charity.html          Computer Technologies Program partnership
about.html            About / FCTCard
contact.html          Contact form
404.html              Not-found page
css/style.css         All styles
js/forms.js           Shared form banners + validation
functions/api/contact.js   Form POST handler (Pages Function)
_headers              Security + cache headers
robots.txt            Crawler rules
favicon.svg           Site icon
screenshots/          Reference screenshots (used for og:image)
```

## Local checks

```bash
node _test-pages.mjs     # markup, links, CSP-safety across all pages
node _test-contact.mjs   # 27 cases against the Pages Function
node _test-forms.mjs     # 16 cases against js/forms.js
```

These import the Function and the script directly — no Wrangler or browser needed.

## Known gaps

- Donation total (`$1,691.06`, "as of September 2026") is hardcoded in three places:
  `index.html` (twice) and `charity.html`. Update all three together.
- Unknown paths return `index.html` with HTTP 200 on the `pages.dev` project, which is
  why `404.html` may not be served. Check the Pages project's 404 behaviour if that
  matters; the file is here and correct.
- No analytics, no cookie banner (and none needed — the site sets no cookies).
