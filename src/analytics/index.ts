import { Connection } from '@solana/web3.js';
import { FeeAnalyticsManager } from './fee-analytics';
import { ProgramPerformanceManager } from './program-performance';
import { NetworkMetricsManager } from './network-metrics';
import { TokenMetricsManager } from './token-metrics';
import { PerformanceMonitoringManager } from './performance-monitoring';
import { FeeAnalytics, ProgramPerformance, NetworkMetrics, TokenAnalytics, PerformanceMetrics } from './types';

class Analytics {
  private static instance: Analytics;
  private feeAnalytics: FeeAnalyticsManager;
  private programPerformance: ProgramPerformanceManager;
  private networkMetrics: NetworkMetricsManager;
  private tokenMetrics: TokenMetricsManager;
  private performanceMonitoring: PerformanceMonitoringManager;

  private constructor() {
    this.feeAnalytics = new FeeAnalyticsManager();
    this.programPerformance = new ProgramPerformanceManager();
    this.networkMetrics = new NetworkMetricsManager();
    this.tokenMetrics = new TokenMetricsManager();
    this.performanceMonitoring = new PerformanceMonitoringManager();
  }

  public static getInstance(): Analytics {
    if (!Analytics.instance) {
      Analytics.instance = new Analytics();
    }
    return Analytics.instance;
  }

  public setConnection(connection: Connection) {
    this.networkMetrics.setConnection(connection);
  }

  // Fee Analytics Methods
  public trackFees(program: string, fee: number, slot: number) {
    const currentCount = (this.programPerformance.getPerformance(program) as ProgramPerformance).totalTransactions;
    this.feeAnalytics.trackFees(program, fee, slot, currentCount);
  }

  // Program Performance Methods
  public trackProgramPerformance(program: string, executionTime: number, pnl: number, success: boolean) {
    this.programPerformance.trackPerformance(program, executionTime, pnl, success);
  }

  public trackProgramActivity(programId: string, activityType: string) {
    this.programPerformance.trackActivity(programId, activityType);
  }

  // Network Metrics Methods
  public async updateNetworkMetrics(currentSlot: number) {
    await this.networkMetrics.updateMetrics(currentSlot);
  }

  // Token Analytics Methods
  public updateTokenMetrics(address: string, symbol: string, price: number, volume: number) {
    this.tokenMetrics.updateMetrics(address, symbol, price, volume);
  }

  // Performance Monitoring Methods
  public trackOperation(operation: string, duration: number) {
    this.performanceMonitoring.trackOperation(operation, duration);
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
    return this.tokenMetrics.getAnalytics(address);
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

export const analytics = Analytics.getInstance();
