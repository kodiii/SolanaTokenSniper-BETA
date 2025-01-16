import { PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { EventEmitter } from 'events';

interface MarketMetrics {
  congestion: number;      // Network congestion in ms
  volume: number;          // Trading volume in SOL
  volatility: number;      // Price volatility percentage
  lastUpdate: number;
}

interface MarketState {
  congestionLevel: 'low' | 'medium' | 'high';
  volumeLevel: 'low' | 'medium' | 'high';
  volatilityLevel: 'low' | 'medium' | 'high';
  adjustments: {
    stopLossIncrease: number;
    takeProfitIncrease: number;
    slippageIncrease: number;
  };
}

interface MarketUpdate {
  tokenMint: PublicKey;
  congestion?: number;
  volume?: number;
  volatility?: number;
  timestamp: number;
}

export interface MarketConditionEvent {
  type: 'condition_changed' | 'adjustment_updated';
  tokenMint: PublicKey;
  oldState?: MarketState;
  newState: MarketState;
  timestamp: number;
}

export type MarketConditionEventHandler = (event: MarketConditionEvent) => Promise<void>;

export class MarketConditionManager extends EventEmitter {
  private metrics: Map<string, MarketMetrics>;
  private states: Map<string, MarketState>;
  private eventHandlers: MarketConditionEventHandler[];
  private updateInterval: NodeJS.Timeout | null;

  constructor() {
    super();
    this.metrics = new Map();
    this.states = new Map();
    this.eventHandlers = [];
    this.updateInterval = null;
    this.startUpdateInterval();
  }

  /**
   * Initialize tracking for a new token
   */
  public initializeTracking(tokenMint: PublicKey): void {
    const metrics: MarketMetrics = {
      congestion: 0,
      volume: 0,
      volatility: 0,
      lastUpdate: Date.now()
    };

    const state: MarketState = {
      congestionLevel: 'low',
      volumeLevel: 'medium',
      volatilityLevel: 'low',
      adjustments: {
        stopLossIncrease: 0,
        takeProfitIncrease: 0,
        slippageIncrease: 0
      }
    };

    this.metrics.set(tokenMint.toBase58(), metrics);
    this.states.set(tokenMint.toBase58(), state);
  }

  /**
   * Update market conditions
   */
  public async updateConditions(update: MarketUpdate): Promise<void> {
    const metrics = this.metrics.get(update.tokenMint.toBase58());
    const state = this.states.get(update.tokenMint.toBase58());
    
    if (!metrics || !state) return;

    // Update metrics
    if (update.congestion !== undefined) metrics.congestion = update.congestion;
    if (update.volume !== undefined) metrics.volume = update.volume;
    if (update.volatility !== undefined) metrics.volatility = update.volatility;
    metrics.lastUpdate = update.timestamp;

    // Calculate new state
    const newState = this.calculateMarketState(metrics);
    const adjustments = this.calculateAdjustments(newState);

    // Check if state changed significantly
    if (this.hasSignificantChange(state, newState)) {
      const oldState = { ...state };
      
      // Update state
      state.congestionLevel = newState.congestionLevel;
      state.volumeLevel = newState.volumeLevel;
      state.volatilityLevel = newState.volatilityLevel;
      state.adjustments = adjustments;

      // Emit event
      await this.emitEvent({
        type: 'condition_changed',
        tokenMint: update.tokenMint,
        oldState,
        newState: { ...state },
        timestamp: update.timestamp
      });
    }
  }

  /**
   * Calculate market state based on metrics
   */
  private calculateMarketState(metrics: MarketMetrics): MarketState {
    const { congestion, volume, volatility } = metrics;
    const { thresholds } = config.trading.marketConditions;

    return {
      congestionLevel: 
        congestion >= thresholds.congestion.high ? 'high' :
        congestion >= thresholds.congestion.medium ? 'medium' : 'low',
      
      volumeLevel:
        volume >= thresholds.volume.high ? 'high' :
        volume <= thresholds.volume.low ? 'low' : 'medium',
      
      volatilityLevel:
        volatility >= thresholds.volatility.high ? 'high' :
        volatility >= thresholds.volatility.medium ? 'medium' : 'low',
      
      adjustments: { stopLossIncrease: 0, takeProfitIncrease: 0, slippageIncrease: 0 }
    };
  }

  /**
   * Calculate trading adjustments based on market state
   */
  private calculateAdjustments(state: MarketState) {
    const { adjustments } = config.trading.marketConditions;
    let result = {
      stopLossIncrease: 0,
      takeProfitIncrease: 0,
      slippageIncrease: 0
    };

    // Apply congestion adjustments
    if (state.congestionLevel === 'high') {
      result.stopLossIncrease += adjustments.highCongestion.stopLossIncrease;
      result.takeProfitIncrease += adjustments.highCongestion.takeProfitIncrease;
      result.slippageIncrease += adjustments.highCongestion.slippageIncrease;
    }

    // Apply volume adjustments
    if (state.volumeLevel === 'low') {
      result.stopLossIncrease += adjustments.lowVolume.stopLossIncrease;
      result.takeProfitIncrease += adjustments.lowVolume.takeProfitIncrease;
      result.slippageIncrease += adjustments.lowVolume.slippageIncrease;
    }

    // Apply volatility adjustments
    if (state.volatilityLevel === 'high') {
      result.stopLossIncrease += adjustments.highVolatility.stopLossIncrease;
      result.takeProfitIncrease += adjustments.highVolatility.takeProfitIncrease;
      result.slippageIncrease += adjustments.highVolatility.slippageIncrease;
    }

    return result;
  }

  /**
   * Check if market state changed significantly
   */
  private hasSignificantChange(oldState: MarketState, newState: MarketState): boolean {
    return oldState.congestionLevel !== newState.congestionLevel ||
           oldState.volumeLevel !== newState.volumeLevel ||
           oldState.volatilityLevel !== newState.volatilityLevel;
  }

  /**
   * Get current market state for a token
   */
  public getMarketState(tokenMint: PublicKey): MarketState | null {
    return this.states.get(tokenMint.toBase58()) || null;
  }

  /**
   * Register an event handler
   */
  public onMarketConditionEvent(handler: MarketConditionEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Emit an event to all registered handlers
   */
  private async emitEvent(event: MarketConditionEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in market condition event handler:', error);
      }
    }
    this.emit(event.type, event);
  }

  /**
   * Start the update interval for periodic checks
   */
  private startUpdateInterval(): void {
    if (this.updateInterval) return;
    
    this.updateInterval = setInterval(() => {
      const now = Date.now();
      this.metrics.forEach((metrics, tokenMint) => {
        if (now - metrics.lastUpdate > 300000) { // 5 minutes
          // Clear stale metrics
          this.metrics.delete(tokenMint);
          this.states.delete(tokenMint);
        }
      });
    }, 300000); // Check every 5 minutes
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.metrics.clear();
    this.states.clear();
    this.eventHandlers = [];
  }
}
