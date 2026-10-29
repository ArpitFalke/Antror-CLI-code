/**
 * Antror Code - Direct GitHub Publisher
 * Pushes the entire codebase to a GitHub repository using the GitHub Git Database REST API.
 * Does not require local git binary.
 *
 * Usage:
 *   node scripts/github-push.js <github-token> <owner/repo> [branch]
 *
 * Example:
 *   node scripts/github-push.js ghp_abc123 myusername/antror-code main
 */

import fs from 'node:fs';
import path from 'node:path';

const [,, token, repoPath, branch = 'main'] = process.argv;

if (!token || !repoPath) {
  console.log(`
\x1b[38;2;255;107;53mAntror Code GitHub Publisher\x1b[0m

Usage:
  node scripts/github-push.js <GITHUB_TOKEN> <OWNER/REPO> [branch]

Example:
  node scripts/github-push.js ghp_xxxx myuser/antror-code main
`);
  process.exit(1);
}

const [owner, repo] = repoPath.split('/');
const API_BASE = 'https://api.github.com';

const headers = {
  'Accept': 'application/vnd.github+json',
  'Authorization': `Bearer ${token}`,
  'User-Agent': 'Antror-Code-Publisher',
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(endpoint, method = 'GET', body = null) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GitHub API Error (${res.status}) on ${endpoint}: ${data.message || JSON.stringify(data)}`);
  }
  return data;
}

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'desktop-dist',
  'dist',
  '.env',
  '.DS_Store',
]);

function getAllFiles(dir, baseDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      files = files.concat(getAllFiles(fullPath, baseDir));
    } else {
      files.push({ fullPath, relPath });
    }
  }

  return files;
}

async function main() {
  console.log(`\n\x1b[38;2;255;107;53mPublishing Antror Code to https://github.com/${owner}/${repo}...\x1b[0m\n`);

  // 1. Verify repository access
  console.log(`[1/5] Verifying repository access for ${owner}/${repo}...`);
  const repoData = await api(`/repos/${owner}/${repo}`);
  console.log(`  ✓ Repository found: ${repoData.full_name} (${repoData.default_branch || 'main'})`);

  // 2. Collect local files
  console.log(`[2/5] Scanning workspace files...`);
  const rootDir = process.cwd();
  const files = getAllFiles(rootDir);
  console.log(`  ✓ Collected ${files.length} project files.`);

  // 3. Upload Blobs
  console.log(`[3/5] Uploading file blobs to GitHub...`);
  const treeItems = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    process.stdout.write(`\r  Uploading [${i + 1}/${files.length}]: ${f.relPath.slice(0, 40).padEnd(40)}`);
    
    const contentBuffer = fs.readFileSync(f.fullPath);
    const isBinary = contentBuffer.some(byte => byte === 0);
    
    let blob;
    if (isBinary) {
      blob = await api(`/repos/${owner}/${repo}/git/blobs`, 'POST', {
        content: contentBuffer.toString('base64'),
        encoding: 'base64',
      });
    } else {
      blob = await api(`/repos/${owner}/${repo}/git/blobs`, 'POST', {
        content: contentBuffer.toString('utf8'),
        encoding: 'utf-8',
      });
    }

    treeItems.push({
      path: f.relPath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }
  console.log(`\n  ✓ All ${treeItems.length} blobs uploaded successfully.`);

  // 4. Create Git Tree & Commit
  console.log(`[4/5] Creating Git tree and commit...`);
  const tree = await api(`/repos/${owner}/${repo}/git/trees`, 'POST', {
    tree: treeItems,
  });

  // Get current HEAD commit sha if branch exists
  let parentCommitSha = null;
  try {
    const refData = await api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    parentCommitSha = refData.object.sha;
  } catch {
    // Branch may not exist yet
  }

  const commit = await api(`/repos/${owner}/${repo}/git/commits`, 'POST', {
    message: 'feat: publish Antror Code — terminal and desktop agentic coding assistant',
    tree: tree.sha,
    parents: parentCommitSha ? [parentCommitSha] : [],
  });

  console.log(`  ✓ Created commit ${commit.sha.slice(0, 7)}`);

  // 5. Update Branch Ref
  console.log(`[5/5] Updating ref heads/${branch}...`);
  if (parentCommitSha) {
    await api(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, 'PATCH', {
      sha: commit.sha,
      force: true,
    });
  } else {
    await api(`/repos/${owner}/${repo}/git/refs`, 'POST', {
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    });
  }

  console.log(`\n\x1b[32m✔ SUCCESS!\x1b[0m Antror Code has been published to:`);
  console.log(`  \x1b[1mhttps://github.com/${owner}/${repo}\x1b[0m\n`);
  console.log(`GitHub Actions will now automatically build the Windows .exe installer.`);
  console.log(`Check your repository's \x1b[1mActions\x1b[0m tab to download the installer!\n`);
}

main().catch(err => {
  console.error(`\n\x1b[31m✖ Error publishing to GitHub:\x1b[0m`, err.message);
  process.exit(1);
});
