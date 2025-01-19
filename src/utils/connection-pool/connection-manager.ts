import { Connection, ConnectionConfig } from '@solana/web3.js';
import { Logger } from '../logger';
import { PooledConnection, PoolConfig } from './types';
import { HealthChecker } from './health-checker';
import { ErrorClassifier } from '../error-classifier';
import { config } from '../../config';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

export class ConnectionManager {
  private healthChecker: HealthChecker;

  private readonly errorClassifier: ErrorClassifier;

  constructor(
    private readonly logger: Logger,
    private readonly poolConfig: PoolConfig = {
      minConnections: config.rpc.min_connections || 2,
      maxConnections: config.rpc.max_connections || 5,
      connectionTTL: 3600000,
      idleTimeout: 300000,
      healthCheckInterval: 60000,
      retryDelay: 5000
    }
  ) {
    this.healthChecker = new HealthChecker(logger);
    this.errorClassifier = ErrorClassifier.getInstance();
  }

  async createConnection(endpoint: string, opts?: ConnectionConfig): Promise<PooledConnection> {
    // Use Helius endpoint if available, otherwise fallback to provided endpoint
    const primaryEndpoint = process.env.HELIUS_HTTPS_URI || endpoint;
    
    const connectionConfig: ConnectionConfig = {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.rpc.connection_timeout,
      httpAgent: primaryEndpoint.
      startsWith('https://')
        ? new HttpsAgent({
            keepAlive: true,
            keepAliveMsecs: 5000,
            timeout: 5000
          })
        : new HttpAgent({
            keepAlive: true,
            keepAliveMsecs: 5000,
            timeout: 5000
          }),
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(input, {
            ...init,
            signal: controller.signal
          } as RequestInit);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          return response;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out');
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      },
      ...opts
    };

    const connection = new Connection(primaryEndpoint, connectionConfig);
    try {
      await this.healthChecker.validateConnection(connection, primaryEndpoint);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const classifiedError = this.errorClassifier.classifyError(
        errorObj,
        'ConnectionManager',
        'createConnection',
        { endpoint }
      );
      this.logger.error('Failed to create connection', classifiedError);
      throw error;
    }

    return {
      connection,
      endpoint,
      lastUsed: Date.now(),
      inUse: false,
      errorCount: 0,
      successCount: 0,
      avgResponseTime: 0
    };
  }

  isConnectionExpired(conn: PooledConnection): boolean {
    const now = Date.now();
    const age = now - conn.lastUsed;
    return age > this.poolConfig.connectionTTL;
  }

  isConnectionIdle(conn: PooledConnection): boolean {
    const now = Date.now();
    const idleTime = now - conn.lastUsed;
    return !conn.inUse && idleTime > this.poolConfig.idleTimeout;
  }

  async refreshConnection(conn: PooledConnection): Promise<PooledConnection> {
    try {
      const newConn = await this.createConnection(conn.endpoint);
      this.logger.info(`Refreshed connection to ${conn.endpoint}`);
      return newConn;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const classifiedError = this.errorClassifier.classifyError(
        errorObj,
        'ConnectionManager',
        'refreshConnection',
        { endpoint: conn.endpoint }
      );
      this.logger.error(`Failed to refresh connection to ${conn.endpoint}`, classifiedError);
      throw error;
    }
  }

  markConnectionAsUsed(conn: PooledConnection) {
    conn.lastUsed = Date.now();
    conn.inUse = true;
  }

  markConnectionAsAvailable(conn: PooledConnection) {
    conn.inUse = false;
  }
}
