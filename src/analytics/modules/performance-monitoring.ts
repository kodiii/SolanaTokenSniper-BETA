import { PerformanceMetrics } from '../types';
import { checkSystemHealth } from '../utils/health-check';

export class PerformanceMonitoringModule {
  private metrics: PerformanceMetrics;
  private readonly monitoringIntervals: NodeJS.Timeout[] = [];

  constructor(initialMetrics: PerformanceMetrics) {
    this.metrics = initialMetrics;
    this.startMonitoring();
  }

  private startMonitoring() {
    this.monitoringIntervals.push(
      setInterval(() => this.updateResourceUsage(), 60000), // Update every minute
      setInterval(() => this.checkSystemHealth(), 300000)   // Check health every 5 minutes
    );
  }

  public cleanup() {
    this.monitoringIntervals.forEach(interval => clearInterval(interval));
  }

  public trackOperation(operation: string, duration: number) {
    const { executionTimes, operationStats } = this.metrics;
    const now = Date.now();

    // Record execution time
    executionTimes.push({ operation, duration, timestamp: now });
    if (executionTimes.length > 1000) executionTimes.shift(); // Keep last 1000 operations

    // Update operation stats
    let stats = operationStats.get(operation) || {
      avgExecutionTime: 0,
      successRate: 1,
      errorRate: 0,
      lastExecuted: now
    };

    const oldAvg = stats.avgExecutionTime;
    const count = executionTimes.filter(t => t.operation === operation).length;
    stats.avgExecutionTime = (oldAvg * (count - 1) + duration) / count;
    stats.lastExecuted = now;

    operationStats.set(operation, stats);
  }

  private updateResourceUsage() {
    const used = process.memoryUsage();
    this.metrics.resourceUsage = {
      memoryUsage: used.heapUsed / used.heapTotal,
      cpuUsage: 0, // Would need external monitoring for accurate CPU usage
      timestamp: Date.now()
    };
  }

  private checkSystemHealth() {
    this.metrics.systemHealth = checkSystemHealth(this.metrics);
  }

  public getMetrics(): PerformanceMetrics {
    return this.metrics;
  }
}
