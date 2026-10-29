import { describe, it, expect } from 'vitest';
import { parsePatch } from '../src/ui/DiffView.js';
import { createPatch } from 'diff';

describe('Milestone 3: Diff Renderer and Parser', () => {
  it('parses unified diff patch correctly with additions, removals, line numbers', () => {
    const oldText = 'line 1\nline 2\nline 3\n';
    const newText = 'line 1\nline 2 modified\nline 3\nline 4 added\n';
    const patch = createPatch('sample.ts', oldText, newText);

    const parsed = parsePatch(patch);

    expect(parsed.some(l => l.type === 'header')).toBe(true);
    expect(parsed.some(l => l.type === 'hunk')).toBe(true);

    const additions = parsed.filter(l => l.type === 'add');
    const removals = parsed.filter(l => l.type === 'remove');

    expect(additions.length).toBe(2);
    expect(removals.length).toBe(1);

    expect(removals[0].text).toBe('line 2');
    expect(additions[0].text).toBe('line 2 modified');
    expect(additions[1].text).toBe('line 4 added');
  });

  it('handles empty diff gracefully', () => {
    const parsed = parsePatch('');
    expect(parsed).toEqual([]);
  });
});
