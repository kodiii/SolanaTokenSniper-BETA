import LRU from 'lru-cache';
import { PriceData, TokenPriceHistory, VolatilityConfig } from './types';
import { TrendAnalyzer } from './trend';

export class DynamicPriceCache {
  private cache: LRU<string, PriceData>;
  private history: Map<string, TokenPriceHistory>;
  private volatilityConfig: VolatilityConfig;
  private trendAnalyzer: TrendAnalyzer;

  constructor(config: VolatilityConfig) {
    this.volatilityConfig = config;
    this.history = new Map();
    this.cache = new LRU<string, PriceData>({
      max: 500, // Maximum number of items
      ttl: config.maxTTL,
      updateAgeOnGet: true
    });
    this.trendAnalyzer = new TrendAnalyzer();
  }

  private calculateVolatility(token: string): number {
    const history = this.history.get(token);
    if (!history || history.prices.length < 2) {
      return 0;
    }

    // Calculate price changes over the history window
    const priceChanges: number[] = [];
    for (let i = 1; i < history.prices.length; i++) {
      const prevPrice = history.prices[i - 1].price;
      const currentPrice = history.prices[i].price;
      const percentChange = Math.abs((currentPrice - prevPrice) / prevPrice) * 100;
      priceChanges.push(percentChange);
    }

    // Calculate standard deviation of price changes
    const mean = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const variance = priceChanges.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / priceChanges.length;
    return Math.sqrt(variance);
  }

  private calculateDynamicTTL(volatility: number): number {
    // Higher volatility = lower TTL, bounded by min/max
    const normalizedVolatility = Math.min(volatility / this.volatilityConfig.updateThreshold, 1);
    const ttlRange = this.volatilityConfig.maxTTL - this.volatilityConfig.minTTL;
    const dynamicTTL = this.volatilityConfig.maxTTL - (ttlRange * normalizedVolatility);
    return Math.max(this.volatilityConfig.minTTL, dynamicTTL);
  }

  private updateHistory(token: string, priceData: PriceData): void {
    let history = this.history.get(token);
    if (!history) {
      history = {
        prices: [],
        volatility: 0,
        trend: undefined,
        lastUpdate: 0
      };
      this.history.set(token, history);
    }

    // Add new price data
    history.prices.push(priceData);

    // Keep only recent samples within history window
    const cutoffTime = Date.now() - this.volatilityConfig.historyWindow;
    history.prices = history.prices
      .filter(p => p.timestamp > cutoffTime)
      .slice(-this.volatilityConfig.samples);

    // Update volatility
    history.volatility = this.calculateVolatility(token);
    
    // Update trend analysis
    history.trend = this.trendAnalyzer.analyzeTrend(history.prices);
    
    history.lastUpdate = Date.now();
  }

  public set(token: string, price: number, source: string, priceData?: Partial<PriceData>): void {
    const currentTime = Date.now();
    
    // Get existing price history
    let history = this.history.get(token);
    if (!history) {
      history = {
        prices: [],
        volatility: 0,
        lastUpdate: currentTime
      };
      this.history.set(token, history);
    }

    // Create new price data entry
    const newPriceData: PriceData = {
      price,
      timestamp: currentTime,
      source,
      confidence: priceData?.confidence || 1.0,
      sourceData: priceData?.sourceData || {
        [source]: {
          price,
          timestamp: currentTime,
          weight: 1.0,
          latency: 0,
          success: true
        }
      }
    };

    // Add volatility if available
    if (history.volatility) {
      newPriceData.volatility = history.volatility;
    }

    // Add trend if available
    if (history.trend) {
      newPriceData.trend = history.trend;
    }

    // Update history
    this.updateHistory(token, newPriceData);

    // Set cache with dynamic TTL
    const ttl = this.calculateDynamicTTL(history.volatility);
    this.cache.set(token, newPriceData, ttl);
  }

  public get(token: string): PriceData | undefined {
    return this.cache.get(token);
  }

  public getVolatility(token: string): number {
    return this.history.get(token)?.volatility || 0;
  }

  public getTrend(token: string): TokenPriceHistory | undefined {
    return this.history.get(token);
  }

  public clear(): void {
    this.cache.clear();
    this.history.clear();
  }
}
