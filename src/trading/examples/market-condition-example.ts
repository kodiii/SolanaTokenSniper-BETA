import { PublicKey } from '@solana/web3.js';
import { MarketConditionManager } from '../market-condition-manager';
import { config } from '../../config';

async function marketConditionExample() {
  // Initialize the manager
  const marketManager = new MarketConditionManager();

  // Create a mock token
  const tokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  // Register event handlers
  marketManager.onMarketConditionEvent(async (event) => {
    console.log(`\n🔄 Market conditions changed for token ${event.tokenMint.toBase58()}`);
    
    if (event.oldState) {
      console.log('\nPrevious conditions:');
      console.log(`   Congestion: ${event.oldState.congestionLevel}`);
      console.log(`   Volume: ${event.oldState.volumeLevel}`);
      console.log(`   Volatility: ${event.oldState.volatilityLevel}`);
    }

    console.log('\nNew conditions:');
    console.log(`   Congestion: ${event.newState.congestionLevel}`);
    console.log(`   Volume: ${event.newState.volumeLevel}`);
    console.log(`   Volatility: ${event.newState.volatilityLevel}`);

    console.log('\nTrading adjustments:');
    console.log(`   Stop Loss increase: +${event.newState.adjustments.stopLossIncrease}%`);
    console.log(`   Take Profit increase: +${event.newState.adjustments.takeProfitIncrease}%`);
    console.log(`   Slippage increase: +${event.newState.adjustments.slippageIncrease}%`);

    // Example of how to apply these adjustments
    console.log('\nAdjusted trading parameters:');
    const baseStopLoss = config.trading.stopLoss.dynamic.basePercentage;
    const baseTakeProfit = config.trading.takeProfit.levels[0].percentage;
    const baseSlippage = config.swap.slippageBps;

    console.log(`   Stop Loss: ${baseStopLoss + event.newState.adjustments.stopLossIncrease}%`);
    console.log(`   Take Profit: ${baseTakeProfit + event.newState.adjustments.takeProfitIncrease}%`);
    console.log(`   Slippage: ${baseSlippage + event.newState.adjustments.slippageIncrease} bps`);
  });

  // Initialize tracking
  console.log(`\nInitializing market tracking for token ${tokenMint.toBase58()}`);
  marketManager.initializeTracking(tokenMint);

  // Simulate different market conditions
  const updates = [
    {
      name: 'Normal conditions',
      congestion: 400,
      volume: 50000,
      volatility: 3,
      delay: 1000
    },
    {
      name: 'High congestion',
      congestion: config.trading.marketConditions.thresholds.congestion.high + 100,
      volume: 50000,
      volatility: 3,
      delay: 1000
    },
    {
      name: 'Low volume',
      congestion: 400,
      volume: config.trading.marketConditions.thresholds.volume.low - 100,
      volatility: 3,
      delay: 1000
    },
    {
      name: 'High volatility',
      congestion: 400,
      volume: 50000,
      volatility: config.trading.marketConditions.thresholds.volatility.high + 1,
      delay: 1000
    },
    {
      name: 'Extreme conditions',
      congestion: config.trading.marketConditions.thresholds.congestion.high + 100,
      volume: config.trading.marketConditions.thresholds.volume.low - 100,
      volatility: config.trading.marketConditions.thresholds.volatility.high + 1,
      delay: 1000
    }
  ];

  for (const update of updates) {
    await new Promise(resolve => setTimeout(resolve, update.delay));
    
    console.log(`\n📊 Simulating ${update.name}...`);
    await marketManager.updateConditions({
      tokenMint,
      congestion: update.congestion,
      volume: update.volume,
      volatility: update.volatility,
      timestamp: Date.now()
    });
  }

  // Clean up
  marketManager.cleanup();
}

// Run the example
marketConditionExample().catch(console.error);
