import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { Message, TokenUsage } from '../llm/types.js';

export interface SessionMetadata {
  id: string;
  cwd: string;
  projectHash: string;
  startTime: number;
  lastUpdated: number;
  messageCount: number;
  initialPrompt?: string;
  totalTokens: number;
  totalCost: number;
}

export interface FileCheckpoint {
  filePath: string;
  content: string;
  timestamp: number;
}

export class SessionStore {
  private sessionId: string;
  private cwd: string;
  private projectHash: string;
  private sessionDir: string;
  private sessionFilePath: string;
  private metadataFilePath: string;
  private checkpointsDir: string;

  constructor(cwd: string = process.cwd(), sessionId?: string) {
    this.cwd = path.resolve(cwd);
    this.projectHash = crypto.createHash('sha256').update(this.cwd).digest('hex').slice(0, 12);
    this.sessionId = sessionId || `session_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const baseDir = path.join(os.homedir(), '.antror', 'projects', this.projectHash);
    this.sessionDir = path.join(baseDir, 'sessions');
    this.checkpointsDir = path.join(baseDir, 'checkpoints', this.sessionId);
    this.sessionFilePath = path.join(this.sessionDir, `${this.sessionId}.jsonl`);
    this.metadataFilePath = path.join(this.sessionDir, `${this.sessionId}.meta.json`);

    this.initDirs();
  }

  private initDirs(): void {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    if (!fs.existsSync(this.checkpointsDir)) {
      fs.mkdirSync(this.checkpointsDir, { recursive: true });
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getProjectHash(): string {
    return this.projectHash;
  }

  public appendMessage(msg: Message): void {
    const line = JSON.stringify({ type: 'message', timestamp: Date.now(), data: msg }) + '\n';
    fs.appendFileSync(this.sessionFilePath, line, 'utf-8');
  }

  public appendEvent(eventType: string, eventData: any): void {
    const line = JSON.stringify({ type: eventType, timestamp: Date.now(), data: eventData }) + '\n';
    fs.appendFileSync(this.sessionFilePath, line, 'utf-8');
  }

  public saveCheckpoint(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const safeName = Buffer.from(filePath).toString('base64url') + `_${Date.now()}.bak`;
        const checkpointPath = path.join(this.checkpointsDir, safeName);
        fs.writeFileSync(checkpointPath, JSON.stringify({ filePath, content, timestamp: Date.now() }), 'utf-8');
      }
    } catch {}
  }

  public saveMetadata(meta: Partial<SessionMetadata>): void {
    const existing = this.loadMetadata() || {
      id: this.sessionId,
      cwd: this.cwd,
      projectHash: this.projectHash,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      messageCount: 0,
      totalTokens: 0,
      totalCost: 0,
    };

    const updated: SessionMetadata = {
      ...existing,
      ...meta,
      lastUpdated: Date.now(),
    };

    fs.writeFileSync(this.metadataFilePath, JSON.stringify(updated, null, 2), 'utf-8');
  }

  public loadMetadata(): SessionMetadata | null {
    if (fs.existsSync(this.metadataFilePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.metadataFilePath, 'utf-8'));
      } catch {}
    }
    return null;
  }

  public loadMessages(): Message[] {
    if (!fs.existsSync(this.sessionFilePath)) return [];

    const messages: Message[] = [];
    const lines = fs.readFileSync(this.sessionFilePath, 'utf-8').split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.data) {
          messages.push(entry.data);
        }
      } catch {}
    }

    return messages;
  }

  public static listProjectSessions(cwd: string = process.cwd()): SessionMetadata[] {
    const resolvedCwd = path.resolve(cwd);
    const hash = crypto.createHash('sha256').update(resolvedCwd).digest('hex').slice(0, 12);
    const sessionDir = path.join(os.homedir(), '.antror', 'projects', hash, 'sessions');

    if (!fs.existsSync(sessionDir)) return [];

    const results: SessionMetadata[] = [];
    const files = fs.readdirSync(sessionDir);

    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(sessionDir, f), 'utf-8'));
        results.push(meta);
      } catch {}
    }

    // Sort by lastUpdated descending (newest first)
    return results.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }
}
