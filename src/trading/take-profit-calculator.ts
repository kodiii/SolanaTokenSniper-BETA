import { config } from '../config';
import { TakeProfitLevelState } from './types';

export class TakeProfitCalculator {
  static calculateLevelPrice(entryPrice: number, percentage: number): number {
    return entryPrice * (1 + percentage / 100);
  }

  static calculateSellAmount(remainingPosition: number, sellPercentage: number): number {
    return remainingPosition * (sellPercentage / 100);
  }

  static calculateNewStopLoss(
    entryPrice: number,
    currentPrice: number,
    levelIndex: number,
    levels: TakeProfitLevelState[]
  ): number {
    if (levelIndex === 0) {
      // First take-profit: move to break-even
      return entryPrice;
    } else {
      // Move to previous take-profit level
      const previousLevel = levels[levelIndex - 1];
      return previousLevel.price;
    }
  }

  static initializeLevels(entryPrice: number): TakeProfitLevelState[] {
    return config.trading.takeProfit.levels.map(level => ({
      percentage: level.percentage,
      sellPercentage: level.sellPercentage,
      adjustStopLoss: level.adjustStopLoss,
      triggered: false,
      price: this.calculateLevelPrice(entryPrice, level.percentage)
    }));
  }

  static rebalanceLevels(
    remainingLevels: TakeProfitLevelState[],
    remainingPosition: number
  ): void {
    if (remainingLevels.length === 0) return;

    const positionPerLevel = remainingPosition / remainingLevels.length;
    remainingLevels.forEach(level => {
      level.sellPercentage = (positionPerLevel / remainingPosition) * 100;
    });
  }
}
