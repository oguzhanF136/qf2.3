import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { FiHome, FiTrendingUp, FiStar, FiSettings } from 'react-icons/fi'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QuantiFlows - Professional Trading Dashboard',
  description: 'Real-time cryptocurrency trading dashboard with smart signals and technical analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <header className="bg-primary border-b border-gray-800">
            <nav className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-8">
                  <h1 className="text-2xl font-bold text-white">QuantiFlows</h1>
                  <div className="hidden md:flex space-x-6">
                    <a href="/" className="text-text-secondary hover:text-white flex items-center space-x-2">
                      <FiHome />
                      <span>Dashboard</span>
                    </a>
                    <a href="/signals" className="text-text-secondary hover:text-white flex items-center space-x-2">
                      <FiTrendingUp />
                      <span>Signals</span>
                    </a>
                    <a href="/watchlist" className="text-text-secondary hover:text-white flex items-center space-x-2">
                      <FiStar />
                      <span>Watchlist</span>
                    </a>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <button className="btn btn-primary">
                    Connect Binance
                  </button>
                  <button className="text-text-secondary hover:text-white">
                    <FiSettings size={20} />
                  </button>
                </div>
              </div>
            </nav>
          </header>

          <main className="flex-grow container mx-auto px-4 py-8">
            {children}
          </main>

          <footer className="bg-primary border-t border-gray-800 py-6">
            <div className="container mx-auto px-4 text-center text-text-secondary">
              <p>© 2024 QuantiFlows. All rights reserved.</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
} 