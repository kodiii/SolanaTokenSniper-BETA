import { PublicKey } from '@solana/web3.js';
import { TakeProfitManager } from '../take-profit-manager';
import { config } from '../../config';

async function takeProfitExample() {
  // Initialize the manager
  const takeProfitManager = new TakeProfitManager();

  // Create a mock token
  const tokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const entryPrice = 100; // SOL
  const position = 1000;  // Number of tokens

  // Register event handlers
  takeProfitManager.onTakeProfitEvent(async (event) => {
    switch (event.type) {
      case 'take_profit_triggered':
        console.log(`\n🎯 Take profit triggered for token ${event.tokenMint.toBase58()}`);
        console.log(`   Level: ${event.level + 1}`);
        console.log(`   Price: ${event.price} SOL`);
        console.log(`   Sell amount: ${event.sellAmount} tokens`);
        console.log(`   Remaining position: ${event.remainingPosition} tokens`);
        // Execute sell order here
        break;

      case 'position_rebalanced':
        console.log(`\n⚖️  Position rebalanced for token ${event.tokenMint.toBase58()}`);
        console.log(`   Current price: ${event.price} SOL`);
        console.log(`   Remaining position: ${event.remainingPosition} tokens`);
        
        // Show new level distribution
        const levels = takeProfitManager.getPositionLevels(event.tokenMint);
        if (levels) {
          console.log('   New level distribution:');
          levels.filter(l => !l.triggered).forEach((level, i) => {
            console.log(`   Level ${i + 1}: ${level.sellPercentage.toFixed(1)}% at ${level.price} SOL`);
          });
        }
        break;
    }
  });

  // Initialize position
  console.log(`\nInitializing position for token ${tokenMint.toBase58()}`);
  console.log(`Entry price: ${entryPrice} SOL`);
  console.log(`Position size: ${position} tokens`);
  takeProfitManager.initializePosition(tokenMint, entryPrice, position);

  // Show initial take-profit levels
  const initialLevels = takeProfitManager.getPositionLevels(tokenMint);
  if (initialLevels) {
    console.log('\nInitial take-profit levels:');
    initialLevels.forEach((level, i) => {
      console.log(`Level ${i + 1}: ${level.sellPercentage}% at ${level.price} SOL`);
    });
  }

  // Simulate price updates
  const priceUpdates = [
    { price: 105, delay: 1000 },  // +5%
    { price: 110, delay: 1000 },  // +10%
    { price: 120, delay: 1000 },  // +20%
    { price: 130, delay: 1000 },  // +30%
    { price: 150, delay: 1000 },  // +50%
  ];

  for (const update of priceUpdates) {
    await new Promise(resolve => setTimeout(resolve, update.delay));
    
    console.log(`\nUpdating price to ${update.price} SOL`);
    // Update the position with new price information
    await takeProfitManager.processPrice({
      tokenMint: tokenMint.toString(),
      currentPrice: update.price,
      timestamp: Date.now()
    });

    // Check if take profit was triggered
    const status = await takeProfitManager.checkTakeProfit(tokenMint.toString());
    if (status.triggered) {
      console.log(`Take profit triggered for ${tokenMint.toString()} at price ${update.price}`);
      // Execute sell order
    }
  }

  // Clean up
  takeProfitManager.cleanup();
}

// Run the example
takeProfitExample().catch(console.error);
