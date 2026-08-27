export interface FxRate {
  rate: number;
  date: string;
  base: string;
  quote: string;
  fetchedAt: number;
}

let cachedRate: FxRate | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function getUsdToInrRate(): Promise<FxRate | null> {
  const now = Date.now();
  if (cachedRate && (now - cachedRate.fetchedAt < TTL_MS)) {
    return cachedRate;
  }

  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/INR');
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.rates && data.rates.INR) {
      cachedRate = {
        rate: data.rates.INR,
        date: data.date || new Date().toISOString().split('T')[0],
        base: 'USD',
        quote: 'INR',
        fetchedAt: now
      };
      return cachedRate;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export function __clearCacheForTesting() {
  cachedRate = null;
}
