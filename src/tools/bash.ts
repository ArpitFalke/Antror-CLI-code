import fs from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

interface BackgroundProcessInfo {
  id: string;
  command: string;
  process: ChildProcess;
  output: string[];
  startTime: number;
}

export class BashTool implements BaseTool {
  public readonly name = 'Bash';
  public readonly description =
    'Execute a terminal command with working-directory persistence, timeout handling, background process management, and output capture.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default 30000ms / 30s)',
      },
      run_in_background: {
        type: 'boolean',
        description: 'Set to true for long-running support servers/processes',
      },
    },
    required: ['command'],
  };

  private currentWorkingDirectory: string = process.cwd();
  private backgroundProcesses: Map<string, BackgroundProcessInfo> = new Map();
  private nextProcessId = 1;

  public getCwd(): string {
    return this.currentWorkingDirectory;
  }

  public setCwd(dir: string): void {
    this.currentWorkingDirectory = dir;
  }

  public getBackgroundProcesses(): Array<{ id: string; command: string; running: boolean }> {
    return Array.from(this.backgroundProcesses.values()).map(p => ({
      id: p.id,
      command: p.command,
      running: !p.process.killed && p.process.exitCode === null,
    }));
  }

  public async execute(
    args: { command: string; timeout?: number; run_in_background?: boolean },
    _context: AgentContext
  ): Promise<ToolResult> {
    const rawCommand = args.command.trim();

    // Check for directory changes like `cd foo`
    if (rawCommand.startsWith('cd ') || rawCommand === 'cd') {
      const target = rawCommand.slice(2).trim() || process.env.HOME || this.currentWorkingDirectory;
      const resolved = path.resolve(this.currentWorkingDirectory, target);
      try {
        if (!fs.existsSync(resolved)) {
          return {
            output: `Directory does not exist: ${target}`,
            isError: true,
          };
        }
        this.currentWorkingDirectory = resolved;
        try {
          process.chdir(resolved);
        } catch {
          // Ignore if global process.chdir is disallowed
        }
        return {
          output: `Changed directory to: ${resolved}`,
          data: { cwd: resolved },
        };
      } catch (err: any) {
        return {
          output: `Failed to change directory to ${target}: ${err.message}`,
          isError: true,
        };
      }
    }

    const isWin = process.platform === 'win32';
    const shell = isWin ? 'powershell.exe' : '/bin/bash';
    const shellArgs = isWin ? ['-NoProfile', '-Command', rawCommand] : ['-c', rawCommand];

    if (args.run_in_background) {
      const procId = `bg_${this.nextProcessId++}`;
      const child = spawn(shell, shellArgs, {
        cwd: this.currentWorkingDirectory,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const procInfo: BackgroundProcessInfo = {
        id: procId,
        command: rawCommand,
        process: child,
        output: [],
        startTime: Date.now(),
      };

      child.stdout?.on('data', (d) => {
        procInfo.output.push(d.toString());
        if (procInfo.output.length > 500) procInfo.output.shift();
      });

      child.stderr?.on('data', (d) => {
        procInfo.output.push(d.toString());
        if (procInfo.output.length > 500) procInfo.output.shift();
      });

      this.backgroundProcesses.set(procId, procInfo);

      return {
        output: `Command started in background with Task ID: ${procId}\nCommand: ${rawCommand}`,
        data: { backgroundId: procId, command: rawCommand },
      };
    }

    const timeoutMs = args.timeout || 30000;

    return new Promise<ToolResult>((resolve) => {
      let stdoutData = '';
      let stderrData = '';
      let timedOut = false;

      const child = spawn(shell, shellArgs, {
        cwd: this.currentWorkingDirectory,
        env: { ...process.env },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout?.on('data', (d) => {
        stdoutData += d.toString();
      });

      child.stderr?.on('data', (d) => {
        stderrData += d.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (timedOut) {
          resolve({
            output: `Command timed out after ${timeoutMs / 1000}s:\n${stdoutData}\n${stderrData}`,
            isError: true,
          });
          return;
        }

        const combined = (stdoutData + (stderrData ? `\n[stderr]\n${stderrData}` : '')).trim();

        // Limit huge output
        const MAX_OUTPUT = 30000;
        let finalOutput = combined || '(command completed with no output)';
        if (finalOutput.length > MAX_OUTPUT) {
          finalOutput =
            finalOutput.slice(0, MAX_OUTPUT) +
            `\n\n... [output truncated (${finalOutput.length - MAX_OUTPUT} additional chars)]`;
        }

        resolve({
          output: finalOutput,
          isError: code !== 0,
          data: { exitCode: code, stdoutLines: stdoutData.split('\n').length },
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          output: `Command failed to start: ${err.message}`,
          isError: true,
        });
      });
    });
  }

  public renderCall(args: any): string {
    const bg = args.run_in_background ? ' [background]' : '';
    return `● Bash("${args.command}"${bg})`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) {
      return `⎿ Command failed: ${result.output.split('\n')[0]}`;
    }
    const lines = result.output.split('\n').filter(Boolean).length;
    return `⎿ Command succeeded (${lines} lines of output)`;
  }
}
