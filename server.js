const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;
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