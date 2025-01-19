import { Logger } from './logger';

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  SYSTEM = 'SYSTEM',
  BUSINESS = 'BUSINESS',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface ClassifiedError extends Error {
  category: ErrorCategory;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  originalError?: Error;
}

export class ErrorClassifier {
  private static instance: ErrorClassifier;
  private readonly logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
  }

  public static getInstance(): ErrorClassifier {
    if (!ErrorClassifier.instance) {
      ErrorClassifier.instance = new ErrorClassifier();
    }
    return ErrorClassifier.instance;
  }

  public classifyError(
    error: Error,
    source: string,
    operation: string,
    context?: Record<string, any>
  ): ClassifiedError {
    const baseError: ClassifiedError = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: {
        ...context,
        source,
        operation,
        timestamp: Date.now()
      },
      originalError: error
    };

    // Network errors
    if (
      error.message.includes('ETIMEDOUT') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('network error')
    ) {
      return {
        ...baseError,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM
      };
    }

    // Validation errors
    if (
      error.message.includes('validation') ||
      error.message.includes('invalid') ||
      error.message.includes('not found')
    ) {
      return {
        ...baseError,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW
      };
    }

    // System errors
    if (
      error.message.includes('out of memory') ||
      error.message.includes('stack overflow') ||
      error.message.includes('system error')
    ) {
      return {
        ...baseError,
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL
      };
    }

    // Business logic errors
    if (
      error.message.includes('insufficient funds') ||
      error.message.includes('unauthorized') ||
      error.message.includes('forbidden')
    ) {
      return {
        ...baseError,
        category: ErrorCategory.BUSINESS,
        severity: ErrorSeverity.HIGH
      };
    }

    return baseError;
  }
}
