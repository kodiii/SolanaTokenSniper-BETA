import { config as baseConfig } from './config';

const developmentConfig: Partial<typeof baseConfig> = {
  performance: {
    max_concurrent_operations: 5,
    use_websocket: false,
    cache_enabled: true,
    cache_duration: 60000,
    batch_size: 10,
    batch_delay: 1000,
    max_retries: 3,
    cache_size: 500,
    update_interval: 5000,
    memory_cleanup_interval: 300000,
    concurrent_batches: 3,
    retry_delay: 1000,
    analytics: {
      enabled: true,
      store_history: true,
      max_history_items: 1000,
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
    endpoints: ["https://api.devnet.solana.com"],
    connection_timeout: 15000,
    max_retries: 5,
    load_balance: false,
    websocketEndpoint: undefined,
    priorityEndpoints: [],
    min_connections: 1,
    max_connections: 3,
    rate_limit: {
      max_requests_per_second: 5,
      retry_delay_base: 2000,
      retry_delay_max: 20000,
      concurrent_requests: 1
    }
  },
  rug_check: {
    simulation_mode: true,
    verbose_log: true,
    allow_mint_authority: true,
    allow_not_initialized: true,
    allow_freeze_authority: true,
    allow_rugged: true,
    allow_mutable: true,
    block_returning_token_names: false,
    block_returning_token_creators: false,
    block_symbols: [],
    block_names: [],
    only_contain_string: false,
    contain_string: [],
    allow_insider_topholders: true,
    max_alowed_pct_topholders: 20,
    max_alowed_pct_all_topholders: 50,
    exclude_lp_from_topholders: false,
    min_total_markets: 0,
    min_total_lp_providers: 0,
    min_total_market_Liquidity: 10000,
    ignore_pump_fun: true,
    max_score: 0,
    min_score: 0,
    legacy_not_allowed: []
  },
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
          percentage: 5,
          sellPercentage: 30,
          adjustStopLoss: true
        },
        {
          percentage: 10,
          sellPercentage: 40,
          adjustStopLoss: true
        },
        {
          percentage: 20,
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
      enabled: true,
      activeTesting: {
        stopLossStrategies: true,
        takeProfitLevels: true,
        marketConditionResponses: true
      },
      groupAssignment: "random",
      trackingEnabled: true,
      resultAnalysisInterval: 3600000 // 1 hour in milliseconds
    }
  }
};

export default developmentConfig;
