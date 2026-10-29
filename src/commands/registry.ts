import { BUILTIN_COMMANDS, CommandDef, CommandContext } from './builtin.js';
import { CustomCommandLoader, interpolateCommand } from './custom.js';
import { MemoryLoader } from '../memory/loader.js';

export class CommandRegistry {
  private commands: Map<string, CommandDef> = new Map();
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    // Register builtin commands
    for (const [name, def] of Object.entries(BUILTIN_COMMANDS)) {
      this.commands.set(name, def);
    }
  }

  public getCommandNames(): string[] {
    const custom = CustomCommandLoader.loadAll(this.cwd);
    const names = Array.from(this.commands.keys());
    for (const c of custom.keys()) {
      if (!names.includes(c)) names.push(c);
    }
    return names;
  }

  public async execute(
    input: string,
    context: CommandContext
  ): Promise<{ handled: boolean; promptToRun?: string }> {
    const trimmed = input.trim();

    // Check for note prefix `# note`
    if (trimmed.startsWith('#')) {
      const note = trimmed.slice(1).trim();
      const loader = new MemoryLoader();
      const savedPath = loader.appendNote(note, this.cwd);
      context.onOutput(`Saved note to **${savedPath}**.`);
      return { handled: true };
    }

    if (!trimmed.startsWith('/')) {
      return { handled: false };
    }

    const spaceIdx = trimmed.indexOf(' ');
    const cmdName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const cmdArgs = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

    // 1. Built-in command
    const builtin = this.commands.get(cmdName);
    if (builtin) {
      await builtin.handler(cmdArgs, context);
      return { handled: true };
    }

    // 2. Custom markdown command (.antror/commands/*.md)
    const customCommands = CustomCommandLoader.loadAll(this.cwd);
    const custom = customCommands.get(cmdName);
    if (custom) {
      const expandedPrompt = interpolateCommand(custom.template, cmdArgs, this.cwd);
      context.onOutput(`*Running custom command \`${cmdName}\`...*`);
      return { handled: true, promptToRun: expandedPrompt };
    }

    context.onOutput(`Unknown command \`${cmdName}\`. Type \`/help\` for a list of commands.`);
    return { handled: true };
  }
}
