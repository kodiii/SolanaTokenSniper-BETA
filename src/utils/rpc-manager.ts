import { Connection } from '@solana/web3.js';
import { ConnectionPool } from './connection-pool';
import { Logger, LogLevel } from './logger';
import { ErrorClassifier } from './errors';

export class RPCManager {
  private static instance: RPCManager;
  private connectionPool: ConnectionPool;
  private logger: Logger;
  private errorClassifier: ErrorClassifier;

  private constructor() {
    this.logger = Logger.getInstance();
    this.connectionPool = ConnectionPool.getInstance(this.logger);
    this.errorClassifier = new ErrorClassifier();
  }

  public static getInstance(): RPCManager {
    if (!RPCManager.instance) {
      RPCManager.instance = new RPCManager();
    }
    return RPCManager.instance;
  }

  public async getConnection(): Promise<Connection> {
    return this.connectionPool.getConnection();
  }

  public releaseConnection(connection: Connection): void {
    this.connectionPool.releaseConnection(connection);
  }

  public async withConnection<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();
    try {
      return await operation(connection);
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error,
        'RPCManager',
        'withConnection',
        { endpoint: connection.rpcEndpoint }
      );
      await this.logger.error('Operation failed', classifiedError);
      throw classifiedError;
    } finally {
      this.releaseConnection(connection);
    }
  }

  public getPoolSize(): number {
    return this.connectionPool.getPoolSize();
  }

  public getUnhealthyEndpoints(): string[] {
    return this.connectionPool.getUnhealthyEndpoints();
  }
}

// Export singleton instance
export const rpcManager = RPCManager.getInstance();
