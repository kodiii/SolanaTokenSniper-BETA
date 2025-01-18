import { config } from '../config';
import { sleep } from './sleep';

export interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
  backoff?: 'exponential' | 'linear' | 'none';
  retryableErrors?: RegExp[];
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  delayMs: 1000,
  backoff: 'exponential',
  retryableErrors: [
    /ETIMEDOUT/,
    /ECONNRESET/,
    /ECONNREFUSED/,
    /EPIPE/,
    /EAI_AGAIN/,
    /getaddrinfo ENOTFOUND/,
    /socket hang up/,
    /network error/i,
    /timeout/i,
    /System is not ready/i,
  ],
  onRetry: (error: Error, attempt: number) => {
    console.warn(`Retry attempt ${attempt} failed: ${error.message}`);
  },
  shouldRetry: (error: Error) => {
    return defaultOptions.retryableErrors.some(pattern => 
      pattern.test(error.message)
    );
  }
};

export interface RetryStats {
  attempts: number;
  totalTime: number;
  errors: Error[];
  successful: boolean;
  finalError?: Error;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly stats: RetryStats
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>, 
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | null = null;
  const stats: RetryStats = {
    attempts: 0,
    totalTime: 0,
    errors: [],
    successful: false
  };

  const startTime = Date.now();

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    stats.attempts = attempt + 1;

    try {
      return await fn();
    } catch (error: any) {
      const err = error instanceof Error ? error : new Error(String(error));
      stats.errors.push(err);
      lastError = err;

      // Check if we should retry
      const shouldRetry = opts.shouldRetry ?
        opts.shouldRetry(err) :
        opts.retryableErrors?.some(pattern => pattern.test(err.message));

      if (!shouldRetry || attempt === opts.maxRetries - 1) {
        stats.finalError = err;
        stats.totalTime = Date.now() - startTime;
        throw new RetryError(
          `Operation failed after ${attempt + 1} attempts: ${err.message}`,
          stats
        );
      }

      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(err, attempt + 1);
      }

      let delay = opts.delayMs;
      
      if (opts.backoff === 'exponential') {
        delay *= Math.pow(2, attempt);
      } else if (opts.backoff === 'linear') {
        delay *= (attempt + 1);
      }
      
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Max retries reached');
}

export function isRetryableError(error: Error, options: Partial<RetryOptions> = {}): boolean {
  const opts = { ...defaultOptions, ...options };
  return opts.retryableErrors.some(pattern => pattern.test(error.message));
}

export async function withRetryAndFallback<T>(
  primaryOperation: () => Promise<T>,
  fallbackOperation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  try {
    return await withRetry(primaryOperation, options);
  } catch (error) {
    if (error instanceof RetryError) {
      console.warn('Primary operation failed, attempting fallback:', error.message);
      return await withRetry(fallbackOperation, options);
    }
    throw error;
  }
}
