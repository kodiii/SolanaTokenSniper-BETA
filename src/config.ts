export const config = {
  performance: {
    max_concurrent_operations: 5, // Maximum number of concurrent operations
    use_websocket: true, // Use WebSocket instead of HTTP polling
    cache_enabled: true,
    cache_duration: 60000, // Cache duration in milliseconds (1 minute)
    batch_size: 10, // Number of operations to batch together
    memory_cleanup_interval: 300000, // Memory cleanup interval in milliseconds (5 minutes)
  },
  rpc: {
    endpoints: [
      process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com", // Primary endpoint from .env or default
      "https://solana-api.projectserum.com", // Backup endpoint
    ],
    connection_timeout: 30000, // Connection timeout in milliseconds
    max_retries: 3, // Maximum number of connection retries
    load_balance: true, // Enable RPC endpoint load balancing
    websocketEndpoint: process.env.HELIUS_WSS_URI,
    priorityEndpoints: [
      process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com",
      "https://solana-api.projectserum.com",
    ],
  },
  liquidity_pool: {
    radiyum_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
  },
  tx: {
    fetch_tx_max_retries: 5,
    fetch_tx_initial_delay: 1000, // Initial delay before fetching LP creation transaction details (3 seconds)
    swap_tx_initial_delay: 500, // Initial delay before first buy (1 second)
    get_timeout: 10000, // Timeout for API requests
    concurrent_transactions: 1, // Number of simultaneous transactions
    retry_delay: 500, // Delay between retries (0.5 seconds)
  },
  swap: {
    verbose_log: false,
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "medium", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    amount: "150000000", //0.015 SOL
    slippageBps: "200", // 2%
    db_name_tracker_holdings: "src/tracker/holdings.db", // Sqlite Database location
    token_not_tradable_400_error_retries: 5, // How many times should the bot try to get a quote if the token is not tradable yet
    token_not_tradable_400_error_delay: 2000, // How many seconds should the bot wait before retrying to get a quote again
  },
  sell: {
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "high", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    slippageBps: "200", // 2%
    auto_sell: true, // If set to true, stop loss and take profit triggers automatically when set.
    stop_loss_percent: 20,
    take_profit_percent: 250,
    track_public_wallet: "", // If set an additional log line will be shown with a link to track your wallet
  },
  rug_check: {
    verbose_log: false,
    simulation_mode: true,
    // Dangerous
    allow_mint_authority: false, // The mint authority is the address that has permission to mint (create) new tokens. Strongly Advised to set to false.
    allow_not_initialized: false, // This indicates whether the token account is properly set up on the blockchain. Strongly Advised to set to false
    allow_freeze_authority: false, // The freeze authority is the address that can freeze token transfers, effectively locking up funds. Strongly Advised to set to false
    allow_rugged: false,
    // Critical
    allow_mutable: false,
    block_returning_token_names: true,
    block_returning_token_creators: true,
    block_symbols: [""],
    block_names: [""],
    only_contain_string: false, // Enable/disable string containment filter
    contain_string: ["AI", "GPT", "AGENT"], // Strings to match in token names (case insensitive)
    allow_insider_topholders: false, // Allow inseder accounts to be part of the topholders
    max_alowed_pct_topholders: 10, // Max allowed percentage an individual topholder might hold
    exclude_lp_from_topholders: true, // If true, Liquidity Pools will not be seen as top holders
    // Warning
    min_total_markets: 0,
    min_total_lp_providers: 0,
    min_total_market_Liquidity: 30000, // Default is 1.000.000
    // Misc
    ignore_pump_fun: false,
    max_score: 11400, // Set to 0 to ignore, 12600 is max
    min_score: 0,
    legacy_not_allowed: [
      //"Low Liquidity",
      "Single holder ownership",
      //"High holder concentration",
      "Freeze Authority still enabled",
      //"Large Amount of LP Unlocked",
      "Copycat token",
      //"Low amount of LP Providers",
    ],
  },
};
