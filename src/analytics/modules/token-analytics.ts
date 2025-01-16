import { TokenAnalytics } from '../types';
import { analyzeTrends } from '../utils/trend-analysis';

export class TokenAnalyticsModule {
  private analytics: Map<string, TokenAnalytics>;
  private readonly PRICE_ALERT_THRESHOLD = 0.05; // 5% price movement
  private readonly VOLUME_ALERT_THRESHOLD = 2.0; // 2x volume increase

  constructor(initialAnalytics: Map<string, TokenAnalytics>) {
    this.analytics = initialAnalytics;
  }

  public updateMetrics(
    address: string,
    symbol: string,
    price: number,
    volume: number
  ) {
    const now = Date.now();
    let tokenMetrics = this.getOrCreateMetrics(address, symbol);
    
    // Update price and volume history
    tokenMetrics.priceHistory.push({ price, timestamp: now, volume });
    tokenMetrics.volumeHistory.push({ volume, timestamp: now });

    // Maintain history for 24 hours
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    tokenMetrics.priceHistory = tokenMetrics.priceHistory.filter(p => p.timestamp > oneDayAgo);
    tokenMetrics.volumeHistory = tokenMetrics.volumeHistory.filter(v => v.timestamp > oneDayAgo);

    // Update metrics and check for alerts
    this.calculateMetrics(address);
    this.checkForAlerts(address);
    this.updateTrends(address);

    this.analytics.set(address, tokenMetrics);
  }

  private getOrCreateMetrics(address: string, symbol: string): TokenAnalytics {
    return this.analytics.get(address) || {
      symbol,
      address,
      priceHistory: [],
      volumeHistory: [],
      alerts: [],
      trends: {
        shortTerm: { direction: 'sideways', strength: 0, timestamp: Date.now() },
        longTerm: { direction: 'sideways', strength: 0, timestamp: Date.now() }
      },
      metrics: {
        volatility: 0,
        averageVolume24h: 0,
        priceChange24h: 0,
        volumeChange24h: 0,
        lastUpdate: Date.now()
      }
    };
  }

  private calculateMetrics(address: string) {
    const tokenMetrics = this.analytics.get(address);
    if (!tokenMetrics || tokenMetrics.priceHistory.length < 2) return;

    const history = tokenMetrics.priceHistory;
    const volumes = tokenMetrics.volumeHistory;

    // Calculate 24h price change
    const oldestPrice = history[0].price;
    const latestPrice = history[history.length - 1].price;
    tokenMetrics.metrics.priceChange24h = (latestPrice - oldestPrice) / oldestPrice;

    // Calculate average volume
    const totalVolume = volumes.reduce((sum, v) => sum + v.volume, 0);
    tokenMetrics.metrics.averageVolume24h = totalVolume / volumes.length;

    // Calculate volume change
    const oldVolume = volumes[0].volume;
    const newVolume = volumes[volumes.length - 1].volume;
    tokenMetrics.metrics.volumeChange24h = (newVolume - oldVolume) / oldVolume;

    // Calculate volatility (standard deviation of price changes)
    const priceChanges = history.slice(1).map((h, i) => 
      (h.price - history[i].price) / history[i].price
    );
    const avgChange = priceChanges.reduce((sum, change) => sum + change, 0) / priceChanges.length;
    const squaredDiffs = priceChanges.map(change => Math.pow(change - avgChange, 2));
    tokenMetrics.metrics.volatility = Math.sqrt(
      squaredDiffs.reduce((sum, diff) => sum + diff, 0) / squaredDiffs.length
    );

    tokenMetrics.metrics.lastUpdate = Date.now();
  }

  private checkForAlerts(address: string) {
    const tokenMetrics = this.analytics.get(address);
    if (!tokenMetrics) return;

    const { priceChange24h, volumeChange24h } = tokenMetrics.metrics;

    // Check for significant price movements
    if (Math.abs(priceChange24h) >= this.PRICE_ALERT_THRESHOLD) {
      tokenMetrics.alerts.push({
        type: 'price_movement',
        message: `Price ${priceChange24h > 0 ? 'increased' : 'decreased'} by ${(Math.abs(priceChange24h) * 100).toFixed(2)}%`,
        timestamp: Date.now(),
        severity: Math.abs(priceChange24h) >= this.PRICE_ALERT_THRESHOLD * 2 ? 'critical' : 'warning'
      });
    }

    // Check for volume spikes
    if (volumeChange24h >= this.VOLUME_ALERT_THRESHOLD) {
      tokenMetrics.alerts.push({
        type: 'volume_spike',
        message: `Volume increased by ${(volumeChange24h * 100).toFixed(2)}%`,
        timestamp: Date.now(),
        severity: volumeChange24h >= this.VOLUME_ALERT_THRESHOLD * 2 ? 'critical' : 'warning'
      });
    }

    // Limit alerts history
    tokenMetrics.alerts = tokenMetrics.alerts.slice(-100);
  }

  private updateTrends(address: string) {
    const tokenMetrics = this.analytics.get(address);
    if (!tokenMetrics || tokenMetrics.priceHistory.length < 10) return;

    const trends = analyzeTrends(tokenMetrics.priceHistory);
    tokenMetrics.trends = {
      shortTerm: { ...trends.shortTerm, timestamp: Date.now() },
      longTerm: { ...trends.longTerm, timestamp: Date.now() }
    };
  }

  public getAnalytics(address: string): TokenAnalytics | undefined {
    return this.analytics.get(address);
  }
}
