import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';

export interface CommonLogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'debug';
  message: string;
  data?: Record<string, unknown>;
}

export class CommonLogger {
  private readonly filePath: string | null;
  private readonly entries: CommonLogEntry[] = [];
  private readonly nestLogger: Logger;
  private readonly fileLoggingEnabled: boolean;

  constructor(serviceName: string, logsDir?: string) {
    this.nestLogger = new Logger(serviceName);
    this.fileLoggingEnabled = process.env.NODE_ENV === 'development';

    if (this.fileLoggingEnabled) {
      const dir = logsDir || join(process.cwd(), 'logs');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      this.filePath = join(dir, `${serviceName}_${ts}.json`);
      writeFileSync(this.filePath, '[]', 'utf-8');
    } else {
      this.filePath = null;
    }
  }

  log(message: string, data?: Record<string, unknown>): void {
    this.nestLogger.log(message);
    if (this.fileLoggingEnabled) this.append('log', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.nestLogger.warn(message);
    if (this.fileLoggingEnabled) this.append('warn', message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.nestLogger.error(message);
    if (this.fileLoggingEnabled) this.append('error', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.nestLogger.debug(message);
    if (this.fileLoggingEnabled) this.append('debug', message, data);
  }

  private append(
    level: CommonLogEntry['level'],
    message: string,
    data?: Record<string, unknown>,
  ): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data !== undefined && { data }),
    });
    this.flush();
  }

  private flush(): void {
    if (!this.filePath) return;
    try {
      writeFileSync(
        this.filePath,
        JSON.stringify(this.entries, null, 2),
        'utf-8',
      );
    } catch {
      this.nestLogger.error(`Failed to write common log to ${this.filePath}`);
    }
  }

  getFilePath(): string | null {
    return this.filePath;
  }
}
