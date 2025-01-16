import { config } from '../config';

export class StopLossCalculator {
  static calculateBaseStopLoss(entryPrice: number): number {
    return entryPrice * (1 - config.trading.stopLoss.dynamic.basePercentage / 100);
  }

  static calculateTrailingStopLoss(currentPrice: number): number {
    return currentPrice * (1 - config.trading.stopLoss.trailing.trailingDistance / 100);
  }

  static calculateVolatilityAdjustment(stopLossPrice: number, volatility: number): number {
    if (volatility > config.trading.stopLoss.dynamic.volatilityThreshold) {
      const adjustment = config.trading.stopLoss.dynamic.volatilityAdjustment / 100;
      return stopLossPrice * (1 - adjustment);
    }
    return stopLossPrice;
  }

  static shouldActivateTrailingStop(entryPrice: number, currentPrice: number): boolean {
    const profitPercentage = ((currentPrice - entryPrice) / entryPrice) * 100;
    return profitPercentage >= config.trading.stopLoss.trailing.activationThreshold;
  }
}
