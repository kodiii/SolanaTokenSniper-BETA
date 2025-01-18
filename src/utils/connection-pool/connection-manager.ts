import { Connection, ConnectionConfig } from '@solana/web3.js';
import { Logger } from '../logger';
import { PooledConnection, PoolConfig } from './types';
import { HealthChecker } from './health-checker';
import { config } from '../../config';

export class ConnectionManager {
  private healthChecker: HealthChecker;

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
  }

  async createConnection(endpoint: string, opts?: ConnectionConfig): Promise<PooledConnection> {
    const connectionConfig: ConnectionConfig = {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.rpc.connection_timeout,
      ...opts
    };

    const connection = new Connection(endpoint, connectionConfig);
    await this.healthChecker.validateConnection(connection, endpoint);

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
      this.logger.error(`Failed to refresh connection to ${conn.endpoint}`, { error });
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
