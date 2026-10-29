export interface ParsedRule {
  raw: string;
  tool: string;
  pattern: string;
  regex: RegExp;
}

export function parseRule(ruleStr: string): ParsedRule | null {
  const match = ruleStr.trim().match(/^([a-zA-Z0-9_\-]+)\((.*)\)$/);
  if (!match) return null;

  const tool = match[1];
  const pattern = match[2];

  // Convert glob-like pattern to regex with safe double-star placeholder
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/___DOUBLE_STAR___/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexStr}$`, 'i');

  return {
    raw: ruleStr,
    tool,
    pattern,
    regex,
  };
}

export function matchesRule(rule: ParsedRule, toolName: string, args: Record<string, any>): boolean {
  if (rule.tool.toLowerCase() !== toolName.toLowerCase() && rule.tool !== '*') {
    return false;
  }

  // Get argument to check against
  const targetVal =
    args.command ||
    args.path ||
    args.url ||
    args.query ||
    args.pattern ||
    JSON.stringify(args);

  // Normalize slashes for cross-platform matching
  const normalized = typeof targetVal === 'string' ? targetVal.replace(/\\/g, '/') : String(targetVal);

  return rule.regex.test(normalized);
}
