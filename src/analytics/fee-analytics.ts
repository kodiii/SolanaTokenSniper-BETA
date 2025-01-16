import { FeeAnalytics } from './types';

export class FeeAnalyticsManager {
  private analytics: FeeAnalytics;

  constructor() {
    this.analytics = {
      avgFeeByProgram: new Map(),
      highFeeTransactions: [],
      totalFeesSpent: 0,
      feeToRevenueRatio: 0
    };
  }

  public trackFees(program: string, fee: number, slot: number, currentCount: number) {
    const { avgFeeByProgram } = this.analytics;
    const currentAvg = avgFeeByProgram.get(program) || 0;
    
    // Update average fee for program
    const newAvg = (currentAvg * (currentCount - 1) + fee) / currentCount;
    avgFeeByProgram.set(program, newAvg);

    // Track high fee transactions (top 10)
    this.analytics.highFeeTransactions.push({
      slot,
      fee,
      program,
      timestamp: Date.now()
    });
    this.analytics.highFeeTransactions.sort((a, b) => b.fee - a.fee);
    if (this.analytics.highFeeTransactions.length > 10) {
      this.analytics.highFeeTransactions.pop();
    }

    // Update total fees
    this.analytics.totalFeesSpent += fee;
  }

  public getAnalytics(): FeeAnalytics {
    return this.analytics;
  }

  public getOptimalPriorityFee(program: string, isSwap: boolean = true): number {
    const avgFee = this.analytics.avgFeeByProgram.get(program) || 0;
    const baseMultiplier = isSwap ? 1.2 : 1.1; // Higher multiplier for swaps
    return avgFee * baseMultiplier;
  }
}
