import Binance from 'binance-api-node';

// Tip tanımlamaları
type BinanceClient = ReturnType<typeof Binance>;

interface Candle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closeTime: number;
  quoteVolume: string;
  trades: number;
  baseAssetVolume: string;
  quoteAssetVolume: string;
}

interface DailyStats {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  weightedAvgPrice: string;
  prevClosePrice: string;
  lastPrice: string;
  lastQty: string;
  bidPrice: string;
  askPrice: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
  firstId: number;
  lastId: number;
  count: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  signal: 'LONG' | 'SHORT' | 'NEUTRAL';
  chartData: { time: string; price: number }[];
}

// Initialize Binance client
const client: BinanceClient = Binance();

export async function getMarketData(symbols: string[]): Promise<MarketData[]> {
  try {
    const marketData: MarketData[] = [];

    for (const symbol of symbols) {
      // Get 24h ticker data
      const ticker = await client.dailyStats({ symbol }) as DailyStats;
      
      // Get candlestick data for chart
      const candles = await client.candles({
        symbol,
        interval: '1h',
        limit: 24,
      }) as Candle[];

      // Calculate technical indicators
      const prices = candles.map((c: Candle) => parseFloat(c.close));
      const sma20 = calculateSMA(prices, 20);
      const lastPrice = parseFloat(ticker.lastPrice);
      const signal = determineSignal(lastPrice, sma20);

      marketData.push({
        symbol,
        price: lastPrice,
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        signal,
        chartData: candles.map((candle: Candle) => ({
          time: new Date(candle.closeTime).toLocaleTimeString(),
          price: parseFloat(candle.close),
        })),
      });
    }

    return marketData;
  } catch (error) {
    console.error('Error fetching market data:', error);
    throw error;
  }
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function determineSignal(price: number, sma: number): 'LONG' | 'SHORT' | 'NEUTRAL' {
  const threshold = 0.01; // 1% threshold for signal
  const diff = (price - sma) / sma;

  if (diff > threshold) return 'LONG';
  if (diff < -threshold) return 'SHORT';
  return 'NEUTRAL';
}

export async function connectToBinance(apiKey: string, apiSecret: string): Promise<boolean> {
  try {
    const authenticatedClient: BinanceClient = Binance({
      apiKey,
      apiSecret,
    });

    await authenticatedClient.accountInfo();
    return true;
  } catch (error) {
    console.error('Error connecting to Binance:', error);
    return false;
  }
}
