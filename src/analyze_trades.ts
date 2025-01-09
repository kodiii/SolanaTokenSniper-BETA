import fs from 'fs';
import path from 'path';

interface TradeLog {
  timestamp: string;
  action: 'BUY' | 'SELL';
  tokenMint: string;
  priceInSOL: number;
  amountInSOL: number;
  balanceAfterTrade: number;
  profitLoss?: number;
  reason?: string;
}

interface TradingSummary {
  totalTrades: number;
  profitableTrades: number;
  lossMakingTrades: number;
  totalProfit: number;
  totalLoss: number;
  netProfitLoss: number;
  winRate: number;
  averageProfit: number;
  averageLoss: number;
  largestProfit: number;
  largestLoss: number;
  initialBalance: number;
  finalBalance: number;
  returnOnInvestment: number;
}

function analyzeTrades(logFile: string): TradingSummary {
  const rawData = fs.readFileSync(logFile, 'utf8');
  const data = JSON.parse(rawData);
  const trades: TradeLog[] = data.trades || [];

  const summary: TradingSummary = {
    totalTrades: 0,
    profitableTrades: 0,
    lossMakingTrades: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfitLoss: 0,
    winRate: 0,
    averageProfit: 0,
    averageLoss: 0,
    largestProfit: 0,
    largestLoss: 0,
    initialBalance: data.summary?.initialBalance || 0,
    finalBalance: data.summary?.currentBalance || 0,
    returnOnInvestment: 0
  };

  const sellTrades = trades.filter(trade => trade.action === 'SELL');
  summary.totalTrades = sellTrades.length;

  sellTrades.forEach(trade => {
    if (trade.profitLoss) {
      if (trade.profitLoss > 0) {
        summary.profitableTrades++;
        summary.totalProfit += trade.profitLoss;
        summary.largestProfit = Math.max(summary.largestProfit, trade.profitLoss);
      } else {
        summary.lossMakingTrades++;
        summary.totalLoss += Math.abs(trade.profitLoss);
        summary.largestLoss = Math.max(summary.largestLoss, Math.abs(trade.profitLoss));
      }
    }
  });

  summary.netProfitLoss = summary.totalProfit - summary.totalLoss;
  summary.winRate = (summary.profitableTrades / summary.totalTrades) * 100;
  summary.averageProfit = summary.totalProfit / summary.profitableTrades || 0;
  summary.averageLoss = summary.totalLoss / summary.lossMakingTrades || 0;
  summary.returnOnInvestment = ((summary.finalBalance - summary.initialBalance) / summary.initialBalance) * 100;

  return summary;
}

function printAnalysis(summary: TradingSummary): void {
  console.log('\n📊 Trading Performance Analysis 📊');
  console.log('==================================');
  console.log(`💰 Initial Balance: ${summary.initialBalance.toFixed(4)} SOL`);
  console.log(`💼 Final Balance: ${summary.finalBalance.toFixed(4)} SOL`);
  console.log(`📈 Return on Investment: ${summary.returnOnInvestment.toFixed(2)}%`);
  console.log('\n📉 Trade Statistics');
  console.log(`Total Trades: ${summary.totalTrades}`);
  console.log(`Win Rate: ${summary.winRate.toFixed(2)}%`);
  console.log(`Profitable Trades: ${summary.profitableTrades}`);
  console.log(`Loss Making Trades: ${summary.lossMakingTrades}`);
  console.log('\n💵 Profit/Loss Analysis');
  console.log(`Net Profit/Loss: ${summary.netProfitLoss.toFixed(4)} SOL`);
  console.log(`Total Profit: ${summary.totalProfit.toFixed(4)} SOL`);
  console.log(`Total Loss: ${summary.totalLoss.toFixed(4)} SOL`);
  console.log(`Average Profit: ${summary.averageProfit.toFixed(4)} SOL`);
  console.log(`Average Loss: ${summary.averageLoss.toFixed(4)} SOL`);
  console.log(`Largest Profit: ${summary.largestProfit.toFixed(4)} SOL`);
  console.log(`Largest Loss: ${summary.largestLoss.toFixed(4)} SOL`);
}

// Run the analysis
const logFile = path.join(__dirname, 'trading_simulation_log.json');
if (fs.existsSync(logFile)) {
  const summary = analyzeTrades(logFile);
  printAnalysis(summary);
} else {
  console.log('❌ No trading log file found. Run some trades first!');
}
