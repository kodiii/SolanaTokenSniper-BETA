import WebSocket from "ws"; // Node.js websocket library
import dotenv from "dotenv"; // zero-dependency module that loads environment variables from a .env
import { WebSocketRequest } from "./types"; // Typescript Types for type safety
import { config } from "./config"; // Configuration parameters for our bot
import { Connection, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { walletAdapterIdentity } from '@metaplex-foundation/js';
import { createSellTransaction, getRugCheckConfirmed } from "./transactions";
import { TransactionDetails } from "./transactions/transaction-details";

// Initialize connection with a valid endpoint
const endpoint = config.rpc.endpoints.find(e => e) || "https://api.mainnet-beta.solana.com";
const connection = new Connection(endpoint, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: config.rpc.connection_timeout
});

// Initialize wallet
const keypair = Keypair.generate();
const wallet = {
  publicKey: keypair.publicKey,
  payer: keypair,
  signTransaction: async (transaction: Transaction) => {
    transaction.sign(keypair);
    return transaction;
  },
  signAllTransactions: async (transactions: Transaction[]) => {
    transactions.forEach(t => t.sign(keypair));
    return transactions;
  }
};

// Load environment variables from the .env file
dotenv.config();
let activeTransactions = 0;
const MAX_CONCURRENT = config.tx.concurrent_transactions;
const pendingTransactions: string[] = [];

// Function used to open our websocket connection
function sendSubscribeRequest(ws: WebSocket): void {
  const request: WebSocketRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [
      {
        mentions: [config.liquidity_pool.radiyum_program_id],
      },
      {
        commitment: "processed", // Can use finalized to be more accurate.
      },
    ],
  };
  ws.send(JSON.stringify(request));
}
// Function used to close other connections
function sendUnsubscribeRequest(ws: WebSocket): void {
  const request: WebSocketRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsUnsubscribe",
    params: [],
  };
  ws.send(JSON.stringify(request));
}

// Function used to handle the transaction once a new pool creation is found
async function processTransaction(incomingSignature: string): Promise<void> {
  if (activeTransactions >= MAX_CONCURRENT) {
    console.log("⏳ Max concurrent transactions reached, queuing...");
    pendingTransactions.push(incomingSignature);
    return;
  }

  try {
    activeTransactions++;
    
    // Output logs
    console.log("=============================================");
    console.log("🔎 New Liquidity Pool found.");
    console.log("🔃 Fetching transaction details ...");

    // Fetch the transaction details
    const data = await TransactionDetails.fetchTransactionDetails(connection, incomingSignature);
    if (!data) {
      console.log("⛔ Transaction aborted. No data returned.");
      console.log("🟢 Resuming looking for new tokens...\n");
      return;
    }

    // Ensure required data is available
    if (!data.solMint || !data.tokenMint) return;

    // Check rug check
    const isRugCheckPassed = await getRugCheckConfirmed(data.tokenMint);
    if (!isRugCheckPassed) {
      console.log("🚫 Rug Check not passed! Transaction aborted.");
      console.log("🟢 Resuming looking for new tokens...\n");
      return;
    }

    // Handle ignored tokens
    if (data.tokenMint.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
      // Check if ignored
      console.log("🚫 Transaction skipped. Ignoring Pump.fun.");
      console.log("🟢 Resuming looking for new tokens..\n");
      return;
    }

    // Ouput logs
    console.log("Token found");
    console.log("👽 GMGN: https://gmgn.ai/sol/token/" + data.tokenMint);
    console.log("😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=" + data.tokenMint);  
    // Check if simulation mode is enabled
    if (config.rug_check.simulation_mode) {
      console.log("👀 Token not swapped. Simulation mode is enabled.");
      console.log("🟢 Resuming looking for new tokens..\n");
      return;
    }

    // Add initial delay before first buy
    await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

    // Create Swap transaction
    const tx = await createSellTransaction(wallet, data.solMint, config.swap.amount);
    if (!tx) {
      console.log("⛔ Transaction aborted. No valid id returned.");
      console.log("🟢 Resuming looking for new tokens...\n");
      return;
    }

    // Output logs
    console.log("✅ Swap quote recieved.");
    console.log("🚀 Swapping SOL for Token.");
    console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

    // Fetch and store the transaction for tracking purposes
    const signature = bs58.encode(tx.signatures[0]);
    await TransactionDetails.fetchAndSaveSwapDetails(connection, signature);
  } catch (error) {
    console.error("Error processing transaction:", error);
  } finally {
    activeTransactions--;
    
    // Process next pending transaction if any
    if (pendingTransactions.length > 0 && activeTransactions < MAX_CONCURRENT) {
      const nextSignature = pendingTransactions.shift();
      if (nextSignature) {
        processTransaction(nextSignature).catch(console.error);
      }
    }
    
    console.log("🟢 Resuming looking for new tokens...\n");
  }
}

let init = false;
async function websocketHandler(): Promise<void> {
  // Create a WebSocket connection
  let ws: WebSocket | null = new WebSocket(process.env.HELIUS_WSS_URI || "");
  if (!init) console.clear();

  // @TODO, test with hosting our app on a Cloud instance closer to the RPC nodes physical location for minimal latency
  // @TODO, test with different RPC and API nodes (free and paid) from quicknode and shyft to test speed

  // Send subscription to the websocket once the connection is open
  ws.on("open", () => {
    // Unsubscribe
    if (ws && !init) sendUnsubscribeRequest(ws); // Send a request once the WebSocket is open
    // Subscribe
    if (ws) sendSubscribeRequest(ws); // Send a request once the WebSocket is open
    console.log("\n🔓 WebSocket is open and listening.");
    init = true;
  });

  // Logic for the message event for the .on event listener
  ws.on("message", async (data: WebSocket.Data) => {
    try {
      const jsonString = data.toString(); // Convert data to a string
      const parsedData = JSON.parse(jsonString); // Parse the JSON string

      // Safely access the nested structure
      const logs = parsedData?.params?.result?.value?.logs;
      const signature = parsedData?.params?.result?.value?.signature;

      // Validate `logs` is an array
      if (Array.isArray(logs)) {
        // Verify if this is a new pool creation
        const containsCreate = logs.some((log: string) => typeof log === "string" && log.includes("Program log: initialize2: InitializeInstruction2"));
        if (!containsCreate || typeof signature !== "string") return;

        // Process transaction
        processTransaction(signature).catch(console.error);
      }
    } catch (error) {
      console.error("Error parsing JSON or processing data:", error);
    }
  });

  ws.on("error", (err: Error) => {
    console.error("WebSocket error:", err);
  });

  ws.on("close", () => {
    // Connection closed, discard old websocket and create a new one in 5 seconds
    ws = null;
    setTimeout(websocketHandler, 5000);
  });
}

websocketHandler();
