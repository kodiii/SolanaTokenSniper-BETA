import { config as baseConfig } from './config';
import { RugCheckConfig } from './rugcheck/types';

const productionConfig: Partial<typeof baseConfig> = {
  performance: {
    max_concurrent_operations: 10,
    use_websocket: true,
    cache_enabled: true,
    cache_duration: 60000,
    batch_size: 20,
    batch_delay: 500,
    max_retries: 5,
    cache_size: 1000,
    update_interval: 3000,
    memory_cleanup_interval: 600000,
    concurrent_batches: 5,
    retry_delay: 500,
    analytics: {
      enabled: true,
      store_history: true,
      max_history_items: 5000,
      congestion_thresholds: {
        low: 500,
        medium: 1000
      },
      fee_multipliers: {
        high: 2.0,
        medium: 1.5,
        low: 1.0
      }
    }
  },
  rpc: {
    endpoints: [process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com"],
    connection_timeout: 30000,
    max_retries: 3,
    load_balance: true,
    websocketEndpoint: undefined,
    priorityEndpoints: [],
    min_connections: 2,
    max_connections: 5,
    rate_limit: {
      max_requests_per_second: 10,
      retry_delay_base: 1000,
      retry_delay_max: 10000,
      concurrent_requests: 3
    }
  },
  rug_check: {
    simulation_mode: false,
    verbose_log: false,
    allow_mint_authority: false,
    allow_not_initialized: false,
    allow_freeze_authority: false,
    allow_rugged: false,
    allow_mutable: false,
    block_returning_token_names: true,
    block_returning_token_creators: true,
    block_symbols: ["TEST", "SCAM", "RUG"],
    block_names: ["Test Token", "Scam Token"],
    only_contain_string: false,
    contain_string: [],
    allow_insider_topholders: false,
    max_alowed_pct_topholders: 10,
    max_alowed_pct_all_topholders: 50,
    exclude_lp_from_topholders: true,
    min_total_markets: 1,
    min_total_lp_providers: 2,
    min_total_market_Liquidity: 50000,
    ignore_pump_fun: false,
    max_score: 100,
    min_score: 50,
    legacy_not_allowed: ["DEPRECATED", "OLD"]
  } as RugCheckConfig,
  trading: {
    stopLoss: {
      enabled: true,
      dynamic: {
        enabled: true,
        basePercentage: 5,
        volatilityMultiplier: 1.5,
        maxStopLoss: 15,
        minStopLoss: 2,
        updateInterval: 30000,
        volatilityThreshold: 0.05,
        volatilityAdjustment: 0.2
      },
      trailing: {
        enabled: true,
        trailingDistance: 2.5,
        activationThreshold: 5,
        updateInterval: 15000
      }
    },
    marketConditions: {
      enabled: true,
      adjustments: {
        highCongestion: {
          stopLossIncrease: 1.5,
          takeProfitIncrease: 1.2,
          slippageIncrease: 1.3
        },
        lowVolume: {
          stopLossIncrease: 1.3,
          takeProfitIncrease: 1.1,
          slippageIncrease: 1.2
        },
        highVolatility: {
          stopLossIncrease: 1.8,
          takeProfitIncrease: 1.4,
          slippageIncrease: 1.4
        }
      },
      thresholds: {
        congestion: {
          high: 1000,
          medium: 500
        },
        volume: {
          low: 1000000,
          high: 5000000
        },
        volatility: {
          high: 0.1,
          medium: 0.05
        }
      }
    },
    takeProfit: {
      enabled: true,
      levels: [
        {
          percentage: 10,
          sellPercentage: 30,
          adjustStopLoss: true
        },
        {
          percentage: 25,
          sellPercentage: 40,
          adjustStopLoss: true
        },
        {
          percentage: 50,
          sellPercentage: 30,
          adjustStopLoss: true
        }
      ],
      partialSellEnabled: true,
      rebalancePosition: true
    },
    featureFlags: {
      dynamicStopLoss: true,
      trailingStopLoss: true,
      multipleTakeProfit: true,
      marketConditionAdjustments: true,
      partialSells: true,
      positionRebalancing: true,
      volatilityAdjustments: true,
      congestionAdjustments: true
    },
    experiments: {
      enabled: false,
      activeTesting: {
        stopLossStrategies: false,
        takeProfitLevels: false,
        marketConditionResponses: false
      },
      groupAssignment: "control",
      trackingEnabled: false,
      resultAnalysisInterval: 0
    }
  }
};

export default productionConfig;
