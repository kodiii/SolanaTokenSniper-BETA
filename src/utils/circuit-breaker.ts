export enum CircuitState {
  CLOSED = 'CLOSED',   // Normal operation, requests allowed
  OPEN = 'OPEN',       // Circuit is open, requests are blocked
  HALF_OPEN = 'HALF_OPEN', // Testing if service is back to normal
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  resetTimeout: number;          // Time in ms before attempting reset
  halfOpenMaxAttempts: number;   // Max attempts in half-open state
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenAttempts: number = 0;

  constructor(
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      halfOpenMaxAttempts: 3,
    }
  ) {}

  public async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new Error(`Circuit breaker is ${this.state}. Request rejected.`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.resetTimeout) {
        this.toHalfOpen();
        return true;
      }
      return false;
    }

    return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.reset();
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN || 
        this.failures >= this.config.failureThreshold) {
      this.toOpen();
    }
  }

  private toOpen(): void {
    this.state = CircuitState.OPEN;
    this.halfOpenAttempts = 0;
  }

  private toHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.failures = 0;
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.halfOpenAttempts = 0;
  }

  public getState(): CircuitState {
    return this.state;
  }

  public getFailures(): number {
    return this.failures;
  }
}
