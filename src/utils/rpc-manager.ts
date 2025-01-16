import { Connection, ConnectionConfig } from '@solana/web3.js';
import { config } from '../config';
import { Logger } from './logger';
import { ConnectionPool } from './connection-pool';
import { ErrorClassifier } from './errors';

class RPCManager {
  private static instance: RPCManager;
  private readonly logger: Logger;
  private readonly connectionPool: ConnectionPool;
  private requestCounts: Map<string, number> = new Map();
  private lastResetTime: number = Date.now();

  private constructor() {
    this.logger = Logger.getInstance();
    this.connectionPool = ConnectionPool.getInstance();
    this.startRateLimitReset();
  }

  public static getInstance(): RPCManager {
    if (!RPCManager.instance) {
      RPCManager.instance = new RPCManager();
    }
    return RPCManager.instance;
  }

  private startRateLimitReset() {
    setInterval(() => {
      const now = Date.now();
      if (now - this.lastResetTime >= 1000) { // Reset every second
        this.requestCounts.clear();
        this.lastResetTime = now;
      }
    }, 1000);
  }

  private async waitForRateLimit(endpoint: string): Promise<void> {
    const currentCount = this.requestCounts.get(endpoint) || 0;
    const maxRequests = config.rpc.rate_limit.max_requests_per_second;
    
    if (currentCount >= maxRequests) {
      const timeUntilReset = this.lastResetTime + 1000 - Date.now();
      if (timeUntilReset > 0) {
        await this.logger.debug(`Rate limit reached for ${endpoint}, waiting ${timeUntilReset}ms`);
        await new Promise(resolve => setTimeout(resolve, timeUntilReset));
      }
    }
  }

  private incrementRequestCount(endpoint: string) {
    const currentCount = this.requestCounts.get(endpoint) || 0;
    this.requestCounts.set(endpoint, currentCount + 1);
  }

  public async withConnection<T>(operation: (connection: Connection) => Promise<T>): Promise<T> {
    return this.connectionPool.executeWithConnection(async (connection) => {
      let lastError: Error | null = null;
      let backoffDelay = config.rpc.rate_limit.retry_delay_base;
      let rateLimitHits = 0;
      const maxRateLimitHits = 3; // Switch connection after 3 rate limits
      
      for (let retry = 0; retry < config.rpc.max_retries; retry++) {
        try {
          // Check rate limit before making request
          await this.waitForRateLimit(connection.rpcEndpoint);
          
          const result = await operation(connection);
          this.incrementRequestCount(connection.rpcEndpoint);
          return result;
        } catch (error: any) {
          lastError = error;
          const isHeliusError = connection.rpcEndpoint.includes('helius');
          const isRateLimit = error.message.includes('429') || 
                            error.message.toLowerCase().includes('too many requests') ||
                            (isHeliusError && error.message.includes('rate limit'));

          const classifiedError = ErrorClassifier.classifyError(error, 'RPCManager', 'withConnection');
          
          await this.logger.warn(
            `RPC request failed (attempt ${retry + 1}/${config.rpc.max_retries})`,
            classifiedError
          );
          
          // Handle rate limit errors
          if (isRateLimit) {
            rateLimitHits++;
            
            // Switch connection if we've hit rate limits too many times
            if (rateLimitHits >= maxRateLimitHits) {
              await this.logger.info(`Connection ${connection.rpcEndpoint} rate limited too many times, switching connection...`);
              return this.connectionPool.executeWithConnection(async (newConnection) => {
                return await operation(newConnection);
              });
            }
            
            const delay = Math.min(backoffDelay, config.rpc.rate_limit.retry_delay_max);
            await this.logger.info(`Rate limit hit. Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            backoffDelay *= 2; // Exponential backoff
            continue;
          }
          
          // For non-rate-limit errors, use standard retry delay
          if (retry < config.rpc.max_retries - 1) {
            await new Promise(resolve => setTimeout(resolve, config.rpc.rate_limit.retry_delay_base));
          }
        }
      }
      
      throw lastError || new Error('Operation failed after max retries');
    });
  }

  public getPoolStats() {
    return this.connectionPool.getPoolStats();
  }
}

// Export singleton instance
export const rpcManager = RPCManager.getInstance();
