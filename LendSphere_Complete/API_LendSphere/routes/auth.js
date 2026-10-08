const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const oracledb = require('oracledb');
const { execute } = require('../db/oracle');
const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Completează toate câmpurile' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Parola trebuie să aibă minim 6 caractere' });

  try {
    const existing = await execute('SELECT id FROM ls_users WHERE email = :email', { email: email.toLowerCase().trim() });
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email deja înregistrat' });

    const passwordHash = await bcrypt.hash(password, 10);
    const BONUS = 1000; // fiecare cont nou primeste 1000 RON fictivi

    const result = await execute(
      `INSERT INTO ls_users (name, email, password_hash, role, wallet_balance)
       VALUES (:name, :email, :hash, 'USER', :wallet)
       RETURNING id INTO :newId`,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        hash: passwordHash,
        wallet: BONUS,
        newId: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 36 }
      }
    );
    const userId = result.outBinds.newId[0];

    // Tranzactie bonus
    await execute(
      `INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
       VALUES (:uid, 'DEPOSIT', 'Bonus înregistrare', :amt, 1, :dt)`,
      { uid: userId, amt: BONUS, dt: new Date().toLocaleDateString('ro-RO') }
    );

    // Notificare welcome
    await execute(
      `INSERT INTO ls_notifications (user_id, type, title, message)
       VALUES (:uid, 'LOAN_APPROVED', 'Bun venit la LendSphere!',
       'Contul tău a fost creat. Ai primit 1.000 RON bonus pentru a începe!')`,
      { uid: userId }
    );

    const token = jwt.sign({ id: userId, email, role: 'USER' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    res.status(201).json({
      message: 'Cont creat cu succes',
      token,
      user: { id: userId, name: name.trim(), email, role: 'USER', walletBalance: BONUS, isVerified: true }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email și parola sunt obligatorii' });

  try {
    const result = await execute(
      `SELECT id, name, email, password_hash, role, is_verified, wallet_balance
       FROM ls_users WHERE email = :email`,
      { email: email.toLowerCase().trim() }
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Email sau parolă incorectă' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.PASSWORD_HASH);
    if (!valid)
      return res.status(401).json({ error: 'Email sau parolă incorectă' });

    const token = jwt.sign(
      { id: user.ID.toUpperCase(), email: user.EMAIL, role: user.ROLE },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Autentificat cu succes',
      token,
      user: {
        id: user.ID, name: user.NAME, email: user.EMAIL,
        role: user.ROLE, isVerified: user.IS_VERIFIED === 1,
        walletBalance: user.WALLET_BALANCE
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token lipsă' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await execute(
      `SELECT id, name, email, role, is_verified, wallet_balance FROM ls_users WHERE id = :id`,
      { id: decoded.id }
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User negăsit' });
    const u = result.rows[0];
    res.json({ id: u.ID, name: u.NAME, email: u.EMAIL, role: u.ROLE, isVerified: u.IS_VERIFIED === 1, walletBalance: u.WALLET_BALANCE });
  } catch (err) {
    res.status(403).json({ error: 'Token invalid' });
  }
});

module.exports = router;
