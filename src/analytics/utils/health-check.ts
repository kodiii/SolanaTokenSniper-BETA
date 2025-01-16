import { PerformanceMetrics } from '../types';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'critical';
  issues: Array<{
    component: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: number;
  }>;
  lastCheck: number;
}

export function checkSystemHealth(metrics: PerformanceMetrics): HealthCheckResult {
  const issues: Array<{
    component: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
  }> = [];
  
  // Check memory usage
  if (metrics.resourceUsage.memoryUsage > 0.9) {
    issues.push({
      component: 'memory',
      issue: 'High memory usage',
      severity: 'high'
    });
  } else if (metrics.resourceUsage.memoryUsage > 0.7) {
    issues.push({
      component: 'memory',
      issue: 'Elevated memory usage',
      severity: 'medium'
    });
  }

  // Check operation performance
  metrics.operationStats.forEach((stats, operation) => {
    if (stats.errorRate > 0.1) {
      issues.push({
        component: operation,
        issue: `High error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
        severity: 'high'
      });
    } else if (stats.errorRate > 0.05) {
      issues.push({
        component: operation,
        issue: `Elevated error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
        severity: 'medium'
      });
    }
  });

  return {
    status: issues.some(i => i.severity === 'high') ? 'critical' :
           issues.length > 0 ? 'degraded' : 'healthy',
    issues: issues.map(i => ({ ...i, timestamp: Date.now() })),
    lastCheck: Date.now()
  };
}
