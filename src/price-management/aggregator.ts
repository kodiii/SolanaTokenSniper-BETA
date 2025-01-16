import axios, { AxiosError } from 'axios';
import { PriceData, PriceSourceConfig, PriceAggregationConfig, ReliabilityMetrics, ReliabilityReport } from './types';
import { config } from '../config';
import { withRetry, withRetryAndFallback, RetryError } from '../utils/retry';
import { ErrorClassifier, ClassifiedError, ErrorCategory, ErrorSeverity } from '../utils/errors';
import { Logger, LogLevel } from '../utils/logger';
import { PriceCircuitManager } from './price-circuit-breaker';

export class PriceAggregator {
  private static instance: PriceAggregator;
  private sources: Map<string, PriceSourceConfig>;
  private readonly aggregationConfig: PriceAggregationConfig;
  private readonly logger: Logger;
  private readonly circuitManager: PriceCircuitManager;

  private constructor() {
    this.sources = new Map();
    this.aggregationConfig = config.price.aggregation;
    this.logger = Logger.getInstance();
    this.circuitManager = PriceCircuitManager.getInstance();
    this.initializeSources();
  }

  public static getInstance(): PriceAggregator {
    if (!PriceAggregator.instance) {
      PriceAggregator.instance = new PriceAggregator();
    }
    return PriceAggregator.instance;
  }

  private initializeSources(): void {
    // Initialize Jupiter source
    this.sources.set('jupiter', {
      name: 'jupiter',
      priority: 1,
      weight: 1.0,
      enabled: true,
      timeout: config.tx.get_timeout,
      retryCount: config.tx.fetch_tx_max_retries,
      retryDelay: config.tx.retry_delay,
      reliabilityScore: 1.0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      successRate: 1.0,
      totalRequests: 0,
      lastUpdate: Date.now(),
      historicalMetrics: [],
      status: 'active',
      degradationThreshold: 0.7, // 70% reliability for degradation
      disableThreshold: 0.3,    // 30% reliability for disabling
      recoveryThreshold: 0.8,   // 80% reliability for recovery
      metricsWindow: 300000,    // 5 minutes
      maxMetricsHistory: 1000   // Keep last 1000 metrics
    });

    // Initialize DexScreener source
    this.sources.set('dexscreener', {
      name: 'dexscreener',
      priority: 2,
      weight: 0.8,
      enabled: true,
      timeout: config.tx.get_timeout,
      retryCount: config.tx.fetch_tx_max_retries,
      retryDelay: config.tx.retry_delay,
      reliabilityScore: 1.0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      successRate: 1.0,
      totalRequests: 0,
      lastUpdate: Date.now(),
      historicalMetrics: [],
      status: 'active',
      degradationThreshold: 0.7,
      disableThreshold: 0.3,
      recoveryThreshold: 0.8,
      metricsWindow: 300000,
      maxMetricsHistory: 1000
    });
  }

  private async fetchJupiterPrice(token: string): Promise<number | null> {
    const startTime = Date.now();
    const source = 'jupiter';
    
    try {
      await this.logger.info('Fetching Jupiter price', { token });
      
      const result = await this.circuitManager.executeWithBreaker<number>(source, async () => {
        const priceResult = await withRetry<number>(
          async () => {
            const response = await axios.get(`${config.price.sources.jupiter.uri}/price?id=${token}`);
            if (!response.data || !response.data.data || !response.data.data.price) {
              throw new Error('Invalid price data from Jupiter');
            }
            return response.data.data.price;
          },
          {
            ...config.retry.price,
            onRetry: (error, attempt) => {
              const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice', {
                token,
                attempt,
                responseTime: Date.now() - startTime
              });
              this.logger.logRetryAttempt('fetchJupiterPrice', attempt, classifiedError, { token });
              this.updateSourceMetrics(source, false, Date.now() - startTime, classifiedError.message);
            },
            shouldRetry: (error) => {
              const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice');
              return classifiedError.retryable;
            }
          }
        );

        const responseTime = Date.now() - startTime;
        this.updateSourceMetrics(source, true, responseTime);
        
        await this.logger.logApiCall(
          'GET',
          `${config.price.sources.jupiter.uri}/price`,
          responseTime,
          true,
          { token, price: priceResult }
        );
        
        return priceResult;
      });

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice', {
        token,
        responseTime,
        retryStats: error instanceof RetryError ? error.stats : undefined
      });
      
      this.updateSourceMetrics(source, false, responseTime, classifiedError.message);
      
      await this.logger.error(
        'Failed to fetch Jupiter price',
        classifiedError,
        { token, responseTime }
      );
      
      return null;
    }
  }

  private async fetchDexScreenerPrice(token: string): Promise<number | null> {
    const startTime = Date.now();
    const source = 'dexscreener';
    
    try {
      await this.logger.info('Fetching DexScreener price', { token });
      
      const result = await this.circuitManager.executeWithBreaker<number>(source, async () => {
        const priceResult = await withRetry<number>(
          async () => {
            const response = await axios.get(`${config.price.sources.dexscreener.uri}/${token}`);
            if (!response.data || !response.data.pairs || !response.data.pairs[0]?.priceUsd) {
              throw new Error('Invalid price data from DexScreener');
            }
            return parseFloat(response.data.pairs[0].priceUsd);
          },
          {
            ...config.retry.price,
            onRetry: (error, attempt) => {
              const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice', {
                token,
                attempt,
                responseTime: Date.now() - startTime
              });
              this.logger.logRetryAttempt('fetchDexScreenerPrice', attempt, classifiedError, { token });
              this.updateSourceMetrics(source, false, Date.now() - startTime, classifiedError.message);
            },
            shouldRetry: (error) => {
              const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice');
              return classifiedError.retryable;
            }
          }
        );

        const responseTime = Date.now() - startTime;
        this.updateSourceMetrics(source, true, responseTime);
        
        await this.logger.logApiCall(
          'GET',
          `${config.price.sources.dexscreener.uri}/${token}`,
          responseTime,
          true,
          { token, price: priceResult }
        );
        
        return priceResult;
      });

      return result;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const classifiedError = ErrorClassifier.classifyError(error, source, 'fetchPrice', {
        token,
        responseTime,
        retryStats: error instanceof RetryError ? error.stats : undefined
      });
      
      this.updateSourceMetrics(source, false, responseTime, classifiedError.message);
      
      await this.logger.error(
        'Failed to fetch DexScreener price',
        classifiedError,
        { token, responseTime }
      );
      
      return null;
    }
  }

  private updateSourceMetrics(sourceName: string, success: boolean, responseTime: number, error?: string): void {
    const source = this.sources.get(sourceName)!;
    source.totalRequests++;
    
    // Create new metrics entry
    const metrics: ReliabilityMetrics = {
      timestamp: Date.now(),
      successRate: source.successRate,
      responseTime,
      reliabilityScore: source.reliabilityScore,
      weight: source.weight,
      errors: error ? [error] : []
    };

    // Update historical metrics
    source.historicalMetrics.push(metrics);
    if (source.historicalMetrics.length > source.maxMetricsHistory) {
      source.historicalMetrics.shift();
    }

    // Update response time metrics
    if (success) {
      source.minResponseTime = Math.min(source.minResponseTime, responseTime);
      source.maxResponseTime = Math.max(source.maxResponseTime, responseTime);
    }

    // Update success rate with exponential moving average
    const alpha = 0.1;
    source.successRate = success ? 
      source.successRate * (1 - alpha) + alpha :
      source.successRate * (1 - alpha);

    // Calculate reliability score based on multiple factors
    const responseTimeScore = success ? 
      1 - (responseTime - source.minResponseTime) / (source.maxResponseTime - source.minResponseTime) :
      0;
    
    const reliabilityAlpha = 0.05;
    source.reliabilityScore = source.reliabilityScore * (1 - reliabilityAlpha) + 
      (success ? this.aggregationConfig.weightRecoveryFactor : -this.aggregationConfig.weightDecayFactor) * reliabilityAlpha;

    // Update source status based on reliability
    this.updateSourceStatus(source);

    // Adjust weight based on reliability and status
    source.weight = source.status === 'active' ? 
      Math.max(0.1, Math.min(1.0, source.reliabilityScore)) :
      source.status === 'degraded' ? source.weight * 0.5 : 0;
    
    source.lastUpdate = Date.now();
    this.sources.set(sourceName, source);
  }

  private updateSourceStatus(source: PriceSourceConfig): void {
    const currentStatus = source.status;
    const newStatus = source.reliabilityScore <= source.disableThreshold ? 'disabled' :
                     source.reliabilityScore <= source.degradationThreshold ? 'degraded' : 'active';

    if (currentStatus !== newStatus) {
      if (newStatus === 'disabled') {
        this.logger.log(LogLevel.WARN, `Price source ${source.name} has been disabled due to poor reliability`);
        source.enabled = false;
      } else if (newStatus === 'active' && source.reliabilityScore >= source.recoveryThreshold) {
        this.logger.log(LogLevel.INFO, `Price source ${source.name} has recovered and is now active`);
        source.enabled = true;
      }
      source.status = newStatus;
    }
  }

  private calculateReliabilityTrends(metrics: ReliabilityMetrics[]): { 
    successRateTrend: number, 
    responseTimeTrend: number, 
    reliabilityTrend: number 
  } {
    if (metrics.length < 2) {
      return { successRateTrend: 0, responseTimeTrend: 0, reliabilityTrend: 0 };
    }

    const recentMetrics = metrics.slice(-10); // Look at last 10 metrics
    const trends = {
      successRateTrend: 0,
      responseTimeTrend: 0,
      reliabilityTrend: 0
    };

    for (let i = 1; i < recentMetrics.length; i++) {
      trends.successRateTrend += recentMetrics[i].successRate - recentMetrics[i-1].successRate;
      trends.responseTimeTrend += recentMetrics[i].responseTime - recentMetrics[i-1].responseTime;
      trends.reliabilityTrend += recentMetrics[i].reliabilityScore - recentMetrics[i-1].reliabilityScore;
    }

    // Normalize trends
    const normalize = (value: number) => value / (recentMetrics.length - 1);
    return {
      successRateTrend: normalize(trends.successRateTrend),
      responseTimeTrend: normalize(trends.responseTimeTrend),
      reliabilityTrend: normalize(trends.reliabilityTrend)
    };
  }

  public getReliabilityReport(sourceName: string): ReliabilityReport {
    const source = this.sources.get(sourceName);
    if (!source) {
      throw new Error(`Price source ${sourceName} not found`);
    }

    const recentMetrics = source.historicalMetrics.filter(
      m => m.timestamp > Date.now() - source.metricsWindow
    );

    const trends = this.calculateReliabilityTrends(recentMetrics);
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (trends.successRateTrend < -0.1) {
      recommendations.push(`Success rate is declining. Consider investigating API stability.`);
    }
    if (trends.responseTimeTrend > 0.1) {
      recommendations.push(`Response times are increasing. Consider optimizing connection parameters.`);
    }
    if (source.status === 'degraded') {
      recommendations.push(`Service is degraded. Monitor closely and consider failover options.`);
    }
    if (source.reliabilityScore < source.degradationThreshold) {
      recommendations.push(`Reliability score is low. Review error patterns and consider maintenance.`);
    }

    return {
      source: sourceName,
      currentMetrics: recentMetrics[recentMetrics.length - 1] || {
        timestamp: Date.now(),
        successRate: source.successRate,
        responseTime: 0,
        reliabilityScore: source.reliabilityScore,
        weight: source.weight,
        errors: []
      },
      historicalMetrics: recentMetrics,
      trend: trends,
      status: source.status,
      recommendations
    };
  }

  private isOutlier(price: number, prices: number[]): boolean {
    if (prices.length < 2) return false;
    
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = Math.sqrt(
      prices.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / (prices.length - 1)
    );
    
    return Math.abs(price - mean) > this.aggregationConfig.outlierThreshold * stdDev;
  }

  private calculateConfidence(prices: Map<string, number>): number {
    const priceValues = Array.from(prices.values());
    if (priceValues.length < this.aggregationConfig.minSources) {
      return 0;
    }

    const mean = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
    const maxDeviation = Math.max(...priceValues.map(p => Math.abs(p - mean) / mean));
    
    return Math.max(0, 1 - (maxDeviation / this.aggregationConfig.maxPriceDeviation));
  }

  public async getAggregatedPrice(token: string): Promise<PriceData | null> {
    const prices = new Map<string, number>();
    const sourceTimes = new Map<string, number>();
    const startTime = Date.now();

    // Only use enabled sources
    const enabledSources = Array.from(this.sources.values())
      .filter(source => source.enabled)
      .sort((a, b) => a.priority - b.priority);

    // Fetch prices from enabled sources in parallel
    const results = await Promise.all(
      enabledSources.map(async (source) => {
        try {
          const price = source.name === 'jupiter' ?
            await this.fetchJupiterPrice(token) :
            await this.fetchDexScreenerPrice(token);
          return { source: source.name, price };
        } catch (error) {
          return { source: source.name, price: null };
        }
      })
    );

    // Process results
    results.forEach(({ source, price }) => {
      if (price !== null) {
        prices.set(source, price);
        sourceTimes.set(source, Date.now() - startTime);
      }
    });

    if (prices.size < this.aggregationConfig.minSources) {
      return null;
    }

    // Calculate weighted average price
    let weightedSum = 0;
    let weightSum = 0;
    const sourceData: { [source: string]: any } = {};

    prices.forEach((price, sourceName) => {
      const sourceConfig = this.sources.get(sourceName)!;
      if (!this.isOutlier(price, Array.from(prices.values()))) {
        weightedSum += price * sourceConfig.weight;
        weightSum += sourceConfig.weight;
      }

      sourceData[sourceName] = {
        price,
        timestamp: Date.now(),
        weight: sourceConfig.weight,
        latency: sourceTimes.get(sourceName) || 0,
        success: true
      };
    });

    if (weightSum === 0) {
      return null;
    }

    const aggregatedPrice = weightedSum / weightSum;
    const confidence = this.calculateConfidence(prices);

    if (confidence < this.aggregationConfig.confidenceThreshold) {
      return null;
    }

    return {
      price: aggregatedPrice,
      timestamp: Date.now(),
      source: 'aggregated',
      confidence,
      sourceData
    };
  }

  public getSourceStats(): Map<string, PriceSourceConfig> {
    return new Map(this.sources);
  }
}
