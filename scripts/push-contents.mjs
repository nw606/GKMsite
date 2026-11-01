// Push local files to GitHub via the Contents API.
// Usage (gateway host only — protected-store secret is auto-injected there):
//   GITHUB_PAT_GKMSITE must be present in the environment.
//   node scripts/push-contents.mjs <repo-owner>/<repo> <branch> "<commit message>" <file1> [file2 ...]
// Each file needs its current SHA fetched first (GET), then PUT base64 content.
import { readFile } from 'node:fs/promises';

const [, , repoArg, branch, message, ...files] = process.argv;
const [owner, repo] = (repoArg || '').split('/');
if (!owner || !repo || !branch || !message || files.length === 0) {
  console.error('usage: node scripts/push-contents.mjs owner/repo branch "message" file...');
  process.exit(1);
}
const token = process.env.GITHUB_PAT_GKMSITE;
if (!token) { console.error('GITHUB_PAT_GKMSITE is not set'); process.exit(1); }

const api = `https://api.github.com/repos/${owner}/${repo}/contents`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'openclaw-gkmsite-push',
};

for (const file of files) {
  // 1) fetch current SHA (404 => new file)
  const getRes = await fetch(`${api}/${encodeURIComponent(file)}?ref=${encodeURIComponent(branch)}`, { headers });
  let sha;
  if (getRes.ok) {
    const meta = await getRes.json();
    sha = meta.sha;
  } else if (getRes.status !== 404) {
    console.error(`GET ${file} -> ${getRes.status}`, await getRes.text());
    process.exit(1);
  }

  // 2) PUT new content
  const content = (await readFile(file)).toString('base64');
  const body = { message: `${message} — ${file}`, content, branch };
  if (sha) body.sha = sha;
  const putRes = await fetch(`${api}/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    console.error(`PUT ${file} -> ${putRes.status}`, putText);
    process.exit(1);
  }
  console.log(`pushed ${file}`);
}
