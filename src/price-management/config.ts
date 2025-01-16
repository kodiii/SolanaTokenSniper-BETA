import { VolatilityConfig, PriceSourceConfig } from './types';

export const volatilityConfig: VolatilityConfig = {
  minTTL: 5000,         // 5 seconds minimum cache time
  maxTTL: 30000,        // 30 seconds maximum cache time
  updateThreshold: 5,    // 5% price change threshold
  historyWindow: 300000, // 5 minutes of price history
  samples: 20           // Keep 20 price samples
};

export const priceSourceConfigs: PriceSourceConfig[] = [
  {
    name: 'jupiter',
    priority: 1,
    weight: 0.6,
    enabled: true,
    timeout: 5000,          // 5 seconds timeout
    retryCount: 3,
    retryDelay: 1000,      // 1 second between retries
    reliabilityScore: 1.0,  // Start with perfect score
    minResponseTime: 100,   // 100ms minimum expected response time
    maxResponseTime: 5000,  // 5s maximum expected response time
    successRate: 1.0,       // Start with perfect success rate
    totalRequests: 0,
    lastUpdate: Date.now(),
    historicalMetrics: [],
    status: 'active',
    degradationThreshold: 0.8,  // Degrade service if reliability drops below 80%
    disableThreshold: 0.5,      // Disable if reliability drops below 50%
    recoveryThreshold: 0.9,     // Recover when reliability reaches 90%
    metricsWindow: 300000,      // 5 minutes metrics window
    maxMetricsHistory: 100      // Keep last 100 metric points
  },
  {
    name: 'dexscreener',
    priority: 2,
    weight: 0.4,
    enabled: true,
    timeout: 5000,
    retryCount: 3,
    retryDelay: 1000,
    reliabilityScore: 1.0,
    minResponseTime: 100,
    maxResponseTime: 5000,
    successRate: 1.0,
    totalRequests: 0,
    lastUpdate: Date.now(),
    historicalMetrics: [],
    status: 'active',
    degradationThreshold: 0.8,
    disableThreshold: 0.5,
    recoveryThreshold: 0.9,
    metricsWindow: 300000,
    maxMetricsHistory: 100
  }
];
