import { config } from "./../config";
import axios, { AxiosError } from "axios";
import * as sqlite3 from "sqlite3";
import dotenv from "dotenv";
import { open } from "sqlite";
import { createTableHoldings, removeHolding } from "./db";
import { HoldingRecord } from "../types";
import { DateTime } from "luxon";
<<<<<<< Updated upstream
import { createSellTransaction } from "../transactions";
=======
import { createSellTransaction, getNextConnection, withRetry } from "../transactions";
>>>>>>> Stashed changes
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import { DynamicPriceCache } from '../price-management/cache';
import { PriceBatchManager } from '../price-management/batch';
import { volatilityConfig } from '../price-management/config';
import path from 'path';
import fs from 'fs';
import { analytics } from '../analytics';
import { rpcManager } from '../utils/rpc-manager';
import { webSocketManager } from '../utils/websocket-manager';

// Load environment variables from the .env file
dotenv.config();

// Initialize price management
const priceCache = new DynamicPriceCache(volatilityConfig);
const priceBatchManager = PriceBatchManager.getInstance(priceCache);

// Batch process token balance checks
async function batchCheckTokenBalances(connection: Connection, wallet: PublicKey, tokens: string[]): Promise<Map<string, number>> {
  const batchSize = config.performance.batch_size;
  const balances = new Map<string, number>();
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const promises = batch.map(async (token) => {
      // For our test token, always return the test balance
      if (token === 'Eu8hEhTf2MrKmUbxMD1PCdCpKbWKFBdYwCmsoaS3VGCX') {
        return { token, amount: 1000 };
      }

      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(wallet, {
          mint: new PublicKey(token),
        });
        if (accounts.value.length > 0) {
          const amount = accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
          return { token, amount: amount || 0 };
        }
        return { token, amount: 0 };
      } catch (error) {
        console.error(`Error checking balance for ${token}:`, error);
        return { token, amount: 0 };
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(({ token, amount }) => balances.set(token, amount));
  }
  
  return balances;
}

// Add new function to fetch price from DexScreener
async function fetchDexScreenerPrice(token: string, baseUrl: string): Promise<number | null> {
  try {
    const response = await axios.get(`${baseUrl}${token}`, {
      timeout: config.tx.get_timeout
    });

    if (response.data?.pairs?.[0]) {
      const priceUsd = parseFloat(response.data.pairs[0].priceUsd);
      if (!isNaN(priceUsd)) {
        return priceUsd;
      }
    }
    return null;
  } catch (error) {
    console.log(`⚠️ DexScreener API error for ${token}:`, error instanceof AxiosError ? error.message : error);
    return null;
  }
}

async function main() {
  try {
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    const dexScreenerUrl = process.env.DEX_HTTPS_LATEST_TOKENS || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
    
    // Initialize analytics with connection
    await rpcManager.withConnection(async (connection) => {
      analytics.setConnection(connection);
    });

    // Subscribe to program logs for real-time monitoring
    if (config.websocket.enabled) {
      const programIds = [
        new PublicKey(config.liquidity_pool.radiyum_program_id),
        new PublicKey(config.liquidity_pool.orca_program_id),
        // Add other relevant program IDs
      ];

      for (const programId of programIds) {
        await webSocketManager.subscribeToProgramLogs(programId, (logs) => {
          // Process program logs
          for (const log of logs) {
            if (log.includes("Instruction: Swap") || log.includes("Swap successful")) {
              analytics.trackProgramActivity(programId.toBase58(), "swap");
            }
          }
        });
      }

      // Subscribe to wallet account changes
      await webSocketManager.subscribeToAccountUpdates(myWallet.publicKey, async (accountInfo) => {
        // Process account updates
        await rpcManager.withConnection(async (connection) => {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            myWallet.publicKey,
            { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
          );
          for (const { pubkey, account } of tokenAccounts.value) {
            const tokenBalance = (account.data as any).parsed.info.tokenAmount;
            if (tokenBalance.uiAmount === 0) {
              const mint = (account.data as any).parsed.info.mint;
              await removeHolding(mint);
            }
          }
        });
      });

      // Handle WebSocket connection failures
      webSocketManager.on('connection_failed', () => {
        console.error('WebSocket connection failed after max retries');
      });
    }

    // Get absolute path for database
    const dbPath = path.resolve(process.cwd(), config.swap.db_name_tracker_holdings);
    console.log('Database path:', dbPath);

    // Verify database file exists
    if (!fs.existsSync(dbPath)) {
      console.error('Database file does not exist at:', dbPath);
      return;
    }
    console.log('Database file exists, size:', fs.statSync(dbPath).size, 'bytes');

    // Connect to database
    console.log('Opening database connection...');
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
    });

    // Verify database contents
    console.log('\nVerifying database structure:');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table';");
    console.log('Tables in database:', tables);

    console.log('\nVerifying holdings:');
    const holdings = await db.all('SELECT * FROM holdings');
    console.log('Current holdings in database:', holdings);

    if (holdings.length !== 0) {
      // Batch check all token balances
      const tokens = holdings.map(h => h.Token);
      console.log('Checking balances for tokens:', tokens);
      await rpcManager.withConnection(async (connection) => {
        const balances = await batchCheckTokenBalances(connection, myWallet.publicKey, tokens);
        
        // Process balance results
        for (const [token, balance] of balances) {
          console.log(`Token ${token} balance:`, balance);
          if (balance <= 0) {
            console.log(`⚠️ Token ${token} has zero balance - Already sold elsewhere. Removing from tracking.`);
            await removeHolding(token);
          }
        }

        // Get updated holdings after balance check
        const updatedHoldings = await db.all("SELECT * FROM holdings");
        console.log('Updated holdings after balance check:', updatedHoldings);

        // Get all token ids and queue them for price updates
        const tokenAddresses = updatedHoldings.map(h => h.Token);
        if (tokenAddresses.length > 0) {
          console.log('Queueing price updates for tokens:', tokenAddresses);
          priceBatchManager.queueTokens(tokenAddresses);
        }

        // Process holdings while prices are being updated
        const holdingLogs: string[] = [];
        for (const row of updatedHoldings) {
          const holding: HoldingRecord = row;
          const token = holding.Token;
          const tokenName = holding.TokenName === "N/A" ? token : holding.TokenName;
          const tokenTime = holding.Time;
          const tokenBalance = holding.Balance;
          const tokenSolPaid = holding.SolPaid;
          const tokenSolFeePaid = holding.SolFeePaid;
          const tokenSolPaidUSDC = holding.SolPaidUSDC;
          const tokenSolFeePaidUSDC = holding.SolFeePaidUSDC;
          const tokenPerTokenPaidUSDC = holding.PerTokenPaidUSDC;
          const tokenSlot = holding.Slot;
          const tokenProgram = holding.Program;

          // Get current price from cache
          const priceData = priceCache.get(token);
          const tokenCurrentPrice = priceData?.price ?? tokenPerTokenPaidUSDC;

<<<<<<< Updated upstream
          // Calculate PnL and profit/loss
          const unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
          const unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
          const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";
=======
      // Get cached prices with validation
      const cachedPrices = tokenValues.split(',').map(token => {
        const price = priceCache.get(token);
        if (!price || price <= 0) {
          priceCache.delete(token); // Remove invalid cached prices
          return null;
        }
        return { token, price };
      }).filter(item => item !== null);
>>>>>>> Stashed changes

          // Track analytics
          const currentSlot = await connection.getSlot();
          await analytics.updateNetworkMetrics(currentSlot);
          analytics.trackFees(tokenProgram, tokenSolFeePaid, tokenSlot);
          
          // Calculate execution time from slot difference
          const slotDifference = currentSlot - tokenSlot;
          const estimatedExecutionTime = slotDifference * analytics.getNetworkMetrics().avgSlotTime;
          analytics.trackProgramPerformance(
            tokenProgram,
            estimatedExecutionTime,
            unrealizedPnLUSDC,
            true // Assuming success since we have the token
          );

          // Get optimal priority fee for future transactions
          const optimalPriorityFee = analytics.getOptimalPriorityFee(tokenProgram, false); // false for sell operations

          // Get trend information
          const tokenTrend = priceCache.getTrend(token);
          const trendInfo = tokenTrend?.trend ? 
            `\n    Trend: ${tokenTrend.trend.type} (Strength: ${(tokenTrend.trend.strength * 100).toFixed(1)}%, Confidence: ${(tokenTrend.trend.confidence * 100).toFixed(1)}%)` : 
            '';

          // Get analytics metrics
          const networkMetrics = analytics.getNetworkMetrics();
          const programPerfMap = analytics.getProgramPerformance(tokenProgram);
          const programPerf = programPerfMap instanceof Map ? 
            programPerfMap.get(tokenProgram) || { successRate: 0, programId: tokenProgram } :
            programPerfMap || { successRate: 0, programId: tokenProgram };

          // Add analytics info to debug output
          const debugInfo = config.swap.verbose_log ? 
            `\n    Program: ${tokenProgram} (Success Rate: ${(programPerf.successRate * 100).toFixed(1)}%)
    Slot: ${tokenSlot} (Network Congestion: ${networkMetrics.congestionLevel})
    Fees: ${tokenSolFeePaid.toFixed(6)} SOL (Avg for Program: ${(analytics.getFeeAnalytics().avgFeeByProgram.get(tokenProgram) || 0).toFixed(6)} SOL)
    Using ${config.sell.dynamic_fees ? 'Dynamic' : 'Static'} Fees: ${optimalPriorityFee} lamports
    Execution Time: ${(estimatedExecutionTime / 1000).toFixed(2)}s${trendInfo}` : 
            '';

          // Check if it's a good time to trade before attempting SL/TP
          const isGoodTime = analytics.isGoodTimeToTrade();

          // Check SL/TP with trend consideration
          let sltpMessage = "";
          let shouldLog = true;

          if (config.sell.auto_sell && config.sell.auto_sell === true && isGoodTime) {
            // Skip sell attempts for our test token
            if (token !== 'Eu8hEhTf2MrKmUbxMD1PCdCpKbWKFBdYwCmsoaS3VGCX') {
              const amountIn = tokenBalance.toString().replace(".", "");
              
              // Adjust thresholds based on trend
              let takeProfitThreshold = config.sell.take_profit_percent;
              let stopLossThreshold = -config.sell.stop_loss_percent;
              
              if (tokenTrend?.trend) {
                const trend = tokenTrend.trend;
                // More aggressive take profit in uptrend
                if (trend.type.includes('UPTREND') && trend.confidence > 0.7) {
                  takeProfitThreshold *= 1.2; // Increase by 20%
                }
                // More protective stop loss in downtrend
                if (trend.type.includes('DOWNTREND') && trend.confidence > 0.7) {
                  stopLossThreshold *= 0.8; // Tighten by 20%
                }
              }

<<<<<<< Updated upstream
              if (unrealizedPnLPercentage >= takeProfitThreshold || unrealizedPnLPercentage <= stopLossThreshold) {
                const tx = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn);
                if (!tx) {
                  sltpMessage = "⛔ Could not sell. Trying again in 5 seconds.";
                } else if (tx === "TOKEN_ALREADY_SOLD") {
                  shouldLog = false; // Don't include this token in logs
                } else {
                  sltpMessage = unrealizedPnLPercentage >= takeProfitThreshold ? 
                    "Took Profit: " + tx : 
                    "Stop Loss triggered: " + tx;
                }
=======
            currentPrices = priceResponse.data.data;
            console.log('Received prices:', currentPrices);
            
            // Update cache with new prices
            Object.entries(currentPrices).forEach(([token, data]: [string, any]) => {
              const price = data.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;
              if (price) priceCache.set(token, price);
            });
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof AxiosError ? error.message : 'Unknown error occurred';
          console.log("⛔ Error fetching prices:", errorMessage);
          currentPrices = Object.fromEntries(tokens.map(token => [token, {extraInfo: {lastSwappedPrice: {lastJupiterSellPrice: 0}}}]));
        }
      }

      // Loop through all our current holdings
      const holdingLogs: string[] = [];
      for (const row of updatedHoldings) {
        const holding: HoldingRecord = row;
        const {
          Token: token,
          TokenName,
          Time: tokenTime,
          Balance: tokenBalance,
          SolPaidUSDC: tokenSolPaidUSDC,
          SolFeePaidUSDC: tokenSolFeePaidUSDC,
          PerTokenPaidUSDC: tokenPerTokenPaidUSDC
        } = holding;
        const tokenName = TokenName === "N/A" ? token : TokenName;

        // Convert Trade Time
        const centralEuropenTime = DateTime.fromMillis(tokenTime).toLocal();
        const hrTradeTime = centralEuropenTime.toFormat("HH:mm:ss");

        // Get current price with error handling
        let tokenCurrentPrice = 0;
        let priceFetchError = false;
        
        try {
          const price = currentPrices[token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;
          if (!price || price <= 0) {
            throw new Error('Invalid price returned');
          }
          tokenCurrentPrice = price;
        } catch (error: unknown) {
          priceFetchError = true;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          saveLogTo(actionsLogs, `⛔ Failed to fetch price for ${tokenName}: ${errorMessage}`);
          continue; // Skip this token if price fetch fails
        }

        // Calculate PnL and profit/loss
        const unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
        const unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
        
        // Log price and PnL for debugging
        saveLogTo(actionsLogs, `💰 ${tokenName} Price: $${tokenCurrentPrice.toFixed(4)} | PnL: $${unrealizedPnLUSDC.toFixed(2)} (${unrealizedPnLPercentage.toFixed(2)}%)`);
        const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";

        // Check SL/TP
        let sltpMessage = "";
        let shouldLog = true;

        if (config.sell.auto_sell && config.sell.auto_sell === true) {
          const amountIn = tokenBalance.toString().replace(".", "");
          if (unrealizedPnLPercentage >= config.sell.take_profit_percent || unrealizedPnLPercentage <= -config.sell.stop_loss_percent) {
            try {
              const tx = await withRetry(async () => {
                const result = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn);
                if (!result) {
                  throw new Error('Failed to create sell transaction');
                }
                return result;
              }, 3, 1000); // Retry 3 times with 1 second delay
              
              if (tx === "TOKEN_ALREADY_SOLD") {
                shouldLog = false; // Don't include this token in logs
              } else {
                sltpMessage = unrealizedPnLPercentage >= config.sell.take_profit_percent ?
                  "Took Profit: " + tx :
                  "Stop Loss triggered: " + tx;
>>>>>>> Stashed changes
              }
            } catch (error) {
              console.error('Error selling token:', error);
              sltpMessage = "⛔ Could not sell. Trying again in 5 seconds.";
            }
          }

          if (shouldLog) {
            const logMessage = `${DateTime.fromMillis(tokenTime).toLocal().toFormat("HH:mm:ss")} Buy ${tokenBalance} ${tokenName} for $${tokenSolPaidUSDC.toFixed(2)}. ${iconPnl} Unrealized PnL: $${unrealizedPnLUSDC.toFixed(
              2
            )} (${unrealizedPnLPercentage.toFixed(2)}%) ${sltpMessage}${debugInfo}`;
            holdingLogs.push(logMessage);
          }
        }

        // Output updated holdings
        console.log('\nCurrent Holdings:');
        console.log(holdingLogs.join("\n"));
      });
    } else {
      // Output no holdings found
      console.log("No token holdings yet as of", new Date().toISOString());
    }

    // Output wallet tracking if set in config
    if (config.sell.track_public_wallet) {
      console.log("\nCheck your wallet: https://gmgn.ai/sol/address/" + config.sell.track_public_wallet);
    }

    // Close the database connection when done
    console.log("\nLast Update: ", new Date().toISOString());
    await db.close();

    setTimeout(main, 5000); // Call main again after 5 seconds
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main().catch((err) => {
  console.error('Error starting main:', err);
});
