import { Connection } from '@solana/web3.js';
import { ClassifiedError } from '../errors';

export interface PooledConnection {
  connection: Connection;
  endpoint: string;
  lastUsed: number;
  inUse: boolean;
  errorCount: number;
  successCount: number;
  avgResponseTime: number;
}

export interface PoolConfig {
  minConnections: number;
  maxConnections: number;
  connectionTTL: number;
  idleTimeout: number;
  healthCheckInterval: number;
  retryDelay: number;
}

// Define RequestInfo type if not available
export type RequestInfo = string | URL | Request;

// Type guards
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function isClassifiedError(error: unknown): error is ClassifiedError {
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function isRecord(obj: unknown): obj is Record<string, any> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}
