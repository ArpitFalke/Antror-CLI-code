import { Command } from 'commander';
import dotenv from 'dotenv';
import { runInteractive, runNonInteractive } from './cli.js';
import { MCPManager } from './mcp/manager.js';
import { CLIOptions, OutputFormat, PermissionMode, LLMProviderType } from './config/types.js';

// Auto-load .env from cwd or project root if present
dotenv.config();

const program = new Command();
program.enablePositionalOptions();

program
  .name('antror')
  .description('Antror Code — Terminal-based agentic coding assistant replicating Claude Code UI/UX')
  .version('1.0.0', '-v, --version', 'Output Antror Code version')
  .argument('[prompt]', 'Initial prompt to run')
  .option('-p, --print <prompt>', 'Run non-interactive with prompt and print result')
  .option('--output-format <format>', 'Output format for non-interactive mode (text, json, stream-json)', 'text')
  .option('-c, --continue', 'Continue the most recent session in this directory')
  .option('-r, --resume', 'Resume from session picker')
  .option('-m, --model <model>', 'Specify model to use (e.g. claude-3-5-sonnet-20241022, gpt-4o)')
  .option('--provider <provider>', 'Specify provider (anthropic, openai, ollama)')
  .option('--permission-mode <mode>', 'Permission mode (default, acceptEdits, plan, bypassPermissions)')
  .option('--theme <theme>', 'UI color theme (warm-orange, dark, light, colorblind)')
  .action(async (initialPrompt, options) => {
    try {
      const cliOptions: CLIOptions = {
        prompt: initialPrompt || options.print,
        print: Boolean(options.print),
        outputFormat: options.outputFormat as OutputFormat,
        continue: Boolean(options.continue),
        resume: Boolean(options.resume),
        model: options.model,
        provider: options.provider as LLMProviderType,
        permissionMode: options.permissionMode as PermissionMode,
        theme: options.theme,
      };

      if (options.print) {
        await runNonInteractive(options.print, cliOptions);
      } else {
        await runInteractive(cliOptions);
      }
    } catch (err: any) {
      // Graceful error UI: never crash to an unhandled stack trace!
      process.stderr.write(`\n\x1b[31m✖ Antror Error:\x1b[0m ${err.message || String(err)}\n\n`);
      process.exit(1);
    }
  });

// MCP Subcommands
const mcp = program.command('mcp').description('Manage Model Context Protocol (MCP) servers');
mcp.enablePositionalOptions();

mcp
  .command('list')
  .description('List all configured MCP servers')
  .action(() => {
    const servers = MCPManager.listServers();
    const names = Object.keys(servers);
    if (names.length === 0) {
      console.log('No MCP servers configured. Add one with: antror mcp add <name> <command> [args...]');
      return;
    }
    console.log('\nConfigured MCP Servers:');
    for (const [name, cfg] of Object.entries(servers)) {
      console.log(`- ${name}: ${cfg.command ? `${cfg.command} ${(cfg.args || []).join(' ')}` : cfg.url} (${cfg.transport || 'stdio'})`);
    }
    console.log();
  });

mcp
  .command('add <name> <command> [args...]')
  .description('Add a new stdio MCP server')
  .allowUnknownOption()
  .passThroughOptions()
  .action((name, command, args) => {
    MCPManager.addServer(name, {
      command,
      args: args || [],
      transport: 'stdio',
    });
    console.log(`✓ Added MCP server "${name}".`);
  });

mcp
  .command('remove <name>')
  .description('Remove a configured MCP server')
  .action((name) => {
    const removed = MCPManager.removeServer(name);
    if (removed) {
      console.log(`✓ Removed MCP server "${name}".`);
    } else {
      console.log(`Server "${name}" not found.`);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`\n\x1b[31m✖ Fatal Antror Error:\x1b[0m ${err.message || String(err)}\n\n`);
  process.exit(1);
});

// Library Exports
export { AntrorClient } from './sdk.js';
export * from './config/types.js';
export * from './llm/types.js';
export * from './agent/types.js';
