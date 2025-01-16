import { Pool, PoolClient, QueryResult } from 'pg';
import { DatabaseConfig, ConnectionPoolMetrics, QueryOptions, DatabaseTransaction } from './types';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { ErrorClassifier } from '../utils/errors';

export class ConnectionPool {
  private static instance: ConnectionPool;
  private pool: Pool;
  private readonly logger: Logger;
  private activeTransactions: Map<string, DatabaseTransaction>;
  private readonly config: DatabaseConfig;

  private constructor(config: DatabaseConfig) {
    this.config = config;
    this.logger = Logger.getInstance();
    this.activeTransactions = new Map();

    this.pool = new Pool({
      ...config,
      max: config.maxConnections,
      min: config.minConnections,
      idleTimeoutMillis: config.connectionIdleTimeout,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      statement_timeout: config.statementTimeout,
      query_timeout: config.queryTimeout
    });

    this.setupPoolEvents();
    this.startMaintenanceTask();
  }

  public static getInstance(config?: DatabaseConfig): ConnectionPool {
    if (!ConnectionPool.instance) {
      if (!config) {
        throw new Error('Database configuration required for initial setup');
      }
      ConnectionPool.instance = new ConnectionPool(config);
    }
    return ConnectionPool.instance;
  }

  private setupPoolEvents(): void {
    this.pool.on('error', (err, client) => {
      const classifiedError = ErrorClassifier.classifyError(
        err,
        'ConnectionPool',
        'poolEvent',
        { poolSize: this.pool.totalCount }
      );
      this.logger.error('Unexpected error on idle client', classifiedError);
    });

    this.pool.on('connect', (client) => {
      this.logger.info('New database connection established');
    });

    this.pool.on('remove', (client) => {
      this.logger.info('Database connection removed from pool');
    });
  }

  private startMaintenanceTask(): void {
    setInterval(() => {
      this.performMaintenance();
    }, 60000); // Run every minute
  }

  private async performMaintenance(): Promise<void> {
    try {
      // Clean up idle connections
      const metrics = await this.getPoolMetrics();
      if (metrics.idleConnections > this.config.minConnections) {
        await this.pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = $1', ['idle']);
      }

      // Check for long-running transactions
      this.activeTransactions.forEach((transaction, id) => {
        const duration = Date.now() - transaction.startTime;
        if (duration > this.config.queryTimeout) {
          this.logger.warn('Long-running transaction detected', {
            transactionId: id,
            duration,
            operations: transaction.operations
          });
        }
      });

    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'ConnectionPool',
        'performMaintenance',
        { poolSize: this.pool.totalCount }
      );
      this.logger.error('Error during pool maintenance', classifiedError);
    }
  }

  public async getPoolMetrics(): Promise<ConnectionPoolMetrics> {
    const { totalCount, idleCount, waitingCount } = this.pool;
    
    return {
      totalConnections: totalCount,
      activeConnections: totalCount - idleCount,
      idleConnections: idleCount,
      waitingClients: waitingCount,
      lastMaintenance: Date.now()
    };
  }

  public async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  public async beginTransaction(): Promise<DatabaseTransaction> {
    const client = await this.getClient();
    const transactionId = uuidv4();

    try {
      await client.query('BEGIN');
      const transaction: DatabaseTransaction = {
        id: transactionId,
        client,
        startTime: Date.now(),
        operations: 0,
        status: 'active'
      };

      this.activeTransactions.set(transactionId, transaction);
      return transaction;
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'ConnectionPool',
        'beginTransaction',
        { transactionId }
      );
      this.logger.error('Error starting transaction', classifiedError);
      client.release();
      throw error;
    }
  }

  public async commitTransaction(transaction: DatabaseTransaction): Promise<void> {
    try {
      await transaction.client.query('COMMIT');
      transaction.status = 'committed';
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'ConnectionPool',
        'commitTransaction',
        { transactionId: transaction.id }
      );
      this.logger.error('Error committing transaction', classifiedError);
      throw error;
    } finally {
      transaction.client.release();
      this.activeTransactions.delete(transaction.id);
    }
  }

  public async rollbackTransaction(transaction: DatabaseTransaction): Promise<void> {
    try {
      await transaction.client.query('ROLLBACK');
      transaction.status = 'rolled_back';
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'ConnectionPool',
        'rollbackTransaction',
        { transactionId: transaction.id }
      );
      this.logger.error('Error rolling back transaction', classifiedError);
      throw error;
    } finally {
      transaction.client.release();
      this.activeTransactions.delete(transaction.id);
    }
  }

  public async query(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      if (options?.timeout) {
        await client.query(`SET statement_timeout = ${options.timeout}`);
      }

      const result = await client.query(sql, params);
      return result;
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'ConnectionPool',
        'query',
        { sql, params }
      );
      this.logger.error('Query error', classifiedError);
      throw error;
    } finally {
      client.release();
    }
  }

  public async end(): Promise<void> {
    try {
      await this.pool.end();
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'ConnectionPool',
        'end',
        { poolSize: this.pool.totalCount }
      );
      this.logger.error('Error ending pool', classifiedError);
      throw error;
    }
  }
}
