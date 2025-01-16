import { PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { TakeProfitPosition, TakeProfitEvent, TakeProfitLevelState, EventHandler } from './types';
import { TakeProfitCalculator } from './take-profit-calculator';

export class TakeProfitManager {
  private positions: Map<string, TakeProfitPosition>;
  private eventHandlers: EventHandler<TakeProfitEvent>[];
  private stopLossUpdateCallback?: (tokenMint: PublicKey, newStopLoss: number) => Promise<void>;

  constructor() {
    this.positions = new Map();
    this.eventHandlers = [];
  }

  public initializePosition(tokenMint: PublicKey, entryPrice: number, position: number): void {
    const levels = TakeProfitCalculator.initializeLevels(entryPrice);
    
    const state: TakeProfitPosition = {
      tokenMint,
      entryPrice,
      currentPrice: entryPrice,
      initialPosition: position,
      remainingPosition: position,
      levels,
      lastUpdate: Date.now()
    };

    this.positions.set(tokenMint.toBase58(), state);
  }

  public updatePrice(tokenMint: PublicKey, currentPrice: number): void {
    const position = this.positions.get(tokenMint.toBase58());
    if (!position) return;

    position.currentPrice = currentPrice;
    position.lastUpdate = Date.now();

    // Check each take-profit level
    for (let i = 0; i < position.levels.length; i++) {
      const level = position.levels[i];
      if (!level.triggered && currentPrice >= level.price) {
        this.handleTakeProfitTriggered(position, i);
      }
    }
  }

  private async handleTakeProfitTriggered(position: TakeProfitPosition, levelIndex: number): Promise<void> {
    const level = position.levels[levelIndex];
    level.triggered = true;

    // Calculate sell amount
    const sellAmount = TakeProfitCalculator.calculateSellAmount(
      position.remainingPosition,
      level.sellPercentage
    );
    position.remainingPosition -= sellAmount;

    // Emit take-profit event
    await this.emitEvent({
      type: 'take_profit_triggered',
      tokenMint: position.tokenMint,
      level: levelIndex,
      price: position.currentPrice,
      sellAmount,
      remainingPosition: position.remainingPosition,
      timestamp: Date.now()
    });

    // Adjust stop loss if configured
    if (level.adjustStopLoss && this.stopLossUpdateCallback) {
      const newStopLoss = TakeProfitCalculator.calculateNewStopLoss(
        position.entryPrice,
        position.currentPrice,
        levelIndex,
        position.levels
      );

      await this.stopLossUpdateCallback(position.tokenMint, newStopLoss);
      await this.emitEvent({
        type: 'stop_loss_adjusted',
        tokenMint: position.tokenMint,
        level: levelIndex,
        price: position.currentPrice,
        newStopLoss,
        timestamp: Date.now()
      });
    }

    // Rebalance position if enabled
    if (config.trading.takeProfit.rebalancePosition && position.remainingPosition > 0) {
      await this.rebalancePosition(position);
    }

    // Remove position if complete
    if (this.isPositionComplete(position)) {
      this.positions.delete(position.tokenMint.toBase58());
    }
  }

  private async rebalancePosition(position: TakeProfitPosition): Promise<void> {
    const remainingLevels = position.levels.filter(l => !l.triggered);
    if (remainingLevels.length === 0) return;

    TakeProfitCalculator.rebalanceLevels(remainingLevels, position.remainingPosition);

    await this.emitEvent({
      type: 'position_rebalanced',
      tokenMint: position.tokenMint,
      level: -1,
      price: position.currentPrice,
      remainingPosition: position.remainingPosition,
      timestamp: Date.now()
    });
  }

  private isPositionComplete(position: TakeProfitPosition): boolean {
    return position.remainingPosition === 0 || 
           position.levels.every(level => level.triggered);
  }

  public onTakeProfitEvent(handler: EventHandler<TakeProfitEvent>): void {
    this.eventHandlers.push(handler);
  }

  public setStopLossUpdateCallback(
    callback: (tokenMint: PublicKey, newStopLoss: number) => Promise<void>
  ): void {
    this.stopLossUpdateCallback = callback;
  }

  private async emitEvent(event: TakeProfitEvent): Promise<void> {
    await Promise.all(this.eventHandlers.map(handler => handler(event)));
  }

  public getPositionLevels(tokenMint: PublicKey): TakeProfitLevelState[] | null {
    const position = this.positions.get(tokenMint.toBase58());
    return position ? position.levels : null;
  }

  public cleanup(): void {
    this.positions.clear();
    this.eventHandlers = [];
  }

  async processPrice(data: { tokenMint: string; currentPrice: number; timestamp: number }): Promise<void> {
    const position = this.positions.get(data.tokenMint);
    if (!position) {
      throw new Error(`No position found for token ${data.tokenMint}`);
    }

    position.currentPrice = data.currentPrice;
    position.lastUpdate = data.timestamp;
    
    await this.updateTakeProfitLevels(data.tokenMint);
  }

  async checkTakeProfit(tokenMint: string): Promise<{ triggered: boolean; price?: number }> {
    const position = this.positions.get(tokenMint);
    if (!position) {
      throw new Error(`No position found for token ${tokenMint}`);
    }

    for (const level of position.levels) {
      if (position.currentPrice >= level.price && !level.triggered) {
        level.triggered = true;
        return { triggered: true, price: level.price };
      }
    }

    return { triggered: false };
  }

  private async updateTakeProfitLevels(tokenMint: string): Promise<void> {
    const position = this.positions.get(tokenMint);
    if (!position) return;

    // Check each take-profit level
    for (let i = 0; i < position.levels.length; i++) {
      const level = position.levels[i];
      if (!level.triggered && position.currentPrice >= level.price) {
        this.handleTakeProfitTriggered(position, i);
      }
    }
  }
}
