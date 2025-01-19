import { Logger } from '../utils/logger';
import { ErrorClassifier } from '../utils/error-classifier';
import { config } from '../config';

const logger = Logger.getInstance();
const errorClassifier = ErrorClassifier.getInstance();

export async function getRugCheckConfirmed(
  tokenMint: string
): Promise<boolean> {
  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`);

    if (!response.ok) {
      throw new Error(`RugCheck API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // TODO: Implement proper scoring logic based on rugcheck response
    return true; // Placeholder - implement actual logic
  } catch (error) {
    const classifiedError = errorClassifier.classifyError(
      error as Error,
      'rugcheck',
      'getRugCheckConfirmed',
      { tokenMint }
    );

    await logger.error(
      'Failed to check token with RugCheck',
      classifiedError,
      { tokenMint }
    );
    
    // Default to false if we can't verify
    return false;
  }
}
