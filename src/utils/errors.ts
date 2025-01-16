import { AxiosError } from 'axios';

export enum ErrorSeverity {
  CRITICAL = 'CRITICAL',   // System cannot continue, immediate attention required
  HIGH = 'HIGH',          // Major functionality is impacted
  MEDIUM = 'MEDIUM',      // Partial functionality is impacted
  LOW = 'LOW',           // Minor issue, system can continue
  INFO = 'INFO'          // Informational only
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',           // Network-related errors
  API = 'API',                   // External API errors
  VALIDATION = 'VALIDATION',     // Data validation errors
  RATE_LIMIT = 'RATE_LIMIT',     // Rate limiting errors
  TIMEOUT = 'TIMEOUT',           // Timeout errors
  AUTH = 'AUTH',                 // Authentication/Authorization errors
  DATA = 'DATA',                 // Data processing/integrity errors
  CONFIG = 'CONFIG',             // Configuration errors
  SYSTEM = 'SYSTEM',             // System-level errors
  UNKNOWN = 'UNKNOWN'            // Unclassified errors
}

export interface ErrorMetadata {
  timestamp: number;
  source: string;
  operation: string;
  details?: Record<string, any>;
  stack?: string;
}

export class ClassifiedError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly metadata: ErrorMetadata;
  public readonly originalError?: Error;
  public readonly retryable: boolean;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    metadata: ErrorMetadata,
    originalError?: Error,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'ClassifiedError';
    this.category = category;
    this.severity = severity;
    this.metadata = metadata;
    this.originalError = originalError;
    this.retryable = retryable;
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      metadata: this.metadata,
      retryable: this.retryable,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

export class ErrorClassifier {
  private static readonly NETWORK_ERROR_PATTERNS = [
    /ETIMEDOUT/,
    /ECONNRESET/,
    /ECONNREFUSED/,
    /ENOTFOUND/,
    /network error/i,
    /socket hang up/
  ];

  private static readonly RATE_LIMIT_PATTERNS = [
    /rate limit/i,
    /too many requests/i,
    /429/
  ];

  private static readonly AUTH_ERROR_PATTERNS = [
    /unauthorized/i,
    /forbidden/i,
    /invalid.+token/i,
    /expired.+token/i,
    /401|403/
  ];

  public static classifyError(
    error: Error | unknown,
    source: string,
    operation: string,
    details?: Record<string, any>
  ): ClassifiedError {
    const metadata: ErrorMetadata = {
      timestamp: Date.now(),
      source,
      operation,
      details,
      stack: error instanceof Error ? error.stack : undefined
    };

    if (error instanceof ClassifiedError) {
      return error;
    }

    // Handle Axios errors
    if (error instanceof AxiosError) {
      return this.classifyAxiosError(error, metadata);
    }

    // Handle other known error types
    if (error instanceof Error) {
      return this.classifyGenericError(error, metadata);
    }

    // Handle unknown errors
    return new ClassifiedError(
      String(error),
      ErrorCategory.UNKNOWN,
      ErrorSeverity.HIGH,
      metadata,
      error instanceof Error ? error : undefined,
      false
    );
  }

  private static classifyAxiosError(error: AxiosError, metadata: ErrorMetadata): ClassifiedError {
    const status = error.response?.status;
    let category = ErrorCategory.API;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = true;

    // Classify based on status code
    if (status) {
      if (status === 429) {
        category = ErrorCategory.RATE_LIMIT;
        severity = ErrorSeverity.HIGH;
      } else if (status >= 500) {
        category = ErrorCategory.API;
        severity = ErrorSeverity.HIGH;
      } else if (status === 401 || status === 403) {
        category = ErrorCategory.AUTH;
        severity = ErrorSeverity.HIGH;
        retryable = false;
      } else if (status === 404) {
        category = ErrorCategory.API;
        severity = ErrorSeverity.MEDIUM;
        retryable = false;
      }
    }

    // Classify based on error code
    if (error.code) {
      if (this.NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(error.code!))) {
        category = ErrorCategory.NETWORK;
        severity = ErrorSeverity.HIGH;
      } else if (error.code === 'ECONNABORTED') {
        category = ErrorCategory.TIMEOUT;
        severity = ErrorSeverity.MEDIUM;
      }
    }

    return new ClassifiedError(
      error.message,
      category,
      severity,
      {
        ...metadata,
        details: {
          ...metadata.details,
          status,
          code: error.code,
          url: error.config?.url,
          method: error.config?.method
        }
      },
      error,
      retryable
    );
  }

  private static classifyGenericError(error: Error, metadata: ErrorMetadata): ClassifiedError {
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = false;

    // Classify based on error message patterns
    if (this.NETWORK_ERROR_PATTERNS.some(pattern => pattern.test(error.message))) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
      retryable = true;
    } else if (this.RATE_LIMIT_PATTERNS.some(pattern => pattern.test(error.message))) {
      category = ErrorCategory.RATE_LIMIT;
      severity = ErrorSeverity.HIGH;
      retryable = true;
    } else if (this.AUTH_ERROR_PATTERNS.some(pattern => pattern.test(error.message))) {
      category = ErrorCategory.AUTH;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    } else if (/timeout/i.test(error.message)) {
      category = ErrorCategory.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (/validation/i.test(error.message)) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.MEDIUM;
      retryable = false;
    }

    return new ClassifiedError(
      error.message,
      category,
      severity,
      metadata,
      error,
      retryable
    );
  }
}
