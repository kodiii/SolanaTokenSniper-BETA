import { EventEmitter } from 'events';
import { config as baseConfig } from '../config';
import { deepMerge, isObject } from '../utils/object-utils';

export type ConfigPath = string[];
export type ConfigValue = unknown;
export type Environment = 'development' | 'staging' | 'production';
export type FeatureFlag = keyof typeof baseConfig.trading.featureFlags;

export interface ConfigUpdate {
  path: ConfigPath;
  value: ConfigValue;
  source: string;
  timestamp: number;
}

export interface ConfigEvent {
  type: 'update' | 'reload' | 'validate';
  path?: ConfigPath;
  oldValue?: ConfigValue;
  newValue?: ConfigValue;
  timestamp: number;
}

export class ConfigurationManager extends EventEmitter {
  private config: typeof baseConfig;
  private environment: Environment;
  private updateHistory: ConfigUpdate[];
  private validators: Map<string, (value: unknown) => boolean>;
  private static instance: ConfigurationManager;

  private constructor() {
    super();
    this.config = { ...baseConfig };
    this.environment = (process.env.NODE_ENV as Environment) || 'development';
    this.updateHistory = [];
    this.validators = new Map();
    this.initializeValidators();
  }

  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private initializeValidators() {
    // Add default validators
    this.addValidator('performance.max_concurrent_operations', 
      (value): value is number => typeof value === 'number' && value > 0 && value <= 10);
    
    this.addValidator('trading.stopLoss.dynamic.basePercentage',
      (value): value is number => typeof value === 'number' && value >= 1 && value <= 20);
    
    this.addValidator('trading.takeProfit.levels',
      (value): boolean => {
        if (!Array.isArray(value)) return false;
        return value.every(level => 
          typeof level === 'object' &&
          level !== null &&
          typeof level.percentage === 'number' && 
          typeof level.sellPercentage === 'number' &&
          typeof level.adjustStopLoss === 'boolean' &&
          level.percentage > 0 &&
          level.sellPercentage > 0 &&
          level.sellPercentage <= 100
        );
      });
  }

  public addValidator(path: string, validator: (value: unknown) => boolean): void {
    this.validators.set(path, validator);
  }

  private validateUpdate(path: ConfigPath, value: unknown): boolean {
    const pathStr = path.join('.');
    const validator = this.validators.get(pathStr);
    
    if (validator) {
      return validator(value);
    }
    
    // If no specific validator, perform basic type checking
    const currentValue = this.getConfigValue(path);
    return typeof value === typeof currentValue;
  }

  private getConfigValue(path: ConfigPath): unknown {
    let current: unknown = this.config;
    for (const key of path) {
      if (!isObject(current)) return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private setConfigValue(path: ConfigPath, value: unknown): void {
    let current: Record<string, unknown> = this.config;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!(key in current) || !isObject(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }
    current[path[path.length - 1]] = value;
  }

  public async updateConfig(path: ConfigPath, value: unknown, source: string): Promise<boolean> {
    if (!this.validateUpdate(path, value)) {
      throw new Error(`Invalid configuration update for path: ${path.join('.')}`);
    }

    const oldValue = this.getConfigValue(path);
    this.setConfigValue(path, value);

    const update: ConfigUpdate = {
      path,
      value,
      source,
      timestamp: Date.now()
    };

    this.updateHistory.push(update);

    const event: ConfigEvent = {
      type: 'update',
      path,
      oldValue,
      newValue: value,
      timestamp: Date.now()
    };

    this.emit('configUpdate', event);
    return true;
  }

  public getConfig(): Readonly<typeof baseConfig> {
    return Object.freeze({ ...this.config });
  }

  public getEnvironment(): Environment {
    return this.environment;
  }

  public getUpdateHistory(): ReadonlyArray<ConfigUpdate> {
    return [...this.updateHistory];
  }

  public async loadEnvironmentConfig(): Promise<void> {
    const envConfig = await this.loadConfigForEnvironment(this.environment);
    this.config = deepMerge(this.config, envConfig);
    
    this.emit('configUpdate', {
      type: 'reload',
      timestamp: Date.now()
    });
  }

  private async loadConfigForEnvironment(env: Environment): Promise<Partial<typeof baseConfig>> {
    try {
      const envConfig = require(`../config.${env}`).default;
      return envConfig;
    } catch (error) {
      console.warn(`No configuration found for environment: ${env}`);
      return {};
    }
  }

  public isFeatureEnabled(featureKey: FeatureFlag): boolean {
    return this.config.trading.featureFlags[featureKey] ?? false;
  }

  public cleanup(): void {
    this.updateHistory = [];
    this.removeAllListeners();
  }
}
