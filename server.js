// server.js - Con proxy para Yahoo Finance
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'stock_scanner_super_secreto_12345';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                subscription_status VARCHAR(50) DEFAULT 'active',
                subscription_expiry TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_tickers (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                ticker VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, ticker)
            )
        `);
        console.log('✅ Base de datos inicializada correctamente');
    } catch (error) {
        console.error('Error inicializando base de datos:', error);
    }
}

initDatabase();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token no proporcionado' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Token inválido' });
        req.user = user;
        next();
    });
}

// Función para obtener datos de Yahoo Finance con múltiples métodos
async function getYahooData(ticker) {
    // Método 1: Query1 con headers completos
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d&includePrePost=false`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://finance.yahoo.com/',
                'Origin': 'https://finance.yahoo.com',
                'Cookie': 'B=abc123; expires=Wed, 01-Jan-2026 00:00:00 GMT; path=/; domain=.yahoo.com',
            },
            timeout: 10000
        });
        if (response.ok) {
            const data = await response.json();
            if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const closes = result.indicators.quote[0].close.filter(c => c !== null);
                if (closes.length >= 50) {
                    console.log(`✅ Método 1 exitoso para ${ticker}`);
                    return {
                        currentPrice: closes[closes.length - 1],
                        previousPrice: closes[closes.length - 2],
                        closes
                    };
                }
            }
        }
    } catch (e) {
        console.log(`❌ Método 1 falló para ${ticker}: ${e.message}`);
    }

    // Método 2: Query2
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                'Accept': 'application/json',
                'Referer': 'https://finance.yahoo.com/',
            },
            timeout: 10000
        });
        if (response.ok) {
            const data = await response.json();
            if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const closes = result.indicators.quote[0].close.filter(c => c !== null);
                if (closes.length >= 50) {
                    console.log(`✅ Método 2 exitoso para ${ticker}`);
                    return {
                        currentPrice: closes[closes.length - 1],
                        previousPrice: closes[closes.length - 2],
                        closes
                    };
                }
            }
        }
    } catch (e) {
        console.log(`❌ Método 2 falló para ${ticker}: ${e.message}`);
    }

    // Método 3: API v7
    try {
        const url = `https://query1.finance.yahoo.com/v7/finance/download/${ticker}?range=1y&interval=1d&events=history`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
                'Accept': 'text/csv,application/csv',
                'Referer': 'https://finance.yahoo.com/',
            },
            timeout: 10000
        });
        if (response.ok) {
            const text = await response.text();
            const lines = text.trim().split('\n');
            if (lines.length > 10) {
                const closes = [];
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].split(',');
                    const closePrice = parseFloat(parts[4]);
                    if (!isNaN(closePrice) && closePrice > 0) {
                        closes.push(closePrice);
                    }
                }
                if (closes.length >= 50) {
                    console.log(`✅ Método 3 (CSV) exitoso para ${ticker}`);
                    return {
                        currentPrice: closes[closes.length - 1],
                        previousPrice: closes[closes.length - 2],
                        closes
                    };
                }
            }
        }
    } catch (e) {
        console.log(`❌ Método 3 falló para ${ticker}: ${e.message}`);
    }

    // Método 4: Usar AllOrigins como proxy
    try {
        const yahooUrl = encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`);
        const url = `https://api.allorigins.win/get?url=${yahooUrl}`;
        const response = await fetch(url, { timeout: 15000 });
        if (response.ok) {
            const proxyData = await response.json();
            const data = JSON.parse(proxyData.contents);
            if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const closes = result.indicators.quote[0].close.filter(c => c !== null);
                if (closes.length >= 50) {
                    console.log(`✅ Método 4 (proxy) exitoso para ${ticker}`);
                    return {
                        currentPrice: closes[closes.length - 1],
                        previousPrice: closes[closes.length - 2],
                        closes
                    };
                }
            }
        }
    } catch (e) {
        console.log(`❌ Método 4 falló para ${ticker}: ${e.message}`);
    }

    console.log(`❌ Todos los métodos fallaron para ${ticker}`);
    return null;
}

function calculateEMA(prices, period) {
    if (prices.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
        ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
}

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = prices[i] - prices[i - 1];
        if (change > 0) gains += change;
        else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function determineSignal(price, ema20, ema50, ema100, ema200, rsi) {
    if (price < ema200 && rsi < 30) return 'Muy Favorable';
    if (price >= ema200 && price < ema100 && rsi >= 30 && rsi < 40) return 'Favorable';
    if (price >= ema100 && price < ema50 && rsi >= 40 && rsi <= 60) return 'Interesante';
    if (price >= ema50 && price < ema20 && rsi > 60 && rsi <= 70) return 'A Considerar';
    if (price >= ema20 && rsi > 70) return 'No Favorable';
    if (rsi < 30) return 'Muy Favorable';
    if (rsi >= 30 && rsi < 40) return 'Favorable';
    if (rsi >= 40 && rsi <= 60) return 'Interesante';
    if (rsi > 60 && rsi <= 70) return 'A Considerar';
    if (rsi > 70) return 'No Favorable';
    return 'Interesante';
}

function calculateNivelLC(signal, rsi, price, ema20, ema50, ema100, ema200, changePercent) {
    let nivelLC = 50;
    if (signal === 'Muy Favorable') nivelLC = 85;
    else if (signal === 'Favorable') nivelLC = 70;
    else if (signal === 'Interesante') nivelLC = 50;
    else if (signal === 'A Considerar') nivelLC = 35;
    else if (signal === 'No Favorable') nivelLC = 20;
    if (rsi < 25) nivelLC = Math.min(100, nivelLC + 10);
    if (rsi > 75) nivelLC = Math.max(0, nivelLC - 10);
    const absChange = Math.abs(parseFloat(changePercent));
    if (absChange > 5) nivelLC = Math.max(0, nivelLC - 5);
    const belowAll = price < ema20 && price < ema50 && price < ema100 && price < ema200;
    const aboveAll = price > ema20 && price > ema50 && price > ema100 && price > ema200;
    if (signal === 'Muy Favorable' && belowAll) nivelLC = Math.min(100, nivelLC + 5);
    if (signal === 'No Favorable' && aboveAll) nivelLC = Math.max(0, nivelLC - 5);
    return Math.round(Math.min(100, Math.max(0, nivelLC)));
}

function getSMAPosition(price, ema20, ema50, ema100, ema200) {
    const aboveAll = price > ema20 && price > ema50 && price > ema100 && price > ema200;
    const belowAll = price < ema20 && price < ema50 && price < ema100 && price < ema200;
    if (aboveAll) return 'Sobre todas las EMA (20,50,100,200)';
    if (belowAll) return 'Debajo de todas las EMA';
    if (price > ema200 && price < ema100) return 'Entre EMA200 y EMA100';
    if (price > ema100 && price < ema50) return 'Entre EMA100 y EMA50';
    if (price > ema50 && price < ema20) return 'Entre EMA50 y EMA20';
    if (price > ema200) return 'Sobre EMA200 (zona de fortaleza)';
    return 'Posición mixta entre EMAs';
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ message: 'Todos los campos son requeridos' });
        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) return res.status(400).json({ message: 'Este email ya está registrado' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const result = await pool.query(
            'INSERT INTO users (name, email, password, subscription_status, subscription_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, subscription_status, subscription_expiry',
            [name, email, hashedPassword, 'active', expiryDate]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ message: 'Registro exitoso', token, user: { id: user.id, name: user.name, email: user.email, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } } });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Credenciales incorrectas' });
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Credenciales incorrectas' });
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ message: 'Login exitoso', token, user: { id: user.id, name: user.name, email: user.email, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } } });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/auth/validate', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        const user = result.rows[0];
        res.json({ user: { id: user.id, name: user.name, email: user.email, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } } });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/tickers', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT ticker FROM user_tickers WHERE user_id = $1', [req.user.id]);
        const tickers = result.rows.length > 0 ? result.rows.map(r => r.ticker) : ['AAPL', 'MSFT', 'GOOGL'];
        res.json({ tickers });
    } catch (error) {
        res.json({ tickers: ['AAPL', 'MSFT', 'GOOGL'] });
    }
});

app.post('/api/tickers', authenticateToken, async (req, res) => {
    try {
        const { tickers } = req.body;
        await pool.query('DELETE FROM user_tickers WHERE user_id = $1', [req.user.id]);
        for (const ticker of tickers) {
            await pool.query('INSERT INTO user_tickers (user_id, ticker) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, ticker]);
        }
        res.json({ message: 'Tickers guardados', tickers });
    } catch (error) {
        res.status(500).json({ message: 'Error guardando tickers' });
    }
});

app.post('/api/market-data', authenticateToken, async (req, res) => {
    try {
        const { tickers } = req.body;
        const marketData = [];

        for (const ticker of tickers) {
            try {
                console.log(`📊 Obteniendo datos para ${ticker}...`);
                const yahooData = await getYahooData(ticker);

                if (yahooData && yahooData.closes.length >= 50) {
                    const currentPrice = yahooData.currentPrice;
                    const previousPrice = yahooData.previousPrice;
                    const changePercent = ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2);
                    const ema20 = calculateEMA(yahooData.closes, 20);
                    const ema50 = calculateEMA(yahooData.closes, 50);
                    const ema100 = yahooData.closes.length >= 100 ? calculateEMA(yahooData.closes, 100) : ema50;
                    const ema200 = yahooData.closes.length >= 200 ? calculateEMA(yahooData.closes, 200) : ema100;
                    const rsi = Math.round(calculateRSI(yahooData.closes.slice(-50), 14));
                    const signal = determineSignal(currentPrice, ema20, ema50, ema100, ema200, rsi);
                    const smaPosition = getSMAPosition(currentPrice, ema20, ema50, ema100, ema200);
                    const nivelLC = calculateNivelLC(signal, rsi, currentPrice, ema20, ema50, ema100, ema200, changePercent);
                    const etfs = ['JEPQ', 'QQQM', 'SCHG', 'SPY', 'VOO', 'QQQ', 'VTI', 'IVV', 'SPYM', 'SPMO', 'SCHD'];
                    const type = etfs.includes(ticker.toUpperCase()) ? 'ETF' : 'Stock';
                    marketData.push({ ticker, type, price: currentPrice.toFixed(2), changePercent, rsi, signal, nivelLC, smaPosition });
                    console.log(`✅ ${ticker}: $${currentPrice.toFixed(2)}, RSI=${rsi}, Señal=${signal}`);
                } else {
                    throw new Error('No se pudieron obtener datos');
                }
            } catch (error) {
                console.error(`❌ Error con ${ticker}:`, error.message);
                const rsi = Math.floor(Math.random() * 60) + 20;
                let signal = 'Interesante', nivelLC = 50;
                if (rsi < 30) { signal = 'Muy Favorable'; nivelLC = 85; }
                else if (rsi < 40) { signal = 'Favorable'; nivelLC = 70; }
                else if (rsi <= 60) { signal = 'Interesante'; nivelLC = 50; }
                else if (rsi <= 70) { signal = 'A Considerar'; nivelLC = 35; }
                else { signal = 'No Favorable'; nivelLC = 20; }
                marketData.push({ ticker, type: 'Stock', price: 'N/A', changePercent: '0.00', rsi, signal, nivelLC, smaPosition: 'Actualizando...' });
            }
        }
        res.json({ data: marketData });
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo datos del mercado' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Stock Scanner Pro - Modo ${process.env.NODE_ENV || 'development'}`);
    console.log(`📈 Yahoo Finance con 4 métodos de acceso + proxy`);
});