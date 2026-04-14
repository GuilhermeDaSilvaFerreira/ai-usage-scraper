import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';

export interface JobLogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export class JobLogger {
  private readonly filePath: string;
  private readonly entries: JobLogEntry[] = [];
  private readonly nestLogger: Logger;

  constructor(jobName: string, logsDir?: string) {
    this.nestLogger = new Logger(`Job:${jobName}`);
    const dir = logsDir || join(process.cwd(), 'logs');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = join(dir, `${jobName}_${ts}.json`);
    writeFileSync(this.filePath, '[]', 'utf-8');
  }

  log(message: string, data?: any): void {
    this.nestLogger.log(message);
    this.append('log', message, data);
  }

  warn(message: string, data?: any): void {
    this.nestLogger.warn(message);
    this.append('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.nestLogger.error(message);
    this.append('error', message, data);
  }

  debug(message: string, data?: any): void {
    this.nestLogger.debug(message);
    this.append('debug', message, data);
  }

  private append(
    level: JobLogEntry['level'],
    message: string,
    data?: any,
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
    try {
      writeFileSync(
        this.filePath,
        JSON.stringify(this.entries, null, 2),
        'utf-8',
      );
    } catch {
      this.nestLogger.error(`Failed to write job log to ${this.filePath}`);
    }
  }

  getFilePath(): string {
    return this.filePath;
  }
}
