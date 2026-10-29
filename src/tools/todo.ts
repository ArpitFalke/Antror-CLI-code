import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export class TodoState {
  private static instance: TodoState;
  private items: TodoItem[] = [];
  private listeners: Array<(items: TodoItem[]) => void> = [];

  public static getInstance(): TodoState {
    if (!TodoState.instance) {
      TodoState.instance = new TodoState();
    }
    return TodoState.instance;
  }

  public getItems(): TodoItem[] {
    return [...this.items];
  }

  public setItems(newItems: TodoItem[]): void {
    this.items = newItems;
    this.listeners.forEach(fn => fn(this.items));
  }

  public subscribe(fn: (items: TodoItem[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  public clear(): void {
    this.items = [];
    this.listeners.forEach(fn => fn(this.items));
  }
}

export class TodoWriteTool implements BaseTool {
  public readonly name = 'TodoWrite';
  public readonly description =
    'Update the live task checklist for multi-step goals. Renders live checkboxes (☐ / ☒) in the terminal.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Unique identifier for task' },
            title: { type: 'string', description: 'Task description' },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed'],
              description: 'Current status of the task',
            },
          },
          required: ['id', 'title', 'status'],
        },
        description: 'The updated list of tasks',
      },
    },
    required: ['tasks'],
  };

  public async execute(args: { tasks: TodoItem[] }, _context: AgentContext): Promise<ToolResult> {
    TodoState.getInstance().setItems(args.tasks);

    const rendered = args.tasks
      .map(t => {
        const mark = t.status === 'completed' ? '☒' : t.status === 'in_progress' ? '▶' : '☐';
        return `${mark} ${t.title}`;
      })
      .join('\n');

    const completed = args.tasks.filter(t => t.status === 'completed').length;
    const total = args.tasks.length;

    return {
      output: `Updated task list (${completed}/${total} completed):\n${rendered}`,
      data: {
        tasks: args.tasks,
        completed,
        total,
      },
    };
  }

  public renderCall(args: any): string {
    const count = args.tasks?.length || 0;
    return `● TodoWrite(${count} tasks)`;
  }

  public renderResult(result: ToolResult): string {
    const d = result.data;
    return `⎿ Updated tasks: ${d?.completed || 0}/${d?.total || 0} completed`;
  }
}
