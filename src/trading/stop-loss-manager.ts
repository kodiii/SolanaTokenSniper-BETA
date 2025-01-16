import { PublicKey } from '@solana/web3.js';
import { Position, StopLossEvent, VolatilityMetrics } from './types';
import { StopLossCalculator } from './stop-loss-calculator';

type StopLossEventHandler = (event: StopLossEvent) => Promise<void>;

export class StopLossManager {
  private positions: Map<string, Position>;
  private volatilityMetrics: Map<string, VolatilityMetrics>;
  private eventHandlers: StopLossEventHandler[];

  constructor() {
    this.positions = new Map();
    this.volatilityMetrics = new Map();
    this.eventHandlers = [];
  }

  public initializePosition(tokenMint: PublicKey, entryPrice: number, size: number): void {
    const stopLossPrice = StopLossCalculator.calculateBaseStopLoss(entryPrice);
    
    this.positions.set(tokenMint.toBase58(), {
      entryPrice,
      size,
      stopLossPrice,
      isTrailingActive: false,
      highestPrice: entryPrice
    });

    this.volatilityMetrics.set(tokenMint.toBase58(), {
      volatility: 0,
      lastUpdate: Date.now(),
      priceHistory: []
    });
  }

  public getStopLossPrice(tokenMint: PublicKey): number | undefined {
    const position = this.positions.get(tokenMint.toBase58());
    return position?.stopLossPrice;
  }

  public updatePrice(tokenMint: PublicKey, currentPrice: number): void {
    const position = this.positions.get(tokenMint.toBase58());
    if (!position) return;

    // Check if trailing stop loss should be activated
    if (!position.isTrailingActive && 
        StopLossCalculator.shouldActivateTrailingStop(position.entryPrice, currentPrice)) {
      position.isTrailingActive = true;
      position.highestPrice = currentPrice;
      position.stopLossPrice = StopLossCalculator.calculateTrailingStopLoss(currentPrice);
    }

    // Update trailing stop loss if active and new price is higher
    if (position.isTrailingActive && currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
      position.stopLossPrice = StopLossCalculator.calculateTrailingStopLoss(currentPrice);
    }

    // Check if stop loss is triggered
    if (currentPrice <= position.stopLossPrice) {
      this.emitEvent({
        type: 'stop_loss_triggered',
        tokenMint,
        price: currentPrice,
        stopLossPrice: position.stopLossPrice,
        timestamp: Date.now()
      });
      this.positions.delete(tokenMint.toBase58());
    }
  }

  public updateVolatility(tokenMint: PublicKey, metrics: { volatility: number; timestamp: number }): void {
    const position = this.positions.get(tokenMint.toBase58());
    if (!position) return;

    this.volatilityMetrics.set(tokenMint.toBase58(), {
      volatility: metrics.volatility,
      lastUpdate: metrics.timestamp,
      priceHistory: []
    });

    const newStopLoss = StopLossCalculator.calculateVolatilityAdjustment(
      position.stopLossPrice,
      metrics.volatility
    );

    if (newStopLoss !== position.stopLossPrice) {
      position.stopLossPrice = newStopLoss;
      this.emitEvent({
        type: 'dynamic_stop_updated',
        tokenMint,
        price: position.stopLossPrice,
        newStopLoss,
        volatility: metrics.volatility,
        timestamp: metrics.timestamp
      });
    }
  }

  public onStopLossEvent(handler: StopLossEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private async emitEvent(event: StopLossEvent): Promise<void> {
    await Promise.all(this.eventHandlers.map(handler => handler(event)));
  }

  public cleanup(): void {
    this.positions.clear();
    this.volatilityMetrics.clear();
    this.eventHandlers = [];
  }
}
