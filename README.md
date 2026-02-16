# 📊 Stock Scanner Pro - Guía Completa de Instalación

## 🎯 ¿Qué es esto?

Una plataforma completa de suscripción para ofrecer servicios de scanner de acciones y ETFs. Los usuarios pagan $20/mes y pueden:
- Ver datos en tiempo real de Yahoo Finance
- Agregar sus propios tickers personalizados
- Ver indicadores técnicos (RSI, SMAs, señales)
- Tú como administrador puedes bloquear usuarios que no paguen

---

## 📋 Requisitos Previos

1. **Node.js** (versión 16 o superior)
   - Descargar de: https://nodejs.org/
   - Verificar instalación: `node --version`

2. **Cuenta de Stripe** (para procesar pagos)
   - Crear cuenta gratuita en: https://stripe.com/
   - Obtener claves API del dashboard

3. **Editor de código** (opcional pero recomendado)
   - VS Code: https://code.visualstudio.com/

---

## 🚀 Instalación Paso a Paso

### PASO 1: Preparar los archivos

1. Crea una carpeta para tu proyecto:
   ```bash
   mkdir stock-scanner-pro
   cd stock-scanner-pro
   ```

2. Copia todos los archivos que te proporcioné:
   - `index.html` (frontend)
   - `app.js` (lógica del frontend)
   - `server.js` (backend)
   - `package.json` (dependencias)
   - `.env.example` (variables de entorno)

### PASO 2: Instalar dependencias

```bash
npm install
```

Esto instalará todas las librerías necesarias:
- Express (servidor web)
- JWT (autenticación)
- Bcrypt (encriptación de contraseñas)
- Yahoo Finance 2 (datos de mercado)
- Stripe (procesamiento de pagos)

### PASO 3: Configurar Stripe

1. Ve a https://dashboard.stripe.com/
2. Regístrate o inicia sesión
3. Ve a "Developers" → "API keys"
4. Copia:
   - **Publishable key** (pk_test_...)
   - **Secret key** (sk_test_...)

5. Configura el webhook:
   - Ve a "Developers" → "Webhooks"
   - Click en "Add endpoint"
   - URL: `http://tu-dominio.com/api/stripe/webhook`
   - Selecciona eventos:
     * checkout.session.completed
     * invoice.payment_succeeded
     * invoice.payment_failed
   - Copia el **Webhook signing secret**

### PASO 4: Configurar variables de entorno

1. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con tus datos:
   ```
   PORT=3000
   JWT_SECRET=cambiar_por_algo_super_seguro_y_aleatorio
   STRIPE_SECRET_KEY=sk_test_TU_CLAVE_AQUI
   STRIPE_PUBLISHABLE_KEY=pk_test_TU_CLAVE_AQUI
   STRIPE_WEBHOOK_SECRET=whsec_TU_WEBHOOK_SECRET_AQUI
   FRONTEND_URL=http://localhost:8000
   ```

### PASO 5: Iniciar el servidor

```bash
npm start
```

Deberías ver:
```
✅ Servidor corriendo en http://localhost:3000
📊 Stock Scanner Pro Backend
💳 Stripe integrado para pagos
📈 Yahoo Finance integrado
```

### PASO 6: Abrir el frontend

1. Abre `index.html` en tu navegador
2. O usa un servidor local:
   ```bash
   # Opción 1: Con Python
   python -m http.server 8000
   
   # Opción 2: Con Node
   npx http-server -p 8000
   ```
3. Ve a: http://localhost:8000

---

## 🎨 Cómo Funciona

### Para los Usuarios:

1. **Registro**
   - Llenan el formulario
   - Son redirigidos a Stripe para pagar $20
   - Después del pago, su cuenta se activa automáticamente

2. **Login**
   - Ingresan email y contraseña
   - Ven su dashboard personal

3. **Usar el Scanner**
   - Agregan tickers personalizados (AAPL, TSLA, etc.)
   - Ven datos en tiempo real
   - Los datos se actualizan cada 5 minutos

### Para Ti (Administrador):

1. **Ver todos los usuarios**
   ```bash
   curl -X GET http://localhost:3000/api/admin/users \
     -H "Authorization: Bearer TU_TOKEN_DE_ADMIN"
   ```

2. **Bloquear un usuario que no pagó**
   ```bash
   curl -X POST http://localhost:3000/api/admin/block-user \
     -H "Authorization: Bearer TU_TOKEN_DE_ADMIN" \
     -H "Content-Type: application/json" \
     -d '{"userId": "ID_DEL_USUARIO"}'
   ```

3. **Activar usuario manualmente**
   ```bash
   curl -X POST http://localhost:3000/api/admin/activate-user \
     -H "Authorization: Bearer TU_TOKEN_DE_ADMIN" \
     -H "Content-Type: application/json" \
     -d '{"userId": "ID_DEL_USUARIO"}'
   ```

---

## 💰 Configuración de Stripe (Pagos)

### Modo Test (Desarrollo)

Para probar sin cobrar dinero real:
- Usa las claves que empiezan con `pk_test_` y `sk_test_`
- Tarjeta de prueba: `4242 4242 4242 4242`
- Fecha: Cualquier fecha futura
- CVC: Cualquier 3 dígitos

### Modo Producción (Cobrar de verdad)

1. Activa tu cuenta de Stripe (verificación de identidad)
2. Cambia a claves de producción (pk_live_ y sk_live_)
3. Configura webhooks en producción
4. Actualiza `.env` con las nuevas claves

---

## 🌐 Desplegar en Internet (Producción)

### Opción 1: Heroku (Gratis/Fácil)

```bash
# 1. Instalar Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# 2. Login
heroku login

# 3. Crear app
heroku create stock-scanner-pro

# 4. Configurar variables
heroku config:set JWT_SECRET=tu_secret
heroku config:set STRIPE_SECRET_KEY=sk_live_...
heroku config:set STRIPE_WEBHOOK_SECRET=whsec_...

# 5. Desplegar
git init
git add .
git commit -m "Initial commit"
git push heroku main
```

### Opción 2: DigitalOcean / AWS / Google Cloud

1. Crea un servidor (droplet/EC2/VM)
2. Instala Node.js
3. Sube tu código
4. Configura Nginx como reverse proxy
5. Usa PM2 para mantener el servidor corriendo
6. Configura SSL con Let's Encrypt

### Opción 3: Vercel (Solo Frontend) + Railway (Backend)

**Frontend en Vercel:**
```bash
npm i -g vercel
vercel
```

**Backend en Railway:**
1. Ve a https://railway.app/
2. Conecta tu repositorio de GitHub
3. Configura variables de entorno
4. Despliega automáticamente

---

## 🔐 Seguridad Importante

### Antes de producción:

1. **Cambiar JWT_SECRET**
   - Usa algo aleatorio y complejo
   - Generador: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

2. **Usar HTTPS**
   - Stripe requiere HTTPS en producción
   - Usa Let's Encrypt (gratis)

3. **Validar emails**
   - Agrega verificación de email
   - Usa servicios como SendGrid

4. **Base de datos real**
   - No uses la DB en memoria
   - Usa PostgreSQL, MongoDB o MySQL

5. **Rate limiting**
   - Limita intentos de login
   - Usa express-rate-limit

---

## 📊 Base de Datos Recomendada (Producción)

### MongoDB (Más fácil)

```javascript
// Instalar
npm install mongoose

// Conectar
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI);

// Schema de Usuario
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  subscription: {
    status: String,
    expiryDate: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String
  },
  createdAt: { type: Date, default: Date.now }
});
```

### PostgreSQL (Más robusto)

```bash
# Instalar
npm install pg

# Crear tablas
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255),
  subscription_status VARCHAR(50),
  subscription_expiry TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🛠 Panel de Administración

Puedes crear un panel HTML simple para administrar:

```html
<!-- admin.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Admin Panel</title>
</head>
<body>
    <h1>Panel de Administración</h1>
    <div id="users"></div>
    
    <script>
        async function loadUsers() {
            const response = await fetch('http://localhost:3000/api/admin/users', {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('adminToken')
                }
            });
            const data = await response.json();
            
            document.getElementById('users').innerHTML = data.users.map(u => `
                <div>
                    <h3>${u.name} (${u.email})</h3>
                    <p>Estado: ${u.subscription.status}</p>
                    <button onclick="blockUser('${u.id}')">Bloquear</button>
                    <button onclick="activateUser('${u.id}')">Activar</button>
                </div>
            `).join('');
        }
        
        loadUsers();
    </script>
</body>
</html>
```

---

## 📞 Soporte y Preguntas Frecuentes

### ¿Cómo agrego más indicadores técnicos?

Modifica la función `calculateRSI` y agrega nuevas funciones en `server.js`:

```javascript
async function calculateMACD(ticker) {
    // Obtener datos históricos
    const queryOptions = { period1: '2023-01-01', interval: '1d' };
    const result = await yahooFinance.historical(ticker, queryOptions);
    
    // Calcular MACD
    // ... tu lógica aquí
    
    return macdValue;
}
```

### ¿Cómo cambio el precio mensual?

En `server.js`, línea donde creas la sesión de Stripe:

```javascript
unit_amount: 2000, // Cambiar a 3000 para $30, 5000 para $50, etc.
```

### ¿Puedo ofrecer planes anuales?

Sí, crea otro endpoint para suscripción anual:

```javascript
recurring: {
    interval: 'year', // En vez de 'month'
},
```

---

## 🎓 Próximos Pasos

1. **Mejorar el diseño**
   - Personaliza colores
   - Agrega tu logo
   - Mejora la UX

2. **Agregar funcionalidades**
   - Alertas por email
   - Notificaciones push
   - Gráficos interactivos
   - Exportar a PDF

3. **Marketing**
   - Crea página de landing
   - Ofrece prueba gratis
   - Programa de referidos

4. **Escalar**
   - Optimiza base de datos
   - Agrega cache (Redis)
   - CDN para estáticos

---

## 📝 Checklist Pre-Lanzamiento

- [ ] Stripe configurado en modo producción
- [ ] Variables de entorno seguras
- [ ] Base de datos configurada
- [ ] HTTPS activado
- [ ] Backup automático configurado
- [ ] Términos y condiciones escritos
- [ ] Política de privacidad
- [ ] Email de soporte configurado
- [ ] Sistema de facturación
- [ ] Analytics instalado (Google Analytics)

---

## 🆘 Troubleshooting

**Error: "Cannot find module"**
```bash
npm install
```

**Error: "Port already in use"**
```bash
# Cambiar PORT en .env
PORT=3001
```

**Error con Stripe**
- Verifica que las claves sean correctas
- Asegúrate de usar claves de test en desarrollo

**Datos no se actualizan**
- Verifica conexión a Yahoo Finance
- Revisa console del navegador (F12)

---

## 💡 Consejos Pro

1. **Usa PM2 en producción**
   ```bash
   npm install -g pm2
   pm2 start server.js --name stock-scanner
   pm2 startup
   pm2 save
   ```

2. **Logs**
   ```bash
   pm2 logs stock-scanner
   ```

3. **Monitoreo**
   - Usa servicios como UptimeRobot
   - Configura alertas

4. **Backup**
   - Programa backups diarios de la DB
   - Usa servicios como AWS S3

---

## 📧 Contacto y Soporte

¿Necesitas ayuda? Aquí algunas opciones:

1. **Documentación de las herramientas:**
   - Stripe: https://stripe.com/docs
   - Yahoo Finance 2: https://github.com/gadicc/node-yahoo-finance2
   - Express: https://expressjs.com/

2. **Comunidades:**
   - Stack Overflow
   - Reddit r/webdev
   - Discord de desarrolladores

---

¡Éxito con tu negocio de Stock Scanner Pro! 🚀📈
