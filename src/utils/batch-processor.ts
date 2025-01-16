import { Logger } from './logger';
import { config } from '../config';
import { performance } from 'perf_hooks';
import { ClassifiedError, ErrorClassifier } from './errors';

export interface BatchProcessorConfig {
  batchSize: number;
  concurrentBatches: number;
  retryDelay: number;
  maxRetries: number;
  performance?: {
    metrics: {
      avgProcessingTime: number;
      successRate: number;
      errorRate: number;
    };
  };
}

export interface BatchMetrics {
  batchSize: number;
  successCount: number;
  errorCount: number;
  averageItemProcessingTime: number;
}

export class BatchProcessor {
  private static instance: BatchProcessor;
  private readonly logger: Logger;
  private currentBatchSize: number;
  private metrics: BatchMetrics[] = [];
  private config: BatchProcessorConfig;

  private constructor(config?: BatchProcessorConfig) {
    this.config = {
      batchSize: config?.batchSize || 20,
      concurrentBatches: config?.concurrentBatches || 3,
      retryDelay: config?.retryDelay || 1000,
      maxRetries: config?.maxRetries || 3,
      performance: {
        metrics: {
          avgProcessingTime: 0,
          successRate: 0,
          errorRate: 0
        }
      }
    };
    this.logger = Logger.getInstance();
    this.currentBatchSize = this.config.batchSize;
  }

  public static getInstance(config?: BatchProcessorConfig): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor(config);
    }
    return BatchProcessor.instance;
  }

  public async processBatch(
    items: any[],
    processor: (item: any) => Promise<any>,
    options: Partial<BatchProcessorConfig> = {}
  ): Promise<any[]> {
    const effectiveConfig = {
      ...this.config,
      ...options,
      performance: {
        metrics: {
          avgProcessingTime: 0,
          successRate: 0,
          errorRate: 0,
          ...options.performance?.metrics
        }
      }
    };
    const results: any[] = [];

    for (let i = 0; i < items.length; i += this.currentBatchSize) {
      const batchItems = items.slice(i, i + this.currentBatchSize);
      const batchStartTime = performance.now();

      try {
        const batchResults = await this.processWithConcurrencyLimit(
          batchItems,
          processor,
          effectiveConfig.concurrentBatches
        );

        const batchEndTime = performance.now();
        const batchProcessingTime = batchEndTime - batchStartTime;

        // Update metrics
        this.updateMetrics({
          batchSize: batchItems.length,
          successCount: batchResults.filter(r => r !== null).length,
          errorCount: batchResults.filter(r => r === null).length,
          averageItemProcessingTime: batchProcessingTime / batchItems.length
        });

        // Adjust batch size based on performance metrics
        if (effectiveConfig.performance.metrics.avgProcessingTime > 0) {
          this.adjustBatchSize(batchProcessingTime, effectiveConfig);
        }

        results.push(...batchResults);
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(
          error instanceof Error ? error : new Error(String(error)),
          'BatchProcessor',
          'processBatch'
        );
        this.logger.error('Batch processing error', classifiedError);
      }
    }

    return results;
  }

  private async processWithConcurrencyLimit(
    items: any[],
    processor: (item: any) => Promise<any>,
    concurrencyLimit: number
  ): Promise<any[]> {
    const results: any[] = [];
    const processingItems: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      const processPromise = (async () => {
        try {
          const result = await processor(items[i]);
          results[i] = result;
        } catch (error) {
          this.logger.error(
            'Item processing error',
            ErrorClassifier.classifyError(error, 'BatchProcessor', 'processWithConcurrencyLimit'),
            { itemIndex: i }
          );
          results[i] = null as any;
        }
      })();

      processingItems.push(processPromise);

      if (processingItems.length >= concurrencyLimit) {
        await Promise.race(processingItems);
        // Remove completed promises
        const completedIndex = await Promise.race(
          processingItems.map(async (p, index) => {
            try {
              await p;
              return index;
            } catch {
              return -1;
            }
          })
        );
        if (completedIndex !== -1) {
          processingItems.splice(completedIndex, 1);
        }
      }
    }

    // Wait for remaining items
    await Promise.all(processingItems);
    return results;
  }

  private updateMetrics(metrics: BatchMetrics): void {
    this.metrics.push(metrics);
    if (this.metrics.length > 10) {
      this.metrics.shift();
    }
  }

  private adjustBatchSize(lastBatchTime: number, config: BatchProcessorConfig): void {
    const avgProcessingTime = config.performance?.metrics.avgProcessingTime || 0;
    if (avgProcessingTime === 0) return;

    const timeRatio = lastBatchTime / avgProcessingTime;
    if (timeRatio > 1.2) {
      this.currentBatchSize = Math.max(5, Math.floor(this.currentBatchSize * 0.8));
    } else if (timeRatio < 0.8) {
      this.currentBatchSize = Math.min(100, Math.floor(this.currentBatchSize * 1.2));
    }
  }

  public getMetrics(): BatchMetrics[] {
    return [...this.metrics];
  }

  public getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }
}
