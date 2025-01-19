import { Logger } from '../utils/logger';
import { ErrorClassifier, ClassifiedError } from '../utils/error-classifier';
import { config } from '../config';
import { PriceSource, PriceValidationResult } from './types';
import { performValidationChecks } from './validators/price-validation-checks';

export class PriceValidator {
  private static instance: PriceValidator;
  private readonly logger: Logger;
  private readonly errorClassifier: ErrorClassifier;
  private priceHistory: Map<string, { price: number; timestamp: number }[]>;
  
  private constructor() {
    this.logger = Logger.getInstance();
    this.errorClassifier = ErrorClassifier.getInstance();
    this.priceHistory = new Map();
  }

  public static getInstance(): PriceValidator {
    if (!PriceValidator.instance) {
      PriceValidator.instance = new PriceValidator();
    }
    return PriceValidator.instance;
  }

  /**
   * Validates price data from multiple sources
   */
  public async validatePrice(
    tokenMint: string,
    priceSources: PriceSource[]
  ): Promise<PriceValidationResult> {
    try {
      // Filter out null prices
      const validPrices = priceSources.filter(
        (source): source is PriceSource & { price: number } => 
          source.price !== null && !isNaN(source.price) && source.price > 0
      );

      if (validPrices.length === 0) {
        return {
          isValid: false,
          reason: 'No valid prices available from any source'
        };
      }

      // Sort by confidence
      validPrices.sort((a, b) => b.confidence - a.confidence);

      // Get historical prices for volatility check
      const history = this.priceHistory.get(tokenMint) || [];
      
      // Calculate weighted average price
      const weightedPrice = this.calculateWeightedPrice(validPrices);
      
      // Perform validation checks
      const validationResult = performValidationChecks(
        tokenMint,
        weightedPrice,
        validPrices,
        history
      );

      // Update price history
      if (validationResult.isValid) {
        this.updatePriceHistory(tokenMint, weightedPrice);
      }

      return validationResult;
    } catch (error) {
      const classifiedError = this.errorClassifier.classifyError(
        error as Error,
        'PriceValidator',
        'validatePrice',
        { 
          sources: priceSources.map(s => s.name).join(','),
          timestamp: Date.now()
        }
      );
      
      await this.logger.error(
        'Price validation failed',
        classifiedError
      );

      return {
        isValid: false,
        reason: 'Price validation error'
      };
    }
  }

  /**
   * Calculate weighted average price based on source confidence
   */
  private calculateWeightedPrice(sources: PriceSource[]): number {
    const totalConfidence = sources.reduce((sum, source) => sum + source.confidence, 0);
    const weightedSum = sources.reduce(
      (sum, source) => sum + (source.price! * source.confidence),
      0
    );
    return weightedSum / totalConfidence;
  }

  /**
   * Update price history for a token
   */
  private updatePriceHistory(tokenMint: string, price: number): void {
    const maxHistoryItems = config.price.validation.max_history_items || 100;
    const history = this.priceHistory.get(tokenMint) || [];
    
    history.push({
      price,
      timestamp: Date.now()
    });

    // Keep only recent history
    if (history.length > maxHistoryItems) {
      history.shift();
    }

    this.priceHistory.set(tokenMint, history);
  }
}
