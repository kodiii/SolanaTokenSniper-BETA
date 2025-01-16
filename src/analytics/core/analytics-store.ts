import { AnalyticsStore } from '../types';

export function createInitialStore(): AnalyticsStore {
  return {
    feeAnalytics: {
      avgFeeByProgram: new Map(),
      highFeeTransactions: [],
      totalFeesSpent: 0,
      feeToRevenueRatio: 0
    },
    programPerformance: new Map(),
    networkMetrics: {
      avgSlotTime: 0,
      congestionLevel: 'Low',
      recentSlots: [],
      lastUpdated: Date.now()
    },
    tokenAnalytics: new Map(),
    performanceMetrics: {
      executionTimes: [],
      resourceUsage: {
        memoryUsage: 0,
        cpuUsage: 0,
        timestamp: Date.now()
      },
      operationStats: new Map(),
      systemHealth: {
        status: 'healthy',
        lastCheck: Date.now(),
        issues: []
      }
    }
  };
}
