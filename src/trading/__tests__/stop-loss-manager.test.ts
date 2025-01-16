import { PublicKey } from '@solana/web3.js';
import { StopLossManager } from '../stop-loss-manager';
import { config } from '../../config';

describe('StopLossManager', () => {
  let manager: StopLossManager;
  const mockTokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const entryPrice = 100;
  const position = 1000;

  beforeEach(() => {
    manager = new StopLossManager();
    manager.initializePosition(mockTokenMint, entryPrice, position);
  });

  describe('Initialization', () => {
    test('should initialize with correct position data', () => {
      const stopLoss = manager.getStopLossPrice(mockTokenMint);
      const expectedPrice = entryPrice * (1 - config.trading.stopLoss.dynamic.basePercentage / 100);
      
      expect(stopLoss).toBeDefined();
      expect(stopLoss).toBeCloseTo(expectedPrice);
    });

    test('should return undefined for unknown token', () => {
      const unknownToken = new PublicKey('11111111111111111111111111111111');
      expect(manager.getStopLossPrice(unknownToken)).toBeUndefined();
    });
  });

  describe('Dynamic Stop Loss', () => {
    test('should initialize with base stop loss', () => {
      const stopLoss = manager.getStopLossPrice(mockTokenMint);
      const expectedPrice = entryPrice * (1 - config.trading.stopLoss.dynamic.basePercentage / 100);
      
      expect(stopLoss).toBeDefined();
      expect(stopLoss).toBeCloseTo(expectedPrice);
    });

    test('should adjust stop loss based on volatility', () => {
      const events: any[] = [];
      manager.onStopLossEvent(async (event) => {
        events.push(event);
      });

      manager.updateVolatility(mockTokenMint, {
        volatility: config.trading.stopLoss.dynamic.volatilityThreshold + 1,
        timestamp: Date.now()
      });

      const stopLoss = manager.getStopLossPrice(mockTokenMint);
      const baseStopLoss = entryPrice * (1 - config.trading.stopLoss.dynamic.basePercentage / 100);
      const expectedPrice = baseStopLoss * (1 - config.trading.stopLoss.dynamic.volatilityAdjustment / 100);
      
      expect(stopLoss).toBeCloseTo(expectedPrice);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('dynamic_stop_updated');
    });

    test('should not adjust stop loss for low volatility', () => {
      const events: any[] = [];
      manager.onStopLossEvent(async (event) => {
        events.push(event);
      });

      const initialStopLoss = manager.getStopLossPrice(mockTokenMint);
      
      manager.updateVolatility(mockTokenMint, {
        volatility: config.trading.stopLoss.dynamic.volatilityThreshold - 1,
        timestamp: Date.now()
      });

      expect(manager.getStopLossPrice(mockTokenMint)).toBe(initialStopLoss);
      expect(events).toHaveLength(0);
    });
  });

  describe('Trailing Stop Loss', () => {
    test('should activate trailing stop loss after profit threshold', () => {
      const profitPrice = entryPrice * (1 + config.trading.stopLoss.trailing.activationThreshold / 100);
      manager.updatePrice(mockTokenMint, profitPrice);

      const stopLoss = manager.getStopLossPrice(mockTokenMint);
      const expectedStopLoss = profitPrice * (1 - config.trading.stopLoss.trailing.trailingDistance / 100);
      
      expect(stopLoss).toBeCloseTo(expectedStopLoss);
    });

    test('should update trailing stop loss with price increase', () => {
      const initialStopLoss = manager.getStopLossPrice(mockTokenMint);
      const newPrice = entryPrice * 1.2; // 20% increase

      manager.updatePrice(mockTokenMint, newPrice);
      const updatedStopLoss = manager.getStopLossPrice(mockTokenMint);

      expect(updatedStopLoss).toBeGreaterThan(initialStopLoss!);
      expect(updatedStopLoss).toBeCloseTo(newPrice * (1 - config.trading.stopLoss.trailing.trailingDistance / 100));
    });

    test('should not lower trailing stop loss with price decrease', () => {
      // First increase price to activate trailing stop loss
      const activationPrice = entryPrice * (1 + config.trading.stopLoss.trailing.activationThreshold / 100);
      manager.updatePrice(mockTokenMint, activationPrice);
      
      // Then increase price further
      const highPrice = entryPrice * 1.2; // 120
      manager.updatePrice(mockTokenMint, highPrice);
      const highStopLoss = manager.getStopLossPrice(mockTokenMint);
      
      // Then decrease price, but stay above stop loss
      // If high price is 120 and trailing distance is 5%, stop loss would be at 114
      // So we'll set price to 115 to be above stop loss but below high
      const lowerPrice = highPrice * 0.96; // 115.2
      manager.updatePrice(mockTokenMint, lowerPrice);
      const currentStopLoss = manager.getStopLossPrice(mockTokenMint);

      expect(currentStopLoss).toEqual(highStopLoss);
    });
  });

  describe('Stop Loss Events', () => {
    test('should emit event when stop loss is triggered', async () => {
      const events: any[] = [];
      manager.onStopLossEvent(async (event) => {
        events.push(event);
      });

      const stopLossPrice = manager.getStopLossPrice(mockTokenMint)!;
      manager.updatePrice(mockTokenMint, stopLossPrice * 0.99);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('stop_loss_triggered');
      expect(events[0].price).toBeLessThan(stopLossPrice);
    });

    test('should remove position after stop loss is triggered', () => {
      const stopLossPrice = manager.getStopLossPrice(mockTokenMint)!;
      manager.updatePrice(mockTokenMint, stopLossPrice * 0.99);

      expect(manager.getStopLossPrice(mockTokenMint)).toBeUndefined();
    });

    test('should not emit event when price is above stop loss', () => {
      const events: any[] = [];
      manager.onStopLossEvent(async (event) => {
        events.push(event);
      });

      const stopLossPrice = manager.getStopLossPrice(mockTokenMint)!;
      manager.updatePrice(mockTokenMint, stopLossPrice * 1.01);

      expect(events).toHaveLength(0);
    });
  });

  describe('Cleanup', () => {
    test('should clear all data on cleanup', () => {
      manager.cleanup();
      expect(manager.getStopLossPrice(mockTokenMint)).toBeUndefined();
    });
  });
});
