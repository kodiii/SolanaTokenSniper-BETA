import { ConfigurationManager } from '../configuration-manager';
import type { FeatureFlag } from '../configuration-manager';

describe('ConfigurationManager', () => {
  let manager: ConfigurationManager;

  beforeEach(() => {
    manager = ConfigurationManager.getInstance();
  });

  afterEach(() => {
    manager.cleanup();
  });

  describe('Configuration Updates', () => {
    test('should update valid configuration values', async () => {
      const path = ['performance', 'max_concurrent_operations'];
      const newValue = 5;
      const source = 'test';

      const success = await manager.updateConfig(path, newValue, source);
      expect(success).toBe(true);

      const config = manager.getConfig();
      expect(config.performance.max_concurrent_operations).toBe(newValue);
    });

    test('should reject invalid configuration values', async () => {
      const path = ['performance', 'max_concurrent_operations'];
      const invalidValue = -1;
      const source = 'test';

      await expect(manager.updateConfig(path, invalidValue, source))
        .rejects.toThrow('Invalid configuration update');
    });

    test('should maintain update history', async () => {
      const path = ['trading', 'stopLoss', 'dynamic', 'basePercentage'];
      const newValue = 5;
      const source = 'test';

      await manager.updateConfig(path, newValue, source);
      const history = manager.getUpdateHistory();

      expect(history).toHaveLength(1);
      expect(history[0].path).toEqual(path);
      expect(history[0].value).toBe(newValue);
      expect(history[0].source).toBe(source);
    });
  });

  describe('Environment Management', () => {
    test('should load environment-specific configuration', async () => {
      process.env.NODE_ENV = 'development';
      await manager.loadEnvironmentConfig();

      const config = manager.getConfig();
      expect(config.rpc.endpoints).toContain('https://api.devnet.solana.com');
    });

    test('should get current environment', () => {
      process.env.NODE_ENV = 'production';
      expect(manager.getEnvironment()).toBe('production');
    });
  });

  describe('Feature Flags', () => {
    test('should check if feature is enabled', async () => {
      const config = manager.getConfig();
      const featureKey: FeatureFlag = 'dynamicStopLoss';

      expect(manager.isFeatureEnabled(featureKey))
        .toBe(config.trading.featureFlags[featureKey]);
    });

    test('should handle unknown feature flags safely', () => {
      // Using type assertion to test invalid feature flag
      expect(manager.isFeatureEnabled('nonexistentFeature' as FeatureFlag)).toBe(false);
      
      // Test a valid feature flag for comparison
      expect(manager.isFeatureEnabled('dynamicStopLoss')).toBeDefined();
    });
  });

  describe('Event Handling', () => {
    test('should emit events on configuration updates', async () => {
      const path = ['trading', 'takeProfit', 'enabled'];
      const newValue = false;
      const source = 'test';

      const eventPromise = new Promise(resolve => {
        manager.once('configUpdate', event => {
          expect(event.type).toBe('update');
          expect(event.path).toEqual(path);
          expect(event.newValue).toBe(newValue);
          resolve(true);
        });
      });

      await manager.updateConfig(path, newValue, source);
      await eventPromise;
    });

    test('should emit reload events when loading environment config', async () => {
      const eventPromise = new Promise(resolve => {
        manager.once('configUpdate', event => {
          expect(event.type).toBe('reload');
          resolve(true);
        });
      });

      await manager.loadEnvironmentConfig();
      await eventPromise;
    });
  });

  describe('Validation', () => {
    test('should validate take-profit levels', async () => {
      const path = ['trading', 'takeProfit', 'levels'];
      const validLevels = [
        { percentage: 10, sellPercentage: 30, adjustStopLoss: true },
        { percentage: 20, sellPercentage: 40, adjustStopLoss: true }
      ];
      const invalidLevels = [
        { percentage: -10, sellPercentage: 30, adjustStopLoss: true },
        { percentage: 20, sellPercentage: 150, adjustStopLoss: true }
      ];

      await expect(manager.updateConfig(path, validLevels, 'test'))
        .resolves.toBe(true);

      await expect(manager.updateConfig(path, invalidLevels, 'test'))
        .rejects.toThrow('Invalid configuration update');
    });

    test('should validate stop-loss parameters', async () => {
      const path = ['trading', 'stopLoss', 'dynamic', 'basePercentage'];
      
      await expect(manager.updateConfig(path, 5, 'test'))
        .resolves.toBe(true);

      await expect(manager.updateConfig(path, 25, 'test'))
        .rejects.toThrow('Invalid configuration update');
    });
  });
});
