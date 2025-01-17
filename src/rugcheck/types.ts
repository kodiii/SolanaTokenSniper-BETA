import { RugResponseExtended } from '../types';

export interface RugCheckCondition {
  check: boolean;
  message: string;
  foundStrings?: string[];
}

export interface TokenReport {
  tokenMeta: {
    name?: string;
    symbol?: string;
    mutable?: boolean;
  };
  token: {
    mintAuthority: string | null;
    isInitialized: boolean;
    freezeAuthority: string | null;
  };
  creator: string;
  risks: {
    name: string;
    value: string;
    description: string;
    score: number;
    level: string;
  }[];
  topHolders: {
    address: string;
    pct: number;
    insider: boolean;
  }[];
  markets?: {
    liquidityA: string;
    liquidityB: string;
  }[];
  totalLPProviders: number;
  totalMarketLiquidity: number;
  rugged: boolean;
  score: number;
  fileMeta?: any;
}
