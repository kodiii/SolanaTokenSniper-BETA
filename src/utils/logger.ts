import { ClassifiedError, ErrorSeverity } from './errors';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG'
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    category?: string;
    severity?: ErrorSeverity;
    stack?: string;
    metadata?: Record<string, any>;
  };
}

export class Logger {
  private static instance: Logger;
  private logDir: string = '';
  private errorLogPath: string = '';
  private combinedLogPath: string = '';
  private readonly maxLogSize: number = 10 * 1024 * 1024; // 10MB
  private readonly maxLogFiles: number = 5;

  private constructor() {
    this.setupLogPaths();
    this.initializeLogDirectory();
  }

  private setupLogPaths(): void {
    const baseDir = process.env.NODE_ENV === 'production' ? process.cwd() : path.join(process.cwd(), 'logs');
    this.logDir = baseDir;
    this.errorLogPath = path.join(this.logDir, 'error.log');
    this.combinedLogPath = path.join(this.logDir, 'combined.log');
  }

  private initializeLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      // Touch the log files to ensure they exist
      fs.writeFileSync(this.errorLogPath, '', { flag: 'a' });
      fs.writeFileSync(this.combinedLogPath, '', { flag: 'a' });
    } catch (error) {
      console.error('Failed to initialize primary log directory:', error);
      // Fall back to temp directory
      try {
        const tmpDir = require('os').tmpdir();
        this.logDir = path.join(tmpDir, 'solana-sniper-logs');
        this.errorLogPath = path.join(this.logDir, 'error.log');
        this.combinedLogPath = path.join(this.logDir, 'combined.log');
        
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
        fs.writeFileSync(this.errorLogPath, '', { flag: 'a' });
        fs.writeFileSync(this.combinedLogPath, '', { flag: 'a' });
      } catch (fallbackError) {
        console.error('Failed to create fallback log files:', fallbackError);
        // Last resort: use memory-only logging
        this.logDir = '';
        this.errorLogPath = '';
        this.combinedLogPath = '';
      }
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatLogEntry(entry: LogEntry): string {
    return JSON.stringify({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString()
    }) + '\n';
  }

  private async rotateLogFile(logPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(logPath);
      if (stats.size >= this.maxLogSize) {
        for (let i = this.maxLogFiles - 1; i > 0; i--) {
          const oldPath = `${logPath}.${i}`;
          const newPath = `${logPath}.${i + 1}`;
          if (fs.existsSync(oldPath)) {
            await fs.promises.rename(oldPath, newPath);
          }
        }
        await fs.promises.rename(logPath, `${logPath}.1`);
      }
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  }

  private async writeToLog(logPath: string, entry: LogEntry): Promise<void> {
    try {
      await this.rotateLogFile(logPath);
      await fs.promises.appendFile(logPath, this.formatLogEntry(entry));
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  public async log(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error | ClassifiedError
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };

      if (error instanceof ClassifiedError) {
        entry.error.category = error.category;
        entry.error.severity = error.severity;
        entry.error.metadata = error.metadata;
      }
    }

    // Write to combined log
    await this.writeToLog(this.combinedLogPath, entry);

    // Write errors to error log
    if (level === LogLevel.ERROR) {
      await this.writeToLog(this.errorLogPath, entry);
    }

    // Console output based on environment
    if (process.env.NODE_ENV !== 'production') {
      const consoleMethod = level === LogLevel.ERROR ? console.error :
                          level === LogLevel.WARN ? console.warn :
                          level === LogLevel.DEBUG ? console.debug :
                          console.log;
      
      consoleMethod(JSON.stringify(entry, null, 2));
    }
  }

  public async error(message: string, error: Error | ClassifiedError, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.ERROR, message, context, error);
  }

  public async warn(message: string, context?: Record<string, any>, error?: Error | ClassifiedError): Promise<void> {
    await this.log(LogLevel.WARN, message, context, error);
  }

  public async info(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.INFO, message, context);
  }

  public async debug(message: string, context?: Record<string, any>): Promise<void> {
    await this.log(LogLevel.DEBUG, message, context);
  }

  public async logMetrics(metrics: Record<string, any>): Promise<void> {
    await this.info('Performance metrics', { metrics });
  }

  public async logRetryAttempt(
    operation: string,
    attempt: number,
    error: Error | ClassifiedError,
    context?: Record<string, any>
  ): Promise<void> {
    await this.warn(
      `Retry attempt ${attempt} for ${operation}`,
      {
        ...context,
        attempt,
        operation
      },
      error
    );
  }

  public async logApiCall(
    method: string,
    url: string,
    duration: number,
    success: boolean,
    context?: Record<string, any>,
    error?: Error | ClassifiedError
  ): Promise<void> {
    const logLevel = success ? LogLevel.DEBUG : LogLevel.ERROR;
    await this.log(
      logLevel,
      `API ${method} ${url} ${success ? 'succeeded' : 'failed'} in ${duration}ms`,
      {
        ...context,
        method,
        url,
        duration,
        success
      },
      error
    );
  }
}
