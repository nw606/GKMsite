import fs from 'node:fs';
const posts=JSON.parse(fs.readFileSync('/tmp/insights-posts.json','utf8'));
const sellers=fs.readFileSync('/tmp/sellers.html','utf8').match(/<main>([\s\S]*?)<\/main>/)[1].trim();
const base='/root/.openclaw/workspace/goodkarma-demo';
fs.mkdirSync(base+'/insights/post',{recursive:true});

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const slug = url => url.split('/').filter(Boolean).pop();
const link = p => 'post/'+slug(p.url)+'.html';        // index page (insights/ root)
const linkUp = p => slug(p.url)+'.html';               // sibling post in post/

function linkify(body){
  const chans=['Joel are Magic','Leumas Card Craze','MTG Metrics','Card N All Gaming','AnonTCG',
    "Frank's Hobbies",'eugigamez','EugiGamez','Final Trade','Leumas','TCG Bulk Kings','Alpha Investments'];
  const chansRe=chans.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');

  // Pattern A: <li> entries — capture following sentence, strip channel lead
  body = body.replace(
    new RegExp('<strong>([^<]+)</strong>\\s*\\(([^)]*)\\)\\s*-\\s*(https?://[^\\s]+)\\s*-\\s*(('+chansRe+")'?s?)\\s+",'g'),
    (m,title,chan,url)=>`<a href="${url}"><strong>${title}</strong></a> (${chan}) - `);
  // Any remaining A-form without channel lead at sentence start
  body = body.replace(/<strong>([^<]+)<\/strong>\s*\(([^)]*)\)\s*-\s*(https?:\/\/[^\s]+)\s*-\s*/g,
    (m,title,chan,url)=>`<a href="${url}"><strong>${title}</strong></a> (${chan}) - `);

  // Pattern B: plain lines (Oct 27), with channel-lead strip
  body = body.replace(
    new RegExp('^\\s*(?!\\s*<)([A-Z][^<\\n]*?)\\s*\\(([^)]*)\\)\\s*-\\s*(https?://[^\\s]+)\\s*-\\s*(('+chansRe+")'?s?)\\s+",'gm'),
    (m,title,chan,url)=>`<a href="${url}">${title}</a> (${chan}) - `);
  body = body.replace(/^\s*(?!\s*<)([A-Z][^<\n]*?)\s*\(([^)]*)\)\s*-\s*(https?:\/\/[^\s]+)\s*-\s*/gm,
    (m,title,chan,url)=>`<a href="${url}">${title}</a> (${chan}) - `);

  // Pattern C: Source lines
  body = body.replace(/(Source:\s*[^,<]+,\s*)"?([^"<]+)"?\s+(https?:\/\/[^\s<]+)/g,
    (m,pre,title,url) => `${pre}<a href="${url}">${title.trim()}</a>`);
  return body;
}

const head = (title, desc, cssPath) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="stylesheet" href="${cssPath}">
<link rel="alternate" type="application/rss+xml" title="Good Karma Magic RSS" href="https://goodkarmamagic.com/insights/feed/rss">
</head>
<body>`;

const header = (root, current) => `
<header class="blog-header">
  <div class="wrap header-inner">
    <a class="blog-brand" href="${root}insights/index.html">GKM <span>Insights</span></a>
    <nav class="blog-nav" aria-label="Main site">
      <a href="${root}sell.html">Sell your cards</a>
      <a href="${root}about.html">About</a>
      <a href="${root}contact.html">Contact</a>
    </nav>
  </div>
</header>

<div class="backstrip">
  <div class="wrap">
    <p><a href="${root}index.html">&larr; Back to the main site</a></p>
  </div>
</div>`;

const sidebar = root => `
    <aside class="sidebar" aria-label="Blog sidebar">
      <nav class="side-box" aria-label="Blog navigation">
        <h2>Insights</h2>
        <ul>
          <li><a href="${root}insights/index.html">All posts</a></li>
          <li><a href="${root}insights/verified-sellers.html">Verified sellers</a></li>
          <li><a href="https://goodkarmamagic.com/insights/feed/rss">RSS feed</a></li>
        </ul>
      </nav>
      <nav class="side-box" aria-label="Main site">
        <h2>Good Karma Magic</h2>
        <ul>
          <li><a href="${root}sell.html">Sell your cards</a></li>
          <li><a href="${root}how-it-works.html">How it works</a></li>
          <li><a href="${root}how-it-works.html#sample-report">Sample appraisal report</a></li>
          <li><a href="${root}charity.html">Charity partnership</a></li>
          <li><a href="${root}contact.html">Contact</a></li>
        </ul>
      </nav>
      <div class="side-box side-cta">
        <h2>Selling a collection?</h2>
        <p>We buy MTG collections of any size &mdash; no sorting needed. Fair cash offer, and a share supports our charity partner.</p>
        <p><a class="btn btn-primary" href="${root}sell.html">Start your appraisal</a></p>
      </div>
    </aside>`;

const footer = root => `
<footer class="blog-footer">
  <div class="wrap">
    <p><strong>GKM Insights</strong> &mdash; the Good Karma Magic blog.</p>
    <p>Ready to sell? <a href="${root}sell.html">Start your appraisal</a> on the main site &mdash; fair cash offers, no sorting needed, and a share of every sale supports the <a href="https://www.ctpberk.org/" rel="noopener">Computer Technologies Program</a>.</p>
    <p class="legal"><a href="${root}privacy.html">Privacy policy</a> &middot; <a href="${root}terms.html">Terms of service</a></p>
    <p class="fineprint">Good Karma Magic is an independent buyer and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast LLC. Magic: The Gathering is a trademark of Wizards of the Coast.</p>
  </div>
</footer>
</body>
</html>
`;

// ---- index page (summary cards) ----
const excerpt=(body,max)=>{
  const firstP=body.match(/<p>([\s\S]*?)<\/p>/);
  let sum=firstP?firstP[1]:'';
  sum=sum.replace(/<[^>]+>/g,'').trim();
  if(sum.length>max) sum=sum.slice(0,max-3).replace(/\s+\S*$/,'')+'&hellip;';
  return sum;
};
// <!--ITEMS_TAG--> resolves after map so both branches always use the complete titles array —
// never compute count from titles.slice(0,3).length (silently wrong for 4-5 item lists)
const buildSummary=(p)=>{
  if(p.tags.includes('reading-list')){
    let titles=[...p.body.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(m=>m[1]);
    if(!titles.length) titles=[...p.body.matchAll(/^([A-Z][^<\n]*?)\s*\([^)]*\)\s*-\s*https?:\/\//gm)].map(m=>m[1].trim());
    if(!titles.length) titles=[...p.body.matchAll(/<li><a href=\"[^\"]+\">([^<]+)<\/a>/g)].map(m=>m[1]);
    if(!titles.length) return excerpt(p.body,240);
    let list=titles.slice(0,3).map(t=>'&ldquo;'+esc(t)+'&rdquo;').join(', ');
    const more=titles.length-3;
    return 'Today\'s picks: '+list+'<!--ITEMS_TAG-->.';
  }
  return excerpt(p.body,240);
};
const summaries = posts.map(p=>{
  const body=linkify(p.body);
  const sum=buildSummary(p).replace('<!--ITEMS_TAG-->',(m)=>{
    const titles=[...p.body.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(x=>x[1]);
    const n=titles.length;
    if(n<=3) return '';
    if(n<=5) return ', '+titles.slice(3).map(t=>'&ldquo;'+esc(t)+'&rdquo;').join(', ');
    return ' &mdash; and '+(n-3)+' more';
  });
  const tags=p.tags.map(t=>`<a class="tag" href="https://goodkarmamagic.com/insights/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('\n          ');
  return `      <article class="post-card">
        <time class="post-date">${esc(p.date)}</time>
        <h2><a href="${link(p)}">${esc(p.title)}</a></h2>
        <div class="post-tags">
          ${tags}
        </div>
        <p class="post-summary">${sum}</p>
        <p class="read-more"><a href="${link(p)}">Read the full post &rarr;</a></p>
      </article>`;
}).join('\n\n');

const indexHtml = head('Insights — Good Karma Magic Blog','Insights, updates, and market notes from Good Karma Magic — daily reading lists, buy/skip takes, and advice for Magic: The Gathering sellers.','../css/blog.css')
+ header('../','posts') + `
<main class="wrap layout">
  <div class="content">
    <div class="blog-hero">
      <h1>Insights <a class="rss-badge" href="https://goodkarmamagic.com/insights/feed/rss" title="RSS feed">RSS</a></h1>
      <p class="lede">Insights, updates, and market notes from Good Karma Magic.</p>
    </div>
    <div class="posts">
${summaries}
    </div>
  </div>
${sidebar('../')}
</main>
` + footer('../');
fs.writeFileSync(base+'/insights/index.html',indexHtml);

// ---- per-post pages ----
for(const p of posts){
  const body=linkify(p.body);
  const tags=p.tags.map(t=>`<a class="tag" href="https://goodkarmamagic.com/insights/tag/${encodeURIComponent(t)}">${esc(t)}</a>`).join('\n          ');
  const html = head(p.title+' — GKM Insights', p.title, '../../css/blog.css')
  + header('../../','posts') + `
<main class="wrap layout">
  <div class="content">
    <article class="post">
      <header class="post-head">
        <p class="crumbs"><a href="../index.html">&larr; All posts</a></p>
        <time class="post-date">${esc(p.date)}</time>
        <h1>${esc(p.title)}</h1>
        <div class="post-tags">
          ${tags}
        </div>
      </header>
      <div class="post-body">
${body}
      </div>
    </article>
  </div>
${sidebar('../../')}
</main>
` + footer('../../');
  fs.writeFileSync(base+'/insights/post/'+slug(p.url)+'.html', html);
}

// ---- verified sellers page ----
const sellersHtml = head('Verified Sellers — GKM Insights','Sellers and stores we trust for sealed Magic product — rechecked periodically.','../css/blog.css')
+ header('../','sellers') + `
<main class="wrap layout">
  <div class="content">
    <div class="blog-hero">
      <h1>Verified sellers</h1>
    </div>
    <div class="post-body sellers-list">
${sellers
  .replace('<h1>Verified Sellers</h1>','')
  .replace(/class="intro"/g,'class="sellers-intro"')
  .trim()}
    </div>
  </div>
${sidebar('../')}
</main>
` + footer('../');
fs.writeFileSync(base+'/insights/verified-sellers.html',sellersHtml);

// ---- verify ----
let bad=0;
const allFiles=['insights/index.html','insights/verified-sellers.html',...posts.map(p=>'insights/post/'+slug(p.url)+'.html')];
for(const f of allFiles){
  const t=fs.readFileSync(base+'/'+f,'utf8');
  const bare=[...t.matchAll(/(?<!href=")https?:\/\/[^\s"'<]+/g)].map(m=>m[0])
    .filter(u=>!u.startsWith('https://goodkarmamagic.com')&&!u.startsWith('https://www.ctpberk.org')&&!u.startsWith('https://tcgbf.'));
  if(bare.length){ console.log('BARE in',f,bare.slice(0,3)); bad++; }
}
// dedupe check: channel name should never appear twice inside one li
const idx=fs.readFileSync(base+'/insights/index.html','utf8');
const postFiles=posts.map(p=>'insights/post/'+slug(p.url)+'.html');
for(const f of ['insights/index.html']) {} // index has summaries only
for(const f of postFiles.map(x=>base+'/'+x)){
  const t=fs.readFileSync(f,'utf8');
  const lis=[...t.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>m[1]);
  for(const li of lis){
    const m=li.match(/\(([^)]+)\)<\/a>? *\(([^)]+)\)|\((\w[^)]*)\) - (\w)/);
  }
  // simple: check "(X) - X " duplication gone
  for(const c of ['Joel are Magic','Leumas Card Craze','MTG Metrics','Card N All Gaming','AnonTCG',"Frank's Hobbies",'eugigamez','EugiGamez','Final Trade']){
    if(t.includes(`(${c}) - ${c} `)){ console.log('DUPE in',f.split('/').pop(),'->',c); bad++; }
  }
}
console.log('files written:',allFiles.length,'| problems:',bad);
