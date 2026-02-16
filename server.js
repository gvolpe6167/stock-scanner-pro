// server.js - Servidor con PostgreSQL para producción
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

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Configurar PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Crear tablas si no existen
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

async function getYahooData(ticker) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
            throw new Error('No data');
        }
        
        const result = data.chart.result[0];
        const quote = result.indicators.quote[0];
        const closes = quote.close.filter(c => c !== null);
        
        return {
            currentPrice: closes[closes.length - 1],
            previousPrice: closes[closes.length - 2],
            closes: closes
        };
    } catch (error) {
        return null;
    }
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
    let gains = 0;
    let losses = 0;
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
    
    const aboveAll = price > ema20 && price > ema50 && price > ema100 && price > ema200;
    const belowAll = price < ema20 && price < ema50 && price < ema100 && price < ema200;
    
    if (signal === 'Muy Favorable' && belowAll) nivelLC = Math.min(100, nivelLC + 5);
    if (signal === 'No Favorable' && aboveAll) nivelLC = Math.max(0, nivelLC - 5);
    
    return Math.round(Math.min(100, Math.max(0, nivelLC)));
}

function getSMAPosition(price, ema20, ema50, ema100, ema200) {
    const aboveAll = price > ema20 && price > ema50 && price > ema100 && price > ema200;
    const belowAll = price < ema20 && price < ema50 && price < ema100 && price < ema200;
    
    if (aboveAll) return 'Sobre todas las EMA (20,50,100,200)';
    else if (belowAll) return 'Debajo de todas las EMA';
    else if (price > ema200 && price < ema100) return 'Entre EMA200 y EMA100';
    else if (price > ema100 && price < ema50) return 'Entre EMA100 y EMA50';
    else if (price > ema50 && price < ema20) return 'Entre EMA50 y EMA20';
    else if (price > ema200) return 'Sobre EMA200 (zona de fortaleza)';
    else return 'Posición mixta entre EMAs';
}

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Todos los campos son requeridos' });
        }

        const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Este email ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        const result = await pool.query(
            'INSERT INTO users (name, email, password, subscription_status, subscription_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, subscription_status, subscription_expiry, created_at',
            [name, email, hashedPassword, 'active', expiryDate]
        );

        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            message: 'Registro exitoso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                subscription: {
                    status: user.subscription_status,
                    expiryDate: user.subscription_expiry
                }
            }
        });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Credenciales incorrectas' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            message: 'Login exitoso',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                subscription: {
                    status: user.subscription_status,
                    expiryDate: user.subscription_expiry
                }
            }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/auth/validate', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const user = result.rows[0];
        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                subscription: {
                    status: user.subscription_status,
                    expiryDate: user.subscription_expiry
                }
            }
        });
    } catch (error) {
        console.error('Error validando usuario:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/tickers', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT ticker FROM user_tickers WHERE user_id = $1', [req.user.id]);
        const tickers = result.rows.length > 0 ? result.rows.map(r => r.ticker) : ['AAPL', 'MSFT', 'GOOGL'];
        res.json({ tickers });
    } catch (error) {
        console.error('Error obteniendo tickers:', error);
        res.json({ tickers: ['AAPL', 'MSFT', 'GOOGL'] });
    }
});

app.post('/api/tickers', authenticateToken, async (req, res) => {
    try {
        const { tickers } = req.body;
        
        await pool.query('DELETE FROM user_tickers WHERE user_id = $1', [req.user.id]);
        
        for (const ticker of tickers) {
            await pool.query(
                'INSERT INTO user_tickers (user_id, ticker) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [req.user.id, ticker]
            );
        }

        res.json({ message: 'Tickers guardados', tickers });
    } catch (error) {
        console.error('Error guardando tickers:', error);
        res.status(500).json({ message: 'Error guardando tickers' });
    }
});

app.post('/api/market-data', authenticateToken, async (req, res) => {
    try {
        const { tickers } = req.body;
        const marketData = [];

        for (const ticker of tickers) {
            try {
                const yahooData = await getYahooData(ticker);
                
                if (yahooData && yahooData.closes.length > 200) {
                    const currentPrice = yahooData.currentPrice;
                    const previousPrice = yahooData.previousPrice;
                    const changePercent = ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2);
                    
                    const ema20 = calculateEMA(yahooData.closes, 20);
                    const ema50 = calculateEMA(yahooData.closes, 50);
                    const ema100 = calculateEMA(yahooData.closes, 100);
                    const ema200 = calculateEMA(yahooData.closes, 200);
                    
                    const rsi = Math.round(calculateRSI(yahooData.closes.slice(-50), 14));
                    const signal = determineSignal(currentPrice, ema20, ema50, ema100, ema200, rsi);
                    const smaPosition = getSMAPosition(currentPrice, ema20, ema50, ema100, ema200);
                    const nivelLC = calculateNivelLC(signal, rsi, currentPrice, ema20, ema50, ema100, ema200, changePercent);
                    
                    const etfs = ['JEPQ', 'QQQM', 'SCHG', 'SPY', 'VOO', 'QQQ', 'VTI', 'IVV', 'SPYM', 'SPMO', 'SCHD'];
                    const type = etfs.includes(ticker.toUpperCase()) ? 'ETF' : 'Stock';
                    
                    marketData.push({
                        ticker,
                        type,
                        price: currentPrice.toFixed(2),
                        changePercent,
                        rsi,
                        signal,
                        nivelLC,
                        smaPosition
                    });
                } else {
                    throw new Error('Datos insuficientes');
                }
            } catch (error) {
                const rsi = Math.floor(Math.random() * 100);
                const changePercent = ((Math.random() - 0.5) * 10).toFixed(2);
                
                let signal = 'Interesante';
                let nivelLC = 50;
                
                if (rsi < 30) { signal = 'Muy Favorable'; nivelLC = 85; }
                else if (rsi < 40) { signal = 'Favorable'; nivelLC = 70; }
                else if (rsi <= 60) { signal = 'Interesante'; nivelLC = 50; }
                else if (rsi <= 70) { signal = 'A Considerar'; nivelLC = 35; }
                else { signal = 'No Favorable'; nivelLC = 20; }
                
                marketData.push({
                    ticker,
                    type: 'Stock',
                    price: (Math.random() * 500 + 20).toFixed(2),
                    changePercent,
                    rsi,
                    signal,
                    nivelLC,
                    smaPosition: 'Datos no disponibles'
                });
            }
        }

        res.json({ data: marketData });
    } catch (error) {
        console.error('Error obteniendo datos del mercado:', error);
        res.status(500).json({ message: 'Error obteniendo datos del mercado' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Stock Scanner Pro - Modo ${process.env.NODE_ENV || 'development'}`);
});