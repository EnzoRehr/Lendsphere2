const express = require('express');
const { execute } = require('../db/oracle');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await execute(
      `SELECT id, type, title, message, is_read
       FROM ls_notifications
       WHERE UPPER(user_id) = UPPER(:nuid)
       FETCH FIRST 50 ROWS ONLY`,
      { nuid: req.user.id }
    );
    const unread = result.rows.filter(n => n.IS_READ === 0).length;
    res.json({ notifications: result.rows, unreadCount: unread });
  } catch (err) {
    console.error('GET notifications error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    await execute(
      `UPDATE ls_notifications SET is_read = 1 WHERE UPPER(user_id) = UPPER(:nuid)`,
      { nuid: req.user.id }
    );
    res.json({ message: 'Toate marcate ca citite' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    await execute(
      `UPDATE ls_notifications SET is_read = 1 WHERE id = :nid AND UPPER(user_id) = UPPER(:nuid)`,
      { nid: req.params.id, nuid: req.user.id }
    );
    res.json({ message: 'Marcat ca citit' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
