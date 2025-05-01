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
    connectWebSocket(); // WebSocket bağlantısını başlat
});

// Tema değiştirme butonu
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', toggleTheme);

// Kline verilerini çekme fonksiyonu
async function fetchKlineData(symbol, interval = '1h', limit = 200) {
    try {
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
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
    status.className = `status ${connected ? 'connected' : 'disconnected'}`;
    status.textContent = `Bağlantı Durumu: ${connected ? 'Bağlı' : 'Bağlantı kuruluyor...'}`;
    connectBtn.disabled = connected;
    disconnectBtn.disabled = !connected;
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

function updateMarketTable() {
    marketData.innerHTML = '';
    markets.forEach((market, symbol) => {
        const row = document.createElement('tr');
        
        // Symbol with logo
        const symbolCell = document.createElement('td');
        const symbolContainer = document.createElement('div');
        symbolContainer.style.display = 'flex';
        symbolContainer.style.alignItems = 'center';
        symbolContainer.style.gap = '8px';

        const logo = document.createElement('img');
        logo.style.width = '24px';
        logo.style.height = '24px';
        logo.style.borderRadius = '50%';

        // Coin logos
        const coinLogos = {
            'BTCUSDT': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579',
            'ETHUSDT': 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1595348880',
            'BNBUSDT': 'https://assets.coingecko.com/coins/images/825/large/bnb-icon2_2x.png?1644979850',
            'SOLUSDT': 'https://assets.coingecko.com/coins/images/4128/large/solana.png?1640133422',
            'ADAUSDT': 'https://assets.coingecko.com/coins/images/975/large/cardano.png?1547034860',
            'DOGEUSDT': 'https://assets.coingecko.com/coins/images/5/large/dogecoin.png?1547792256',
            'XRPUSDT': 'https://assets.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png?1605778731',
            'DOTUSDT': 'https://assets.coingecko.com/coins/images/12171/large/polkadot.png?1639712644',
            'AVAXUSDT': 'https://assets.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1670992574',
            'MATICUSDT': 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png?1624446912',
            'LINKUSDT': 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png?1547034700',
            'LTCUSDT': 'https://assets.coingecko.com/coins/images/2/large/litecoin.png?1547031400',
            'UNIUSDT': 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png?1600306604',
            'ATOMUSDT': 'https://assets.coingecko.com/coins/images/1481/large/cosmos_hub.png?1555657960',
            'FILUSDT': 'https://assets.coingecko.com/coins/images/12817/large/filecoin.png?1602753933',
            'AXSUSDT': 'https://assets.coingecko.com/coins/images/13029/large/axie_infinity_logo.png?1604471082',
            'NEARUSDT': 'https://assets.coingecko.com/coins/images/10365/large/near_icon.png?1601359077',
            'ALGOUSDT': 'https://assets.coingecko.com/coins/images/4380/large/download.png?1547039725',
            'VETUSDT': 'https://assets.coingecko.com/coins/images/116/large/VeChain-Logo-768x725.png?1598000999',
            'ICPUSDT': 'https://assets.coingecko.com/coins/images/14495/large/Internet_Computer_logo.png?1620703073',
            'ARBUSDT': 'https://assets.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg?1680097630',
            'OPUSDT': 'https://assets.coingecko.com/coins/images/25244/large/Optimism.png?1660904599',
            'APTUSDT': 'https://assets.coingecko.com/coins/images/26455/large/aptos_round.png?1666839629',
            'INJUSDT': 'https://assets.coingecko.com/coins/images/12882/large/Secondary_Symbol.png?1628233237',
            'GRTUSDT': 'https://assets.coingecko.com/coins/images/13397/large/Graph_Token.png?1608145566',
            'AAVEUSDT': 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png?1601374110',
            'SNXUSDT': 'https://assets.coingecko.com/coins/images/3406/large/SNX.png?1598631139',
            'CRVUSDT': 'https://assets.coingecko.com/coins/images/12124/large/Curve.png?1597369484',
            '1INCHUSDT': 'https://assets.coingecko.com/coins/images/13469/large/1inch.png?1608803028',
            'ENSUSDT': 'https://assets.coingecko.com/coins/images/19785/large/acatxTm8_400x400.jpg?1635850140',
            'COMPUSDT': 'https://assets.coingecko.com/coins/images/10775/large/COMP.png?1592625425',
            'SUSHIUSDT': 'https://assets.coingecko.com/coins/images/12271/large/512x512_Logo_no_chop.png?1606986688',
            'CAKEUSDT': 'https://assets.coingecko.com/coins/images/12632/large/pancakeswap-cake-logo_%281%29.png?1629359065',
            'SANDUSDT': 'https://assets.coingecko.com/coins/images/12129/large/sandbox_telegram.jpg?1597397942',
            'MANAUSDT': 'https://assets.coingecko.com/coins/images/878/large/decentraland-mana.png?1550108745',
            'GALAUSDT': 'https://assets.coingecko.com/coins/images/12493/large/GALA-COINGECKO.png?1600233435',
            'CHZUSDT': 'https://assets.coingecko.com/coins/images/8834/large/Chiliz.png?1561970540',
            'LRCUSDT': 'https://assets.coingecko.com/coins/images/913/large/LRC.png?1572852344',
            'IMXUSDT': 'https://assets.coingecko.com/coins/images/17233/large/imx.png?1636691817',
            'RNDRUSDT': 'https://assets.coingecko.com/coins/images/11636/large/rndr.png?1638840934'
        };

        logo.src = coinLogos[symbol] || 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png?1547033579';
        
        const symbolText = document.createElement('span');
        symbolText.textContent = symbol.replace('USDT', '');
        
        symbolContainer.appendChild(logo);
        symbolContainer.appendChild(symbolText);
        symbolCell.appendChild(symbolContainer);
        row.appendChild(symbolCell);

        // Price
        const priceCell = document.createElement('td');
        priceCell.textContent = market.price.toFixed(2);
        row.appendChild(priceCell);

        // 24h Change
        const changeCell = document.createElement('td');
        changeCell.textContent = market.change24h.toFixed(2) + '%';
        changeCell.className = market.change24h >= 0 ? 'positive' : 'negative';
        row.appendChild(changeCell);

        // 24h Volume
        const volumeCell = document.createElement('td');
        volumeCell.textContent = market.volume24h.toLocaleString();
        row.appendChild(volumeCell);

        // RSI
        const rsiCell = document.createElement('td');
        rsiCell.textContent = `${market.rsi.toFixed(2)} (14h)`;
        rsiCell.className = market.rsi > 70 ? 'negative' : market.rsi < 30 ? 'positive' : '';
        row.appendChild(rsiCell);

        // MACD
        const macdCell = document.createElement('td');
        macdCell.textContent = `MACD: ${market.macd.macd.toFixed(2)} | Signal: ${market.macd.signal.toFixed(2)} | Hist: ${market.macd.histogram.toFixed(2)}`;
        macdCell.className = market.macd.histogram > 0 ? 'positive' : 'negative';
        row.appendChild(macdCell);

        // Open Interest
        const oiCell = document.createElement('td');
        oiCell.textContent = market.openInterest.toLocaleString();
        row.appendChild(oiCell);

        // Long/Short Ratio - Yeni detaylı görünüm
        const lsrCell = document.createElement('td');
        // Open Interest değerini daha gerçekçi bir şekilde kullan
        const baseValue = market.openInterest / 1000; // Open Interest'i 1000'e böl
        const ratioData = calculateLongShortRatio(
            [baseValue * market.longShortRatio], // Long pozisyonlar
            [baseValue] // Short pozisyonlar
        );
        const detailView = displayLongShortDetail(ratioData);
        lsrCell.appendChild(detailView);
        row.appendChild(lsrCell);

        marketData.appendChild(row);
    });
}

// Kline verilerini güncelleme fonksiyonu
async function updateKlineData(symbol) {
    try {
        const klines = await fetchKlineData(symbol);
        if (klines.length > 0) {
            klineData.set(symbol, klines);
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
        }

        ws = new WebSocket('wss://fstream.binance.com/ws');

        ws.onopen = () => {
            console.log('WebSocket bağlantısı kuruldu');
            reconnectAttempts = 0;
            
            // Subscribe to ticker stream
            const subscribeMsg = {
                method: "SUBSCRIBE",
                params: [
                    "btcusdt@ticker",
                    "ethusdt@ticker",
                    "bnbusdt@ticker",
                    "xrpusdt@ticker",
                    "adausdt@ticker",
                    "dogeusdt@ticker",
                    "dotusdt@ticker",
                    "uniusdt@ticker"
                ],
                id: 1
            };
            ws.send(JSON.stringify(subscribeMsg));
        };

        ws.onclose = (event) => {
            console.log('WebSocket bağlantısı kapandı:', event.code, event.reason);
            if (reconnectAttempts < maxReconnectAttempts) {
                console.log(`${reconnectDelay/1000} saniye sonra yeniden bağlanılacak...`);
                setTimeout(connectWebSocket, reconnectDelay);
                reconnectAttempts++;
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket hatası:', error);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('Gelen veri:', data);
                // Veri işleme kodları buraya gelecek
            } catch (error) {
                console.error('Veri işleme hatası:', error);
            }
        };
    } catch (error) {
        console.error('WebSocket bağlantı hatası:', error);
        if (reconnectAttempts < maxReconnectAttempts) {
            setTimeout(connectWebSocket, reconnectDelay);
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
