import { PublicKey } from '@solana/web3.js';
import { TakeProfitManager } from '../take-profit-manager';
import { config } from '../../config';

describe('TakeProfitManager', () => {
  let manager: TakeProfitManager;
  const mockTokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const entryPrice = 100;
  const position = 1000;

  beforeEach(() => {
    manager = new TakeProfitManager();
  });

  describe('Position Management', () => {
    test('should initialize position with multiple take profit levels', () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      const levels = manager.getPositionLevels(mockTokenMint);

      expect(levels).toBeDefined();
      expect(levels?.length).toBe(config.trading.takeProfit.levels.length);
      expect(levels?.[0].price).toBeGreaterThan(entryPrice);
    });

    test('should handle non-existent position', () => {
      const nonExistentMint = new PublicKey('11111111111111111111111111111111');
      const levels = manager.getPositionLevels(nonExistentMint);
      expect(levels).toBeNull();
    });
  });

  describe('Take Profit Triggers', () => {
    test('should trigger take profit and adjust stop loss when price reaches level', async () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      const events: any[] = [];
      let stopLossUpdated = false;
      let newStopLossPrice = 0;

      manager.onTakeProfitEvent((event) => {
        events.push(event);
        return Promise.resolve();
      });

      manager.setStopLossUpdateCallback(async (tokenMint, newStopLoss) => {
        stopLossUpdated = true;
        newStopLossPrice = newStopLoss;
      });

      // Update price to trigger first take profit level
      const triggerPrice = entryPrice * (1 + config.trading.takeProfit.levels[0].percentage / 100);
      manager.updatePrice(mockTokenMint, triggerPrice);

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(events).toHaveLength(2); // take_profit_triggered and stop_loss_adjusted
      expect(events[0].type).toBe('take_profit_triggered');
      expect(events[0].level).toBe(0);
      expect(events[0].sellAmount).toBe(position * config.trading.takeProfit.levels[0].sellPercentage / 100);

      expect(events[1].type).toBe('stop_loss_adjusted');
      expect(events[1].newStopLoss).toBe(entryPrice); // First level moves stop loss to break-even
      expect(stopLossUpdated).toBe(true);
      expect(newStopLossPrice).toBe(entryPrice);
    });

    test('should not trigger take profit when price is below level', () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      const events: any[] = [];

      manager.onTakeProfitEvent((event) => {
        events.push(event);
        return Promise.resolve();
      });

      // Update price below take profit level
      manager.updatePrice(mockTokenMint, entryPrice * 1.01);

      expect(events).toHaveLength(0);
    });

    test('should handle multiple take profit levels in sequence', async () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      const events: any[] = [];

      manager.onTakeProfitEvent((event) => {
        events.push(event);
        return Promise.resolve();
      });

      // Trigger first level
      const firstTriggerPrice = entryPrice * (1 + config.trading.takeProfit.levels[0].percentage / 100);
      manager.updatePrice(mockTokenMint, firstTriggerPrice);

      // Trigger second level
      const secondTriggerPrice = entryPrice * (1 + config.trading.takeProfit.levels[1].percentage / 100);
      manager.updatePrice(mockTokenMint, secondTriggerPrice);

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 0));

      const takeProfitEvents = events.filter(e => e.type === 'take_profit_triggered');
      expect(takeProfitEvents).toHaveLength(2);
      expect(takeProfitEvents[0].level).toBe(0);
      expect(takeProfitEvents[1].level).toBe(1);
    });
  });

  describe('Position Rebalancing', () => {
    test('should rebalance remaining position after partial sell', async () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      const events: any[] = [];

      manager.onTakeProfitEvent((event) => {
        events.push(event);
        return Promise.resolve();
      });

      // Trigger first take profit level
      const triggerPrice = entryPrice * (1 + config.trading.takeProfit.levels[0].percentage / 100);
      manager.updatePrice(mockTokenMint, triggerPrice);

      // Wait for events to be processed
      await new Promise(resolve => setTimeout(resolve, 0));

      const rebalanceEvent = events.find(e => e.type === 'position_rebalanced');
      expect(rebalanceEvent).toBeDefined();
      expect(rebalanceEvent.remainingPosition).toBeLessThan(position);

      // Check that remaining levels are rebalanced
      const levels = manager.getPositionLevels(mockTokenMint);
      const remainingLevels = levels?.filter(l => !l.triggered) || [];
      const expectedSellPercentage = 100 / remainingLevels.length;
      remainingLevels.forEach(level => {
        expect(Math.round(level.sellPercentage)).toBe(Math.round(expectedSellPercentage));
      });
    });
  });

  describe('Cleanup', () => {
    test('should clean up resources properly', () => {
      manager.initializePosition(mockTokenMint, entryPrice, position);
      manager.cleanup();
      
      const levels = manager.getPositionLevels(mockTokenMint);
      expect(levels).toBeNull();
    });
  });
});
