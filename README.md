# Good Karma Magic — website

Static marketing site for Good Karma Magic (FCTCard), Berkeley CA.
Served by **Cloudflare Pages** from this repository: https://gkmsite.pages.dev

## Structure

- `*.html` — the five pages plus homepage. Plain HTML, no build step.
- `css/style.css` — all styling (design tokens in `:root`).
- `functions/api/contact.js` — Cloudflare Pages Function: handles the Sell/Contact
  form POSTs and emails them via Resend. Requires env vars in the Pages project
  settings: `RESEND_API_KEY`, `FORM_RECIPIENT`, optional `FORM_FROM`.
- `data/site.json` — the donation total + period shown on the site.
- `media/` — images uploaded through the CMS.

## Editing the site (no coding needed)

This repo is wired for [Pages CMS](https://pagescms.org):

1. Go to <https://app.pagescms.org> and sign in with GitHub.
2. Open the `nw606/GKMsite` repository.
3. Edit content through the forms it generates from `.pages.yml`:
   - **Site settings** — the donation total and "as of" period.
   - **Pages (HTML)** — direct code editing of each page.
   - **Stylesheet (CSS)** — the site's styles.
4. Save → Pages CMS commits to `main` → Cloudflare Pages redeploys automatically.

### Updating the donation number

Set the new value in **Site settings** (CMS) or edit `data/site.json` directly
and commit. A GitHub Action (`.github/workflows/update-site.yml`) then
substitutes it into `index.html` and `charity.html` between the
`<!--donation-total-start/end-->` and `<!--donation-asof-start/end-->` marker
comments, commits the result, and the site redeploys. You can also trigger it
manually from the CMS "Apply donation update" action button or the repo's
Actions tab.

## Local development

Any static server works:

```sh
npx wrangler pages dev .   # includes the /api/contact function
```

Deploying is automatic on push to `main` (Cloudflare Pages Git integration).
