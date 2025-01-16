export interface TrendResult {
  direction: 'up' | 'down' | 'sideways';
  strength: number;
}

export function calculateTrend(prices: number[]): TrendResult {
  if (prices.length < 2) return { direction: 'sideways', strength: 0 };

  const changes = prices.slice(1).map((price, i) => price - prices[i]);
  const totalChange = changes.reduce((sum, change) => sum + change, 0);
  const avgChange = totalChange / changes.length;
  const strength = Math.abs(avgChange) / prices[0]; // Normalized strength

  if (strength < 0.01) return { direction: 'sideways', strength };
  return {
    direction: avgChange > 0 ? 'up' : 'down',
    strength
  };
}

export function analyzeTrends(
  priceHistory: Array<{ price: number; timestamp: number }>,
  shortTermWindow: number = 3600000, // 1 hour
  longTermWindow: number = 86400000 // 24 hours
): { shortTerm: TrendResult; longTerm: TrendResult } {
  const now = Date.now();
  
  // Short-term trend analysis
  const shortTermPrices = priceHistory
    .filter(h => h.timestamp > now - shortTermWindow)
    .map(h => h.price);
  const shortTermTrend = calculateTrend(shortTermPrices);

  // Long-term trend analysis
  const longTermPrices = priceHistory
    .filter(h => h.timestamp > now - longTermWindow)
    .map(h => h.price);
  const longTermTrend = calculateTrend(longTermPrices);

  return {
    shortTerm: shortTermTrend,
    longTerm: longTermTrend
  };
}
