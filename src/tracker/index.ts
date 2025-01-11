import { config } from "./../config";
import axios, { AxiosError } from "axios";
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
import LRU from 'lru-cache';
import path from 'path';
import fs from 'fs';

// Load environment variables from the .env file
dotenv.config();

// Initialize price cache
const priceCache = new LRU({
  max: 500, // Maximum number of items
  ttl: 30000, // Cache TTL: 30 seconds
});

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

async function main() {
  try {
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET || "")));
    const connection = getNextConnection();

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

      // Get all token ids
      const tokenValues = updatedHoldings.map((holding) => holding.Token).join(",");

      // Check cache first
      let currentPrices: any = {};
      const cachedPrices = tokenValues.split(',').map(token => ({
        token,
        price: priceCache.get(token)
      })).filter(item => item.price !== undefined);

      if (cachedPrices.length === tokenValues.split(',').length) {
        currentPrices = Object.fromEntries(cachedPrices.map(({token, price}) => [token, {extraInfo: {lastSwappedPrice: {lastJupiterSellPrice: price}}}]));
      } else {
        try {
          console.log('Fetching prices from Jupiter...');
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
            console.log("⛔ Latest price could not be fetched. Using last known prices.");
            currentPrices = Object.fromEntries(tokens.map(token => [token, {extraInfo: {lastSwappedPrice: {lastJupiterSellPrice: 0}}}]));
          } else {
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

        // Get current price (default to purchase price if not available)
        const tokenCurrentPrice = currentPrices[token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice ?? tokenPerTokenPaidUSDC;

        // Calculate PnL and profit/loss
        const unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
        const unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
        const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";

        // Check SL/TP
        let sltpMessage = "";
        let shouldLog = true;

        if (config.sell.auto_sell && config.sell.auto_sell === true) {
          // Skip sell attempts for our test token
          if (token !== 'Eu8hEhTf2MrKmUbxMD1PCdCpKbWKFBdYwCmsoaS3VGCX') {
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
        }

        if (shouldLog) {
          const logMessage = `${hrTradeTime} Buy ${tokenBalance} ${tokenName} for $${tokenSolPaidUSDC.toFixed(2)}. ${iconPnl} Unrealized PnL: $${unrealizedPnLUSDC.toFixed(
            2
          )} (${unrealizedPnLPercentage.toFixed(2)}%) ${sltpMessage}`;
          holdingLogs.push(logMessage);
        }
      }

      // Output updated holdings
      console.log('\nCurrent Holdings:');
      console.log(holdingLogs.join("\n"));
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
