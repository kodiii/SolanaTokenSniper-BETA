import { PerformanceMetrics } from './types';

interface OperationStats {
  avgExecutionTime: number;
  successRate: number;
  errorRate: number;
  lastExecuted: number;
}

interface ExecutionTime {
  operation: string;
  duration: number;
  timestamp: number;
}

interface ResourceUsage {
  memoryUsage: number;
  cpuUsage: number;
  timestamp: number;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  lastCheck: number;
  issues: Array<{ component: string; issue: string; severity: 'low' | 'medium' | 'high'; timestamp: number }>;
}

interface Issue {
  component: string;
  issue: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

export class PerformanceMonitoringManager {
  private metrics: PerformanceMetrics;
  private readonly monitoringIntervals: NodeJS.Timeout[] = [];

  constructor() {
    this.metrics = {
      executionTimes: [] as ExecutionTime[],
      resourceUsage: {
        memoryUsage: 0,
        cpuUsage: 0,
        timestamp: Date.now()
      } as ResourceUsage,
      operationStats: new Map<string, OperationStats>(),
      systemHealth: {
        status: 'healthy',
        lastCheck: Date.now(),
        issues: [] as Issue[]
      } as SystemHealth
    };
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
    const issues: Array<{ component: string; issue: string; severity: 'low' | 'medium' | 'high' }> = [];
    
    // Check memory usage
    if (this.metrics.resourceUsage.memoryUsage > 0.9) {
      issues.push({
        component: 'memory',
        issue: 'High memory usage',
        severity: 'high'
      });
    }

    // Check operation performance
    this.metrics.operationStats.forEach((stats: OperationStats, operation: string) => {
      if (stats.errorRate > 0.1) {
        issues.push({
          component: operation,
          issue: `High error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
          severity: 'high'
        });
      }
    });

    // Update system health
    this.metrics.systemHealth = {
      status: issues.some(i => i.severity === 'high') ? 'critical' :
             issues.length > 0 ? 'degraded' : 'healthy',
      lastCheck: Date.now(),
      issues: issues.map(i => ({ ...i, timestamp: Date.now() }))
    };
  }

  public getMetrics(): PerformanceMetrics {
    return this.metrics;
  }
}
