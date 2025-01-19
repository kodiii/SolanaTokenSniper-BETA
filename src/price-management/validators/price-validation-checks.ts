import { config } from '../../config';
import { PriceSource, PriceValidationResult } from '../types';

export function checkPriceDeviation(sources: PriceSource[], maxDeviation: number): boolean {
  if (sources.length < 2) return false;

  const prices = sources.map(s => s.price!);
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  
  return (maxPrice - minPrice) / minPrice > maxDeviation;
}

export function performValidationChecks(
  tokenMint: string,
  currentPrice: number,
  sources: PriceSource[],
  history: { price: number; timestamp: number }[]
): PriceValidationResult {
  // Check price deviation between sources
  const maxDeviation = config.price.validation.max_source_deviation || 0.1; // 10%
  const hasLargeDeviation = checkPriceDeviation(sources, maxDeviation);
  if (hasLargeDeviation) {
    return {
      isValid: false,
      reason: 'Large price deviation between sources'
    };
  }

  // Check for sudden price changes
  const maxPriceChange = config.price.validation.max_price_change || 0.2; // 20%
  if (history.length > 0) {
    const lastPrice = history[history.length - 1].price;
    const priceChange = Math.abs(currentPrice - lastPrice) / lastPrice;
    
    if (priceChange > maxPriceChange) {
      return {
        isValid: false,
        reason: 'Sudden large price change detected'
      };
    }
  }

  // Check for stale prices
  const maxAge = config.price.validation.max_price_age || 60000; // 1 minute
  const hasStalePrice = sources.every(
    source => Date.now() - source.timestamp > maxAge
  );
  
  if (hasStalePrice) {
    return {
      isValid: false,
      reason: 'All price sources are stale'
    };
  }

  return {
    isValid: true,
    adjustedPrice: currentPrice
  };
}
