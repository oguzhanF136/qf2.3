import { create } from 'zustand'

interface Market {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  signal: 'LONG' | 'SHORT' | 'NEUTRAL'
}

interface AppState {
  markets: Market[]
  isConnected: boolean
  setMarkets: (markets: Market[]) => void
  setConnected: (connected: boolean) => void
  connect: () => void
  disconnect: () => void
}

export const useStore = create<AppState>((set, get) => ({
  markets: [],
  isConnected: false,
  setMarkets: (markets) => set({ markets }),
  setConnected: (isConnected) => set({ isConnected }),
  
  connect: () => {
    const ws = new WebSocket('wss://stream.binance.com:9443/ws');
    
    ws.onopen = () => {
      set({ isConnected: true });
      
      // Subscribe to market data for BTC/USDT and ETH/USDT
      const subscribeMessage = {
        method: "SUBSCRIBE",
        params: [
          "btcusdt@ticker",
          "ethusdt@ticker"
        ],
        id: 1
      };
      ws.send(JSON.stringify(subscribeMessage));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.e === '24hrTicker') {
          const currentMarkets = get().markets;
          const updatedMarkets = [...currentMarkets];
          
          const marketIndex = updatedMarkets.findIndex(m => m.symbol === data.s);
          const newMarket: Market = {
            symbol: data.s,
            price: parseFloat(data.c),
            change24h: parseFloat(data.P),
            volume24h: parseFloat(data.v),
            signal: Math.random() > 0.5 ? 'LONG' : 'SHORT'
          };

          if (marketIndex === -1) {
            updatedMarkets.push(newMarket);
          } else {
            updatedMarkets[marketIndex] = newMarket;
          }

          set({ markets: updatedMarkets });
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      set({ isConnected: false });
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      set({ isConnected: false });
    };
  },

  disconnect: () => {
    set({ isConnected: false });
  }
})); 