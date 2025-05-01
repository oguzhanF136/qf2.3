'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { FiTrendingUp, FiTrendingDown, FiStar } from 'react-icons/fi'

interface MarketData {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  signal: 'LONG' | 'SHORT' | 'NEUTRAL'
  chartData: { time: string; price: number }[]
}

export default function Home() {
  const [markets, setMarkets] = useState<MarketData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('1h')

  useEffect(() => {
    // TODO: Implement real-time data fetching from Binance API
    const mockData: MarketData[] = [
      {
        symbol: 'BTCUSDT',
        price: 42000,
        change24h: 2.5,
        volume24h: 1500000000,
        signal: 'LONG',
        chartData: Array.from({ length: 24 }, (_, i) => ({
          time: `${i}:00`,
          price: 42000 + Math.random() * 1000 - 500,
        })),
      },
      {
        symbol: 'ETHUSDT',
        price: 2200,
        change24h: -1.2,
        volume24h: 800000000,
        signal: 'SHORT',
        chartData: Array.from({ length: 24 }, (_, i) => ({
          time: `${i}:00`,
          price: 2200 + Math.random() * 100 - 50,
        })),
      },
    ]
    setMarkets(mockData)
    setLoading(false)
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Market Overview</h1>
        <div className="flex space-x-4">
          <select
            className="input"
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
          >
            <option value="1h">1 Hour</option>
            <option value="4h">4 Hours</option>
            <option value="1d">1 Day</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {markets.map((market) => (
          <div key={market.symbol} className="card">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">{market.symbol}</h2>
                <p className="text-2xl font-bold mt-2">${market.price.toLocaleString()}</p>
              </div>
              <button className="text-text-secondary hover:text-white">
                <FiStar size={20} />
              </button>
            </div>

            <div className="h-32 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={market.chartData}>
                  <defs>
                    <linearGradient id={`color${market.symbol}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={market.signal === 'LONG' ? '#10B981' : '#EF4444'} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={market.signal === 'LONG' ? '#10B981' : '#EF4444'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1E1E1E', border: '1px solid #374151' }}
                    labelStyle={{ color: '#F3F4F6' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke={market.signal === 'LONG' ? '#10B981' : '#EF4444'}
                    fill={`url(#color${market.symbol})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                {market.signal === 'LONG' ? (
                  <FiTrendingUp className="text-success" />
                ) : (
                  <FiTrendingDown className="text-danger" />
                )}
                <span className={market.signal === 'LONG' ? 'text-success' : 'text-danger'}>
                  {market.signal}
                </span>
              </div>
              <div className="text-right">
                <p className="text-text-secondary">24h Change</p>
                <p className={market.change24h >= 0 ? 'text-success' : 'text-danger'}>
                  {market.change24h >= 0 ? '+' : ''}{market.change24h}%
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 