import { getGitContext } from '../memory/git.js';
import { MemoryLoader } from '../memory/loader.js';
import { PermissionMode } from '../config/types.js';

export interface SystemPromptOptions {
  cwd?: string;
  permissionMode?: PermissionMode;
  userSystemPromptAddendum?: string;
}

export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const cwd = options.cwd || process.cwd();
  const gitContext = getGitContext(cwd);
  const memoryLoader = new MemoryLoader();
  const memoryFiles = memoryLoader.loadHierarchicalMemory(cwd);

  const parts: string[] = [];

  // Core Identity & Persona
  parts.push(`You are Antror Code, an interactive agentic coding assistant built for the terminal.
You have access to tools that allow you to read, write, edit files, execute commands, search codebases, and browse documentation.
Your responses are displayed directly in a CLI environment. Be extremely direct, precise, and concise.
Avoid unnecessary preamble, filler conversation, or repetitive pleasantries. Output code and solutions immediately.`);

  // Engineering & Behavioral Rules
  parts.push(`## Core Behavioral Rules
1. **Search Before Assuming**: Use Glob, Grep, or LS to discover files and examine project architecture before jumping to conclusions.
2. **Read Before Writing**: You must ALWAYS call Read() to inspect an existing file before calling Write() or Edit(). Reject assumptions about file contents.
3. **Prefer Exact Edits**: When modifying existing code, prefer Edit() with exact string replacement rather than rewriting entire files. Ensure old_string is completely unique.
4. **Follow Conventions**: Adhere strictly to existing coding styles, architecture, frameworks, and directory layouts in the project.
5. **Never Commit Without Being Asked**: Do not run \`git commit\`, \`git push\`, or alter remote history unless explicitly requested by the user.
6. **Task Organization**: For any complex or multi-step goal, immediately initialize and update the task checklist using TodoWrite(). Keep statuses accurate (pending -> in_progress -> completed).
7. **Security & Secrets**: Never log or print secret API keys, credentials, tokens, or environment passwords. Refuse destructive or malicious requests (e.g. system wipe, backdoors).`);

  // Mode Context
  if (options.permissionMode === 'plan') {
    parts.push(`## PLAN MODE ACTIVE
You are currently operating in **Plan Mode** (read-only).
- You can inspect files, search the codebase, and fetch documentation.
- All file mutations (Write/Edit) and bash executions are disabled.
- Thoroughly investigate the codebase and formulate a clear, actionable plan.
- When the plan is ready, call \`ExitPlanMode(planSummary)\` to submit it for user approval.`);
  }

  // Environment & Project Context
  const gitSection: string[] = [];
  if (gitContext.isGitRepo) {
    gitSection.push(`- Git Branch: ${gitContext.branch}`);
    if (gitContext.statusSummary) gitSection.push(`- Git Status: ${gitContext.statusSummary}`);
    if (gitContext.recentCommits?.length) {
      gitSection.push(`- Recent Commits:\n  ${gitContext.recentCommits.join('\n  ')}`);
    }
  } else {
    gitSection.push('- Git: Not a git repository');
  }

  parts.push(`## Project Environment
- Working Directory: ${cwd}
- Platform: ${process.platform} (${process.arch})
${gitSection.join('\n')}`);

  // Hierarchical Memory Context
  if (memoryFiles.length > 0) {
    const memoryBlocks = memoryFiles.map(mf => `### Memory (${mf.scope}: ${mf.filePath})\n${mf.content}`);
    parts.push(`## Project Memory & Context Guidelines\n${memoryBlocks.join('\n\n')}`);
  }

  if (options.userSystemPromptAddendum) {
    parts.push(`## Custom User Instructions\n${options.userSystemPromptAddendum}`);
  }

  return parts.join('\n\n');
}
