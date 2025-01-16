import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { Logger } from './logger';
import { ConnectionPool } from './connection-pool';
import { ErrorClassifier } from './errors';
import { EventEmitter } from 'events';

export interface WebSocketSubscription {
  id: number;
  type: 'account' | 'program' | 'signature' | 'slot';
  unsubscribe: () => void;
}

export interface WebSocketManagerConfig {
  maxReconnectAttempts: number;
  reconnectDelay: number;
  pingInterval: number;
  pongTimeout: number;
}

export class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager;
  private readonly logger: Logger;
  private readonly connectionPool: ConnectionPool;
  private subscriptions: Map<string, WebSocketSubscription> = new Map();
  private config: WebSocketManagerConfig;
  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;

  private constructor() {
    super();
    this.logger = Logger.getInstance();
    this.connectionPool = ConnectionPool.getInstance();
    this.config = {
      maxReconnectAttempts: config.websocket?.max_reconnect_attempts || 5,
      reconnectDelay: config.websocket?.reconnect_delay || 1000,
      pingInterval: config.websocket?.ping_interval || 30000,
      pongTimeout: config.websocket?.pong_timeout || 10000,
    };
    this.setupWebSocket();
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  private async setupWebSocket() {
    await this.connectionPool.withConnection(async (connection: Connection) => {
      try {
        // Start ping/pong heartbeat
        this.startHeartbeat();

        // Subscribe to slot updates for network status
        this.subscribeToSlotUpdates();

        this.logger.info('WebSocket connection established');
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'setupWebSocket');
        this.logger.error('Failed to setup WebSocket connection', classifiedError);
        this.handleConnectionError();
      }
    });
  }

  private startHeartbeat() {
    const pingInterval = setInterval(() => {
      if (!this.isReconnecting) {
        this.connectionPool.withConnection(async (connection: Connection) => {
          try {
            const pongTimeout = setTimeout(() => {
              this.logger.warn('WebSocket pong timeout');
              this.handleConnectionError();
            }, this.config.pongTimeout);

            // Get slot as ping
            await connection.getSlot();
            clearTimeout(pongTimeout);
          } catch (error) {
            const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'startHeartbeat');
            this.logger.error('WebSocket heartbeat failed', classifiedError);
            this.handleConnectionError();
          }
        });
      }
    }, this.config.pingInterval);

    // Cleanup on process exit
    process.on('SIGINT', () => {
      clearInterval(pingInterval);
      this.cleanup();
    });
  }

  private handleConnectionError() {
    this.reconnectAttempts++;
    if (this.reconnectAttempts <= this.config.maxReconnectAttempts) {
      this.logger.info('Attempting to reconnect', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });
      setTimeout(() => {
        this.setupWebSocket();
      }, this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1));
    } else {
      const error = ErrorClassifier.classifyError(
        new Error('Max reconnection attempts reached'),
        'WebSocketManager',
        'handleConnectionError',
        {
          attempts: this.reconnectAttempts,
          maxAttempts: this.config.maxReconnectAttempts
        }
      );
      this.logger.error('Max reconnection attempts reached', error);
      this.emit('connection_failed');
    }
  }

  private async handleSubscriptionError(error: unknown, context: string, metadata?: Record<string, unknown>) {
    const classifiedError = ErrorClassifier.classifyError(
      error instanceof Error ? error : new Error(String(error)),
      'WebSocketManager',
      context,
      { ...metadata }
    );
    await this.logger.error('WebSocket subscription error', classifiedError);
  }

  private async handleWebSocketError(error: unknown, context: string, metadata?: Record<string, unknown>) {
    const classifiedError = ErrorClassifier.classifyError(
      error instanceof Error ? error : new Error(String(error)),
      'WebSocketManager',
      context
    );
    await this.logger.error('WebSocket error', classifiedError, metadata);
  }

  public async subscribeToAccountUpdates(accountPublicKey: PublicKey, callback: (accountInfo: any) => void): Promise<string> {
    return await this.connectionPool.withConnection(async (connection: Connection) => {
      try {
        const subscriptionId = connection.onAccountChange(
          accountPublicKey,
          (accountInfo) => {
            callback(accountInfo);
          },
          'confirmed'
        );

        const key = `account:${accountPublicKey.toBase58()}`;
        this.subscriptions.set(key, {
          id: subscriptionId,
          type: 'account',
          unsubscribe: () => connection.removeAccountChangeListener(subscriptionId)
        });

        return key;
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'subscribeToAccountUpdates');
        this.logger.error('Failed to subscribe to account updates', classifiedError);
        throw error;
      }
    });
  }

  public async subscribeToProgramLogs(programId: PublicKey, callback: (logs: string[]) => void): Promise<string> {
    return await this.connectionPool.withConnection(async (connection: Connection) => {
      try {
        const subscriptionId = connection.onLogs(
          programId,
          (logs) => {
            callback(logs.logs);
          },
          'confirmed'
        );

        const key = `program:${programId.toBase58()}`;
        this.subscriptions.set(key, {
          id: subscriptionId,
          type: 'program',
          unsubscribe: () => connection.removeOnLogsListener(subscriptionId)
        });

        return key;
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'subscribeToProgramLogs');
        this.logger.error('Failed to subscribe to program logs', classifiedError);
        throw error;
      }
    });
  }

  private async subscribeToSlotUpdates() {
    await this.connectionPool.withConnection(async (connection: Connection) => {
      try {
        const subscriptionId = connection.onSlotChange((slotInfo) => {
          this.emit('slot_update', slotInfo);
        });

        const key = 'slot:updates';
        this.subscriptions.set(key, {
          id: subscriptionId,
          type: 'slot',
          unsubscribe: () => connection.removeSlotChangeListener(subscriptionId)
        });
      } catch (error) {
        await this.handleWebSocketError(error, 'subscribeToSlotUpdates');
      }
    });
  }

  public async subscribeToSignatureStatus(signature: string, callback: (status: any) => void): Promise<string> {
    return await this.connectionPool.withConnection(async (connection: Connection) => {
      try {
        const subscriptionId = connection.onSignature(
          signature,
          (status) => {
            callback(status);
            // Auto-unsubscribe after receiving the status
            this.unsubscribe(`signature:${signature}`);
          },
          'confirmed'
        );

        const key = `signature:${signature}`;
        this.subscriptions.set(key, {
          id: subscriptionId,
          type: 'signature',
          unsubscribe: () => connection.removeSignatureListener(subscriptionId)
        });

        return key;
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'subscribeToSignatureStatus');
        this.logger.error('Failed to subscribe to signature status', classifiedError);
        throw error;
      }
    });
  }

  public async unsubscribe(subscriptionKey: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionKey);
    if (subscription) {
      try {
        subscription.unsubscribe();
        this.subscriptions.delete(subscriptionKey);
        await this.logger.debug('Unsubscribed from subscription', {
          subscriptionType: subscription.type,
          subscriptionId: subscriptionKey
        });
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'unsubscribe', {
          subscriptionKey: subscriptionKey
        });
        this.logger.error('Failed to unsubscribe from subscription', classifiedError);
      }
    }
  }

  public getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  private cleanup() {
    for (const [key, subscription] of this.subscriptions) {
      try {
        subscription.unsubscribe();
        this.subscriptions.delete(key);
      } catch (error) {
        const classifiedError = ErrorClassifier.classifyError(error, 'WebSocketManager', 'cleanup', {
          subscriptionKey: key
        });
        this.logger.error('Failed to cleanup subscription', classifiedError);
      }
    }
  }
}

// Export singleton instance
export const webSocketManager = WebSocketManager.getInstance();
