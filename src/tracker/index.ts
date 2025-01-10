import { config } from "./../config"; // Configuration parameters for our bot
import axios from "axios";
import * as sqlite3 from "sqlite3";
import dotenv from "dotenv";
import { open } from "sqlite";
import { createTableHoldings, removeHolding } from "./db";
import { HoldingRecord } from "../types";
import { DateTime } from "luxon";
import { createSellTransaction, getNextConnection } from "../transactions";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import WebSocket from 'ws';
import LRU from 'lru-cache';

// Load environment variables from the .env file
dotenv.config();

// Initialize price cache
const priceCache = new LRU({
  max: 500, // Maximum number of items
  ttl: 30000, // Cache TTL: 30 seconds
});

// WebSocket connection for real-time price updates
let priceWs: WebSocket | null = null;
const prices: { [key: string]: number } = {};

function initializePriceWebSocket() {
  if (priceWs) return;

  const wsUrl = process.env.JUP_WS_PRICE_URI || "wss://price-api.jup.ag/v4/ws";
  priceWs = new WebSocket(wsUrl);

  priceWs.on('open', () => {
    console.log('Price WebSocket connected');
  });

  priceWs.on('message', (data: string) => {
    try {
      const priceData = JSON.parse(data);
      if (priceData.price && priceData.id) {
        prices[priceData.id] = priceData.price;
        priceCache.set(priceData.id, priceData.price);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });

  priceWs.on('close', () => {
    console.log('Price WebSocket disconnected, reconnecting...');
    priceWs = null;
    setTimeout(initializePriceWebSocket, 5000);
  });

  priceWs.on('error', (error) => {
    console.error('WebSocket error:', error);
    priceWs?.close();
  });
}

// Batch process token balance checks
async function batchCheckTokenBalances(connection: Connection, wallet: PublicKey, tokens: string[]): Promise<Map<string, number>> {
  const batchSize = config.performance.batch_size;
  const balances = new Map<string, number>();
  
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    const promises = batch.map(async (token) => {
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

async function main() {
  // Initialize WebSocket connection
  if (config.performance.use_websocket && !priceWs) {
    initializePriceWebSocket();
  }

  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
  const connection = getNextConnection();

  // Connect to database and create if not exists
  const db = await open({
    filename: config.swap.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    console.log("Holdings table not present.");
    // Close the database connection when done
    await db.close();
  }

  // Proceed with tracker
  if (holdingsTableExist) {
    // Create a place to store our updated holdings before showing them.
    const holdingLogs: string[] = [];
    const saveLog = (...args: unknown[]): void => {
      const message = args.map((arg) => String(arg)).join(" ");
      holdingLogs.push(message);
    };

    // Get all our current holdings
    const holdings = await db.all("SELECT * FROM holdings");
    if (holdings.length !== 0) {
      // Batch check all token balances
      const tokens = holdings.map(h => h.Token);
      const balances = await batchCheckTokenBalances(connection, myWallet.publicKey, tokens);
      
      // Process balance results
      for (const [token, balance] of balances) {
        if (balance <= 0) {
          console.log(`⚠️ Token ${token} has zero balance - Already sold elsewhere. Removing from tracking.`);
          await removeHolding(token);
        }
      }

      // Get updated holdings after balance check
      const updatedHoldings = await db.all("SELECT * FROM holdings");

      // Get all token ids
      const tokenValues = updatedHoldings.map((holding) => holding.Token).join(",");

      // @TODO, add more sources for current prices. Now our price is the current price based on the Jupiter Last Swap (sell/buy) price

      // Get prices from WebSocket or fallback to HTTP
      let currentPrices: any = {};
      if (config.performance.use_websocket && Object.keys(prices).length > 0) {
        currentPrices = prices;
      } else {
        // Check cache first
        const cachedPrices = tokenValues.split(',').map(token => ({
          token,
          price: priceCache.get(token)
        })).filter(item => item.price !== undefined);

        if (cachedPrices.length === tokenValues.split(',').length) {
          currentPrices = Object.fromEntries(cachedPrices.map(({token, price}) => [token, {extraInfo: {lastSwappedPrice: {lastJupiterSellPrice: price}}}]));
        } else {
          // Fallback to HTTP request
          const solMint = config.liquidity_pool.wsol_pc_mint;
          const priceResponse = await axios.get<any>(priceUrl, {
            params: {
              ids: tokenValues + "," + solMint,
              showExtraInfo: true,
            },
            timeout: config.tx.get_timeout,
          });

          if (!priceResponse.data.data) {
            console.log("⛔ Latest price could not be fetched. Trying again...");
            return;
          }
          currentPrices = priceResponse.data.data;
          
          // Update cache with new prices
          Object.entries(currentPrices).forEach(([token, data]: [string, any]) => {
            const price = data.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;
            if (price) priceCache.set(token, price);
          });
        }
      }

      // Loop trough all our current holdings
      const updatedHoldingsAfterPriceCheck = await Promise.all(
        updatedHoldings.map(async (row) => {
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

          // Convert Trade Time
          const centralEuropenTime = DateTime.fromMillis(tokenTime).toLocal();
          const hrTradeTime = centralEuropenTime.toFormat("HH:mm:ss");

          // Get current price
          const tokenCurrentPrice = currentPrices[token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;

          // Calculate PnL and profit/loss
          const unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
          const unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
          const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";

          // Check SL/TP
          let sltpMessage = "";
          let shouldLog = true;

          if (config.sell.auto_sell && config.sell.auto_sell === true) {
            const amountIn = tokenBalance.toString().replace(".", "");
            if (unrealizedPnLPercentage >= config.sell.take_profit_percent || unrealizedPnLPercentage <= -config.sell.stop_loss_percent) {
              const tx = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn);
              if (!tx) {
                sltpMessage = "⛔ Could not sell. Trying again in 5 seconds.";
              } else if (tx === "TOKEN_ALREADY_SOLD") {
                shouldLog = false; // Don't include this token in logs
              } else {
                sltpMessage = unrealizedPnLPercentage >= config.sell.take_profit_percent ? 
                  "Took Profit: " + tx : 
                  "Stop Loss triggered: " + tx;
              }
            }
          }

          if (shouldLog) {
            return `${hrTradeTime} Buy ${tokenBalance} ${tokenName} for $${tokenSolPaidUSDC.toFixed(2)}. ${iconPnl} Unrealized PnL: $${unrealizedPnLUSDC.toFixed(
              2
            )} (${unrealizedPnLPercentage.toFixed(2)}%) ${sltpMessage}`;
          }
          return null;
        })
      );

      // Filter out null entries and update logs
      holdingLogs.push(...updatedHoldingsAfterPriceCheck.filter(log => log !== null));
    }

    // Output updated holdings
    console.clear();
    console.log(holdingLogs.join("\n"));

    // Output no holdings found
    if (holdings.length === 0) console.log("No token holdings yet as of", new Date().toISOString());

    // Output wallet tracking if set in config
    if (config.sell.track_public_wallet) {
      console.log("\nCheck your wallet: https://gmgn.ai/sol/address/" + config.sell.track_public_wallet);
    }

    // Close the database connection when done
    console.log("Last Update: ", new Date().toISOString());
    await db.close();
  }

  setTimeout(main, 5000); // Call main again after 5 seconds
}

main().catch((err) => {
  console.error(err);
});
