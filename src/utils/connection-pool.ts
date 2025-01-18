import { Connection, ConnectionConfig } from '@solana/web3.js';
import { config } from '../config';
import { Logger, LogLevel } from './logger';
import { ErrorClassifier, ClassifiedError, ErrorCategory, ErrorSeverity } from './errors';
import { ConnectionManager } from './connection-pool/connection-manager';
import { HealthChecker } from './connection-pool/health-checker';

export class ConnectionPool {
  private static instance: ConnectionPool;
  private pool: PooledConnection[] = [];
  private unhealthyConnections: Set<string> = new Set();
  private connectionManager: ConnectionManager;
  private healthChecker: HealthChecker;
  private errorClassifier: ErrorClassifier;

  private constructor(
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
    this.connectionManager = new ConnectionManager(logger, poolConfig);
    this.healthChecker = new HealthChecker(logger);
    this.errorClassifier = new ErrorClassifier();
    this.initializePool();
    this.startHealthCheck();
  }

  public static getInstance(logger: Logger): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool(logger);
    }
    return ConnectionPool.instance;
  }

  private async initializePool() {
    const endpoints = (config.rpc.endpoints || []).filter((endpoint): endpoint is string => !!endpoint);
    for (let i = 0; i < this.poolConfig.minConnections; i++) {
      const endpoint = endpoints[i % endpoints.length];
      if (!endpoint) {
        await this.logger.log(LogLevel.ERROR, 'No valid endpoints available');
        continue;
      }
      try {
        const conn = await this.connectionManager.createConnection(endpoint);
        this.pool.push(conn);
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'ConnectionPool', 'initializePool', {
          endpoint
        });
        await this.logger.error('Failed to initialize connection', classifiedError);
        this.unhealthyConnections.add(endpoint);
      }
    }
  }

  private startHealthCheck() {
    setInterval(async () => {
      for (const conn of this.pool) {
        if (!conn.inUse) {
          const isHealthy = await this.healthChecker.checkConnectionHealth(conn);
          if (!isHealthy) {
            this.unhealthyConnections.add(conn.endpoint);
            await this.replaceUnhealthyConnection(conn);
          }
        }
      }
    }, this.poolConfig.healthCheckInterval);
  }

  private async replaceUnhealthyConnection(conn: PooledConnection) {
    const endpoints = (config.rpc.endpoints || [])
      .filter((endpoint): endpoint is string => !!endpoint)
      .filter(ep => !this.unhealthyConnections.has(ep));

    if (endpoints.length === 0) {
      await this.logger.log(LogLevel.ERROR, 'No healthy endpoints available');
      return;
    }

    const newEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    try {
      const newConn = await this.connectionManager.createConnection(newEndpoint);
      const index = this.pool.indexOf(conn);
      if (index !== -1) {
        this.pool[index] = newConn;
      }
      this.unhealthyConnections.delete(conn.endpoint);
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(error, 'ConnectionPool', 'replaceUnhealthyConnection', {
        endpoint: newEndpoint
      });
      await this.logger.error('Failed to replace unhealthy connection', classifiedError);
    }
  }

  public async getConnection(): Promise<Connection> {
    // Find available connection
    let conn = this.pool.find(c => !c.inUse);

    // If no available connection and we haven't reached max, create new one
    if (!conn && this.pool.length < this.poolConfig.maxConnections) {
      const endpoints = (config.rpc.endpoints || [])
        .filter((endpoint): endpoint is string => !!endpoint)
        .filter(ep => !this.unhealthyConnections.has(ep));

      if (endpoints.length > 0) {
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        try {
          conn = await this.connectionManager.createConnection(endpoint);
          this.pool.push(conn);
        } catch (error) {
          const classifiedError = ErrorClassifier.classifyError(error, 'ConnectionPool', 'getConnection', {
            endpoint
          });
          await this.logger.error('Failed to create new connection', classifiedError);
        }
      }
    }

    // If still no connection, wait for one to become available
    if (!conn) {
      conn = await this.waitForAvailableConnection();
    }

    // Check if connection needs refresh
    if (this.connectionManager.isConnectionExpired(conn)) {
      try {
        conn = await this.connectionManager.refreshConnection(conn);
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'ConnectionPool', 'getConnection', {
          endpoint: conn.endpoint
        });
        await this.logger.error('Failed to refresh connection', classifiedError);
      }
    }

    this.connectionManager.markConnectionAsUsed(conn);
    return conn.connection;
  }

  private async waitForAvailableConnection(): Promise<PooledConnection> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const conn = this.pool.find(c => !c.inUse);
        if (conn) {
          clearInterval(checkInterval);
          resolve(conn);
        }
      }, 100);
    });
  }

  public releaseConnection(connection: Connection) {
    const conn = this.pool.find(c => c.connection === connection);
    if (conn) {
      this.connectionManager.markConnectionAsAvailable(conn);
    }
  }

  public getPoolSize(): number {
    return this.pool.length;
  }

  public getUnhealthyEndpoints(): string[] {
    return Array.from(this.unhealthyConnections);
  }
}

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTTL: number;
  idleTimeout: number;
  healthCheckInterval: number;
  retryDelay: number;
}

interface PooledConnection {
  connection: Connection;
  endpoint: string;
  lastUsed: number;
  inUse: boolean;
  errorCount: number;
  successCount: number;
  avgResponseTime: number;
}

// Type guard for Error
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Type guard for ClassifiedError
function isClassifiedError(error: unknown): error is ClassifiedError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

// Type guard for Record<string, any>
function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}
