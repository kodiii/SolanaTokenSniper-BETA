import { CircuitBreaker, CircuitBreakerConfig } from '../utils/circuit-breaker';
import { Logger } from '../utils/logger';

export class PriceCircuitManager {
  private static instance: PriceCircuitManager;
  private breakers: Map<string, CircuitBreaker>;
  private readonly logger: Logger;

  private constructor() {
    this.breakers = new Map();
    this.logger = Logger.getInstance();
    this.initializeBreakers();
  }

  public static getInstance(): PriceCircuitManager {
    if (!PriceCircuitManager.instance) {
      PriceCircuitManager.instance = new PriceCircuitManager();
    }
    return PriceCircuitManager.instance;
  }

  private initializeBreakers(): void {
    const defaultConfig: CircuitBreakerConfig = {
      failureThreshold: 5,
      resetTimeout: 30000, // 30 seconds
      halfOpenMaxAttempts: 2
    };

    // Initialize circuit breakers for each price source
    this.breakers.set('jupiter', new CircuitBreaker(defaultConfig));
    this.breakers.set('dexscreener', new CircuitBreaker(defaultConfig));
  }

  public async executeWithBreaker<T>(
    source: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const breaker = this.breakers.get(source);
    if (!breaker) {
      throw new Error(`No circuit breaker found for source: ${source}`);
    }

    try {
      return await breaker.execute(operation);
    } catch (error) {
      await this.logger.warn(
        `Circuit breaker for ${source} prevented operation`,
        { 
          source,
          state: breaker.getState(),
          failures: breaker.getFailures()
        }
      );
      throw error;
    }
  }

  public getBreaker(source: string): CircuitBreaker | undefined {
    return this.breakers.get(source);
  }
}
