import axios, { AxiosError } from 'axios';
import { PriceData, PriceSourceConfig } from './types';
import { DynamicPriceCache } from './cache';
import { config } from '../config';
import { PriceAggregator } from './aggregator';

interface BatchPriceUpdate {
  tokens: string[];
  timestamp: number;
  retryCount: number;
}

export class PriceBatchManager {
  private static instance: PriceBatchManager;
  private batchQueue: Map<string, BatchPriceUpdate>;
  private processing: boolean;
  private cache: DynamicPriceCache;
  private batchSize: number;
  private batchDelay: number;
  private maxRetries: number;

  private constructor(cache: DynamicPriceCache) {
    this.batchQueue = new Map();
    this.processing = false;
    this.cache = cache;
    this.batchSize = config.performance.batch_size || 50;
    this.batchDelay = config.tx.retry_delay || 1000;
    this.maxRetries = config.tx.fetch_tx_max_retries || 3;
  }

  public static getInstance(cache: DynamicPriceCache): PriceBatchManager {
    if (!PriceBatchManager.instance) {
      PriceBatchManager.instance = new PriceBatchManager(cache);
    }
    return PriceBatchManager.instance;
  }

  private async processBatch(batchId: string, update: BatchPriceUpdate): Promise<void> {
    try {
      const priceAggregator = PriceAggregator.getInstance();
      const prices = new Map<string, number>();

      // Process each token in parallel
      await Promise.all(update.tokens.map(async (token) => {
        try {
          const priceData = await priceAggregator.getAggregatedPrice(token);
          if (priceData && priceData.confidence >= config.price.aggregation.confidenceThreshold) {
            prices.set(token, priceData.price);
            this.cache.set(token, priceData.price, 'aggregated', priceData);
          }
        } catch (error) {
          console.error(`Failed to get aggregated price for ${token}:`, error);
        }
      }));

      // Check if any tokens failed to get prices
      const failedTokens = update.tokens.filter(token => !prices.has(token));
      if (failedTokens.length > 0 && update.retryCount < this.maxRetries) {
        // Queue failed tokens for retry
        this.queueTokens(failedTokens, update.retryCount + 1);
      } else if (failedTokens.length > 0) {
        console.error('Failed to fetch prices for tokens after max retries:', failedTokens);
      }
    } catch (error) {
      console.error('Batch processing error:', error instanceof AxiosError ? error.message : error);
      if (update.retryCount < this.maxRetries) {
        this.queueTokens(update.tokens, update.retryCount + 1);
      }
    } finally {
      this.batchQueue.delete(batchId);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.batchQueue.size > 0) {
        const batches = Array.from(this.batchQueue.entries());
        for (const [batchId, update] of batches) {
          await this.processBatch(batchId, update);
          await new Promise(resolve => setTimeout(resolve, this.batchDelay));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  public queueTokens(tokens: string[], retryCount = 0): void {
    // Split tokens into batches
    for (let i = 0; i < tokens.length; i += this.batchSize) {
      const batchTokens = tokens.slice(i, i + this.batchSize);
      const batchId = `batch_${Date.now()}_${i}`;
      
      this.batchQueue.set(batchId, {
        tokens: batchTokens,
        timestamp: Date.now(),
        retryCount
      });
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  public isProcessing(): boolean {
    return this.processing;
  }

  public getPendingCount(): number {
    return this.batchQueue.size;
  }
}
