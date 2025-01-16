import { Connection, ConnectionConfig } from '@solana/web3.js';
import { config } from '../config';
import { Logger } from './logger';
import { ErrorClassifier } from './errors';

interface PooledConnection {
  connection: Connection;
  endpoint: string;
  lastUsed: number;
  inUse: boolean;
  errorCount: number;
  successCount: number;
  avgResponseTime: number;
}

interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTTL: number;       // Time to live for connections in ms
  idleTimeout: number;         // Time before removing idle connections in ms
  healthCheckInterval: number; // Interval for health checks in ms
  retryDelay: number;         // Delay between retries in ms
}

export class ConnectionPool {
  private static instance: ConnectionPool;
  private pool: PooledConnection[] = [];
  private logger: Logger;

  private constructor(
    private readonly poolConfig: PoolConfig = {
      minConnections: config.rpc.min_connections || 2,
      maxConnections: config.rpc.max_connections || 10,
      connectionTTL: 3600000,    // 1 hour
      idleTimeout: 300000,       // 5 minutes
      healthCheckInterval: 60000, // 1 minute
      retryDelay: 1000,          // 1 second
    }
  ) {
    this.logger = Logger.getInstance();
    this.initializePool();
    this.startHealthCheck();
  }

  public static getInstance(config?: PoolConfig): ConnectionPool {
    if (!ConnectionPool.instance) {
      ConnectionPool.instance = new ConnectionPool(config);
    }
    return ConnectionPool.instance;
  }

  private async initializePool(): Promise<void> {
    try {
      // Use Helius RPC endpoint directly
      const heliusRpcUrl = process.env.HELIUS_WSS_URI?.replace('wss://', 'https://') || "";
      
      if (heliusRpcUrl) {
        this.logger.info('Using Helius RPC endpoint');
        const connection = new Connection(heliusRpcUrl, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: config.rpc.connection_timeout
        });
        
        this.pool.push({
          connection,
          endpoint: heliusRpcUrl,
          lastUsed: Date.now(),
          inUse: false,
          errorCount: 0,
          successCount: 0,
          avgResponseTime: 0
        });
      }

      // Also add fallback endpoints for redundancy
      const endpoints = config.rpc.endpoints;
      const minConnections = Math.min(this.poolConfig.minConnections - 1, endpoints.length);

      for (let i = 0; i < minConnections; i++) {
        const endpoint = endpoints[i];
        const connection = new Connection(endpoint, {
          commitment: 'confirmed',
          confirmTransactionInitialTimeout: config.rpc.connection_timeout
        });
        this.pool.push({
          connection,
          endpoint,
          lastUsed: Date.now(),
          inUse: false,
          errorCount: 0,
          successCount: 0,
          avgResponseTime: 0
        });
      }
    } catch (error: any) {
      const classifiedError = ErrorClassifier.classifyError(error, 'ConnectionPool', 'initializePool');
      this.logger.error('Failed to initialize connection pool:', classifiedError);
      throw classifiedError;
    }
  }

  private getNextEndpoint(): string {
    const endpoints = config.rpc.endpoints;
    const now = Date.now();
    
    // Find the endpoint with the least recent usage and lowest error count
    let bestEndpoint = endpoints[0];
    let bestScore = -Infinity;
    
    endpoints.forEach(endpoint => {
      const conn = this.pool.find(c => c.endpoint === endpoint);
      if (!conn) {
        // New endpoint, give it a high score to try it
        bestEndpoint = endpoint;
        return;
      }
      
      // Calculate score based on last used time and error count
      const timeSinceLastUse = now - conn.lastUsed;
      const errorPenalty = conn.errorCount * 1000; // 1 second penalty per error
      const successBonus = conn.successCount * 100; // Small bonus for successful calls
      const score = timeSinceLastUse - errorPenalty + successBonus;
      
      if (score > bestScore) {
        bestScore = score;
        bestEndpoint = endpoint;
      }
    });
    
    return bestEndpoint;
  }

  public async acquireConnection(): Promise<Connection> {
    // First try to find a completely free connection
    const availableConnection = this.pool.find(conn => 
      !conn.inUse && 
      conn.errorCount < 3 && // Skip connections with too many errors
      Date.now() - conn.lastUsed > 1000 // Ensure minimum delay between uses
    );
    
    if (availableConnection) {
      availableConnection.inUse = true;
      availableConnection.lastUsed = Date.now();
      return availableConnection.connection;
    }

    // If no ideal connection is available, but we're under max connections, create new one
    if (this.pool.length < this.poolConfig.maxConnections) {
      const endpoint = this.getNextEndpoint();
      const connectionConfig: ConnectionConfig = {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: config.rpc.connection_timeout,
        disableRetryOnRateLimit: false,
        fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.rpc.connection_timeout);
          
          try {
            const response = await fetch(input, {
              ...init,
              keepalive: true,
              signal: controller.signal,
              headers: {
                ...init?.headers,
                'Content-Type': 'application/json',
              }
            });
            return response;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      };

      const newConnection: PooledConnection = {
        connection: new Connection(endpoint, connectionConfig),
        endpoint,
        lastUsed: Date.now(),
        inUse: true,
        errorCount: 0,
        successCount: 0,
        avgResponseTime: 0
      };
      
      this.pool.push(newConnection);
      return newConnection.connection;
    }

    // If we're at max connections, wait for the least recently used connection
    const leastRecentlyUsed = this.pool.reduce((prev, curr) => 
      prev.lastUsed < curr.lastUsed ? prev : curr
    );
    
    // Wait a bit before reusing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    leastRecentlyUsed.inUse = true;
    leastRecentlyUsed.lastUsed = Date.now();
    return leastRecentlyUsed.connection;
  }

  public releaseConnection(connection: Connection): void {
    const pooledConnection = this.pool.find(conn => conn.connection === connection);
    if (pooledConnection) {
      pooledConnection.inUse = false;
      pooledConnection.lastUsed = Date.now();
    }
  }

  public async executeWithConnection<T>(
    operation: (connection: Connection) => Promise<T>
  ): Promise<T> {
    let connection = await this.getAvailableConnection();
    let attempts = 0;
    const maxAttempts = this.poolConfig.maxConnections * 2; // Allow trying each connection twice

    while (attempts < maxAttempts) {
      try {
        // Mark connection as in use
        const pooledConnection = this.pool.find(pc => pc.connection === connection);
        if (pooledConnection) {
          pooledConnection.inUse = true;
          pooledConnection.lastUsed = Date.now();
        }

        const startTime = Date.now();
        const result = await operation(connection);
        const endTime = Date.now();

        // Update connection stats on success
        if (pooledConnection) {
          pooledConnection.successCount++;
          pooledConnection.avgResponseTime = (pooledConnection.avgResponseTime * (pooledConnection.successCount - 1) + (endTime - startTime)) / pooledConnection.successCount;
          pooledConnection.inUse = false;
        }

        return result;
      } catch (error: any) {
        // Update connection stats on error
        const pooledConnection = this.pool.find(pc => pc.connection === connection);
        if (pooledConnection) {
          pooledConnection.errorCount++;
          pooledConnection.inUse = false;
        }

        // If rate limited, try a different connection
        if (error.message.includes('429') || error.message.toLowerCase().includes('too many requests')) {
          this.logger.info(`Connection ${pooledConnection?.endpoint} rate limited, switching to next connection...`);
          connection = await this.getNextAvailableConnection(connection);
        }

        attempts++;
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Failed to execute operation with any connection');
  }

  public async withConnection<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    return this.executeWithConnection(operation);
  }

  private async getAvailableConnection(): Promise<Connection> {
    // Sort connections by error rate and usage
    const sortedConnections = this.pool
      .filter(conn => !conn.inUse)
      .sort((a, b) => {
        // Calculate error rate
        const aErrorRate = a.errorCount / (a.successCount + a.errorCount || 1);
        const bErrorRate = b.errorCount / (b.successCount + b.errorCount || 1);
        
        // Prioritize connections with lower error rates
        if (aErrorRate !== bErrorRate) {
          return aErrorRate - bErrorRate;
        }
        
        // If error rates are equal, use the least recently used connection
        return a.lastUsed - b.lastUsed;
      });

    // If we have an available connection with acceptable error rate, use it
    const acceptableConnection = sortedConnections.find(conn => 
      conn.errorCount / (conn.successCount + conn.errorCount || 1) < 0.3
    );
    
    if (acceptableConnection) {
      acceptableConnection.inUse = true;
      acceptableConnection.lastUsed = Date.now();
      return acceptableConnection.connection;
    }

    // If no ideal connection is available, but we're under max connections, create new one
    if (this.pool.length < this.poolConfig.maxConnections) {
      const endpoint = this.getNextEndpoint();
      const connectionConfig: ConnectionConfig = {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: config.rpc.connection_timeout,
        disableRetryOnRateLimit: false,
        fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.rpc.connection_timeout);
          
          try {
            const response = await fetch(input, {
              ...init,
              keepalive: true,
              signal: controller.signal,
              headers: {
                ...init?.headers,
                'Content-Type': 'application/json',
              }
            });
            return response;
          } finally {
            clearTimeout(timeoutId);
          }
        }
      };

      const newConnection: PooledConnection = {
        connection: new Connection(endpoint, connectionConfig),
        endpoint,
        lastUsed: Date.now(),
        inUse: true,
        errorCount: 0,
        successCount: 0,
        avgResponseTime: 0
      };
      
      this.pool.push(newConnection);
      return newConnection.connection;
    }

    // If we're at max connections, remove the worst performing connection and create a new one
    const worstConnection = this.pool.reduce((prev, curr) => {
      const prevErrorRate = prev.errorCount / (prev.successCount + prev.errorCount || 1);
      const currErrorRate = curr.errorCount / (curr.successCount + curr.errorCount || 1);
      return prevErrorRate > currErrorRate ? prev : curr;
    });

    await this.removeConnection(worstConnection);
    
    // Create new connection with a different endpoint
    const endpoint = this.getNextEndpoint();
    const connectionConfig: ConnectionConfig = {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.rpc.connection_timeout,
      disableRetryOnRateLimit: false,
      fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.rpc.connection_timeout);
        
        try {
          const response = await fetch(input, {
            ...init,
            keepalive: true,
            signal: controller.signal,
            headers: {
              ...init?.headers,
              'Content-Type': 'application/json',
            }
          });
          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    };

    const newConnection: PooledConnection = {
      connection: new Connection(endpoint, connectionConfig),
      endpoint,
      lastUsed: Date.now(),
      inUse: true,
      errorCount: 0,
      successCount: 0,
      avgResponseTime: 0
    };
    
    this.pool.push(newConnection);
    return newConnection.connection;
  }

  private async getNextAvailableConnection(currentConnection: Connection): Promise<Connection> {
    const currentIndex = this.pool.findIndex(pc => pc.connection === currentConnection);
    let nextIndex = (currentIndex + 1) % this.pool.length;
    let attempts = 0;

    while (attempts < this.pool.length) {
      const nextConnection = this.pool[nextIndex];
      if (!nextConnection.inUse) {
        return nextConnection.connection;
      }
      nextIndex = (nextIndex + 1) % this.pool.length;
      attempts++;
    }

    // If no available connection found, wait and retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.getNextAvailableConnection(currentConnection);
  }

  private updateMetrics(connection: Connection, success: boolean, responseTime: number): void {
    const pooledConnection = this.pool.find(conn => conn.connection === connection);
    if (pooledConnection) {
      if (success) {
        pooledConnection.successCount++;
      } else {
        pooledConnection.errorCount++;
      }

      // Update average response time
      const totalRequests = pooledConnection.successCount + pooledConnection.errorCount;
      pooledConnection.avgResponseTime = (
        (pooledConnection.avgResponseTime * (totalRequests - 1) + responseTime) / totalRequests
      );
    }
  }

  private async startHealthCheck(): Promise<void> {
    setInterval(async () => {
      const now = Date.now();
      
      // Check each connection
      for (const conn of this.pool) {
        try {
          // Skip health check for in-use connections
          if (conn.inUse) continue;

          // Remove old connections
          if (now - conn.lastUsed > this.poolConfig.connectionTTL) {
            await this.removeConnection(conn);
            continue;
          }

          // Remove idle connections if above minimum
          if (
            this.pool.length > this.poolConfig.minConnections &&
            now - conn.lastUsed > this.poolConfig.idleTimeout
          ) {
            await this.removeConnection(conn);
            continue;
          }

          // Check connection health
          await this.checkConnectionHealth(conn);
        } catch (error) {
          await this.logger.error(
            'Connection health check failed',
            ErrorClassifier.classifyError(error, 'ConnectionPool', 'healthCheck'),
            { endpoint: conn.endpoint }
          );
        }
      }

      // Ensure minimum connections
      if (this.pool.length < this.poolConfig.minConnections) {
        await this.initializePool();
      }
    }, this.poolConfig.healthCheckInterval);
  }

  private async checkConnectionHealth(conn: PooledConnection): Promise<void> {
    try {
      // Simple health check by getting recent blockhash
      await conn.connection.getLatestBlockhash();
      conn.errorCount = Math.max(0, conn.errorCount - 1); // Decrease error count on success
    } catch (error) {
      conn.errorCount++;
      
      // If too many errors, remove the connection
      if (conn.errorCount > 5) {
        await this.removeConnection(conn);
      }
    }
  }

  private async removeConnection(conn: PooledConnection): Promise<void> {
    const index = this.pool.indexOf(conn);
    if (index > -1) {
      this.pool.splice(index, 1);
      await this.logger.info('Removed connection from pool', {
        endpoint: conn.endpoint,
        reason: 'health_check_failed'
      });
    }
  }

  public getPoolStats() {
    return {
      totalConnections: this.pool.length,
      activeConnections: this.pool.filter(conn => conn.inUse).length,
      connectionStats: this.pool.map(conn => ({
        endpoint: conn.endpoint,
        inUse: conn.inUse,
        successCount: conn.successCount,
        errorCount: conn.errorCount,
        avgResponseTime: conn.avgResponseTime,
        lastUsed: conn.lastUsed
      }))
    };
  }
}
