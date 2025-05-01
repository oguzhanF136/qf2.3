const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 10000;
const host = '0.0.0.0';

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

app.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
}); 