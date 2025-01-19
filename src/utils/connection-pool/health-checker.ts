import { Connection } from '@solana/web3.js';
import { Logger } from '../logger';
import { PooledConnection } from './types';
import { ErrorClassifier, ErrorCategory, ErrorSeverity } from '../errors';

export class HealthChecker {
  private errorClassifier: ErrorClassifier;

  constructor(private readonly logger: Logger) {
    this.errorClassifier = new ErrorClassifier();
  }

  async checkConnectionHealth(conn: PooledConnection): Promise<boolean> {
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 5000;
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const start = Date.now();
        
        // Use Promise.race to implement timeout
        const slot = await Promise.race([
          conn.connection.getSlot(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), TIMEOUT_MS)
          )
        ]);
        
        // Validate slot number
        if (typeof slot !== 'number' || slot <= 0) {
          throw new Error(`Invalid slot number received: ${slot}`);
        }
        
        const responseTime = Date.now() - start;
        this.updateConnectionMetrics(conn, responseTime, true);
        return true;
        
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          this.updateConnectionMetrics(conn, 0, false);
          const classifiedError = ErrorClassifier.classifyError(
            error,
            'HealthChecker',
            'checkConnectionHealth',
            {
              endpoint: conn.endpoint,
              attempt: attempt + 1
            }
          );
          this.logger.error('Health check failed', classifiedError);
          return false;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return false;
  }

  private updateConnectionMetrics(conn: PooledConnection, responseTime: number, success: boolean) {
    if (success) {
      conn.successCount++;
      // Update average response time using exponential moving average
      conn.avgResponseTime = conn.avgResponseTime === 0 
        ? responseTime 
        : conn.avgResponseTime * 0.7 + responseTime * 0.3;
    } else {
      conn.errorCount++;
    }
  }

  async validateConnection(connection: Connection, endpoint: string): Promise<void> {
    const TIMEOUT_MS = 5000;
    
    try {
      // First try getSlot() with explicit commitment
      const slotPromise = connection.getSlot('finalized').catch(async (err) => {
        // If that fails, try getLatestBlockhash as a fallback
        return connection.getLatestBlockhash().then(() => 1).catch(() => {
          throw err; // If both fail, throw the original error
        });
      });
      
      const slot = await Promise.race([
        slotPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Validation timeout')), TIMEOUT_MS)
        )
      ]);
      
      // More lenient validation - just ensure we got some response
      if (slot === undefined || slot === null) {
        throw new Error('Invalid response from RPC endpoint');
      }
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'HealthChecker',
        'validateConnection',
        {
          endpoint,
          validationError: error instanceof Error ? error.message : String(error)
        }
      );

      if (classifiedError.severity === ErrorSeverity.CRITICAL) {
        throw new Error(`Critical error validating connection to ${endpoint}: ${classifiedError.message}`);
      }
      
      // Log non-critical validation errors but don't fail
      this.logger.warn(`Non-critical error validating connection to ${endpoint}`, classifiedError);
    }
  }
}
