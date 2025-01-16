import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey, Commitment } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import LRU from 'lru-cache';
import { rpcManager } from './utils/rpc-manager';
import { Logger } from './utils/logger';
import { BatchProcessor } from './utils/batch-processor';

// Initialize cache
const quoteCache = new LRU({
  max: 100,
  ttl: config.performance.cache_duration,
});

// Batch process multiple operations
async function batchProcess<T>(
  items: T[],
  processor: (item: T) => Promise<any>
): Promise<any[]> {
  const batchProcessor = BatchProcessor.getInstance();
  return await batchProcessor.processBatch(items, processor);
}

// Exponential backoff retry
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number, initialDelay: number): Promise<T> {
  let retryCount = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (retryCount >= maxRetries) throw error;
      const delay = initialDelay * Math.pow(1.5, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      retryCount++;
    }
  }
}

import {
  TransactionDetailsResponseArray,
  MintsDataReponse,
  QuoteResponse,
  SerializedQuoteResponse,
  SwapEventDetailsResponse,
  HoldingRecord,
  RugResponseExtended,
  NewTokenRecord,
} from "./types";
import { insertHolding, insertNewToken, removeHolding, selectTokenByMint, selectTokenByNameAndCreator } from "./tracker/db";

// Load environment variables from the .env file
dotenv.config();

export async function fetchTransactionDetails(signature: string): Promise<MintsDataReponse | null> {
  // Check cache first
  const cachedResult = quoteCache.get(signature) as MintsDataReponse | undefined;
  if (cachedResult) {
    console.log("Cache hit for transaction details");
    return cachedResult;
  }

  try {
    // Wait for transaction confirmation with retries
    let isConfirmed = false;
    await rpcManager.withConnection(async (connection) => {
      let confirmationAttempts = 0;
      const maxConfirmationAttempts = config.tx.fetch_tx_max_retries;
      
      while (confirmationAttempts < maxConfirmationAttempts) {
        try {
          const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
          if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
            isConfirmed = true;
            break;
          }
          console.log(`Waiting for transaction confirmation (attempt ${confirmationAttempts + 1}/${maxConfirmationAttempts})...`);
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.log(`Error checking transaction status: ${error.message}`);
          } else {
            console.log(`Error checking transaction status: ${String(error)}`);
          }
        }
        await new Promise(resolve => setTimeout(resolve, config.tx.fetch_tx_initial_delay));
        confirmationAttempts++;
      }
    });

    if (!isConfirmed) {
      console.log("⚠️ Transaction not confirmed after maximum attempts");
      return null;
    }

    // First try Helius API for enhanced transaction details
    const heliusUrl = process.env.HELIUS_HTTPS_URI;
    if (heliusUrl) {
      try {
        // Clean the signature and construct the URL properly
        const cleanSignature = signature.trim();
        const baseUrl = heliusUrl.split('?')[0]; // Get base URL without query params
        const apiKey = heliusUrl.match(/api-key=([^&]+)/)?.[1];
        
        if (!apiKey) {
          throw new Error("Helius API key not found in URL");
        }

        const url = `${baseUrl}?api-key=${apiKey}&signatures=${cleanSignature}`;
        const response = await axios.get(url, {
          timeout: config.tx.get_timeout,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
          const tx = response.data[0];
          // Cache the result
          quoteCache.set(signature, tx);
          return tx;
        }
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        console.log("Helius API error, falling back to RPC:", errorMessage);
      }
    }

    // Fallback to standard RPC if Helius API fails
    return await rpcManager.withConnection(async (connection) => {
      const tx = await connection.getParsedTransaction(signature, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0
      });

      if (!tx) {
        throw new Error("Transaction not found");
      }

      // Add type checking and fallbacks
      if (!tx.transaction?.message?.instructions) {
        throw new Error("Invalid transaction format: missing instructions");
      }

      // Handle both legacy and versioned transactions
      let instructions;
      if (Array.isArray(tx.transaction.message.instructions)) {
        instructions = tx.transaction.message.instructions;
      } else if (typeof tx.transaction.message.instructions === 'object') {
        instructions = [tx.transaction.message.instructions];
      } else {
        throw new Error("Invalid instruction format");
      }

      // Process instructions
      let solMint: string | undefined;
      let tokenMint: string | undefined;

      for (const ix of instructions) {
        try {
          if ('parsed' in ix && ix.parsed && typeof ix.parsed === 'object') {
            const parsed = ix.parsed as { type: string; info?: any };
            
            if (parsed.type === 'initializeAccount' && parsed.info?.mint) {
              if (parsed.info.mint === config.liquidity_pool.wsol_pc_mint) {
                solMint = parsed.info.mint;
              } else {
                tokenMint = parsed.info.mint;
              }
            }
          }
        } catch (err) {
          console.warn("Failed to parse instruction:", err);
          continue;
        }
      }

      if (!solMint || !tokenMint) {
        throw new Error("Could not find required token mints in transaction");
      }

      const result: MintsDataReponse = {
        tokenMint,
        solMint
      };

      return result;
    });
  } catch (error: any) {
    console.error("Failed to fetch transaction details:", error.message);
    return null;
  }
}

export async function createSwapTransaction(solMint: string, tokenMint: string): Promise<string | null> {
  try {
    const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
    const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
    
    return await rpcManager.withConnection(async (connection) => {
      let quoteResponseData: QuoteResponse | null = null;
      let serializedQuoteResponseData: SerializedQuoteResponse | null = null;

      // Get Swap Quote with retry logic
      return withRetry(async () => {
        try {
          // Request a quote in order to swap SOL for new token
          const quoteResponse = await axios.get<QuoteResponse>(quoteUrl, {
            params: {
              inputMint: solMint,
              outputMint: tokenMint,
              amount: config.swap.amount,
              slippageBps: config.swap.slippageBps,
            },
            timeout: config.tx.get_timeout,
          });

          if (!quoteResponse.data) return null;

          if (config.swap.verbose_log) {
            console.log("\nVerbose log:");
            console.log(quoteResponse.data);
          }

          quoteResponseData = quoteResponse.data;

          // Serialize the quote into a swap transaction
          const swapResponse = await axios.post<SerializedQuoteResponse>(
            swapUrl,
            JSON.stringify({
              quoteResponse: quoteResponseData,
              userPublicKey: myWallet.publicKey.toString(),
              wrapAndUnwrapSol: true,
              dynamicSlippage: {
                maxBps: 300,
              },
              prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                  maxLamports: config.swap.prio_fee_max_lamports,
                  priorityLevel: config.swap.prio_level,
                },
              },
            }),
            {
              headers: { "Content-Type": "application/json" },
              timeout: config.tx.get_timeout,
            }
          );

          if (!swapResponse.data) return null;
          serializedQuoteResponseData = swapResponse.data;

          // Process transaction
          const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
          transaction.sign([myWallet.payer]);

          // Execute transaction
          const rawTransaction = transaction.serialize();
          const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2,
          });

          if (!txid) return null;

          // Confirm transaction
          const latestBlockHash = await connection.getLatestBlockhash();
          const conf = await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid,
          });

          if (conf.value.err) return null;

          return txid;
        } catch (error: any) {
          if (error.response?.status === 400 && error.response?.data?.errorCode === "TOKEN_NOT_TRADABLE") {
            throw error; // Allow retry for TOKEN_NOT_TRADABLE errors
          }
          console.error("Error in swap transaction:", error.message);
          return null;
        }
      }, config.swap.token_not_tradable_400_error_retries, config.swap.token_not_tradable_400_error_delay);
    });
  } catch (error: any) {
    console.error("Error in swap transaction:", error.message);
    return null;
  }
}

export async function fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
  try {
    const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    
    return await rpcManager.withConnection(async (connection) => {
      return withRetry(async () => {
        try {
          // Fetch transaction details
          const response = await axios.post<any>(
            txUrl,
            { transactions: [tx] },
            {
              headers: { "Content-Type": "application/json" },
              timeout: config.tx.get_timeout,
            }
          );

          if (!response.data?.length) {
            console.log("⛔ Could not fetch swap details: No response received from API.");
            return false;
          }

          const transactions: TransactionDetailsResponseArray = response.data;
          const swapTransactionData: SwapEventDetailsResponse = {
            programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
            tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
            tokenOutputs: transactions[0]?.events.swap.innerSwaps[0].tokenOutputs,
            fee: transactions[0]?.fee,
            slot: transactions[0]?.slot,
            timestamp: transactions[0]?.timestamp,
            description: transactions[0]?.description,
          };

          // Get SOL price
          const solMint = config.liquidity_pool.wsol_pc_mint;
          const priceResponse = await axios.get<any>(priceUrl, {
            params: { ids: solMint },
            timeout: config.tx.get_timeout,
          });

          if (!priceResponse.data.data[solMint]?.price) return false;

          // Calculate prices
          const solUsdcPrice = priceResponse.data.data[solMint].price;
          const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
          const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
          const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

          // Get token metadata
          let tokenName = "N/A";
          const tokenData = await selectTokenByMint(swapTransactionData.tokenOutputs[0].mint);
          if (tokenData?.length) {
            tokenName = tokenData[0].name;
          }

          // Save holding
          const newHolding: HoldingRecord = {
            Time: swapTransactionData.timestamp,
            Token: swapTransactionData.tokenOutputs[0].mint,
            TokenName: tokenName,
            Balance: swapTransactionData.tokenOutputs[0].tokenAmount,
            SolPaid: swapTransactionData.tokenInputs[0].tokenAmount,
            SolFeePaid: swapTransactionData.fee,
            SolPaidUSDC: solPaidUsdc,
            SolFeePaidUSDC: solFeePaidUsdc,
            PerTokenPaidUSDC: perTokenUsdcPrice,
            Slot: swapTransactionData.slot,
            Program: swapTransactionData.programInfo?.source || "N/A",
          };

          await insertHolding(newHolding);
          return true;
        } catch (error: any) {
          console.error("Error during request:", error.message);
          throw error; // Let withRetry handle retries
        }
      }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
    });
  } catch (error: any) {
    console.error("Error during request:", error.message);
    return false;
  }
}

export async function createSellTransaction(solMint: string, tokenMint: string, amount: string): Promise<string | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
  
  return await rpcManager.withConnection(async (connection) => {
    return withRetry(async () => {
      try {
        // Check token balance
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(myWallet.publicKey, {
          mint: new PublicKey(tokenMint),
        });

        if (!tokenAccounts.value.length) {
          console.log(`⚠️ Token ${tokenMint} not found in wallet - Already sold elsewhere.`);
          await removeHolding(tokenMint);
          return "TOKEN_ALREADY_SOLD";
        }

        const tokenAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount;
        if (!tokenAmount.uiAmount || tokenAmount.uiAmount <= 0) {
          console.log(`⚠️ Token ${tokenMint} has zero balance - Already sold elsewhere.`);
          await removeHolding(tokenMint);
          return "TOKEN_ALREADY_SOLD";
        }

        // Get quote
        const quoteResponse = await axios.get<QuoteResponse>(quoteUrl, {
          params: {
            inputMint: tokenMint,
            outputMint: solMint,
            amount: amount,
            slippageBps: config.sell.slippageBps,
          },
          timeout: config.tx.get_timeout,
        });

        if (!quoteResponse.data) return null;

        // Create swap transaction
        const swapTransaction = await axios.post<SerializedQuoteResponse>(
          swapUrl,
          JSON.stringify({
            quoteResponse: quoteResponse.data,
            userPublicKey: myWallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
            dynamicSlippage: { maxBps: 300 },
            prioritizationFeeLamports: {
              priorityLevelWithMaxLamports: {
                maxLamports: config.sell.prio_fee_max_lamports,
                priorityLevel: config.sell.prio_level,
              },
            },
          }),
          {
            headers: { "Content-Type": "application/json" },
            timeout: config.tx.get_timeout,
          }
        );

        if (!swapTransaction.data) return null;

        // Process transaction
        const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([myWallet.payer]);

        // Execute transaction
        const latestBlockHash = await connection.getLatestBlockhash();
        const rawTransaction = transaction.serialize();
        const txid = await connection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
          maxRetries: 2,
        });

        if (!txid) return null;

        // Confirm transaction
        const conf = await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: txid,
        });

        if (conf.value.err) return null;

        // Remove holding on successful sale
        await removeHolding(tokenMint);
        return txid;
      } catch (error: any) {
        console.error("Error in sell transaction:", error.message);
        throw error; // Let withRetry handle retries
      }
    }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
  });
}

export async function getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
  return withRetry(async () => {
    const rugResponse = await axios.get<RugResponseExtended>(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`,
      { timeout: config.tx.get_timeout }
    );

    if (!rugResponse.data) return false;

    if (config.rug_check.verbose_log) {
      console.log("\nVerbose log:");
      console.log(rugResponse.data);
    }

    const tokenReport = rugResponse.data;

    if (config.rug_check.simulation_mode) {
      console.log("\nSimulation mode: No actual swaps will be made");
    }

    if (config.rug_check.verbose_log) {
      console.log("\nToken Metadata Debug:");
      console.log("- Token Name:", tokenReport.tokenMeta?.name || "undefined");
      console.log("- Token Symbol:", tokenReport.tokenMeta?.symbol || "undefined");
      console.log("- Token Creator:", tokenReport.creator || tokenMint);
      console.log("- Raw tokenMeta:", JSON.stringify(tokenReport.tokenMeta, null, 2));
      console.log("- fileMeta:", JSON.stringify(tokenReport.fileMeta, null, 2));
    }

    console.log("\nToken Risks:");
    const rugRisks = tokenReport.risks || [{
      name: "Good",
      value: "",
      description: "",
      score: 0,
      level: "good",
    }];
    
    rugRisks.forEach((risk) => {
      console.log(`- ${risk.name}: ${risk.value}`);
    });

    let topHolders = tokenReport.topHolders;
    const marketsLength = tokenReport.markets?.length || 0;
    const totalLPProviders = tokenReport.totalLPProviders;
    const totalMarketLiquidity = tokenReport.totalMarketLiquidity;
    const isRugged = tokenReport.rugged;
    const rugScore = tokenReport.score;

    if (config.rug_check.exclude_lp_from_topholders && tokenReport.markets) {
      const liquidityAddresses = tokenReport.markets
        .flatMap(market => [market.liquidityA, market.liquidityB])
        .filter((address): address is string => !!address);
      topHolders = topHolders.filter(holder => !liquidityAddresses.includes(holder.address));
    }

    const rugCheckConfig = config.rug_check;

    const conditions = [
      {
        check: !rugCheckConfig.allow_mint_authority && tokenReport.token.mintAuthority !== null,
        message: "Mint authority should be null",
      },
      {
        check: !rugCheckConfig.allow_not_initialized && !tokenReport.token.isInitialized,
        message: "Token is not initialized",
      },
      {
        check: !rugCheckConfig.allow_freeze_authority && tokenReport.token.freezeAuthority !== null,
        message: "Freeze authority should be null",
      },
      {
        check: !rugCheckConfig.allow_mutable && tokenReport.tokenMeta?.mutable !== false,
        message: "Mutable should be false",
      },
      {
        check: !rugCheckConfig.allow_insider_topholders && topHolders.some((holder) => holder.insider),
        message: "Insider accounts should not be part of the top holders",
      },
      {
        check: topHolders.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
        message: "An individual top holder cannot hold more than the allowed percentage of the total supply",
      },
      {
        check: totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: `Not enough LP Providers:  ${totalLPProviders}`,
      },
      {
        check: marketsLength < rugCheckConfig.min_total_markets,
        message: `Not enough Markets:  ${marketsLength}`,
      },
      {
        check: totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: `Not enough Market Liquidity:  ${totalMarketLiquidity}`,
      },
      {
        check: !rugCheckConfig.allow_rugged && isRugged,
        message: "Token is rugged",
      },
      {
        check: rugCheckConfig.block_symbols.includes(tokenReport.tokenMeta?.symbol || ""),
        message: `Symbol is blocked:  ${tokenReport.tokenMeta?.symbol}`,
      },
      {
        check: rugCheckConfig.block_names.includes(tokenReport.tokenMeta?.name || ""),
        message: `Name is blocked:  ${tokenReport.tokenMeta?.name}`,
      },
      {
        check: rugCheckConfig.only_contain_string && (() => {
          const foundStrings = rugCheckConfig.contain_string.filter(str => 
            tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase())
          );
          
          console.log(`Checking token name: '${tokenReport.tokenMeta?.name || ""}'`);
          rugCheckConfig.contain_string.forEach(str => {
            console.log(`- Looking for '${str}': ${tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase()) ? "Found!" : "Not found"}`);
          });
          
          const noStringsFound = foundStrings.length === 0;
          console.log(`Result: ${noStringsFound ? "No required strings found" : `Found strings: ${foundStrings.join(", ")}`}`);
          return noStringsFound;
        })(),
        message: "Token name must contain one of these strings: " + rugCheckConfig.contain_string.join(", "),
        foundStrings: rugCheckConfig.contain_string.filter(str => 
          tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase())
        )
      },
      {
        check: rugScore > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
        message: `Rug score is ${rugScore} which is higher than the allowed maximum of ${rugCheckConfig.max_score}`,
      },
      {
        check: rugCheckConfig.legacy_not_allowed && rugRisks.some((risk) => rugCheckConfig.legacy_not_allowed.includes(risk.name)),
        message: "Token has legacy risks that are not allowed: " + 
                rugRisks
                  .filter(risk => rugCheckConfig.legacy_not_allowed.includes(risk.name))
                  .map(risk => `${risk.name} (${risk.value})`)
                  .join(", "),
      },
    ];

    const allConditions = [...conditions];

    if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
      const duplicate = await selectTokenByNameAndCreator(
        tokenReport.tokenMeta?.name || "",
        tokenReport.creator || tokenMint
      );

      if (duplicate.length !== 0) {
        if (config.rug_check.block_returning_token_names) {
          allConditions.push({
            check: duplicate.some((token) => token.name === tokenReport.tokenMeta?.name),
            message: "Token with this name was already created"
          });
        }
        if (config.rug_check.block_returning_token_creators) {
          allConditions.push({
            check: duplicate.some((token) => token.creator === tokenReport.creator),
            message: "Token from this creator was already created"
          });
        }
      }
    }

    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: tokenMint,
      name: tokenReport.tokenMeta?.name || "",
      creator: tokenReport.creator || tokenMint,
    };
    
    await insertNewToken(newToken).catch((err) => {
      if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
        console.log("Unable to store new token for tracking duplicate tokens: " + err);
      }
    });

    console.log("\nRug Check Conditions:");
    let hasFailedConditions = false;

    for (const condition of allConditions) {
      let isConditionFailed = condition.check;
      
      let displayMessage = condition.message.replace("", "");
      if (displayMessage.startsWith("Token name must contain")) {
        if (!rugCheckConfig.only_contain_string) {
          continue;
        }
        
        const foundStrings = condition.foundStrings || [];
        const hasStrings = foundStrings.length > 0;
        displayMessage = hasStrings
          ? `Token name '${tokenReport.tokenMeta?.name || ""}' contains required string(s): ${foundStrings.join(", ")}`
          : `Token name '${tokenReport.tokenMeta?.name || ""}' does not contain any required strings: ${rugCheckConfig.contain_string.join(", ")}`;
        isConditionFailed = !hasStrings;
      }
      
      const status = isConditionFailed ? " FAILED" : " PASSED";
      console.log(`${status}: ${displayMessage}`);
      
      if (isConditionFailed) {
        hasFailedConditions = true;
      }
    }

    if (hasFailedConditions) {
      console.log("\nRug Check Failed: One or more conditions did not pass");
      return false;
    }

    console.log("\nAll Rug Check conditions passed!");
    return true;
  }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
}
