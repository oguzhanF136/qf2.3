// WebSocket ve bağlantı yönetimi
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 3000; // 3 saniye
const log = document.getElementById('log');
const status = document.getElementById('status');
const connectBtn = document.getElementById('connect');
const disconnectBtn = document.getElementById('disconnect');
const marketData = document.getElementById('marketData');
const markets = new Map(); // Symbol -> Market Data
const klineData = new Map(); // Symbol -> Kline Data
const lastKlineUpdateTime = new Map(); // Symbol -> Son güncelleme zamanı

// API endpoint constants - Use absolute URLs to work in both file:// and http:// contexts
const BINANCE_API_BASE = 'http://localhost:3000/api/binance';
const BINANCE_FUTURES_API_BASE = 'http://localhost:3000/api/futures';

// Tema değiştirme fonksiyonu
function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // İkon animasyonu
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');
    
    if (newTheme === 'light') {
        sunIcon.style.transform = 'rotate(360deg)';
        moonIcon.style.transform = 'rotate(-360deg)';
    } else {
        sunIcon.style.transform = 'rotate(-360deg)';
        moonIcon.style.transform = 'rotate(360deg)';
    }
}

// Sayfa yüklendiğinde tema ayarı ve WebSocket bağlantısı
window.addEventListener('load', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    
    // DOM elementlerini yükle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // WebSocket bağlantısını başlat
    connectWebSocket();
});

// API istekleri için yardımcı fonksiyon
async function makeApiRequest(url, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url);
            
            // Rate limiting kontrolü
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
                addLog(`Rate limit aşıldı. ${retryAfter} saniye bekleniyor...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        }
    }
}

// Kline verilerini çekme fonksiyonu
async function fetchKlineData(symbol, interval = '1h', limit = 200) {
    try {
        const url = `${BINANCE_API_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await makeApiRequest(url);
        
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Geçersiz kline verisi');
        }
        
        return data.map(kline => ({
            time: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        }));
    } catch (error) {
        addLog(`Kline verisi çekme hatası (${symbol}): ${error.message}`);
        return [];
    }
}

// RSI hesaplama fonksiyonu
function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;

    let gains = [];
    let losses = [];

    // Fiyat değişimlerini hesapla
    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(change >= 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    // İlk ortalama kazanç ve kayıp
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Sonraki değerler için üssel hareketli ortalama
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }

    // RSI hesapla
    const rs = avgGain / (avgLoss || 0.0001); // Sıfıra bölünmeyi önle
    return 100 - (100 / (1 + rs));
}

// EMA hesaplama fonksiyonu
function calculateEMA(prices, period) {
    if (prices.length < period) return 0;
    
    const k = 2 / (period + 1);
    let ema = prices[0];

    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }

    return ema;
}

// MACD hesaplama fonksiyonu
function calculateMACD(prices) {
    if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };

    // MACD çizgisi = 12 günlük EMA - 26 günlük EMA
    const ema12 = calculateEMA(prices, 12);
    const ema26 = calculateEMA(prices, 26);
    const macdLine = ema12 - ema26;

    // MACD değerlerini hesapla
    const macdValues = [];
    for (let i = 0; i < prices.length; i++) {
        const shortEma = calculateEMA(prices.slice(0, i + 1), 12);
        const longEma = calculateEMA(prices.slice(0, i + 1), 26);
        macdValues.push(shortEma - longEma);
    }
    
    const signalLine = calculateEMA(macdValues, 9);
    const histogram = macdLine - signalLine;

    return {
        macd: macdLine,
        signal: signalLine,
        histogram: histogram
    };
}

// Signal hesaplama fonksiyonu
function generateSignal(rsi, macdData, priceChange) {
    // Her gösterge için puan hesaplama
    let signalStrength = 0;
    
    // RSI sinyalleri - daha hassas bölgeler
    if (rsi > 75) signalStrength -= 2;       // SELL
    else if (rsi > 65) signalStrength -= 1;  // CAUTION_SELL
    else if (rsi < 25) signalStrength += 2;  // BUY
    else if (rsi < 35) signalStrength += 1;  // CAUTION_BUY
    
    // MACD sinyalleri - histogram değerine göre
    const macdStrength = Math.abs(macdData.histogram);
    const macdThreshold = 0.5;
    
    if (macdData.histogram > 0) {
        signalStrength += (macdStrength > macdThreshold) ? 2 : 1;  // BUY veya CAUTION_BUY
    } else if (macdData.histogram < 0) {
        signalStrength -= (macdStrength > macdThreshold) ? 2 : 1;  // SELL veya CAUTION_SELL
    }
    
    // Fiyat değişimi sinyalleri - yüzdeye göre
    if (priceChange > 2) signalStrength += 2;        // BUY
    else if (priceChange > 0.5) signalStrength += 1; // CAUTION_BUY
    else if (priceChange < -2) signalStrength -= 2;  // SELL
    else if (priceChange < -0.5) signalStrength -= 1;// CAUTION_SELL
    
    // Final sinyal belirleme
    if (signalStrength >= 3) return 'BUY';
    if (signalStrength >= 1) return 'CAUTION_BUY';
    if (signalStrength <= -3) return 'SELL';
    if (signalStrength <= -1) return 'CAUTION_SELL';
    return 'NEUTRAL';
}

// Signal görüntüleme fonksiyonu
function displaySignal(signal) {
    const signalCell = document.createElement('td');
    
    // Signal metinlerini daha profesyonel hale getir
    const signalTexts = {
        'BUY': 'Alış',
        'CAUTION_BUY': 'Dikkatli Alış',
        'NEUTRAL': 'Nötr',
        'CAUTION_SELL': 'Dikkatli Satış',
        'SELL': 'Satış'
    };
    
    signalCell.textContent = signalTexts[signal] || signal;
    
    // Signal renklendirme
    if (signal === 'BUY') {
        signalCell.className = 'long';
    } else if (signal === 'CAUTION_BUY') {
        signalCell.className = 'weak-long';
    } else if (signal === 'SELL') {
        signalCell.className = 'short';
    } else if (signal === 'CAUTION_SELL') {
        signalCell.className = 'weak-short';
    } else {
        signalCell.className = 'neutral';
    }
    
    return signalCell;
}

function addLog(message) {
    // Sadece önemli hata mesajlarını göster
    if (message.includes('hata') || message.includes('error')) {
        console.error(message);
    }
}

function updateStatus(connected) {
    const status = document.getElementById('status');
    const connectBtn = document.getElementById('connect');
    const disconnectBtn = document.getElementById('disconnect');
    
    if (status) {
        status.className = `status ${connected ? 'connected' : 'disconnected'}`;
        status.textContent = `Bağlantı Durumu: ${connected ? 'Bağlı' : 'Bağlantı kuruluyor...'}`;
    }
    
    if (connectBtn) {
        connectBtn.disabled = connected;
    }
    
    if (disconnectBtn) {
        disconnectBtn.disabled = !connected;
    }
}

// Long/Short Ratio hesaplama fonksiyonu
function calculateLongShortRatio(longPositions, shortPositions) {
    // Pozisyonlar boş veya undefined ise hata kontrolü
    if (!longPositions || !longPositions.length) longPositions = [0];
    if (!shortPositions || !shortPositions.length) shortPositions = [0];
    
    // Long ve short pozisyonlarının toplamını al
    const totalLong = longPositions.reduce((sum, pos) => sum + (Number(pos) || 0), 0);
    const totalShort = shortPositions.reduce((sum, pos) => sum + (Number(pos) || 0), 0);
    
    // Oranı hesapla (short pozisyonlar 0 ise Infinity yerine makul bir değer döndür)
    const ratio = totalShort > 0 ? totalLong / totalShort : totalLong > 0 ? 1.5 : 1;
    
    // Toplam işlem hacmi
    const totalVolume = totalLong + totalShort;
    
    // Long ve short yüzdeleri
    const longPercentage = totalVolume > 0 ? (totalLong / totalVolume) * 100 : 50;
    const shortPercentage = totalVolume > 0 ? (totalShort / totalVolume) * 100 : 50;
    
    return {
        ratio: Math.min(ratio, 3), // Maksimum oranı 3 ile sınırla
        totalLong: totalLong,
        totalShort: totalShort,
        totalVolume: totalVolume,
        longPercentage: longPercentage,
        shortPercentage: shortPercentage
    };
}

// Long/Short Ratio görüntüleme fonksiyonu
function displayLongShortRatio(ratioData) {
    const ratioCell = document.createElement('td');
    
    // Oranı formatla ve göster (sınırlama eklenmiş)
    const displayRatio = Math.min(ratioData.ratio, 99.99); // Aşırı büyük değerleri sınırla
    ratioCell.textContent = displayRatio.toFixed(2);
    
    // Renklendirme (geliştirilmiş mantık)
    if (ratioData.ratio > 1.5) {
        ratioCell.className = 'positive'; // Çok fazla long pozisyon
    } else if (ratioData.ratio > 1) {
        ratioCell.className = 'weak-positive'; // Hafif fazla long pozisyon
    } else if (ratioData.ratio < 0.5) {
        ratioCell.className = 'negative'; // Çok fazla short pozisyon
    } else if (ratioData.ratio < 1) {
        ratioCell.className = 'weak-negative'; // Hafif fazla short pozisyon
    } else {
        ratioCell.className = 'neutral'; // Dengeli
    }
    
    // Geliştirilmiş tooltip - daha fazla bilgi ve yüzdeler eklenmiş
    ratioCell.title = `Long: ${ratioData.totalLong.toLocaleString()} (${ratioData.longPercentage.toFixed(1)}%)\n` +
                    `Short: ${ratioData.totalShort.toLocaleString()} (${ratioData.shortPercentage.toFixed(1)}%)\n` +
                    `Toplam Hacim: ${ratioData.totalVolume.toLocaleString()}`;
    
    return ratioCell;
}

// Geliştirilmiş görüntüleme fonksiyonu - hem oran hem de yüzde görünümü
function displayLongShortDetail(ratioData) {
    const container = document.createElement('div');
    container.className = 'long-short-detail';
    
    // Oran göstergesi
    const ratioElement = document.createElement('div');
    ratioElement.className = 'long-short-ratio';
    ratioElement.textContent = `L/S: ${Math.min(ratioData.ratio, 99.99).toFixed(2)}`;
    
    // Progress bar container
    const barContainer = document.createElement('div');
    barContainer.className = 'progress-container';
    
    // Long yüzde bar
    const longBar = document.createElement('div');
    longBar.className = 'long-bar';
    longBar.style.width = `${ratioData.longPercentage}%`;
    longBar.textContent = `${ratioData.longPercentage.toFixed(1)}%`;
    
    // Short yüzde bar
    const shortBar = document.createElement('div');
    shortBar.className = 'short-bar';
    shortBar.style.width = `${ratioData.shortPercentage}%`;
    shortBar.textContent = `${ratioData.shortPercentage.toFixed(1)}%`;
    
    // Bileşenleri bir araya getir
    barContainer.appendChild(longBar);
    barContainer.appendChild(shortBar);
    
    container.appendChild(ratioElement);
    container.appendChild(barContainer);
    
    // Tooltip ekle
    container.title = `Long: ${ratioData.totalLong.toLocaleString()}\n` +
                    `Short: ${ratioData.totalShort.toLocaleString()}\n` +
                    `Toplam: ${ratioData.totalVolume.toLocaleString()}`;
    
    return container;
}

// Futures markette işlem gören coinleri kontrol et
async function isFuturesSymbol(symbol) {
    try {
        const url = `${BINANCE_FUTURES_API_BASE}/exchangeInfo`;
        const response = await makeApiRequest(url);
        const data = await response.json();
        return data.symbols.some(s => s.symbol === symbol);
    } catch (error) {
        addLog(`Futures sembol kontrolü hatası (${symbol}): ${error.message}`);
        return false;
    }
}

// Açık pozisyon verilerini çekme fonksiyonu
async function fetchOpenInterest(symbol) {
    try {
        // Önce futures markette işlem görüp görmediğini kontrol et
        const isFutures = await isFuturesSymbol(symbol);
        if (!isFutures) {
            return {
                openInterest: 0,
                timestamp: Date.now()
            };
        }

        const url = `${BINANCE_FUTURES_API_BASE}/openInterest?symbol=${symbol}`;
        const response = await makeApiRequest(url);
        const data = await response.json();
        return {
            openInterest: parseFloat(data.openInterest),
            timestamp: data.time
        };
    } catch (error) {
        addLog(`Açık pozisyon verisi çekme hatası (${symbol}): ${error.message}`);
        return {
            openInterest: 0,
            timestamp: Date.now()
        };
    }
}

// Market verilerini güncelleme fonksiyonu
async function updateMarketTable() {
    try {
        const response = await makeApiRequest(`${BINANCE_API_BASE}/ticker/24hr`);
        const tickers = await response.json();
        
        // Debug: Log the first ticker's structure
        console.log('Ticker Data Structure:', tickers[0]);
        
        const tableBody = document.getElementById('marketData');
        tableBody.innerHTML = ''; // Clear existing data
        
        for (const ticker of tickers) {
            const row = document.createElement('tr');
            
            // Debug: Log each ticker's data
            console.log(`Processing ticker ${ticker.symbol}:`, {
                price: ticker.lastPrice,
                change: ticker.priceChangePercent,
                volume: ticker.volume,
                high: ticker.highPrice,
                low: ticker.lowPrice
            });
            
            // Symbol
            const symbolCell = document.createElement('td');
            symbolCell.textContent = ticker.symbol;
            row.appendChild(symbolCell);
            
            // Price
            const priceCell = document.createElement('td');
            priceCell.textContent = formatNumber(parseFloat(ticker.lastPrice));
            row.appendChild(priceCell);
            
            // 24h Change
            const changeCell = document.createElement('td');
            const change = parseFloat(ticker.priceChangePercent);
            changeCell.textContent = `${change.toFixed(2)}%`;
            changeCell.className = change >= 0 ? 'positive' : 'negative';
            row.appendChild(changeCell);
            
            // 24h Volume
            const volumeCell = document.createElement('td');
            volumeCell.textContent = formatNumber(parseFloat(ticker.volume));
            row.appendChild(volumeCell);
            
            // RSI
            const rsiCell = document.createElement('td');
            const klineData = await fetchKlineData(ticker.symbol);
            const rsi = calculateRSI(klineData.map(k => k.close));
            rsiCell.textContent = rsi.toFixed(2);
            rsiCell.className = getRSIClass(rsi);
            row.appendChild(rsiCell);
            
            // MACD
            const macdCell = document.createElement('td');
            const macdData = calculateMACD(klineData.map(k => k.close));
            macdCell.textContent = `${macdData.macd.toFixed(4)} / ${macdData.signal.toFixed(4)}`;
            row.appendChild(macdCell);
            
            // Open Interest (for futures)
            const oiCell = document.createElement('td');
            if (await isFuturesSymbol(ticker.symbol)) {
                const oiData = await fetchOpenInterest(ticker.symbol);
                oiCell.textContent = formatNumber(parseFloat(oiData.openInterest));
            } else {
                oiCell.textContent = 'N/A';
            }
            row.appendChild(oiCell);
            
            // Signal
            const signal = generateSignal(rsi, macdData, change);
            row.appendChild(displaySignal(signal));
            
            tableBody.appendChild(row);
        }
    } catch (error) {
        console.error('Market table update error:', error);
        addLog(`Market table update error: ${error.message}`);
    }
}

// Market verilerini görüntüleme fonksiyonu
function updateMarketDisplay() {
    const tableBody = document.getElementById('marketData');
    tableBody.innerHTML = '';
    
    for (const [symbol, data] of markets) {
        const row = document.createElement('tr');
        
        // Symbol
        const symbolCell = document.createElement('td');
        symbolCell.textContent = symbol;
        row.appendChild(symbolCell);
        
        // Fiyat
        const priceCell = document.createElement('td');
        priceCell.textContent = data.price.toFixed(2);
        row.appendChild(priceCell);
        
        // Değişim (24h Change)
        const changeCell = document.createElement('td');
        changeCell.textContent = `${data.priceChange.toFixed(2)}%`;
        changeCell.className = data.priceChange >= 0 ? 'positive' : 'negative';
        row.appendChild(changeCell);
        
        // 24s Hacim (24h Volume)
        const volumeCell = document.createElement('td');
        volumeCell.textContent = formatNumber(data.volume);
        row.appendChild(volumeCell);
        
        // RSI
        const rsiCell = document.createElement('td');
        rsiCell.textContent = data.rsi.toFixed(2);
        rsiCell.className = getRSIClass(data.rsi);
        row.appendChild(rsiCell);
        
        // MACD
        const macdCell = document.createElement('td');
        if (data.macd && typeof data.macd === 'object') {
            macdCell.textContent = data.macd.histogram.toFixed(4);
            macdCell.className = data.macd.histogram > 0 ? 'positive' : 'negative';
        } else {
            macdCell.textContent = 'N/A';
        }
        row.appendChild(macdCell);
        
        // Açık Pozisyon (Open Interest)
        const oiCell = document.createElement('td');
        oiCell.textContent = data.openInterest > 0 ? formatNumber(data.openInterest) : 'N/A';
        row.appendChild(oiCell);
        
        // Long/Short Ratio
        const lsRatioCell = document.createElement('td');
        lsRatioCell.textContent = data.longShortRatio > 0 ? data.longShortRatio.toFixed(2) : 'N/A';
        row.appendChild(lsRatioCell);
        
        tableBody.appendChild(row);
    }
}

// Sayı formatlama fonksiyonu
function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    } else {
        return num.toFixed(2);
    }
}

// RSI renk sınıfı belirleme
function getRSIClass(rsi) {
    if (rsi >= 70) return 'overbought';
    if (rsi <= 30) return 'oversold';
    return 'neutral';
}

// Kline verilerini güncelleme fonksiyonu
async function updateKlineData(symbol) {
    try {
        const now = Date.now();
        const lastUpdate = lastKlineUpdateTime.get(symbol) || 0;
        const updateInterval = 2 * 60 * 1000; // 2 dakika (milisaniye cinsinden)
        
        // Son güncellemeden bu yana 2 dakika geçmediyse ve kline verisi varsa, mevcut veriyi kullan
        if (now - lastUpdate < updateInterval && klineData.has(symbol)) {
            console.log(`${symbol} için önbellekten veri kullanılıyor. Sonraki güncelleme: ${Math.round((updateInterval - (now - lastUpdate)) / 1000)} saniye sonra.`);
            const klines = klineData.get(symbol);
            const closes = klines.map(k => k.close);
            const rsi = calculateRSI(closes);
            const macdData = calculateMACD(closes);
            return { 
                rsi, 
                macd: macdData,
                prices: closes
            };
        }
        
        // 2 dakika geçtiyse veya kline verisi yoksa, yeni veri çek
        console.log(`${symbol} için yeni kline verisi çekiliyor...`);
        const klines = await fetchKlineData(symbol);
        if (klines.length > 0) {
            klineData.set(symbol, klines);
            lastKlineUpdateTime.set(symbol, now);
            const closes = klines.map(k => k.close);
            const rsi = calculateRSI(closes);
            const macdData = calculateMACD(closes);
            return { 
                rsi, 
                macd: macdData,
                prices: closes // Fiyat geçmişini de döndür
            };
        }
        return { 
            rsi: 50, 
            macd: { macd: 0, signal: 0, histogram: 0 },
            prices: [] // Boş fiyat dizisi döndür
        };
    } catch (error) {
        addLog(`Kline verisi güncelleme hatası (${symbol}): ${error.message}`);
        return { 
            rsi: 50, 
            macd: { macd: 0, signal: 0, histogram: 0 },
            prices: []
        };
    }
}

function connectWebSocket() {
    try {
        if (ws) {
            ws.close();
            ws = null;
        }

        console.log('WebSocket bağlantısı başlatılıyor...');
        
        // Binance Futures WebSocket URL'si
        const wsUrl = 'wss://fstream.binance.com/ws';
        console.log('Bağlanılacak URL:', wsUrl);
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket bağlantısı başarılı');
            reconnectAttempts = 0;
            updateStatus(true);
            
            // Subscribe to mark price stream
            const subscribeMsg = {
                method: "SUBSCRIBE",
                params: [
                    "btcusdt@markPrice@1s",
                    "ethusdt@markPrice@1s",
                    "bnbusdt@markPrice@1s",
                    "xrpusdt@markPrice@1s",
                    "adausdt@markPrice@1s",
                    "dogeusdt@markPrice@1s",
                    "dotusdt@markPrice@1s",
                    "uniusdt@markPrice@1s"
                ],
                id: 1
            };

            try {
                console.log('Abonelik mesajı gönderiliyor...');
                ws.send(JSON.stringify(subscribeMsg));
                console.log('Abonelik mesajı gönderildi');
            } catch (error) {
                console.error('Abonelik mesajı gönderme hatası:', error);
            }
        };

        ws.onclose = (event) => {
            console.log('WebSocket bağlantısı kapandı. Kod:', event.code, 'Sebep:', event.reason);
            updateStatus(false);
            
            if (reconnectAttempts < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                console.log(`${delay/1000} saniye sonra yeniden bağlanılacak... (Deneme ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
                setTimeout(connectWebSocket, delay);
                reconnectAttempts++;
            } else {
                console.log('Maksimum yeniden bağlanma denemesi aşıldı');
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket hatası:', error);
            console.error('WebSocket durumu:', ws.readyState);
            addLog(`WebSocket hatası: ${error.message || 'Bilinmeyen hata'}`);
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Gelen veri:', data);
                
                if (data.e === 'markPriceUpdate') {
                    const symbol = data.s;
                    
                    // Kline verilerini güncelle ve göstergeleri hesapla
                    const indicators = await updateKlineData(symbol);
                    
                    // Mevcut market verisini al veya yeni oluştur
                    const existingMarket = markets.get(symbol) || {};
                    
                    // Son veri güncellemesinden bu yana geçen süre (milisaniye)
                    const lastUpdate = existingMarket.lastUpdate || 0;
                    const now = Date.now();
                    const timeSinceLastUpdate = now - lastUpdate;
                    
                    // WebSocket'ten gelen verileri güncelle
                    const updatedMarket = {
                        ...existingMarket,
                        symbol: symbol,
                        price: parseFloat(data.p),
                        lastUpdate: now
                    };
                    
                    // Kline verilerinden elde edilen göstergeleri güncelle
                    if (indicators && indicators.prices && indicators.prices.length > 0) {
                        const macdData = calculateMACD(indicators.prices);
                        
                        updatedMarket.rsi = indicators.rsi;
                        updatedMarket.macd = macdData;
                        updatedMarket.signal = generateSignal(indicators.rsi, macdData, parseFloat(data.r || 0));
                    }
                    
                    // Her 2 dakikada bir veya ilk kez yükleniyorsa ek verileri getir
                    const updateInterval = 2 * 60 * 1000; // 2 dakika
                    if (timeSinceLastUpdate > updateInterval || !existingMarket.lastFullUpdate) {
                        try {
                            // 24 saatlik değişim ve hacim verilerini çek
                            const tickerData = await fetchTickerData(symbol);
                            updatedMarket.priceChange = tickerData.priceChange;
                            updatedMarket.volume = tickerData.volume;
                            updatedMarket.high = tickerData.high;
                            updatedMarket.low = tickerData.low;
                            
                            // Açık pozisyon verisini çek
                            const oiData = await fetchOpenInterest(symbol);
                            updatedMarket.openInterest = oiData.openInterest;
                            
                            // Long/Short oranını çek
                            const lsRatioData = await fetchLongShortRatio(symbol);
                            updatedMarket.longShortRatio = lsRatioData.longShortRatio;
                            
                            // Tam güncelleme zamanını kaydet
                            updatedMarket.lastFullUpdate = now;
                            
                            console.log(`${symbol} için tüm veriler güncellendi`);
                        } catch (error) {
                            console.error(`${symbol} için veri güncelleme hatası:`, error);
                        }
                    } else {
                        // WebSocket'ten gelen fiyat değişimi verisini kullan (varsa)
                        if (data.r) {
                            updatedMarket.priceChange = parseFloat(data.r);
                        }
                        
                        console.log(`${symbol} için kısmi güncelleme yapıldı. Sonraki tam güncelleme: ${Math.round((updateInterval - timeSinceLastUpdate) / 1000)} saniye sonra.`);
                    }
                    
                    // Market verisini güncelle
                    markets.set(symbol, updatedMarket);
                    
                    // Tabloyu güncelle
                    updateMarketDisplay();
                }
            } catch (error) {
                console.error('Veri işleme hatası:', error);
            }
        };
    } catch (error) {
        console.error('WebSocket bağlantı hatası:', error);
        console.error('Hata detayları:', error.message);
        if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            setTimeout(connectWebSocket, delay);
            reconnectAttempts++;
        }
    }
}

// WebSocket bağlantısını kesme
disconnectBtn.addEventListener('click', () => {
    if (ws) {
        ws.close();
        ws = null;
    }
});

// Tab değiştirme fonksiyonu
document.querySelectorAll('.info-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        // Aktif tab'ı değiştir
        document.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // İlgili paneli göster
        const panelId = tab.getAttribute('data-tab') + '-panel';
        document.querySelectorAll('.info-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(panelId).classList.add('active');
    });
});

// Sayfa yüklendiğinde veri çekme işlemini başlat
document.addEventListener('DOMContentLoaded', () => {
    // Tema ayarını yükle
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    
    // Market verilerini çek ve güncelle
    updateMarketTable();
    
    // Her 30 saniyede bir verileri güncelle
    setInterval(updateMarketTable, 30000);
}); 

// Ticker verilerini çekme fonksiyonu (24 saatlik değişim ve hacim için)
async function fetchTickerData(symbol) {
    try {
        const url = `${BINANCE_API_BASE}/ticker/24hr?symbol=${symbol}`;
        const response = await makeApiRequest(url);
        const data = await response.json();
        
        return {
            priceChange: parseFloat(data.priceChangePercent),
            volume: parseFloat(data.quoteVolume),
            high: parseFloat(data.highPrice),
            low: parseFloat(data.lowPrice),
            timestamp: Date.now()
        };
    } catch (error) {
        addLog(`Ticker verisi çekme hatası (${symbol}): ${error.message}`);
        return {
            priceChange: 0,
            volume: 0,
            high: 0,
            low: 0,
            timestamp: Date.now()
        };
    }
}

// Long/Short oranını çekme fonksiyonu
async function fetchLongShortRatio(symbol) {
    try {
        // Symbol'ü doğru formata çevir (BTCUSDT -> BTC)
        const baseAsset = symbol.replace(/USDT$/, '');
        
        const url = `${BINANCE_FUTURES_API_BASE}/globalLongShortAccountRatio?symbol=${baseAsset}&period=5m&limit=1`;
        const response = await makeApiRequest(url);
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            return {
                longShortRatio: parseFloat(data[0].longShortRatio),
                timestamp: Date.now()
            };
        }
        
        return {
            longShortRatio: 0,
            timestamp: Date.now()
        };
    } catch (error) {
        addLog(`Long/Short oranı çekme hatası (${symbol}): ${error.message}`);
        return {
            longShortRatio: 0,
            timestamp: Date.now()
        };
    }
}