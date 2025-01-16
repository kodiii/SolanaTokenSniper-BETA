import { PriceData } from './types';

export enum TrendType {
  STRONG_UPTREND = 'STRONG_UPTREND',
  UPTREND = 'UPTREND',
  NEUTRAL = 'NEUTRAL',
  DOWNTREND = 'DOWNTREND',
  STRONG_DOWNTREND = 'STRONG_DOWNTREND'
}

export interface TrendAnalysis {
  type: TrendType;
  strength: number;        // 0-1 indicating trend strength
  duration: number;        // Duration of current trend in milliseconds
  priceChange: number;     // Percentage price change during trend
  confidence: number;      // 0-1 indicating confidence in trend analysis
}

export class TrendAnalyzer {
  private readonly shortWindow: number;  // Short-term MA window
  private readonly longWindow: number;   // Long-term MA window
  private readonly minSamples: number;   // Minimum samples needed for analysis

  constructor(shortWindow = 5, longWindow = 20, minSamples = 10) {
    this.shortWindow = shortWindow;
    this.longWindow = longWindow;
    this.minSamples = minSamples;
  }

  private calculateMA(prices: number[], window: number): number {
    if (prices.length < window) return prices[prices.length - 1];
    const windowPrices = prices.slice(-window);
    return windowPrices.reduce((sum, price) => sum + price, 0) / window;
  }

  private calculateRSI(prices: number[]): number {
    if (prices.length < 2) return 50;

    let gains = 0;
    let losses = 0;
    let count = 0;

    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else if (change < 0) losses -= change;
      count++;
    }

    if (count === 0) return 50;
    const avgGain = gains / count;
    const avgLoss = losses / count;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateTrendStrength(
    shortMA: number,
    longMA: number,
    rsi: number,
    priceChange: number
  ): number {
    // Combine multiple indicators for trend strength
    const maDiff = Math.abs((shortMA - longMA) / longMA);
    const rsiStrength = Math.abs(rsi - 50) / 50;
    const priceStrength = Math.abs(priceChange) / 100;

    return (maDiff * 0.4 + rsiStrength * 0.3 + priceStrength * 0.3);
  }

  private calculateConfidence(
    prices: number[],
    volatility: number,
    strength: number
  ): number {
    // More samples and lower volatility increase confidence
    const sampleConfidence = Math.min(prices.length / this.minSamples, 1);
    const volatilityFactor = Math.max(1 - volatility / 100, 0);
    const strengthFactor = strength;

    return (sampleConfidence * 0.4 + volatilityFactor * 0.3 + strengthFactor * 0.3);
  }

  public analyzeTrend(priceHistory: PriceData[]): TrendAnalysis {
    if (priceHistory.length < 2) {
      return {
        type: TrendType.NEUTRAL,
        strength: 0,
        duration: 0,
        priceChange: 0,
        confidence: 0
      };
    }

    const prices = priceHistory.map(p => p.price);
    const shortMA = this.calculateMA(prices, this.shortWindow);
    const longMA = this.calculateMA(prices, this.longWindow);
    const rsi = this.calculateRSI(prices);

    // Calculate price change percentage
    const startPrice = prices[0];
    const currentPrice = prices[prices.length - 1];
    const priceChange = ((currentPrice - startPrice) / startPrice) * 100;

    // Calculate trend duration
    const duration = priceHistory[priceHistory.length - 1].timestamp - priceHistory[0].timestamp;

    // Calculate trend strength
    const strength = this.calculateTrendStrength(shortMA, longMA, rsi, priceChange);

    // Calculate confidence
    const volatility = priceHistory[priceHistory.length - 1].volatility || 0;
    const confidence = this.calculateConfidence(prices, volatility, strength);

    // Determine trend type
    let type: TrendType;
    if (shortMA > longMA && rsi > 60) {
      type = rsi > 70 ? TrendType.STRONG_UPTREND : TrendType.UPTREND;
    } else if (shortMA < longMA && rsi < 40) {
      type = rsi < 30 ? TrendType.STRONG_DOWNTREND : TrendType.DOWNTREND;
    } else {
      type = TrendType.NEUTRAL;
    }

    return {
      type,
      strength,
      duration,
      priceChange,
      confidence
    };
  }
}
