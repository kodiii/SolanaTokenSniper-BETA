import { RugResponseExtended } from '../types';

export interface RugCheckCondition {
  check: boolean;
  message: string;
  foundStrings?: string[];
}

export interface RugCheckConfig {
  verbose_log: boolean;
  simulation_mode: boolean;
  allow_mint_authority: boolean;
  allow_not_initialized: boolean;
  allow_freeze_authority: boolean;
  allow_rugged: boolean;
  allow_mutable: boolean;
  ignore_pump_fun: boolean;
  allow_insider_topholders: boolean;
  block_returning_token_names: boolean;
  block_returning_token_creators: boolean;
  exclude_lp_from_topholders: boolean;
  only_contain_string: boolean;
  contain_string: string[];
  block_symbols: string[];
  block_names: string[];
  max_alowed_pct_topholders: number;
  max_alowed_pct_all_topholders: number;
  min_total_lp_providers: number;
  min_total_markets: number;
  min_total_market_Liquidity: number;
  max_score: number;
  min_score: number;
  legacy_not_allowed: string[];
}

export interface TokenReport {
  token: {
    mintAuthority: string | null;
    freezeAuthority: string | null;
    isInitialized: boolean;
  };
  tokenMeta?: {
    name?: string;
    symbol?: string;
    mutable: boolean;
  };
  creator?: string;
  fileMeta?: any;
  risks: Array<{
    name: string;
    value: string;
    description: string;
  }>;
  topHolders?: Array<{
    address: string;
    pct: number;
    insider: boolean;
  }>;
  totalLPProviders: number;
  markets?: Array<{
    liquidityA: string;
    liquidityB: string;
  }>;
  totalMarketLiquidity: number;
  rugged: boolean;
  rugScore?: number;
  score: number;
}
