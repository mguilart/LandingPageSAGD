'use strict';

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const nodemailer = require('nodemailer');
const path = require('path');
const fs   = require('fs');

const PORT           = process.env.PORT           || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const DB_PATH        = process.env.DB_PATH        || './data/solicitudes.json';
const LOG_PATH       = process.env.LOG_PATH       || './logs/app.log';

[path.dirname(DB_PATH), path.dirname(LOG_PATH)].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
function log(level, msg, data = {}) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...data });
  logStream.write(entry + '\n');
  console.log(`[${level}] ${msg}`, Object.keys(data).length ? data : '');
}

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return [];
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (e) { log('ERROR', 'Error leyendo BD', { error: e.message }); return []; }
}

function writeDB(records) {
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), 'utf8');
}

function insertRecord(data) {
  const records = readDB();
  const record  = { id: records.length + 1, ...data, enviado: false, created_at: new Date().toISOString() };
  records.push(record);
  writeDB(records);
  return record;
}

function markSent(ref) {
  const records = readDB();
  const idx = records.findIndex(r => r.ref === ref);
  if (idx !== -1) { records[idx].enviado = true; writeDB(records); }
}

log('INFO', 'Base de datos JSON lista', { path: DB_PATH });

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

transporter.verify()
  .then(() => log('INFO', 'Conexión SMTP verificada'))
  .catch(err => log('WARN', 'SMTP no disponible', { error: err.message }));

function buildEmailHTML(data) {
  const row = (label, value) => !value ? '' : `<tr><td style="padding:8px 12px;font-size:13px;color:#4a5e78;font-weight:600;border-bottom:1px solid #e1e6ef;white-space:nowrap;width:160px;">${label}</td><td style="padding:8px 12px;font-size:13px;color:#0c1a2e;border-bottom:1px solid #e1e6ef;">${value}</td></tr>`;
  const modulos = data.modulos?.length ? data.modulos.join(', ') : '—';
  const fecha   = new Date().toLocaleString('es-VE', { dateStyle:'full', timeStyle:'short' });
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(12,26,46,.12);"><tr><td style="background:linear-gradient(135deg,#0f1e36 0%,#162a46 100%);padding:28px 32px;"><div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:700;color:#dda83b;">SAGD</div><div style="font-size:11px;color:#3d5c7a;text-transform:uppercase;letter-spacing:.1em;margin-top:4px;">Nueva solicitud de demostración</div></td></tr><tr><td style="padding:20px 32px 0;"><span style="background:#f8edda;border:1px solid #e8c87a;color:#7a4e00;font-family:monospace;font-size:12px;padding:5px 14px;border-radius:20px;">Referencia: ${data.ref}</span><span style="font-size:11px;color:#94a3b8;margin-left:12px;">${fecha}</span></td></tr><tr><td style="padding:20px 32px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e1e6ef;border-radius:8px;overflow:hidden;">${row('Nombre',data.nombre)}${row('Cargo',data.cargo)}${row('Empresa',data.empresa)}${row('Email',`<a href="mailto:${data.email}" style="color:#1d5fa0;">${data.email}</a>`)}${row('Teléfono',data.telefono||'—')}${row('Sector',data.sector)}${row('Tamaño',data.tamano||'—')}${row('Módulos',modulos)}${row('Contacto',data.contacto)}${data.mensaje?row('Mensaje',`<i>${data.mensaje}</i>`):''}></table></td></tr><tr><td style="padding:0 32px 28px;"><a href="mailto:${data.email}?subject=Demo%20SAGD%20[${data.ref}]" style="display:inline-block;background:#c8962a;color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">Responder a ${data.nombre.split(' ')[0]}</a></td></tr><tr><td style="background:#f4f6f9;padding:16px 32px;border-top:1px solid #e1e6ef;"><div style="font-size:11px;color:#94a3b8;">IP: ${data.ip||'—'} · ISO 15489-1:2016 · ISO 16175 · ISO 30300</div></td></tr></table></td></tr></table></body></html>`;
}

function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function generateRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let ref = 'SAGD-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Intente de nuevo en 15 minutos.' },
});

app.post('/api/demo', limiter, (req, res) => {
  try {
    const body = req.body;
    const errors = {};
    if (!body.nombre  || body.nombre.trim().length  < 2) errors.nombre  = 'Requerido';
    if (!body.cargo   || body.cargo.trim().length   < 2) errors.cargo   = 'Requerido';
    if (!body.empresa || body.empresa.trim().length < 2) errors.empresa = 'Requerido';
    if (!body.email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.email = 'Email inválido';
    if (!body.sector  || !body.sector.trim())            errors.sector  = 'Requerido';
    if (!body.contacto|| !body.contacto.trim())          errors.contacto= 'Requerido';

    if (Object.keys(errors).length) return res.status(422).json({ ok: false, errors });

    const data = {
      ref:      generateRef(),
      nombre:   sanitize(body.nombre),
      cargo:    sanitize(body.cargo),
      empresa:  sanitize(body.empresa),
      email:    sanitize(body.email, 254),
      telefono: sanitize(body.telefono),
      sector:   sanitize(body.sector),
      tamano:   sanitize(body.tamano),
      modulos:  Array.isArray(body.modulos) ? body.modulos.map(m => sanitize(m)) : [],
      mensaje:  sanitize(body.mensaje, 2000),
      contacto: sanitize(body.contacto),
      ip:       req.ip,
    };

    const record = insertRecord(data);
    log('INFO', 'Solicitud guardada', { id: record.id, ref: data.ref, empresa: data.empresa });

    const notifyTo  = process.env.NOTIFY_TO;
    const notifyCC  = process.env.NOTIFY_CC;
    const fromName  = process.env.SMTP_FROM_NAME  || 'SAGD Sistema';
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

    if (notifyTo && process.env.SMTP_USER) {
      const plainText = [
        `Ref: ${data.ref}`, `Nombre: ${data.nombre}`, `Cargo: ${data.cargo}`,
        `Empresa: ${data.empresa}`, `Email: ${data.email}`, `Teléfono: ${data.telefono||'—'}`,
        `Sector: ${data.sector}`, `Tamaño: ${data.tamano||'—'}`,
        `Módulos: ${data.modulos.join(', ')||'—'}`, `Contacto: ${data.contacto}`,
        `Mensaje: ${data.mensaje||'—'}`,
      ].join('\n');

      transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`, to: notifyTo,
        cc: notifyCC || undefined, replyTo: data.email,
        subject: `[SAGD Demo] ${data.empresa} — ${data.ref}`,
        html: buildEmailHTML(data), text: plainText,
      })
      .then(() => { markSent(data.ref); log('INFO', 'Correo enviado', { ref: data.ref }); })
      .catch(err => log('ERROR', 'Fallo al enviar correo', { ref: data.ref, error: err.message }));
    } else {
      log('WARN', 'NOTIFY_TO o SMTP_USER no configurados');
    }

    return res.status(201).json({ ok: true, ref: data.ref });
  } catch (err) {
    log('ERROR', 'Error en POST /api/demo', { error: err.message });
    return res.status(500).json({ ok: false, error: 'Error interno del servidor.' });
  }
});

app.get('/api/solicitudes', (req, res) => {
  const { page = 1, limit = 20, sector, q } = req.query;
  let records = readDB();
  if (sector) records = records.filter(r => r.sector === sector);
  if (q) {
    const ql = q.toLowerCase();
    records = records.filter(r =>
      r.nombre?.toLowerCase().includes(ql) ||
      r.empresa?.toLowerCase().includes(ql) ||
      r.email?.toLowerCase().includes(ql)
    );
  }
  records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const total = records.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  res.json({ ok: true, total, page: parseInt(page), data: records.slice(start, start + parseInt(limit)) });
});

app.get('/api/stats', (req, res) => {
  const all   = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const week  = new Date(Date.now() - 7 * 86400000).toISOString();
  const porSector = {};
  all.forEach(r => { porSector[r.sector] = (porSector[r.sector] || 0) + 1; });
  res.json({ ok: true, stats: {
    total: all.length,
    hoy:   all.filter(r => r.created_at.startsWith(today)).length,
    semana:all.filter(r => r.created_at >= week).length,
    emailsEnviados: all.filter(r => r.enviado).length,
    porSector: Object.entries(porSector).map(([sector,total])=>({sector,total})).sort((a,b)=>b.total-a.total),
  }});
});

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada' }));
app.use((err, req, res, _next) => { log('ERROR', 'Error', { error: err.message }); res.status(500).json({ ok: false, error: 'Error interno' }); });

app.listen(PORT, () => log('INFO', `Servidor SAGD iniciado en puerto ${PORT}`));
process.on('SIGTERM', () => { log('INFO', 'Cerrando…'); process.exit(0); });
