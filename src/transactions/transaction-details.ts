import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { Logger } from '../utils/logger';
import { ErrorClassifier } from '../utils/error-classifier';

const logger = Logger.getInstance();
const errorClassifier = ErrorClassifier.getInstance();

async function fetchTransactionDetails(
  connection: Connection,
  signature: string
): Promise<any> {
  try {
    const transaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      throw new Error(`Transaction ${signature} not found`);
    }

    return transaction;
  } catch (error) {
    const classifiedError = errorClassifier.classifyError(
      error as Error,
      'transactions',
      'fetchTransactionDetails',
      { signature }
    );

    await logger.error(
      'Failed to fetch transaction details',
      classifiedError,
      { signature }
    );
    throw error;
  }
}

async function fetchAndSaveSwapDetails(
  connection: Connection,
  signature: string
): Promise<void> {
  try {
    const transaction = await fetchTransactionDetails(connection, signature);
    // TODO: Implement saving swap details to database
    await logger.info('Swap details saved', {
      signature,
      timestamp: transaction.blockTime
    });
  } catch (error) {
    const classifiedError = errorClassifier.classifyError(
      error as Error,
      'transactions',
      'fetchAndSaveSwapDetails',
      { signature }
    );

    await logger.error(
      'Failed to fetch and save swap details',
      classifiedError,
      { signature }
    );
    throw error;
  }
}

export const TransactionDetails = {
  fetchTransactionDetails,
  fetchAndSaveSwapDetails
};
