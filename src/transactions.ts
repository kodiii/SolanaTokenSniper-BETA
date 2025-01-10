import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey, Commitment } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import LRU from 'lru-cache';

// Initialize connection pool
const connectionPool: Connection[] = config.rpc.endpoints.map(endpoint => new Connection(endpoint));
let currentConnectionIndex = 0;

// Initialize cache
const quoteCache = new LRU({
  max: 100,
  ttl: config.performance.cache_duration,
});

// Get next connection from pool with round-robin
export function getNextConnection(): Connection {
  const connection = connectionPool[currentConnectionIndex];
  currentConnectionIndex = (currentConnectionIndex + 1) % connectionPool.length;
  return connection;
}

// Batch process multiple operations
async function batchProcess<T>(items: T[], processor: (item: T) => Promise<any>, batchSize = config.performance.batch_size): Promise<any[]> {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
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
  // Set function constants
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const maxRetries = config.tx.fetch_tx_max_retries;
  let retryCount = 0;

  // Add longer initial delay to allow transaction to be processed
  console.log("Waiting " + config.tx.fetch_tx_initial_delay / 1000 + " seconds for transaction to be confirmed...");
  await new Promise((resolve) => setTimeout(resolve, config.tx.fetch_tx_initial_delay));

  return withRetry(async () => {
    try {
      console.log(`Attempt ${retryCount + 1} of ${maxRetries} to fetch transaction details...`);
      
      const response = await axios.post<any>(
        txUrl,
        {
          transactions: [signature],
          commitment: "finalized",
          encoding: "jsonParsed",
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: config.tx.get_timeout,
        }
      );

      // Verify if a response was received
      if (!response.data) {
        throw new Error("No response data received");
      }

      // Verify if the response was in the correct format and not empty
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error("Response data array is empty");
      }

      // Access the `data` property which contains the array of transactions
      const transactions: TransactionDetailsResponseArray = response.data;

      // Verify if transaction details were found
      if (!transactions[0]) {
        throw new Error("Transaction not found");
      }

      // Access the `instructions` property which contains account instructions
      const instructions = transactions[0].instructions;
      if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
        throw new Error("No instructions found in transaction");
      }

      // Verify and find the instructions for the correct market maker id
      const instruction = instructions.find((ix) => ix.programId === config.liquidity_pool.radiyum_program_id);
      if (!instruction || !instruction.accounts) {
        throw new Error("No market maker instruction found");
      }
      if (!Array.isArray(instruction.accounts) || instruction.accounts.length < 10) {
        throw new Error("Invalid accounts array in instruction");
      }

      // Store quote and token mints
      const accountOne = instruction.accounts[8];
      const accountTwo = instruction.accounts[9];

      // Verify if we received both quote and token mints
      if (!accountOne || !accountTwo) {
        throw new Error("Required accounts not found");
      }

      // Set new token and SOL mint
      let solTokenAccount = "";
      let newTokenAccount = "";
      if (accountOne === config.liquidity_pool.wsol_pc_mint) {
        solTokenAccount = accountOne;
        newTokenAccount = accountTwo;
      } else {
        solTokenAccount = accountTwo;
        newTokenAccount = accountOne;
      }

      console.log("Successfully fetched transaction details!");
      console.log(`SOL Token Account: ${solTokenAccount}`);
      console.log(`New Token Account: ${newTokenAccount}`);

      console.log(`\x1b[32mPHOTON TRACKER: https://photon-sol.tinyastro.io/en/lp/${newTokenAccount}\x1b[0m`);
      console.log(`\x1b[94mDEXSCREENER TRACKER: https://dexscreener.com/solana/${newTokenAccount}\x1b[0m`);
      
      const displayData: MintsDataReponse = {
        tokenMint: newTokenAccount,
        solMint: solTokenAccount,
      };

      // Cache the result
      quoteCache.set(signature, displayData);
      return displayData;
    } catch (error: any) {
      throw error; // Let withRetry handle the retry logic
    }
  }, maxRetries, config.tx.fetch_tx_initial_delay);
}

export async function createSwapTransaction(solMint: string, tokenMint: string): Promise<string | null> {
  // Use connection pool
  const connection = getNextConnection();
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
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
}

export async function fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";

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
}

export async function createSellTransaction(solMint: string, tokenMint: string, amount: string): Promise<string | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
  const connection = getNextConnection();

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
}

export async function getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
  return withRetry(async () => {
    const rugResponse = await axios.get<RugResponseExtended>(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`,
      { timeout: config.tx.get_timeout }
    );

    if (!rugResponse.data) return false;

    if (config.rug_check.verbose_log) {
      console.log("\n🔍 Full API Response Debug:");
      console.log(JSON.stringify(rugResponse.data, null, 2));
    }

    const tokenReport = rugResponse.data;

    if (config.rug_check.simulation_mode) {
      console.log("\n🔬 SIMULATION MODE: No actual swaps will be made");
    }

    if (config.rug_check.verbose_log) {
      console.log("\n🔍 Token Metadata Debug:");
      console.log("- Token Name:", tokenReport.tokenMeta?.name || "undefined");
      console.log("- Token Symbol:", tokenReport.tokenMeta?.symbol || "undefined");
      console.log("- Token Creator:", tokenReport.creator || tokenMint);
      console.log("- Raw tokenMeta:", JSON.stringify(tokenReport.tokenMeta, null, 2));
      console.log("- fileMeta:", JSON.stringify(tokenReport.fileMeta, null, 2));
    }

    console.log("\n🔍 Token Risks:");
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
        message: "🚫 Mint authority should be null",
      },
      {
        check: !rugCheckConfig.allow_not_initialized && !tokenReport.token.isInitialized,
        message: "🚫 Token is not initialized",
      },
      {
        check: !rugCheckConfig.allow_freeze_authority && tokenReport.token.freezeAuthority !== null,
        message: "🚫 Freeze authority should be null",
      },
      {
        check: !rugCheckConfig.allow_mutable && tokenReport.tokenMeta?.mutable !== false,
        message: "🚫 Mutable should be false",
      },
      {
        check: !rugCheckConfig.allow_insider_topholders && topHolders.some((holder) => holder.insider),
        message: "🚫 Insider accounts should not be part of the top holders",
      },
      {
        check: topHolders.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
        message: "🚫 An individual top holder cannot hold more than the allowed percentage of the total supply",
      },
      {
        check: totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: "🚫 Not enough LP Providers.",
      },
      {
        check: marketsLength < rugCheckConfig.min_total_markets,
        message: "🚫 Not enough Markets.",
      },
      {
        check: totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: "🚫 Not enough Market Liquidity.",
      },
      {
        check: !rugCheckConfig.allow_rugged && isRugged,
        message: "🚫 Token is rugged",
      },
      {
        check: rugCheckConfig.block_symbols.includes(tokenReport.tokenMeta?.symbol || ""),
        message: "🚫 Symbol is blocked",
      },
      {
        check: rugCheckConfig.block_names.includes(tokenReport.tokenMeta?.name || ""),
        message: "🚫 Name is blocked",
      },
      {
        check: rugCheckConfig.only_contain_string && (() => {
          const foundStrings = rugCheckConfig.contain_string.filter(str => 
            tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase())
          );
          
          console.log(`🔍 Checking token name: '${tokenReport.tokenMeta?.name || ""}'`);
          rugCheckConfig.contain_string.forEach(str => {
            console.log(`- Looking for '${str}': ${tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase()) ? "Found!" : "Not found"}`);
          });
          
          const noStringsFound = foundStrings.length === 0;
          console.log(`🔍 Result: ${noStringsFound ? "No required strings found" : `Found strings: ${foundStrings.join(", ")}`}`);
          return noStringsFound;
        })(),
        message: "🚫 Token name must contain one of these strings: " + rugCheckConfig.contain_string.join(", "),
        foundStrings: rugCheckConfig.contain_string.filter(str => 
          tokenReport.tokenMeta?.name?.toLowerCase().includes(str.toLowerCase())
        )
      },
      {
        check: rugScore > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
        message: `🚫 Rug score is ${rugScore} which is higher than the allowed maximum of ${rugCheckConfig.max_score}`,
      },
      {
        check: rugCheckConfig.legacy_not_allowed && rugRisks.some((risk) => rugCheckConfig.legacy_not_allowed.includes(risk.name)),
        message: "🚫 Token has legacy risks that are not allowed: " + 
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
            message: "🚫 Token with this name was already created"
          });
        }
        if (config.rug_check.block_returning_token_creators) {
          allConditions.push({
            check: duplicate.some((token) => token.creator === tokenReport.creator),
            message: "🚫 Token from this creator was already created"
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
        console.log("⛔ Unable to store new token for tracking duplicate tokens: " + err);
      }
    });

    console.log("\n🔍 Rug Check Conditions:");
    let hasFailedConditions = false;

    for (const condition of allConditions) {
      let isConditionFailed = condition.check;
      
      let displayMessage = condition.message.replace("🚫 ", "");
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
      
      const status = isConditionFailed ? "❌ FAILED" : "✅ PASSED";
      console.log(`${status}: ${displayMessage}`);
      
      if (isConditionFailed) {
        hasFailedConditions = true;
      }
    }

    if (hasFailedConditions) {
      console.log("\n❌ Rug Check Failed: One or more conditions did not pass");
      return false;
    }

    console.log("\n✅ All Rug Check conditions passed!");
    return true;
  }, config.tx.fetch_tx_max_retries, config.tx.retry_delay);
}
