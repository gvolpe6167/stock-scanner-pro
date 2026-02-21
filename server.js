// server.js - Usando Python yfinance para datos precisos
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { exec } = require('child_process');
const { Pool } = require('pg');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

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

app.get('/api/setup-admin', async (req, res) => {
    try {
        try {
            await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE');
            console.log('✅ Columna is_admin verificada/agregada');
        } catch (e) {
            console.log('⚠️ Error agregando columna:', e.message);
        }

        const adminEmail = 'gvolpe@gmail.com';
        const adminPassword = 'Admin2024!Segura';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const expiryDate = new Date('2099-12-31');
        
        const adminExists = await pool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
        
        if (adminExists.rows.length === 0) {
            await pool.query(
                'INSERT INTO users (name, email, password, subscription_status, subscription_expiry, is_admin) VALUES ($1, $2, $3, $4, $5, $6)',
                ['Administrador', adminEmail, hashedPassword, 'active', expiryDate, true]
            );
            res.json({ success: true, message: 'Admin creado exitosamente', email: adminEmail });
        } else {
            await pool.query(
                'UPDATE users SET is_admin = TRUE, password = $1, subscription_status = $2, subscription_expiry = $3 WHERE email = $4', 
                [hashedPassword, 'active', expiryDate, adminEmail]
            );
            res.json({ success: true, message: 'Usuario actualizado: admin + contraseña reseteada', email: adminEmail, password: 'Admin2024!Segura' });
        }
    } catch (error) {
        console.error('❌ Error en setup-admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

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

function authenticateAdmin(req, res, next) {
    authenticateToken(req, res, async () => {
        try {
            const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
            if (result.rows.length === 0 || !result.rows[0].is_admin) {
                return res.status(403).json({ message: 'Acceso denegado. Solo administradores.' });
            }
            next();
        } catch (error) {
            res.status(500).json({ message: 'Error verificando permisos' });
        }
    });
}

// Función para obtener datos usando Python yfinance
async function getYahooData(ticker) {
    try {
        const pythonScript = path.join(__dirname, 'get_stock_data.py');
        const { stdout, stderr } = await execPromise(`python3 ${pythonScript} ${ticker}`);
        
        if (stderr) {
            console.log(`⚠️ Python stderr para ${ticker}:`, stderr);
        }
        
        const result = JSON.parse(stdout);
        
        if (result.error) {
            console.log(`❌ Error Python para ${ticker}:`, result.error);
            return null;
        }
        
        if (result.success && result.closes && result.closes.length >= 50) {
            console.log(`✅ Datos obtenidos vía Python para ${ticker}: ${result.closes.length} días`);
            return {
                currentPrice: result.currentPrice,
                previousPrice: result.previousPrice,
                closes: result.closes
            };
        }
        
        return null;
    } catch (error) {
        console.error(`❌ Error ejecutando Python para ${ticker}:`, error.message);
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
    if (prices.length < period + 100) return 50;
    const recentPrices = prices.slice(-200);
    let gains = 0, losses = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = recentPrices[i] - recentPrices[i - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for (let i = period + 1; i < recentPrices.length; i++) {
        const change = recentPrices[i] - recentPrices[i - 1];
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
        }
    }
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return Math.round(rsi * 100) / 100;
}

function determineSignal(price, ema20, ema50, ema100, ema200) {
    const belowAll = price < ema200 && price < ema100 && price < ema50 && price < ema20;
    const aboveAll = price > ema200 && price > ema100 && price > ema50 && price > ema20;
    if (belowAll) return 'Muy Favorable';
    if (price >= ema200 && price < ema100) return 'Favorable';
    if (price >= ema100 && price < ema50) return 'Interesante';
    if (price >= ema50 && price < ema20) return 'A Considerar';
    if (aboveAll) return 'No Favorable';
    if (price < ema200) return 'Muy Favorable';
    if (price < ema100) return 'Favorable';
    if (price < ema50) return 'Interesante';
    if (price < ema20) return 'A Considerar';
    return 'No Favorable';
}

function calculateNivelLC(signal, rsi) {
    let nivelLC = 50;
    if (signal === 'Muy Favorable') nivelLC = 85;
    else if (signal === 'Favorable') nivelLC = 70;
    else if (signal === 'Interesante') nivelLC = 50;
    else if (signal === 'A Considerar') nivelLC = 35;
    else if (signal === 'No Favorable') nivelLC = 20;
    if (rsi < 25) nivelLC = Math.min(100, nivelLC + 10);
    else if (rsi < 35) nivelLC = Math.min(100, nivelLC + 5);
    else if (rsi > 75) nivelLC = Math.max(0, nivelLC - 10);
    else if (rsi > 65) nivelLC = Math.max(0, nivelLC - 5);
    return Math.round(Math.min(100, Math.max(0, nivelLC)));
}

function getSMAPosition(price, ema20, ema50, ema100, ema200) {
    const aboveAll = price > ema20 && price > ema50 && price > ema100 && price > ema200;
    const belowAll = price < ema20 && price < ema50 && price < ema100 && price < ema200;
    if (aboveAll) return 'Sobre todas las EMA (20,50,100,200)';
    if (belowAll) return 'Debajo de todas las EMA';
    if (price >= ema200 && price < ema100) return 'Entre EMA200 y EMA100';
    if (price >= ema100 && price < ema50) return 'Entre EMA100 y EMA50';
    if (price >= ema50 && price < ema20) return 'Entre EMA50 y EMA20';
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
        const trialExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        const result = await pool.query(
            'INSERT INTO users (name, email, password, subscription_status, subscription_expiry) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, subscription_status, subscription_expiry',
            [name, email, hashedPassword, 'trial', trialExpiry]
        );
        
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            message: 'Registro exitoso - 7 días de prueba gratis',
            token,
            user: { id: user.id, name: user.name, email: user.email, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } }
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
        if (result.rows.length === 0) return res.status(401).json({ message: 'Credenciales incorrectas' });
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Credenciales incorrectas' });
        
        const now = new Date();
        const expiry = new Date(user.subscription_expiry);
        
        if (expiry < now && user.subscription_status !== 'blocked' && !user.is_admin) {
            await pool.query('UPDATE users SET subscription_status = $1 WHERE id = $2', ['expired', user.id]);
            user.subscription_status = 'expired';
        }
        
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            message: 'Login exitoso',
            token,
            user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin || false, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } }
        });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/auth/validate', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Usuario no encontrado' });
        
        const user = result.rows[0];
        const now = new Date();
        const expiry = new Date(user.subscription_expiry);
        
        if (expiry < now && user.subscription_status !== 'blocked' && !user.is_admin) {
            await pool.query('UPDATE users SET subscription_status = $1 WHERE id = $2', ['expired', user.id]);
            user.subscription_status = 'expired';
        }
        
        res.json({
            user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin || false, subscription: { status: user.subscription_status, expiryDate: user.subscription_expiry } }
        });
    } catch (error) {
        console.error('Error en validación:', error);
        res.status(500).json({ message: 'Error en el servidor' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, subscription_status, subscription_expiry, created_at FROM users WHERE is_admin = FALSE OR is_admin IS NULL ORDER BY created_at DESC');
        res.json({ users: result.rows });
    } catch (error) {
        res.status(500).json({ message: 'Error obteniendo usuarios' });
    }
});

app.post('/api/admin/activate-user', authenticateAdmin, async (req, res) => {
    try {
        const { userId, days } = req.body;
        const daysToAdd = days || 30;
        const newExpiry = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
        await pool.query('UPDATE users SET subscription_status = $1, subscription_expiry = $2 WHERE id = $3', ['active', newExpiry, userId]);
        res.json({ message: `Usuario activado por ${daysToAdd} días` });
    } catch (error) {
        res.status(500).json({ message: 'Error activando usuario' });
    }
});

app.post('/api/admin/block-user', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        await pool.query('UPDATE users SET subscription_status = $1 WHERE id = $2', ['blocked', userId]);
        res.json({ message: 'Usuario bloqueado' });
    } catch (error) {
        res.status(500).json({ message: 'Error bloqueando usuario' });
    }
});

app.post('/api/admin/extend-trial', authenticateAdmin, async (req, res) => {
    try {
        const { userId, days } = req.body;
        const daysToAdd = days || 7;
        const userResult = await pool.query('SELECT subscription_expiry FROM users WHERE id = $1', [userId]);
        const currentExpiry = new Date(userResult.rows[0].subscription_expiry);
        const newExpiry = new Date(currentExpiry.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        await pool.query('UPDATE users SET subscription_expiry = $1 WHERE id = $2', [newExpiry, userId]);
        res.json({ message: `Suscripción extendida por ${daysToAdd} días` });
    } catch (error) {
        res.status(500).json({ message: 'Error extendiendo suscripción' });
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
        const userResult = await pool.query('SELECT subscription_status, is_admin FROM users WHERE id = $1', [req.user.id]);
        const user = userResult.rows[0];
        
        if (!user.is_admin && user.subscription_status !== 'active' && user.subscription_status !== 'trial') {
            return res.status(403).json({ message: 'Suscripción expirada o bloqueada. Contacta al administrador.' });
        }
        
        const { tickers } = req.body;
        const marketData = [];

        for (const ticker of tickers) {
            try {
                const yahooData = await getYahooData(ticker);
                if (yahooData && yahooData.closes.length >= 50) {
                    const currentPrice = yahooData.currentPrice;
                    const previousPrice = yahooData.previousPrice;
                    const changePercent = ((currentPrice - previousPrice) / previousPrice * 100).toFixed(2);
                    const ema20 = calculateEMA(yahooData.closes, 20);
                    const ema50 = calculateEMA(yahooData.closes, 50);
                    const ema100 = yahooData.closes.length >= 100 ? calculateEMA(yahooData.closes, 100) : ema50;
                    const ema200 = yahooData.closes.length >= 200 ? calculateEMA(yahooData.closes, 200) : ema100;
                    const rsi = calculateRSI(yahooData.closes, 14);
                    const signal = determineSignal(currentPrice, ema20, ema50, ema100, ema200);
                    const smaPosition = getSMAPosition(currentPrice, ema20, ema50, ema100, ema200);
                    const nivelLC = calculateNivelLC(signal, rsi);
                    const etfs = ['JEPQ', 'QQQM', 'SCHG', 'SPY', 'VOO', 'QQQ', 'VTI', 'IVV', 'SPYM', 'SPMO', 'SCHD'];
                    const type = etfs.includes(ticker.toUpperCase()) ? 'ETF' : 'Stock';
                    marketData.push({ ticker, type, price: currentPrice.toFixed(2), changePercent, rsi: Math.round(rsi), signal, nivelLC, smaPosition });
                    console.log(`✅ ${ticker}: $${currentPrice.toFixed(2)}, RSI=${rsi.toFixed(2)}, EMA20=${ema20?.toFixed(2)}, Señal=${signal}`);
                } else {
                    throw new Error('Datos insuficientes');
                }
            } catch (error) {
                console.error(`Error con ${ticker}:`, error.message);
                marketData.push({ ticker, type: 'Stock', price: 'N/A', changePercent: '0.00', rsi: 50, signal: 'Interesante', nivelLC: 50, smaPosition: 'Actualizando...' });
            }
        }
        res.json({ data: marketData });
    } catch (error) {
        console.error('Error en market-data:', error);
        res.status(500).json({ message: 'Error obteniendo datos del mercado' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Stock Scanner Pro - Usando Python yfinance`);
    console.log(`🔧 Para crear admin: GET /api/setup-admin`);
});