import { 
  Connection, 
  Transaction, 
  TransactionSignature, 
  SendTransactionError, 
  VersionedTransaction,
  TransactionMessage,
  VersionedMessage,
  MessageV0,
  TransactionConfirmationStrategy,
  Commitment
} from '@solana/web3.js';
import { Logger } from '../utils/logger';
import { ErrorClassifier, ClassifiedError } from '../utils/error-classifier';
import { withRetry, RetryOptions, RetryError } from '../utils/retry';
import { config } from '../config';

interface TransactionRetryContext {
  signature?: string;
  slot?: number;
  status?: string;
  error?: Error;
  lastValidBlockHeight?: number;
  retryCount: number;
}

interface LogContext {
  error?: ClassifiedError;
  additionalInfo?: Record<string, any>;
}

export class TransactionRetryManager {
  private static instance: TransactionRetryManager;
  private readonly logger: Logger;
  private readonly errorClassifier: ErrorClassifier;

  private constructor() {
    this.logger = Logger.getInstance();
    this.errorClassifier = ErrorClassifier.getInstance();
  }

  public static getInstance(): TransactionRetryManager {
    if (!TransactionRetryManager.instance) {
      TransactionRetryManager.instance = new TransactionRetryManager();
    }
    return TransactionRetryManager.instance;
  }

  /**
   * Convert legacy Transaction to VersionedTransaction
   */
  private async convertToVersionedTransaction(
    connection: Connection,
    transaction: Transaction
  ): Promise<VersionedTransaction> {
    // Get the latest blockhash
    const { blockhash, lastValidBlockHeight } = 
      await connection.getLatestBlockhash();
    
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;

    // Create a versioned message
    const messageV0 = new MessageV0({
      header: transaction.compileMessage().header,
      staticAccountKeys: transaction.compileMessage().accountKeys,
      recentBlockhash: transaction.recentBlockhash,
      compiledInstructions: transaction.compileMessage().compiledInstructions,
      addressTableLookups: []
    });
    
    // Create and return a new VersionedTransaction
    return new VersionedTransaction(messageV0);
  }

  /**
   * Send a transaction with retry mechanism
   */
  public async sendWithRetry(
    connection: Connection,
    transaction: Transaction | VersionedTransaction,
    maxRetries: number = config.tx.max_retries || 3
  ): Promise<TransactionSignature> {
    const retryOptions: RetryOptions = {
      maxRetries,
      backoff: 'exponential',
      delayMs: config.tx.retry_delay || 1000,
      retryableErrors: [
        /Transaction simulation failed/,
        /Transaction was not confirmed/,
        /Blockhash not found/,
        /Block height exceeded/,
        /insufficient funds/i,
        /Network congestion/i,
      ],
      onRetry: async (error, attempt) => {
        const context: TransactionRetryContext = {
          retryCount: attempt,
          error,
        };

        // If the error is due to an expired blockhash, get a new one
        if (error.message.includes('Blockhash not found')) {
          const { blockhash, lastValidBlockHeight } = 
            await connection.getLatestBlockhash();
          
          if (transaction instanceof Transaction) {
            transaction.recentBlockhash = blockhash;
            transaction.lastValidBlockHeight = lastValidBlockHeight;
          }
          context.lastValidBlockHeight = lastValidBlockHeight;
        }

        const logContext: LogContext = {
          additionalInfo: context
        };

        await this.logger.warn(
          'Transaction retry needed',
          logContext
        );
      },
      shouldRetry: (error: Error) => {
        // Don't retry if the error indicates a permanent failure
        if (
          error.message.includes('insufficient funds') ||
          error.message.includes('invalid account') ||
          error.message.includes('unauthorized')
        ) {
          return false;
        }
        return true;
      }
    };

    try {
      return await withRetry(
        async () => {
          // Convert to VersionedTransaction if needed
          const versionedTx = transaction instanceof Transaction 
            ? await this.convertToVersionedTransaction(connection, transaction)
            : transaction;

          const signature = await connection.sendTransaction(versionedTx);
          
          // Wait for confirmation
          const strategy: TransactionConfirmationStrategy = {
            signature,
            blockhash: versionedTx.message.recentBlockhash,
            lastValidBlockHeight: transaction instanceof Transaction
              ? transaction.lastValidBlockHeight!
              : (await connection.getLatestBlockhash()).lastValidBlockHeight
          };

          const confirmation = await connection.confirmTransaction(strategy);

          if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
          }

          const logContext: LogContext = {
            additionalInfo: {
              signature,
              slot: confirmation.context.slot,
              status: 'confirmed'
            }
          };

          await this.logger.info('Transaction confirmed', logContext);

          return signature;
        },
        retryOptions
      );
    } catch (error) {
      const classifiedError = this.errorClassifier.classifyError(
        error as Error,
        'TransactionRetryManager',
        'sendWithRetry',
        {
          attempts: (error as RetryError)?.stats?.attempts || 1,
          timestamp: Date.now()
        }
      );

      const logContext: LogContext = {
        error: classifiedError,
        additionalInfo: {
          transaction: transaction instanceof Transaction
            ? {
                recentBlockhash: transaction.recentBlockhash,
                instructions: transaction.instructions.length
              }
            : {
                version: transaction.version,
                messageSize: transaction.message.serialize().length
              }
        }
      };

      await this.logger.error(
        'Transaction failed permanently',
        classifiedError,
        {
          transaction: transaction instanceof Transaction
            ? {
                recentBlockhash: transaction.recentBlockhash,
                instructions: transaction.instructions.length
              }
            : {
                version: transaction.version,
                messageSize: transaction.message.serialize().length
              }
        }
      );

      throw error;
    }
  }
}
