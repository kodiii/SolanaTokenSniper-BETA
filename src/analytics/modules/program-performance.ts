import { ProgramPerformance } from '../types';

export class ProgramPerformanceModule {
  private performance: Map<string, ProgramPerformance>;

  constructor(initialPerformance: Map<string, ProgramPerformance>) {
    this.performance = initialPerformance;
  }

  public trackPerformance(program: string, executionTime: number, pnl: number, success: boolean) {
    const performance = this.getOrCreatePerformance(program);

    performance.totalExecutions++;
    if (success) performance.successfulExecutions++;
    performance.successRate = performance.successfulExecutions / performance.totalExecutions;
    performance.avgExecutionTime = (performance.avgExecutionTime * (performance.totalExecutions - 1) + executionTime) / performance.totalExecutions;
    performance.totalPnl += pnl;
    performance.totalTransactions++;
    performance.avgProfitLoss = performance.totalPnl / performance.totalTransactions;
    performance.lastUpdated = Date.now();

    this.performance.set(program, performance);
  }

  public trackActivity(programId: string, activityType: string) {
    const performance = this.getOrCreatePerformance(programId);
    const currentCount = performance.activityCount?.get(activityType) || 0;
    performance.activityCount?.set(activityType, currentCount + 1);
    performance.totalExecutions++;
    performance.lastUpdated = Date.now();

    this.performance.set(programId, performance);
  }

  public getPerformance(program?: string): ProgramPerformance | Map<string, ProgramPerformance> {
    if (program) {
      return this.getOrCreatePerformance(program);
    }
    return this.performance;
  }

  private getOrCreatePerformance(program: string): ProgramPerformance {
    return this.performance.get(program) || {
      programId: program,
      successRate: 0,
      totalExecutions: 0,
      successfulExecutions: 0,
      avgExecutionTime: 0,
      totalPnl: 0,
      activityCount: new Map(),
      totalTransactions: 0,
      avgProfitLoss: 0,
      lastUpdated: Date.now()
    };
  }
}
