# SAGD — Backend de Solicitudes de Demo

Backend Node.js que recibe los formularios del landing page, los guarda en un archivo JSON y envía una notificación por correo electrónico.

---

## Stack

| Componente | Tecnología |
|---|---|
| Servidor HTTP | Express 4 |
| Base de datos | JSON file (`data/solicitudes.json`) |
| Correo saliente | Nodemailer (SMTP) |
| Rate limiting | express-rate-limit |
| Variables de entorno | dotenv |

---

## Instalación paso a paso

### 1. Requisitos previos

- Node.js 18+ instalado  
- Un servidor o VPS con IP pública (Linux recomendado)
- Acceso SMTP: Gmail, Outlook, Mailgun, SendGrid, etc.

### 2. Clonar / subir los archivos

```bash
# Si usa Git
git clone https://github.com/su-org/sagd-backend.git
cd sagd-backend

# O simplemente suba la carpeta sagd-backend/ a su servidor vía SCP/SFTP
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Llene los valores en `.env`:

```env
PORT=3000
NODE_ENV=production

# Su dominio donde está el landing page (evita peticiones de otros orígenes)
ALLOWED_ORIGIN=https://www.sudominio.com

# SMTP — ejemplo con Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notificaciones@suempresa.com
SMTP_PASS=clave_de_aplicacion_gmail   # Ver nota abajo

# A quién llegan las solicitudes de demo
NOTIFY_TO=ventas@suempresa.com
NOTIFY_CC=gerencia@suempresa.com      # Opcional

SMTP_FROM_NAME=SAGD Sistema
SMTP_FROM_EMAIL=notificaciones@suempresa.com

DB_PATH=./data/solicitudes.json
LOG_PATH=./logs/app.log
```

> **Nota Gmail:** No use su contraseña de Google. Genere una "Contraseña de aplicación" en  
> `Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación`

### 5. Arrancar el servidor

```bash
# Desarrollo
npm run dev

# Producción (simple)
npm start

# Producción con PM2 (recomendado — se reinicia automáticamente)
npm install -g pm2
pm2 start server.js --name sagd-backend
pm2 save
pm2 startup   # para que arranque con el sistema
```

### 6. Conectar el landing page

Abra `SAGD_landing.html` y busque la línea:

```javascript
const API_URL = 'http://localhost:3000/api/demo';
```

Cámbiela por la URL real de su servidor:

```javascript
const API_URL = 'https://api.sudominio.com/api/demo';
```

---

## Endpoints disponibles

### `POST /api/demo`
Recibe una solicitud de demostración.

**Body JSON:**
```json
{
  "nombre":   "María Rodríguez",
  "cargo":    "Gerente de Operaciones",
  "empresa":  "Corporación ALBA",
  "email":    "maria@corp.com",
  "telefono": "+58 412 555-1234",
  "sector":   "Manufactura e Industria",
  "tamano":   "101 – 500 colaboradores",
  "modulos":  ["Retención y Disposición", "Auditoría e Informes"],
  "mensaje":  "Quisiera ver el módulo de retención en detalle",
  "contacto": "Correo electrónico"
}
```

**Respuesta exitosa (201):**
```json
{ "ok": true, "ref": "SAGD-X4Z9KA" }
```

**Respuesta con errores de validación (422):**
```json
{ "ok": false, "errors": { "email": "Email inválido" } }
```

---

### `GET /api/solicitudes`
Lista todas las solicitudes recibidas.

**Parámetros opcionales:**
- `?page=1&limit=20` — paginación
- `?sector=Banca y Finanzas` — filtrar por sector
- `?q=maria` — búsqueda por nombre, empresa o email

**Ejemplo:**
```
GET /api/solicitudes?page=1&limit=10&sector=Banca%20y%20Finanzas
```

---

### `GET /api/stats`
Estadísticas generales del sistema.

```json
{
  "ok": true,
  "stats": {
    "total": 47,
    "hoy": 3,
    "semana": 12,
    "emailsEnviados": 45,
    "porSector": [
      { "sector": "Banca y Finanzas", "total": 14 },
      { "sector": "Sector Público",   "total": 9  }
    ]
  }
}
```

---

### `GET /health`
Verificar que el servidor está activo.

```json
{ "ok": true, "uptime": 3612.4, "ts": "2025-10-15T14:32:00.000Z" }
```

---

## Dónde quedan los datos

### Archivo JSON
Todas las solicitudes se guardan en `data/solicitudes.json`:

```json
[
  {
    "id": 1,
    "ref": "SAGD-X4Z9KA",
    "nombre": "María Rodríguez",
    "cargo": "Gerente de Operaciones",
    "empresa": "Corporación ALBA",
    "email": "maria@corp.com",
    "telefono": "+58 412 555-1234",
    "sector": "Manufactura e Industria",
    "tamano": "101 – 500 colaboradores",
    "modulos": ["Retención y Disposición", "Auditoría e Informes"],
    "mensaje": "Queremos ver el módulo de retención",
    "contacto": "Correo electrónico",
    "ip": "190.41.22.18",
    "enviado": true,
    "created_at": "2025-10-15T14:32:00.000Z"
  }
]
```

### Correo electrónico
Llega a `NOTIFY_TO` (y `NOTIFY_CC` si está configurado) un email con todos los datos, con botón de respuesta directa y número de referencia.

### Logs
Cada operación queda registrada en `logs/app.log` en formato JSON:
```
{"ts":"2025-10-15T14:32:01Z","level":"INFO","msg":"Solicitud guardada","id":1,"ref":"SAGD-X4Z9KA","empresa":"Corporación ALBA"}
{"ts":"2025-10-15T14:32:02Z","level":"INFO","msg":"Correo enviado","ref":"SAGD-X4Z9KA"}
```

---

## Seguridad incluida

| Medida | Detalle |
|---|---|
| Rate limiting | Máximo 5 envíos por IP cada 15 minutos |
| Sanitización | Se eliminan caracteres `<>` de todos los campos |
| Validación server-side | Campos requeridos y formato de email validados en el servidor |
| CORS | Solo acepta peticiones del dominio configurado en `ALLOWED_ORIGIN` |
| Body limit | Máximo 64 KB por petición |
| Trust proxy | Compatible con Nginx / Caddy como proxy inverso |

---

## Configuración nginx (opcional)

Si pone Nginx delante del backend:

```nginx
server {
    listen 443 ssl;
    server_name api.sudominio.com;

    location /api/ {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

---

## Estructura del proyecto

```
sagd-backend/
├── server.js              ← Servidor principal
├── package.json
├── .env.example           ← Plantilla de configuración
├── .env                   ← Su configuración (NO subir a Git)
├── data/
│   └── solicitudes.json   ← Base de datos (generado automáticamente)
└── logs/
    └── app.log            ← Registro de operaciones
```
