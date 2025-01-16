export interface FeeAnalytics {
  avgFeeByProgram: Map<string, number>;
  highFeeTransactions: Array<{
    slot: number;
    fee: number;
    program: string;
    timestamp: number;
  }>;
  totalFeesSpent: number;
  feeToRevenueRatio: number;
}

export interface ProgramPerformance {
  programId: string;
  successRate: number;
  totalExecutions: number;
  successfulExecutions: number;
  avgExecutionTime: number;
  totalPnl: number;
  activityCount?: Map<string, number>;
  totalTransactions: number;
  avgProfitLoss: number;
  lastUpdated: number;
}

export interface NetworkMetrics {
  avgSlotTime: number;
  congestionLevel: 'Low' | 'Medium' | 'High';
  recentSlots: Array<{
    slot: number;
    timestamp: number;
  }>;
  lastUpdated: number;
}

export interface TokenAnalytics {
  symbol: string;
  address: string;
  priceHistory: Array<{
    price: number;
    timestamp: number;
    volume: number;
  }>;
  volumeHistory: Array<{
    volume: number;
    timestamp: number;
  }>;
  alerts: Array<{
    type: 'price_movement' | 'volume_spike' | 'trend_change';
    message: string;
    timestamp: number;
    severity: 'info' | 'warning' | 'critical';
  }>;
  trends: {
    shortTerm: {
      direction: 'up' | 'down' | 'sideways';
      strength: number;
      timestamp: number;
    };
    longTerm: {
      direction: 'up' | 'down' | 'sideways';
      strength: number;
      timestamp: number;
    };
  };
  metrics: {
    volatility: number;
    averageVolume24h: number;
    priceChange24h: number;
    volumeChange24h: number;
    lastUpdate: number;
  };
}

export interface PerformanceMetrics {
  executionTimes: Array<{
    operation: string;
    duration: number;
    timestamp: number;
  }>;
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
    timestamp: number;
  };
  operationStats: Map<string, {
    avgExecutionTime: number;
    successRate: number;
    errorRate: number;
    lastExecuted: number;
  }>;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'critical';
    lastCheck: number;
    issues: Array<{
      component: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
      timestamp: number;
    }>;
  };
}

export interface AnalyticsStore {
  feeAnalytics: FeeAnalytics;
  programPerformance: Map<string, ProgramPerformance>;
  networkMetrics: NetworkMetrics;
  tokenAnalytics: Map<string, TokenAnalytics>;
  performanceMetrics: PerformanceMetrics;
}
