import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ReadTool } from '../src/tools/read.js';
import { WriteTool } from '../src/tools/write.js';
import { EditTool, MultiEditTool } from '../src/tools/edit.js';
import { BashTool } from '../src/tools/bash.js';
import { GlobTool, GrepTool, LSTool } from '../src/tools/file-search.js';
import { TodoWriteTool, TodoState } from '../src/tools/todo.js';
import { AgentContext } from '../agent/types.js';

describe('Milestone 2: Core Tools & Safety Rules', () => {
  let tmpDir: string;
  let context: AgentContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'antror-test-'));
    context = {
      messages: [],
      totalUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      totalCost: 0,
      filesRead: new Set<string>(),
      fileVersions: new Map<string, number>(),
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('Write creates new file without requiring pre-read', async () => {
    const writeTool = new WriteTool();
    const testFile = path.join(tmpDir, 'newfile.txt');

    const result = await writeTool.execute(
      { path: testFile, content: 'Line 1\nLine 2\nLine 3' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('Line 1\nLine 2\nLine 3');
    expect(context.filesRead.has(testFile)).toBe(true);
    expect(result.diff).toBeDefined();
  });

  it('Write rejects modifying existing file if not read first', async () => {
    const writeTool = new WriteTool();
    const testFile = path.join(tmpDir, 'existing.txt');
    fs.writeFileSync(testFile, 'Original content');

    const result = await writeTool.execute(
      { path: testFile, content: 'Modified content' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('was not read first');
  });

  it('Read records file in context and returns content with line numbers', async () => {
    const readTool = new ReadTool();
    const testFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(testFile, 'alpha\nbeta\ngamma\ndelta');

    const result = await readTool.execute({ path: testFile, offset: 2, limit: 2 }, context);

    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('beta');
    expect(result.output).toContain('gamma');
    expect(context.filesRead.has(testFile)).toBe(true);
    expect(context.fileVersions.has(testFile)).toBe(true);
  });

  it('Edit rejects if not read first', async () => {
    const editTool = new EditTool();
    const testFile = path.join(tmpDir, 'edit_test.txt');
    fs.writeFileSync(testFile, 'const x = 1;');

    const result = await editTool.execute(
      { path: testFile, old_string: 'const x = 1;', new_string: 'const x = 2;' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('was not read first');
  });

  it('Edit requires exact unique match', async () => {
    const readTool = new ReadTool();
    const editTool = new EditTool();
    const testFile = path.join(tmpDir, 'unique_test.txt');
    fs.writeFileSync(testFile, 'hello world\nhello world');

    // Read first
    await readTool.execute({ path: testFile }, context);

    // Multiple matches -> error
    const multiResult = await editTool.execute(
      { path: testFile, old_string: 'hello world', new_string: 'hey world' },
      context
    );
    expect(multiResult.isError).toBe(true);
    expect(multiResult.output).toContain('occurs 2 times');

    // 0 matches -> error
    const zeroResult = await editTool.execute(
      { path: testFile, old_string: 'goodbye world', new_string: 'hey world' },
      context
    );
    expect(zeroResult.isError).toBe(true);
    expect(zeroResult.output).toContain('not found');
  });

  it('Edit succeeds on exact unique match and generates diff', async () => {
    const readTool = new ReadTool();
    const editTool = new EditTool();
    const testFile = path.join(tmpDir, 'success_edit.txt');
    fs.writeFileSync(testFile, 'function add(a, b) {\n  return a - b;\n}');

    await readTool.execute({ path: testFile }, context);

    const result = await editTool.execute(
      { path: testFile, old_string: 'return a - b;', new_string: 'return a + b;' },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(fs.readFileSync(testFile, 'utf-8')).toBe('function add(a, b) {\n  return a + b;\n}');
    expect(result.diff).toContain('+  return a + b;');
    expect(result.diff).toContain('-  return a - b;');
  });

  it('Edit rejects stale edits if file was modified externally', async () => {
    const readTool = new ReadTool();
    const editTool = new EditTool();
    const testFile = path.join(tmpDir, 'stale_test.txt');
    fs.writeFileSync(testFile, 'initial line');

    await readTool.execute({ path: testFile }, context);

    // Simulate external change
    const futureTime = (Date.now() + 5000) / 1000;
    fs.utimesSync(testFile, futureTime, futureTime);

    const result = await editTool.execute(
      { path: testFile, old_string: 'initial line', new_string: 'updated line' },
      context
    );

    expect(result.isError).toBe(true);
    expect(result.output).toContain('modified externally');
  });

  it('Bash persists working directory changes', async () => {
    const bashTool = new BashTool();
    bashTool.setCwd(tmpDir);

    const subDir = path.join(tmpDir, 'nested_folder');
    fs.mkdirSync(subDir);

    const res = await bashTool.execute({ command: 'cd nested_folder' }, context);
    expect(res.isError).toBeFalsy();
    expect(path.normalize(bashTool.getCwd())).toBe(path.normalize(subDir));
  });

  it('TodoWrite updates live checklist state', async () => {
    const todoTool = new TodoWriteTool();
    const result = await todoTool.execute(
      {
        tasks: [
          { id: '1', title: 'Task One', status: 'completed' },
          { id: '2', title: 'Task Two', status: 'in_progress' },
        ],
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.output).toContain('☒ Task One');
    expect(result.output).toContain('▶ Task Two');
    expect(TodoState.getInstance().getItems().length).toBe(2);
  });
});
