import { Connection } from '@solana/web3.js';
import { createInitialStore } from './analytics-store';
import { FeeAnalyticsModule } from '../modules/fee-analytics';
import { ProgramPerformanceModule } from '../modules/program-performance';
import { NetworkMetricsModule } from '../modules/network-metrics';
import { TokenAnalyticsModule } from '../modules/token-analytics';
import { PerformanceMonitoringModule } from '../modules/performance-monitoring';
import { AnalyticsStore, FeeAnalytics, ProgramPerformance, NetworkMetrics, TokenAnalytics, PerformanceMetrics } from '../types';

export class AnalyticsBase {
  protected readonly store: AnalyticsStore;
  protected readonly feeAnalytics: FeeAnalyticsModule;
  protected readonly programPerformance: ProgramPerformanceModule;
  protected readonly networkMetrics: NetworkMetricsModule;
  protected readonly tokenAnalytics: TokenAnalyticsModule;
  protected readonly performanceMonitoring: PerformanceMonitoringModule;

  constructor() {
    this.store = createInitialStore();
    this.feeAnalytics = new FeeAnalyticsModule(this.store.feeAnalytics);
    this.programPerformance = new ProgramPerformanceModule(this.store.programPerformance);
    this.networkMetrics = new NetworkMetricsModule(this.store.networkMetrics);
    this.tokenAnalytics = new TokenAnalyticsModule(this.store.tokenAnalytics);
    this.performanceMonitoring = new PerformanceMonitoringModule(this.store.performanceMetrics);
  }

  public setConnection(connection: Connection) {
    this.networkMetrics.setConnection(connection);
  }

  public cleanup() {
    this.performanceMonitoring.cleanup();
  }

  // Analytics Retrieval Methods
  public getFeeAnalytics(): FeeAnalytics {
    return this.feeAnalytics.getAnalytics();
  }

  public getProgramPerformance(program?: string): ProgramPerformance | Map<string, ProgramPerformance> {
    return this.programPerformance.getPerformance(program);
  }

  public getNetworkMetrics(): NetworkMetrics {
    return this.networkMetrics.getMetrics();
  }

  public getTokenAnalytics(address: string): TokenAnalytics | undefined {
    return this.tokenAnalytics.getAnalytics(address);
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    return this.performanceMonitoring.getMetrics();
  }

  // Helper Methods
  public getOptimalPriorityFee(program: string, isSwap: boolean = true): number {
    return this.feeAnalytics.getOptimalPriorityFee(program, isSwap);
  }

  public isGoodTimeToTrade(): boolean {
    return this.networkMetrics.isGoodTimeToTrade();
  }
}
