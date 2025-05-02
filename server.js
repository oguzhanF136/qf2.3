const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;
const host = '0.0.0.0';

// Custom CSP middleware - should be first
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; connect-src 'self' wss://stream.binance.com:* wss://fstream.binance.com wss://*.binance.com https://*.binance.com; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.coingecko.com https://assets.coingecko.com; upgrade-insecure-requests;"
    );
    next();
});

// Disable helmet's CSP as we're using our own
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors()); // Enable CORS
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Binance API proxy
const apiCache = new Map(); // API yanıtlarını önbelleğe almak için
const apiCacheTTL = 60000; // Önbellek süresi (ms) - 1 dakika

app.get('/api/binance/*', async (req, res) => {
    try {
        const path = req.path.replace('/api/binance/', '');
        const queryString = new URLSearchParams(req.query).toString();
        const url = `https://api.binance.com/api/v3/${path}${queryString ? `?${queryString}` : ''}`;
        const cacheKey = url;
        
        // Önbellekte varsa ve süresi geçmediyse önbellekten yanıt ver
        const cachedData = apiCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp < apiCacheTTL)) {
            console.log('Cache hit for:', url);
            return res.json(cachedData.data);
        }
        
        console.log('Binance API request:', url);
        
        // API isteği yapmadan önce kısa bir gecikme ekle (rate limit'i aşmamak için)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 418 || response.status === 429) {
                // Rate limit aşıldıysa, önbellekte varsa eski veriyi kullan
                if (cachedData) {
                    console.log('Using stale cache due to rate limit:', url);
                    return res.json(cachedData.data);
                }
                
                // Retry-After header'ı varsa bekle
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                console.log(`Rate limited by Binance. Retry after ${retryAfter} seconds.`);
                
                throw new Error(`Binance API rate limited: ${response.status} ${response.statusText}. Retry after ${retryAfter} seconds.`);
            }
            
            throw new Error(`Binance API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Yanıtı önbelleğe al
        apiCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        res.json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Binance Futures API proxy
app.get('/api/futures/*', async (req, res) => {
    try {
        const path = req.path.replace('/api/futures/', '');
        const queryString = new URLSearchParams(req.query).toString();
        const url = `https://fapi.binance.com/fapi/v1/${path}${queryString ? `?${queryString}` : ''}`;
        const cacheKey = url;
        
        // Önbellekte varsa ve süresi geçmediyse önbellekten yanıt ver
        const cachedData = apiCache.get(cacheKey);
        if (cachedData && (Date.now() - cachedData.timestamp < apiCacheTTL)) {
            console.log('Cache hit for:', url);
            return res.json(cachedData.data);
        }
        
        console.log('Binance Futures API request:', url);
        
        // API isteği yapmadan önce kısa bir gecikme ekle (rate limit'i aşmamak için)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const response = await fetch(url);
        
        if (!response.ok) {
            if (response.status === 418 || response.status === 429) {
                // Rate limit aşıldıysa, önbellekte varsa eski veriyi kullan
                if (cachedData) {
                    console.log('Using stale cache due to rate limit:', url);
                    return res.json(cachedData.data);
                }
                
                // Retry-After header'ı varsa bekle
                const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
                console.log(`Rate limited by Binance. Retry after ${retryAfter} seconds.`);
                
                throw new Error(`Binance API rate limited: ${response.status} ${response.statusText}. Retry after ${retryAfter} seconds.`);
            }
            
            throw new Error(`Binance Futures API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Yanıtı önbelleğe al
        apiCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        res.json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/old_index', (req, res) => {
    res.sendFile(path.join(__dirname, 'old_index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start server
app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
}); 