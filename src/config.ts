import { RugCheckConfig } from './rugcheck/types';

export const config = {
  performance: {
    max_concurrent_operations: 5, // Maximum number of concurrent operations
    use_websocket: true, // Use WebSocket instead of HTTP polling
    cache_enabled: true,
    cache_duration: 60000, // Cache duration in milliseconds (1 minute)
    batch_size: 10,           // Number of tokens to process in a single batch
    batch_delay: 1000,        // Delay between batches in milliseconds
    max_retries: 3,           // Maximum number of retries for failed price fetches
    cache_size: 500,          // Maximum number of items in the price cache
    update_interval: 5000,    // Price update interval in milliseconds
    memory_cleanup_interval: 300000, // Memory cleanup interval in milliseconds (5 minutes)
    analytics: {
      enabled: true,
      store_history: true,
      max_history_items: 1000,
      congestion_thresholds: {
        low: 500,    // Less than 500ms per slot
        medium: 1000 // Less than 1000ms per slot
      },
      fee_multipliers: {
        high: 2.0,    // 100% increase during high congestion
        medium: 1.5, // 50% increase during medium congestion
        low: 1.0    // Normal fee during low congestion
      }
    },
    concurrent_batches: 3,
    retry_delay: 1000,
  },
  rpc: {
    endpoints: [
      process.env.HELIUS_HTTPS_URI,
      "https://solana-api.instantnodes.io/token-YbDpGWJmRDzsiLxX4fmLVXMLRDQfGDVG",
      "https://api.mainnet-beta.solana.com",
      "https://rpc.ankr.com/solana",
      "https://solana-mainnet.g.alchemy.com/v2/demo",
      "https://solana-api.projectserum.com",
      "https://solana.genesysgo.net"
    ],
    connection_timeout: 30000,
    max_retries: 5,
    load_balance: true,
    websocketEndpoint: undefined,
    priorityEndpoints: [],
    min_connections: 3,
    max_connections: 8,
    rate_limit: {
      max_requests_per_second: 20,
      retry_delay_base: 500,
      retry_delay_max: 8000,
      concurrent_requests: 4
    }
  },
  websocket: {
    max_reconnect_attempts: 5,
    reconnect_delay: 1000,
    ping_interval: 30000,
    pong_timeout: 10000,
    enabled: true,
  },
  liquidity_pool: {
    radiyum_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    orca_program_id: "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
  },
  tx: {
    max_retries: 3,              // Maximum number of retry attempts
    retry_delay: 1000,           // Base delay between retries in ms
    confirmation_timeout: 30000,  // Max time to wait for confirmation in ms
    priority_fee: 10000,         // Priority fee in lamports
    fetch_tx_max_retries: 5,
    fetch_tx_initial_delay: 1000, // Initial delay before fetching LP creation transaction details (3 seconds)
    swap_tx_initial_delay: 500, // Initial delay before first buy (1 second)
    get_timeout: 10000, // Timeout for API requests
    concurrent_transactions: 1, // Number of simultaneous transactions
  },
  swap: {
    verbose_log: false,
    dynamic_fees: false, // Toggle between dynamic and static fees
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "medium", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    amount: 150000000, //0.015 SOL
    slippageBps: 200, // 2%
    db_name_tracker_holdings: "src/tracker/holdings.db", // Sqlite Database location
    token_not_tradable_400_error_retries: 5, // How many times should the bot try to get a quote if the token is not tradable yet
    token_not_tradable_400_error_delay: 2000, // How many seconds should the bot wait before retrying to get a quote again
  },
  sell: {
    dynamic_fees: false, // Toggle between dynamic and static fees
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "high", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    slippageBps: 200, // 2%
    auto_sell: true, // If set to true, stop loss and take profit triggers automatically when set.
    stop_loss_percent: 20, // Changed from 20 to 8 for better risk management
    take_profit_percent: 25, // Changed from 250 to 80 for more realistic profit targets
    track_public_wallet: "", // If set an additional log line will be shown with a link to track your wallet
    price_source: "jup", // "jup" for Jupiter or "dex" for DexScreener
    min_holding_time: 300, // 5 minutes
    min_liquidity: 10000, // $10,000
    max_retries: 3,
    retry_delay: 5000, // 5 seconds
    cooling_period: 30000, // 30 seconds
  },
  rug_check: {
    verbose_log: true,
    simulation_mode: true,
    allow_mint_authority: false,
    allow_not_initialized: false,
    allow_freeze_authority: false,
    allow_rugged: false,
    allow_mutable: false,
    ignore_pump_fun: false,
    allow_insider_topholders: false,
    block_returning_token_names: true,
    block_returning_token_creators: true,
    exclude_lp_from_topholders: true,
    only_contain_string: false,
    contain_string: [] as string[],
    block_symbols: [] as string[],
    block_names: [] as string[],
    max_alowed_pct_topholders: 20,
    max_alowed_pct_all_topholders: 50,
    min_total_lp_providers: 5,
    min_total_markets: 1,
    min_total_market_Liquidity: 1000,
    max_score: 50,
    min_score: 0,
    legacy_not_allowed: ["Honeypot Risk", "Mint Authority", "Freeze Authority"]
  } as RugCheckConfig,
  retry: {
    default: {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      timeout: 5000
    },
    transaction: {
      maxAttempts: 5,
      initialDelay: 2000,
      maxDelay: 60000,
      backoffFactor: 1.5,
      timeout: 90000
    },
    price: {
      maxAttempts: 3,
      initialDelay: 500,
      maxDelay: 5000,
      backoffFactor: 2,
      timeout: 3000
    },
    network: {
      maxAttempts: 4,
      initialDelay: 1000,
      maxDelay: 15000,
      backoffFactor: 2,
      timeout: 10000
    }
  },
  price: {
    aggregation: {
      minSources: 2,              // Minimum number of sources required
      maxPriceDeviation: 0.05,    // Maximum allowed price difference (5%)
      confidenceThreshold: 0.7,   // Minimum confidence required (70%)
      weightDecayFactor: 0.2,     // Weight reduction on failure (20%)
      weightRecoveryFactor: 0.1,  // Weight increase on success (10%)
      reliabilityWindow: 300000,  // Time window for metrics (5 minutes)
      outlierThreshold: 2.0       // Standard deviations for outliers
    },
    sources: {
      jupiter: {
        uri: process.env.JUP_HTTPS_PRICE_URI,
        timeout: 3000
      },
      dexscreener: {
        uri: process.env.DEX_HTTPS_LATEST_TOKENS,
        timeout: 3000
      }
    },
    validation: {
      max_source_deviation: 0.1,    // Maximum allowed deviation between sources (10%)
      max_price_change: 0.2,        // Maximum allowed sudden price change (20%)
      max_price_age: 60000,         // Maximum age of price data in milliseconds (1 minute)
      max_history_items: 100,       // Number of historical prices to keep per token
      min_confidence: 0.7,          // Minimum required confidence score
      outlier_threshold: 2,         // Standard deviations for outlier detection
      stale_price_threshold: 30000  // Consider price stale after 30 seconds
    },
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
        updateInterval: 60000,
        volatilityThreshold: 5,
        volatilityAdjustment: 2
      },
      trailing: {
        enabled: true,
        activationThreshold: 10,
        trailingDistance: 5,
        updateInterval: 30000
      }
    },
    takeProfit: {
      enabled: true,
      levels: [
        {
          percentage: 10,            // First take-profit at 10%
          sellPercentage: 30,       // Sell 30% of position
          adjustStopLoss: true      // Move stop-loss to break-even
        },
        {
          percentage: 25,            // Second take-profit at 25%
          sellPercentage: 40,       // Sell 40% of position
          adjustStopLoss: true      // Move stop-loss to first take-profit
        },
        {
          percentage: 50,            // Third take-profit at 50%
          sellPercentage: 30,       // Sell remaining 30%
          adjustStopLoss: true      // Move stop-loss to second take-profit
        }
      ],
      partialSellEnabled: true,
      rebalancePosition: true       // Rebalance remaining position after partial sells
    },
    marketConditions: {
      enabled: true,
      adjustments: {
        highCongestion: {
          stopLossIncrease: 2,      // Increase stop-loss by 2%
          takeProfitIncrease: 5,    // Increase take-profit by 5%
          slippageIncrease: 1       // Increase slippage tolerance by 1%
        },
        lowVolume: {
          stopLossIncrease: 3,      // Increase stop-loss by 3%
          takeProfitIncrease: 7,    // Increase take-profit by 7%
          slippageIncrease: 2       // Increase slippage tolerance by 2%
        },
        highVolatility: {
          stopLossIncrease: 4,      // Increase stop-loss by 4%
          takeProfitIncrease: 10,   // Increase take-profit by 10%
          slippageIncrease: 2       // Increase slippage tolerance by 2%
        }
      },
      thresholds: {
        congestion: {
          high: 1000,               // High congestion threshold (ms)
          medium: 500               // Medium congestion threshold (ms)
        },
        volume: {
          low: 10000,              // Low volume threshold (SOL)
          high: 100000             // High volume threshold (SOL)
        },
        volatility: {
          high: 10,                // High volatility threshold (%)
          medium: 5                // Medium volatility threshold (%)
        }
      }
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
      groupAssignment: "random",    // "random" or "roundRobin"
      trackingEnabled: true,
      resultAnalysisInterval: 86400000 // 24 hours in milliseconds
    }
  }
};
