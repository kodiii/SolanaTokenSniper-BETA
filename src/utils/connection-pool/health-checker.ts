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
    try {
      const start = Date.now();
      await conn.connection.getSlot();
      const responseTime = Date.now() - start;

      // Update metrics
      this.updateConnectionMetrics(conn, responseTime, true);
      return true;
    } catch (error) {
      this.updateConnectionMetrics(conn, 0, false);
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'HealthChecker',
        'checkConnectionHealth',
        { endpoint: conn.endpoint }
      );
      this.logger.error('Health check failed', classifiedError);
      return false;
    }
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
    try {
      await connection.getSlot();
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'HealthChecker',
        'validateConnection',
        { endpoint }
      );

      if (classifiedError.severity === ErrorSeverity.CRITICAL) {
        throw new Error(`Critical error validating connection to ${endpoint}: ${classifiedError.message}`);
      }

      if (classifiedError.category === ErrorCategory.NETWORK) {
        throw new Error(`Connection error for endpoint ${endpoint}: ${classifiedError.message}`);
      }

      this.logger.warn(`Non-critical error validating connection to ${endpoint}`, { error: classifiedError });
    }
  }
}
