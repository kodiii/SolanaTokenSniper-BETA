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

interface TransactionDetailsResponse {
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: {
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number | string;
    mint: string;
    tokenStandard: string;
  }[];
  nativeTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
  accountData: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: {
      userAccount: string;
      tokenAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      mint: string;
    }[];
  }[];
  transactionError: string | null;
  instructions: {
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions: {
      accounts: string[];
      data: string;
      programId: string;
    }[];
  }[];
  events: {
    swap: {
      nativeInput: {
        account: string;
        amount: string;
      } | null;
      nativeOutput: {
        account: string;
        amount: string;
      } | null;
      tokenInputs: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      tokenOutputs: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      nativeFees: {
        account: string;
        amount: string;
      }[];
      tokenFees: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      innerSwaps: {
        tokenInputs: {
          fromTokenAccount: string;
          toTokenAccount: string;
          fromUserAccount: string;
          toUserAccount: string;
          tokenAmount: number;
          mint: string;
          tokenStandard: string;
        }[];
        tokenOutputs: {
          fromTokenAccount: string;
          toTokenAccount: string;
          fromUserAccount: string;
          toUserAccount: string;
          tokenAmount: number;
          mint: string;
          tokenStandard: string;
        }[];
        tokenFees: {
          userAccount: string;
          tokenAccount: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
          mint: string;
        }[];
        nativeFees: {
          account: string;
          amount: string;
        }[];
        programInfo: {
          source: string;
          account: string;
          programName: string;
          instructionName: string;
        };
      }[];
    };
  };
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
<<<<<<< Updated upstream
// Update to reflect an array of transactions
=======

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

export interface SellTransactionLock {
  token: string;
  lockedAt: number;
  expiresAt: number;
  attempts: number;
}

export interface MarketData {
  price: number;
  liquidity: number;
  priceImpact: number;
  lastUpdated: number;
  source: 'jup' | 'dex';
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

>>>>>>> Stashed changes
export type TransactionDetailsResponseArray = TransactionDetailsResponse[];
