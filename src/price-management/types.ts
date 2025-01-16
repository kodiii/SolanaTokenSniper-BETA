import { TrendAnalysis } from './trend';

export interface PriceData {
  price: number;
  timestamp: number;
  volatility?: number;
  source: string;
  trend?: TrendAnalysis;
  confidence: number;
  sourceData: {
    [source: string]: {
      price: number;
      timestamp: number;
      weight: number;
      latency: number;
      success: boolean;
    };
  };
}

export interface TokenPriceHistory {
  prices: PriceData[];
  volatility: number;
  lastUpdate: number;
  trend?: TrendAnalysis;
}

export interface ReliabilityMetrics {
  timestamp: number;
  successRate: number;
  responseTime: number;
  reliabilityScore: number;
  weight: number;
  errors: string[];
}

export interface ReliabilityReport {
  source: string;
  currentMetrics: ReliabilityMetrics;
  historicalMetrics: ReliabilityMetrics[];
  trend: {
    successRateTrend: number;
    responseTimeTrend: number;
    reliabilityTrend: number;
  };
  status: 'active' | 'degraded' | 'disabled';
  recommendations: string[];
}

export interface PriceSourceConfig {
  name: string;
  priority: number;
  weight: number;
  enabled: boolean;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  reliabilityScore: number;
  minResponseTime: number;
  maxResponseTime: number;
  successRate: number;
  totalRequests: number;
  lastUpdate: number;
  historicalMetrics: ReliabilityMetrics[];
  status: 'active' | 'degraded' | 'disabled';
  degradationThreshold: number;
  disableThreshold: number;
  recoveryThreshold: number;
  metricsWindow: number;
  maxMetricsHistory: number;
}

export interface VolatilityConfig {
  minTTL: number;        // Minimum cache TTL in milliseconds
  maxTTL: number;        // Maximum cache TTL in milliseconds
  updateThreshold: number; // Price change threshold for volatility calculation
  historyWindow: number;  // Time window for volatility calculation in milliseconds
  samples: number;       // Number of samples to keep for volatility calculation
}

export interface PriceAggregationConfig {
  minSources: number;    // Minimum number of sources required for aggregation
  maxPriceDeviation: number; // Maximum allowed deviation between sources (percentage)
  confidenceThreshold: number; // Minimum confidence required for price updates
  weightDecayFactor: number;  // Factor for reducing source weight on failures
  weightRecoveryFactor: number; // Factor for increasing source weight on successes
  reliabilityWindow: number;   // Time window for calculating reliability scores
  outlierThreshold: number;    // Standard deviations for outlier detection
}
