import { PublicKey } from '@solana/web3.js';

export interface Position {
  entryPrice: number;
  size: number;
  stopLossPrice: number;
  isTrailingActive: boolean;
  highestPrice: number;
}

export interface VolatilityMetrics {
  volatility: number;
  lastUpdate: number;
  priceHistory: number[];
}

export interface StopLossEvent {
  type: 'stop_loss_triggered' | 'dynamic_stop_updated';
  tokenMint: PublicKey;
  price?: number;
  stopLossPrice?: number;
  newStopLoss?: number;
  volatility?: number;
  timestamp: number;
}

export interface TakeProfitLevelState {
  percentage: number;
  sellPercentage: number;
  adjustStopLoss: boolean;
  triggered: boolean;
  price: number;
}

export interface TakeProfitPosition {
  tokenMint: PublicKey;
  entryPrice: number;
  currentPrice: number;
  initialPosition: number;
  remainingPosition: number;
  levels: TakeProfitLevelState[];
  lastUpdate: number;
}

export interface TakeProfitEvent {
  type: 'take_profit_triggered' | 'position_rebalanced' | 'stop_loss_adjusted';
  tokenMint: PublicKey;
  level: number;
  price: number;
  sellAmount?: number;
  remainingPosition?: number;
  newStopLoss?: number;
  timestamp: number;
}

export type EventHandler<T> = (event: T) => Promise<void>;

export interface MarketCondition {
  congestion: 'low' | 'medium' | 'high';
  volume: 'low' | 'medium' | 'high';
  volatility: 'low' | 'medium' | 'high';
  timestamp: number;
}

export interface MarketAdjustment {
  stopLossIncrease: number;
  takeProfitIncrease: number;
  slippageIncrease: number;
}
