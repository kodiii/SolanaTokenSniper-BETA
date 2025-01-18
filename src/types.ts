export interface MintsDataReponse {
  tokenMint?: string;
  solMint?: string;
}

export interface QuoteResponse {
  // Define the expected structure of the response here
  // Adjust based on the actual API response
  data: any; // Replace `any` with the specific type if known
}

export interface SerializedQuoteResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: {
    computeBudget: Record<string, unknown>;
  };
  simulationSlot: number;
  dynamicSlippageReport: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
    categoryName: string;
    heuristicMaxSlippageBps: number;
  };
  simulationError: string | null;
}

export interface RugResponseExtended {
  mint: string;
  tokenProgram: string;
  creator: string;
  token: {
    mintAuthority: string | null;
    supply: number;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority: string | null;
  };
  token_extensions: any | null;
  tokenMeta: {
    name: string;
    symbol: string;
    uri: string;
    mutable: boolean;
    updateAuthority: string;
  };
  topHolders: {
    address: string;
    amount: number;
    decimals: number;
    pct: number;
    uiAmount: number;
    uiAmountString: string;
    owner: string;
    insider: boolean;
  }[];
  freezeAuthority: string | null;
  mintAuthority: string | null;
  risks: {
    name: string;
    value: string;
    description: string;
    score: number;
    level: string;
  }[];
  score: number;
  fileMeta: {
    description: string;
    name: string;
    symbol: string;
    image: string;
  };
  lockerOwners: Record<string, any>;
  lockers: Record<string, any>;
  lpLockers: any | null;
  markets: {
    pubkey: string;
    marketType: string;
    mintA: string;
    mintB: string;
    mintLP: string;
    liquidityA: string;
    liquidityB: string;
  }[];
  totalMarketLiquidity: number;
  totalLPProviders: number;
  rugged: boolean;
}

export interface WebSocketRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: Array<object>;
}

interface TransactionBase {
  description?: string;
  type?: string;
  source?: string;
  fee?: number;
  feePayer?: string;
  signature?: string;
  slot?: number;
  timestamp?: number;
  transactionError?: string | null;
}

interface TransactionLegacy extends TransactionBase {
  version: 'legacy';
  transaction: {
    message: {
      instructions: Array<{
        parsed?: {
          type: string;
          info: Record<string, any>;
        };
        programId: string;
        accounts?: string[];
        data?: string;
      }>;
    };
  };
  meta?: {
    innerInstructions?: Array<{
      instructions: Array<{
        parsed?: {
          type: string;
          info: Record<string, any>;
        };
        programId: string;
        accounts?: string[];
        data?: string;
      }>;
    }>;
  };
}

interface TransactionVersioned extends TransactionBase {
  version: number;
  transaction: {
    message: {
      instructions: Array<{
        parsed?: {
          type: string;
          info: Record<string, any>;
        };
        programId: string;
        accounts?: string[];
        data?: string;
      }>;
    };
  };
  meta?: {
    innerInstructions?: Array<{
      instructions: Array<{
        parsed?: {
          type: string;
          info: Record<string, any>;
        };
        programId: string;
        accounts?: string[];
        data?: string;
      }>;
    }>;
  };
}

type TransactionDetailsResponse = TransactionLegacy | TransactionVersioned;

// Type guard functions
function isTransactionLegacy(tx: any): tx is TransactionLegacy {
  return tx?.version === 'legacy' &&
         tx?.transaction?.message?.instructions !== undefined;
}

function isTransactionVersioned(tx: any): tx is TransactionVersioned {
  return typeof tx?.version === 'number' &&
         tx?.transaction?.message?.instructions !== undefined;
}

function isTransactionDetailsResponse(tx: any): tx is TransactionDetailsResponse {
  return isTransactionLegacy(tx) || isTransactionVersioned(tx);
}

export interface SwapEventDetailsResponse {
  programInfo: {
    source: string;
    account: string;
    programName: string;
    instructionName: string;
  };
  tokenInputs: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  tokenOutputs: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  fee: number;
  slot: number;
  timestamp: number;
  description: string;
}

export interface HoldingRecord {
  id?: number; // Optional because it's added by the database
  Time: number;
  Token: string;
  TokenName: string;
  Balance: number;
  SolPaid: number;
  SolFeePaid: number;
  SolPaidUSDC: number;
  SolFeePaidUSDC: number;
  PerTokenPaidUSDC: number;
  Slot: number;
  Program: string;
}

export interface NewTokenRecord {
  id?: number; // Optional because it's added by the database
  time: number;
  name: string;
  mint: string;
  creator: string;
}

export interface MarketData {
  price: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
}

export interface SellTransactionLock {
  timestamp: number;
  cooling_period: number;
  min_holding_time: number;
}

export interface createSellTransactionResponse {
  success: boolean;
  msg: string | null;
  tx: string | null;
}

export interface SellTransactionLock {
  token: string;
  lockedAt: number;
  expiresAt: number;
  attempts: number;
}

export interface SellAttempt {
  token: string;
  timestamp: number;
  success: boolean;
  error?: string;
  price?: number;
  liquidity?: number;
  priceImpact?: number;
}

export interface TransactionSafetyChecks {
  minHoldingTime: number; // in seconds
  minLiquidity: number; // in USD
  maxPriceImpact: number; // in percentage (0-100)
  maxRetries: number;
  retryDelay: number; // in milliseconds
}

export interface LastPriceDexReponse {
  schemaVersion: string;
  pairs: {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    labels?: string[];
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
      m5: { buys: number; sells: number };
      h1: { buys: number; sells: number };
      h6: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    priceChange: {
      m5: number;
      h1: number;
      h6: number;
      h24: number;
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info: {
      imageUrl: string;
      header: string;
      openGraph: string;
      websites?: { label: string; url: string }[];
      socials: { type: string; url: string }[];
    };
  }[];
}

export type TransactionDetailsResponseArray = TransactionDetailsResponse[];
