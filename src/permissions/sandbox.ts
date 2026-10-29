import path from 'node:path';

export const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-[rf]{1,2}\s+[\/\*]/i,
  /\bdel\s+\/[fq]\s+[a-z]:\\/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\b(curl|wget)\b.*\|\s*(bash|sh|zsh|powershell|cmd)\b/i,
  /\bdd\s+if=.*of=\/dev\//i,
  />\s*\/dev\/[s|h]d[a-z]/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bkillall\s+-9\b/i,
];

export function isPathSandboxed(filePath: string, rootDir: string = process.cwd()): boolean {
  const resolved = path.resolve(rootDir, filePath);
  const normalizedRoot = path.normalize(rootDir);
  const normalizedPath = path.normalize(resolved);

  return normalizedPath.startsWith(normalizedRoot);
}

export function isDangerousBashCommand(command: string): { dangerous: boolean; reason?: string } {
  const trimmed = command.trim();

  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        dangerous: true,
        reason: `Command matches critical destructive pattern: ${pattern.toString()}`,
      };
    }
  }

  // Check for command injection / chained commands
  if (trimmed.includes('&&') || trimmed.includes(';') || trimmed.includes('|')) {
    // Flag chained commands for review
    return {
      dangerous: false,
      reason: 'Contains chained commands or pipes',
    };
  }

  return { dangerous: false };
}
