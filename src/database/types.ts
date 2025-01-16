import { PoolConfig, Pool, QueryResult } from 'pg';

export interface DatabaseConfig extends PoolConfig {
  maxConnections: number;
  minConnections: number;
  connectionIdleTimeout: number;
  connectionTimeoutMillis: number;
  statementTimeout: number;
  queryTimeout: number;
}

export interface QueryMetrics {
  queryId: string;
  sql: string;
  duration: number;  // Negative duration indicates error
  timestamp: number;
  rowCount: number;
  cached: boolean;
  status: 'success' | 'error' | 'timeout';
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  lastMaintenance: number;
}

export interface DatabaseMetrics {
  queryMetrics: QueryMetrics[];
  poolMetrics: ConnectionPoolMetrics;
  slowQueries: QueryMetrics[];
  errorRate: number;
  lastCleanup: number;
}

export interface QueryOptions {
  useCache?: boolean;
  cacheTTL?: number;
  priority?: 'high' | 'normal' | 'low';
  timeout?: number;
}

export interface PreparedStatement {
  name: string;
  text: string;
  values?: any[];
}

export interface DatabaseTransaction {
  id: string;
  client: any;
  startTime: number;
  operations: number;
  status: 'active' | 'committed' | 'rolled_back';
}

export interface QueryCache {
  get(key: string): Promise<QueryResult | null>;
  set(key: string, result: QueryResult, ttl?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  cleanup(): Promise<void>;
}
