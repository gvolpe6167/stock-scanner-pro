// app.js - Frontend con detección automática de entorno
const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

let currentUser = null;
let userTickers = [];
let updateInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

function checkAuth() {
    const token = localStorage.getItem('token');
    if (token) {
        validateToken(token);
    }
}

async function validateToken(token) {
    try {
        const response = await fetch(`${API_URL}/auth/validate`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showDashboard();
        } else {
            localStorage.removeItem('token');
            showAuth();
        }
    } catch (error) {
        console.error('Error validando token:', error);
        showAuth();
    }
}

function showAuth() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').classList.remove('active');
}

function showDashboard() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('dashboardScreen').classList.add('active');
    
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    
    updateSubscriptionStatus();
    loadUserTickers();
    startAutoUpdate();
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    hideError();
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    hideError();
}

async function login(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            showDashboard();
        } else {
            showError(data.message || 'Error al iniciar sesión');
        }
    } catch (error) {
        showError('Error de conexión. Por favor intenta de nuevo.');
    }
}

async function register(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            showDashboard();
        } else {
            showError(data.message || 'Error al registrarse');
        }
    } catch (error) {
        showError('Error de conexión. Por favor intenta de nuevo.');
    }
}

function logout() {
    localStorage.removeItem('token');
    currentUser = null;
    userTickers = [];
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    showAuth();
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.classList.remove('show');
}

function updateSubscriptionStatus() {
    const statusElement = document.getElementById('subscriptionStatus');
    const expiryElement = document.getElementById('subscriptionExpiry');
    
    if (!currentUser.subscription) {
        statusElement.textContent = '⚠ Sin suscripción';
        statusElement.className = 'subscription-status status-expired';
        expiryElement.textContent = 'Activa tu suscripción para continuar';
        return;
    }

    const expiryDate = new Date(currentUser.subscription.expiryDate);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (currentUser.subscription.status === 'active') {
        statusElement.textContent = '✓ Activa';
        statusElement.className = 'subscription-status status-active';
        
        if (daysLeft <= 5) {
            statusElement.className = 'subscription-status status-warning';
            expiryElement.textContent = `Renueva en ${daysLeft} días`;
        } else {
            expiryElement.textContent = `Válida hasta ${expiryDate.toLocaleDateString('es-ES')}`;
        }
    } else {
        statusElement.textContent = '❌ Expirada';
        statusElement.className = 'subscription-status status-expired';
        expiryElement.textContent = 'Renueva tu suscripción';
    }
}

async function loadUserTickers() {
    try {
        const response = await fetch(`${API_URL}/tickers`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            userTickers = data.tickers || ['AAPL', 'MSFT', 'GOOGL'];
        } else {
            userTickers = ['AAPL', 'MSFT', 'GOOGL'];
        }
    } catch (error) {
        console.error('Error cargando tickers:', error);
        userTickers = ['AAPL', 'MSFT', 'GOOGL'];
    }
    
    updateScanner();
}

async function addTicker() {
    const input = document.getElementById('newTicker');
    const ticker = input.value.trim().toUpperCase();
    
    if (!ticker) {
        alert('Por favor ingresa un ticker válido');
        return;
    }

    if (userTickers.includes(ticker)) {
        alert('Este ticker ya está en tu lista');
        return;
    }

    userTickers.push(ticker);
    input.value = '';

    await saveTickers();
    updateScanner();
}

async function deleteTicker(ticker) {
    if (!confirm(`¿Estás seguro de eliminar ${ticker}?`)) {
        return;
    }

    userTickers = userTickers.filter(t => t !== ticker);
    await saveTickers();
    updateScanner();
}

async function saveTickers() {
    try {
        await fetch(`${API_URL}/tickers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ tickers: userTickers })
        });
    } catch (error) {
        console.error('Error guardando tickers:', error);
    }
}

async function updateScanner() {
    const tbody = document.getElementById('scannerBody');
    
    if (!currentUser || currentUser.subscription?.status !== 'active') {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <h3>⚠ Suscripción requerida</h3>
                    <p>Activa tu suscripción para acceder al scanner</p>
                </td>
            </tr>
        `;
        return;
    }

    try {
        const response = await fetch(`${API_URL}/market-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ tickers: userTickers })
        });

        if (!response.ok) {
            throw new Error('Error obteniendo datos del mercado');
        }

        const marketData = await response.json();
        renderScannerTable(marketData.data);
        
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString('es-ES');
    } catch (error) {
        console.error('Error actualizando scanner:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="loading">
                    Error cargando datos. Reintentando...
                </td>
            </tr>
        `;
    }
}

function renderScannerTable(data) {
    const tbody = document.getElementById('scannerBody');
    let html = '';

    for (const item of data) {
        const signalClass = item.signal === 'Muy Favorable' ? 'signal-muy-favorable' :
                           item.signal === 'Favorable' ? 'signal-favorable' :
                           item.signal === 'Interesante' ? 'signal-interesante' :
                           item.signal === 'A Considerar' ? 'signal-considerar' :
                           'signal-no-favorable';

        const nivelClass = item.nivelLC >= 70 ? 'nivel-high' :
                          item.nivelLC >= 40 ? 'nivel-medium' : 'nivel-low';

        let smaClass = 'sma-mixed';
        let smaTextColor = '#fff';
        
        if (item.smaPosition.includes('Debajo de todas')) {
            smaClass = 'sma-below';
            smaTextColor = '#ffebee';
        } else if (item.smaPosition.includes('Sobre todas')) {
            smaClass = 'sma-above';
            smaTextColor = '#e8f5e9';
        } else {
            smaClass = 'sma-mixed';
            smaTextColor = '#e3f2fd';
        }

        const priceClass = parseFloat(item.changePercent) >= 0 ? 'price-positive' : 'price-negative';
        const changeSymbol = parseFloat(item.changePercent) >= 0 ? '+' : '';
        const yahooLink = `https://finance.yahoo.com/quote/${item.ticker}`;

        html += `
            <tr>
                <td>
                    <a href="${yahooLink}" target="_blank" class="ticker-link">${item.ticker}</a>
                </td>
                <td>
                    <span class="type-badge type-${item.type.toLowerCase()}">${item.type}</span>
                </td>
                <td>
                    <span style="font-weight: bold; font-size: 1.1rem;">${item.rsi}</span>
                </td>
                <td class="${priceClass}">
                    $${item.price}
                </td>
                <td class="${priceClass}">
                    ${changeSymbol}${item.changePercent}%
                </td>
                <td>
                    <span class="${signalClass}">${item.signal}</span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="nivel-bar" style="flex: 1;">
                            <div class="nivel-fill ${nivelClass}" style="width: ${item.nivelLC}%"></div>
                        </div>
                        <span style="font-weight: bold; min-width: 30px;">${item.nivelLC}</span>
                    </div>
                </td>
                <td>
                    <span class="sma-status ${smaClass}" style="color: ${smaTextColor}; font-weight: 500;">${item.smaPosition}</span>
                </td>
                <td>
                    <button class="delete-btn" onclick="deleteTicker('${item.ticker}')">Eliminar</button>
                </td>
            </tr>
        `;
    }

    tbody.innerHTML = html;
}

function startAutoUpdate() {
    updateInterval = setInterval(updateScanner, 300000);
}

document.addEventListener('DOMContentLoaded', () => {
    const newTickerInput = document.getElementById('newTicker');
    if (newTickerInput) {
        newTickerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addTicker();
            }
        });
    }
});