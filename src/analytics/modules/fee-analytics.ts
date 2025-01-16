import { FeeAnalytics } from '../types';

export class FeeAnalyticsModule {
  private analytics: FeeAnalytics;

  constructor(initialAnalytics: FeeAnalytics) {
    this.analytics = initialAnalytics;
  }

  public trackFees(program: string, fee: number, slot: number, totalTransactions: number) {
    const { avgFeeByProgram } = this.analytics;
    const currentAvg = avgFeeByProgram.get(program) || 0;
    
    // Update average fee for program
    const newAvg = (currentAvg * (totalTransactions - 1) + fee) / totalTransactions;
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
