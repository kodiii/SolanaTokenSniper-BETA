import { Pool, QueryResult } from 'pg';
import { ConnectionPool } from './pool';
import { QueryCacheManager } from './cache';
import { DatabaseConfig, QueryOptions, DatabaseMetrics, QueryMetrics, PreparedStatement } from './types';
import { Logger } from '../utils/logger';
import { ErrorClassifier } from '../utils/errors';

export class Database {
  private static instance: Database;
  private readonly pool: ConnectionPool;
  private readonly cache: QueryCacheManager;
  private readonly logger: Logger;
  private readonly preparedStatements: Map<string, PreparedStatement>;
  private readonly config: DatabaseConfig;
  private queryMetrics: QueryMetrics[];
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 second

  private constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      minConnections: parseInt(process.env.DB_MIN_CONNECTIONS || '5'),
      connectionIdleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000'),
      statementTimeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
      queryTimeout: parseInt(process.env.DB_QUERY_TIMEOUT || '5000')
    };

    this.pool = ConnectionPool.getInstance(this.config);
    this.cache = QueryCacheManager.getInstance();
    this.logger = Logger.getInstance();
    this.preparedStatements = new Map();
    this.queryMetrics = [];

    this.setupPreparedStatements();
    this.startPeriodicCleanup();
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  private async setupPreparedStatements(): Promise<void> {
    const statements: PreparedStatement[] = [
      {
        name: 'get_token_price',
        text: 'SELECT price, timestamp FROM token_prices WHERE address = $1 ORDER BY timestamp DESC LIMIT 1'
      },
      {
        name: 'insert_transaction',
        text: 'INSERT INTO transactions (hash, block_number, timestamp, status) VALUES ($1, $2, $3, $4)'
      }
    ];

    for (const stmt of statements) {
      this.preparedStatements.set(stmt.name, stmt);
      try {
        await this.pool.query(`PREPARE ${stmt.name} AS ${stmt.text}`);
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(
          error instanceof Error ? error : new Error(String(error)),
          'Database',
          'setupPreparedStatements',
          { statementName: stmt.name }
        );
        this.logger.error('Error preparing statement', classifiedError);
      }
    }
  }

  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.performCleanup();
    }, 3600000); // Run every hour
  }

  private async performCleanup(): Promise<void> {
    try {
      const oneHourAgo = Date.now() - 3600000;
      this.queryMetrics = this.queryMetrics.filter(m => m.timestamp > oneHourAgo);
      await this.cache.cleanup();
      await this.pool.query('DELETE FROM token_prices WHERE timestamp < NOW() - INTERVAL \'7 days\'');
      this.logger.info('Database cleanup completed');
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'Database',
        'performCleanup'
      );
      this.logger.error('Error during database cleanup', classifiedError);
    }
  }

  public async query(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult> {
    const startTime = Date.now();
    const queryId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      if (options?.useCache) {
        const cacheKey = `${sql}:${JSON.stringify(params)}`;
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.recordQueryMetrics(queryId, sql, startTime, cached.rowCount || 0, true);
          return cached;
        }
      }

      const result = await this.pool.query(sql, params, options);

      if (options?.useCache && options.cacheTTL) {
        const cacheKey = `${sql}:${JSON.stringify(params)}`;
        await this.cache.set(cacheKey, result, options.cacheTTL);
      }

      this.recordQueryMetrics(queryId, sql, startTime, result.rowCount || 0, false);
      return result;
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'Database',
        'query',
        { sql, params }
      );
      this.logger.error('Query error', classifiedError);
      this.recordQueryMetrics(queryId, sql, startTime, 0, false, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private recordQueryMetrics(
    queryId: string,
    sql: string,
    startTime: number,
    rowCount: number,
    cached: boolean,
    error?: Error
  ): void {
    const duration = Date.now() - startTime;
    const metrics: QueryMetrics = {
      queryId,
      sql,
      duration: error ? -duration : duration,
      timestamp: Date.now(),
      rowCount,
      cached,
      status: error ? 'error' : duration > this.SLOW_QUERY_THRESHOLD ? 'timeout' : 'success'
    };

    this.queryMetrics.push(metrics);
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      const slowQueryError = ErrorClassifier.classifyError(
        new Error('Slow query detected'),
        'Database',
        'recordQueryMetrics',
        { metrics }
      );
      this.logger.warn('Slow query detected', slowQueryError);
    }
  }

  public async getMetrics(): Promise<DatabaseMetrics> {
    const poolMetrics = await this.pool.getPoolMetrics();
    const slowQueries = this.queryMetrics.filter(m => m.duration > this.SLOW_QUERY_THRESHOLD);
    const errorRate = this.calculateErrorRate();

    return {
      queryMetrics: this.queryMetrics.slice(-100),
      poolMetrics,
      slowQueries,
      errorRate,
      lastCleanup: Date.now()
    };
  }

  private calculateErrorRate(): number {
    const recentQueries = this.queryMetrics.filter(m => 
      m.timestamp > Date.now() - 300000
    );
    if (recentQueries.length === 0) return 0;

    const errorCount = recentQueries.filter(m => m.status === 'error' || m.status === 'timeout').length;
    return errorCount / recentQueries.length;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}
