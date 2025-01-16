import { Connection } from '@solana/web3.js';
import { NetworkMetrics } from './types';

export class NetworkMetricsManager {
  private metrics: NetworkMetrics;
  private connection: Connection | null = null;

  constructor() {
    this.metrics = {
      avgSlotTime: 0,
      congestionLevel: 'Low',
      recentSlots: [],
      lastUpdated: Date.now()
    };
  }

  public setConnection(connection: Connection) {
    this.connection = connection;
  }

  public async updateMetrics(currentSlot: number) {
    if (!this.connection) return;

    const now = Date.now();
    this.metrics.recentSlots.push({ slot: currentSlot, timestamp: now });

    // Keep only last 100 slots
    if (this.metrics.recentSlots.length > 100) {
      this.metrics.recentSlots.shift();
    }

    // Calculate average slot time
    if (this.metrics.recentSlots.length > 1) {
      const timeDeltas: number[] = [];
      for (let i = 1; i < this.metrics.recentSlots.length; i++) {
        const timeDelta = this.metrics.recentSlots[i].timestamp - this.metrics.recentSlots[i-1].timestamp;
        timeDeltas.push(timeDelta);
      }
      this.metrics.avgSlotTime = timeDeltas.reduce((a, b) => a + b, 0) / timeDeltas.length;

      // Update congestion level
      if (this.metrics.avgSlotTime < 500) { // Less than 500ms per slot
        this.metrics.congestionLevel = 'Low';
      } else if (this.metrics.avgSlotTime < 1000) { // Less than 1s per slot
        this.metrics.congestionLevel = 'Medium';
      } else {
        this.metrics.congestionLevel = 'High';
      }
    }

    this.metrics.lastUpdated = now;
  }

  public getMetrics(): NetworkMetrics {
    return this.metrics;
  }

  public isGoodTimeToTrade(): boolean {
    return this.metrics.congestionLevel !== 'High' && 
           this.metrics.avgSlotTime < 800;
  }
}
