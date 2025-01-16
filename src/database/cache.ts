import type { QueryResult } from 'pg';
import { QueryCache } from './types';
import { Logger } from '../utils/logger';
import LRUCache from 'lru-cache';
import { ErrorClassifier } from '../utils/errors';

export class QueryCacheManager implements QueryCache {
  private static instance: QueryCacheManager;
  private readonly cache: LRUCache<string, QueryResult>;
  private readonly logger: Logger;

  private constructor() {
    this.logger = Logger.getInstance();
    this.cache = new LRUCache<string, QueryResult>({
      max: 100, // Maximum number of items
      ttl: 1000 * 60 * 5, // 5 minutes TTL
      updateAgeOnGet: true
    });
  }

  public static getInstance(): QueryCacheManager {
    if (!QueryCacheManager.instance) {
      QueryCacheManager.instance = new QueryCacheManager();
    }
    return QueryCacheManager.instance;
  }

  public async get(key: string): Promise<QueryResult | null> {
    try {
      const result = this.cache.get(key);
      return result || null;
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'QueryCacheManager',
        'get',
        { key }
      );
      this.logger.error('Error retrieving from cache', classifiedError);
      return null;
    }
  }

  public async set(key: string, result: QueryResult, ttl?: number): Promise<void> {
    try {
      this.cache.set(key, result, ttl ? ttl * 1000 : undefined);
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'QueryCacheManager',
        'set',
        { key }
      );
      this.logger.error('Error setting cache', classifiedError);
    }
  }

  public async invalidate(pattern: string): Promise<void> {
    try {
      // Simple pattern matching for cache keys
      const keys = [...this.cache.keys()].filter(key => 
        key.includes(pattern)
      );
      keys.forEach(key => this.cache.delete(key));
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'QueryCacheManager',
        'invalidate',
        { pattern }
      );
      this.logger.error('Error invalidating cache', classifiedError);
    }
  }

  public async cleanup(): Promise<void> {
    try {
      this.cache.clear();
      this.logger.info('Cache cleanup completed');
    } catch (error) {
      const classifiedError = ErrorClassifier.classifyError(
        error instanceof Error ? error : new Error(String(error)),
        'QueryCacheManager',
        'cleanup'
      );
      this.logger.error('Error during cache cleanup', classifiedError);
    }
  }
}
