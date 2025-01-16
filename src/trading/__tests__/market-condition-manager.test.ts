import { PublicKey } from '@solana/web3.js';
import { MarketConditionManager, MarketConditionEvent } from '../market-condition-manager';
import { config } from '../../config';

describe('MarketConditionManager', () => {
  let manager: MarketConditionManager;
  const mockTokenMint = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  beforeEach(() => {
    manager = new MarketConditionManager();
    manager.initializeTracking(mockTokenMint);
  });

  describe('Initialization', () => {
    test('should initialize with default state', () => {
      const state = manager.getMarketState(mockTokenMint);
      
      expect(state).toBeDefined();
      expect(state?.congestionLevel).toBe('low');
      expect(state?.volumeLevel).toBe('medium');
      expect(state?.volatilityLevel).toBe('low');
    });
  });

  describe('Condition Updates', () => {
    test('should update market conditions correctly', () => {
      manager.updateConditions({
        tokenMint: mockTokenMint,
        congestion: config.trading.marketConditions.thresholds.congestion.high + 100,
        volume: config.trading.marketConditions.thresholds.volume.high + 100,
        volatility: config.trading.marketConditions.thresholds.volatility.high + 1,
        timestamp: Date.now()
      });

      const state = manager.getMarketState(mockTokenMint);
      expect(state?.congestionLevel).toBe('high');
      expect(state?.volumeLevel).toBe('high');
      expect(state?.volatilityLevel).toBe('high');
    });

    test('should not emit event for small changes', async () => {
      const events: MarketConditionEvent[] = [];
      manager.onMarketConditionEvent(async (event) => {
        events.push(event);
      });

      await manager.updateConditions({
        tokenMint: mockTokenMint,
        congestion: 400, // low congestion level
        volume: 45000, // medium volume level
        volatility: 0.02, // low volatility level
        timestamp: Date.now()
      });

      expect(events).toHaveLength(0);
    });
  });

  describe('Trading Adjustments', () => {
    test('should calculate correct adjustments for high risk conditions', () => {
      manager.updateConditions({
        tokenMint: mockTokenMint,
        congestion: config.trading.marketConditions.thresholds.congestion.high + 100,
        volume: config.trading.marketConditions.thresholds.volume.low - 100,
        volatility: config.trading.marketConditions.thresholds.volatility.high + 1,
        timestamp: Date.now()
      });

      const state = manager.getMarketState(mockTokenMint);
      const expectedStopLoss = 
        config.trading.marketConditions.adjustments.highCongestion.stopLossIncrease +
        config.trading.marketConditions.adjustments.lowVolume.stopLossIncrease +
        config.trading.marketConditions.adjustments.highVolatility.stopLossIncrease;

      expect(state?.adjustments.stopLossIncrease).toBe(expectedStopLoss);
    });
  });

  describe('State Management', () => {
    test('should cleanup old data', () => {
      const oldTimestamp = Date.now() - (1000 * 60 * 60 * 24); // 1 day ago
      
      manager.updateConditions({
        tokenMint: mockTokenMint,
        congestion: 400,
        volume: 50000,
        volatility: 2,
        timestamp: oldTimestamp
      });

      manager.cleanup();
      expect(manager.getMarketState(mockTokenMint)).toBeNull();
    });
  });
});
