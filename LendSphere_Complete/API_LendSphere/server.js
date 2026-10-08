require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db/oracle');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/loans',         require('./routes/loans'));
app.use('/api/wallet',        require('./routes/wallet'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin',         require('./routes/admin'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.path} nu există` });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Eroare internă server' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await db.initialize();
    app.listen(PORT, () => {
      console.log(`\n🚀 LendSphere API pornit pe http://localhost:${PORT}`);
      console.log(`📋 Endpoints disponibile:`);
      console.log(`   POST /api/auth/login`);
      console.log(`   POST /api/auth/register`);
      console.log(`   GET  /api/loans/my`);
      console.log(`   GET  /api/loans/market`);
      console.log(`   POST /api/loans`);
      console.log(`   GET  /api/wallet`);
      console.log(`   POST /api/wallet/deposit`);
      console.log(`   POST /api/wallet/withdraw`);
      console.log(`   POST /api/wallet/invest`);
      console.log(`   GET  /api/notifications`);
      console.log(`   GET  /api/admin/stats\n`);
    });
  } catch (err) {
    console.error('❌ Nu s-a putut porni serverul:', err.message);
    process.exit(1);
  }
}

start();
