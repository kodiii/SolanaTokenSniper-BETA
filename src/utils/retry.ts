import { config } from '../config';

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  timeout: number;
  retryableErrors?: RegExp[];
  onRetry?: (error: Error, attempt: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

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

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2,
  timeout: 5000,
  retryableErrors: [
    /ETIMEDOUT/,
    /ECONNRESET/,
    /ECONNREFUSED/,
    /ENOTFOUND/,
    /socket hang up/,
    /network error/i,
    /rate limit/i,
    /timeout/i,
    /Request failed/i
  ]
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const retryOptions: RetryOptions = { ...defaultOptions, ...options };
  const stats: RetryStats = {
    attempts: 0,
    totalTime: 0,
    errors: [],
    successful: false
  };

  const startTime = Date.now();

  for (let attempt = 1; attempt <= retryOptions.maxAttempts; attempt++) {
    stats.attempts = attempt;

    try {
      // Add timeout to the operation
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Operation timed out after ${retryOptions.timeout}ms`));
          }, retryOptions.timeout);
        })
      ]);

      stats.successful = true;
      stats.totalTime = Date.now() - startTime;
      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      stats.errors.push(err);

      // Check if we should retry
      const shouldRetry = retryOptions.shouldRetry ?
        retryOptions.shouldRetry(err) :
        retryOptions.retryableErrors?.some(pattern => pattern.test(err.message));

      if (!shouldRetry || attempt === retryOptions.maxAttempts) {
        stats.finalError = err;
        stats.totalTime = Date.now() - startTime;
        throw new RetryError(
          `Operation failed after ${attempt} attempts: ${err.message}`,
          stats
        );
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        retryOptions.initialDelay * Math.pow(retryOptions.backoffFactor, attempt - 1),
        retryOptions.maxDelay
      );
      const jitter = Math.random() * 0.1 * delay; // 10% jitter
      const finalDelay = delay + jitter;

      // Call onRetry callback if provided
      if (retryOptions.onRetry) {
        retryOptions.onRetry(err, attempt);
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }

  // This should never be reached due to the throw in the catch block
  throw new Error('Unexpected retry loop completion');
}

export function isRetryableError(error: Error): boolean {
  return defaultOptions.retryableErrors?.some(pattern => pattern.test(error.message)) || false;
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
