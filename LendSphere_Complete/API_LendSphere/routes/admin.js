const express = require('express');
const { execute } = require('../db/oracle');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const router = express.Router();

router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users   = await execute(`SELECT COUNT(*) AS cnt FROM ls_users`);
    const pending = await execute(`SELECT COUNT(*) AS cnt FROM ls_loans WHERE status = 'PENDING'`);
    const funded  = await execute(`SELECT NVL(SUM(amount),0) AS total FROM ls_loans WHERE status IN ('ACTIVE','COMPLETED')`);
    const overdue = await execute(`SELECT COUNT(*) AS cnt FROM ls_loans WHERE status = 'OVERDUE'`);
    res.json({
      activeUsers:     users.rows[0].CNT,
      pendingRequests: pending.rows[0].CNT,
      totalFunded:     funded.rows[0].TOTAL,
      overdueLoans:    overdue.rows[0].CNT
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pending-users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await execute(`SELECT id, name, email, role FROM ls_users WHERE is_verified = 0`);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/users/:id/approve', authMiddleware, adminOnly, async (req, res) => {
  try {
    await execute(`UPDATE ls_users SET is_verified = 1 WHERE id = :auid`, { auid: req.params.id });
    res.json({ message: 'Utilizator aprobat' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
