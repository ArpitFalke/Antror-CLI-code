import { BaseTool, ToolResult } from './base.js';
import { ToolParameterSchema } from '../llm/types.js';
import { AgentContext } from '../agent/types.js';

export class WebFetchTool implements BaseTool {
  public readonly name = 'WebFetch';
  public readonly description =
    'Fetch content from a URL over HTTP/HTTPS and return readable text or markdown.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      prompt: {
        type: 'string',
        description: 'Optional question or focus for the extracted information',
      },
    },
    required: ['url'],
  };

  public async execute(args: { url: string; prompt?: string }, _context: AgentContext): Promise<ToolResult> {
    try {
      const res = await fetch(args.url, {
        headers: {
          'User-Agent': 'AntrorCode/1.0 (terminal-agent)',
          'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) {
        return {
          output: `HTTP Error ${res.status}: ${res.statusText}`,
          isError: true,
        };
      }

      const contentType = res.headers.get('content-type') || '';
      let text = await res.text();

      if (contentType.includes('html')) {
        // Strip scripts and styles
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        // Strip HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        // Collapse spaces
        text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
      }

      const MAX_LENGTH = 20000;
      if (text.length > MAX_LENGTH) {
        text = text.slice(0, MAX_LENGTH) + `\n\n... [content truncated (${text.length - MAX_LENGTH} chars)]`;
      }

      return {
        output: text,
        data: { url: args.url, length: text.length },
      };
    } catch (err: any) {
      return {
        output: `Failed to fetch URL "${args.url}": ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● WebFetch(${args.url})`;
  }

  public renderResult(result: ToolResult): string {
    if (result.isError) return `⎿ ${result.output}`;
    return `⎿ Fetched ${(result.data?.length || 0).toLocaleString()} characters`;
  }
}

export class WebSearchTool implements BaseTool {
  public readonly name = 'WebSearch';
  public readonly description =
    'Search the web for up-to-date documentation, API references, or answers.';

  public readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string',
      },
    },
    required: ['query'],
  };

  public async execute(args: { query: string }, _context: AgentContext): Promise<ToolResult> {
    try {
      // Use DuckDuckGo HTML search / API for reliable search results
      const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
      const res = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!res.ok) {
        return {
          output: `Search failed with status ${res.status}: ${res.statusText}`,
          isError: true,
        };
      }

      const html = await res.text();
      // Extract links and snippets from search results
      const regex = /<a class="result__snippet[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
      const results: string[] = [];
      let match;
      let count = 0;

      while ((match = regex.exec(html)) !== null && count < 8) {
        count++;
        const snippet = match[2].replace(/<[^>]+>/g, '').trim();
        results.push(`${count}. ${snippet}`);
      }

      if (results.length === 0) {
        // Fallback simple snippet extraction
        const genericMatches = html.match(/<a class="result__url"[^>]*>(.*?)<\/a>/gi);
        if (genericMatches) {
          genericMatches.slice(0, 5).forEach((m, idx) => {
            results.push(`${idx + 1}. ${m.replace(/<[^>]+>/g, '').trim()}`);
          });
        }
      }

      const output = results.length > 0
        ? `Search results for "${args.query}":\n\n` + results.join('\n\n')
        : `No direct web search results found for "${args.query}".`;

      return {
        output,
        data: { query: args.query, count: results.length },
      };
    } catch (err: any) {
      return {
        output: `Search error: ${err.message}`,
        isError: true,
      };
    }
  }

  public renderCall(args: any): string {
    return `● WebSearch("${args.query}")`;
  }

  public renderResult(result: ToolResult): string {
    return `⎿ Found ${result.data?.count || 0} results`;
  }
}
