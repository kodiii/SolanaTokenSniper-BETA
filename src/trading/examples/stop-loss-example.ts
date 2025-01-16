import { PublicKey } from '@solana/web3.js';
import { StopLossManager } from '../stop-loss-manager';

async function stopLossExample() {
  // Initialize the manager
  const stopLossManager = new StopLossManager();

  // Create a mock token
  const tokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const entryPrice = 100; // SOL

  // Register event handlers
  stopLossManager.onStopLossEvent(async (event) => {
    switch (event.type) {
      case 'stop_loss_triggered':
        console.log(`🚨 Stop loss triggered for token ${event.tokenMint.toBase58()}`);
        console.log(`   Price: ${event.price} SOL`);
        // Execute sell order here
        break;

      case 'dynamic_stop_updated':
        console.log(`🔄 Dynamic stop updated for token ${event.tokenMint.toBase58()}`);
        console.log(`   New stop price: ${event.newStopLoss} SOL`);
        console.log(`   Current price: ${event.price} SOL`);
        break;
    }
  });

  // Initialize position with size
  console.log(`Initializing position for token ${tokenMint.toBase58()}`);
  console.log(`Entry price: ${entryPrice} SOL`);
  const positionSize = 1.0; // 1 SOL worth of tokens
  stopLossManager.initializePosition(tokenMint, entryPrice, positionSize);

  // Simulate price updates
  const priceUpdates = [
    { price: 105, delay: 1000 },  // +5%
    { price: 110, delay: 1000 },  // +10%
    { price: 120, delay: 1000 },  // +20%
    { price: 115, delay: 1000 },  // -4%
    { price: 90, delay: 1000 },   // -22%
  ];

  for (const update of priceUpdates) {
    await new Promise(resolve => setTimeout(resolve, update.delay));
    
    console.log(`\nUpdating price to ${update.price} SOL`);
    stopLossManager.updatePrice(tokenMint, update.price);
  }

  // Clean up
  stopLossManager.cleanup();
}

// Run the example
stopLossExample().catch(console.error);
