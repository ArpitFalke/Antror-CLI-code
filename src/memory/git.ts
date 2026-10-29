import { execSync } from 'node:child_process';
import path from 'node:path';

export interface GitContext {
  isGitRepo: boolean;
  branch?: string;
  statusSummary?: string;
  recentCommits?: string[];
  remoteUrl?: string;
}

export function getGitContext(cwd: string = process.cwd()): GitContext {
  try {
    // Check if inside git work tree
    const isRepo = execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf-8',
    }).trim() === 'true';

    if (!isRepo) {
      return { isGitRepo: false };
    }

    // Branch
    let branch = '';
    try {
      branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
    } catch {}

    // Status summary
    let statusSummary = '';
    try {
      const statusOut = execSync('git status --short', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();

      if (statusOut) {
        const lines = statusOut.split('\n');
        statusSummary = `${lines.length} changed file(s):\n${statusOut.slice(0, 500)}`;
      } else {
        statusSummary = 'Clean working tree (no modified files)';
      }
    } catch {}

    // Recent 3 commits
    const recentCommits: string[] = [];
    try {
      const logOut = execSync('git log -n 3 --oneline', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
      if (logOut) {
        recentCommits.push(...logOut.split('\n'));
      }
    } catch {}

    // Remote
    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSync('git config --get remote.origin.url', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
      }).trim();
    } catch {}

    return {
      isGitRepo: true,
      branch: branch || 'unknown',
      statusSummary,
      recentCommits,
      remoteUrl,
    };
  } catch {
    return { isGitRepo: false };
  }
}
