const express = require('express');
const oracledb = require('oracledb');
const { execute } = require('../db/oracle');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/loans/my
router.get('/my', authMiddleware, async (req, res) => {
  try {
    console.log('loans/my uid:', req.user.id);
    const result = await execute(
      `SELECT id, title, amount, currency,
              term_months, interest_rate, status, risk_level,
              funded_percent, funded_amount,
              next_payment_date, next_payment_amt, purpose
       FROM ls_loans WHERE UPPER(borrower_id) = UPPER(:luid)`,
      { luid: req.user.id }
    );
    console.log('loans/my found:', result.rows.length);
    res.json(result.rows);
  } catch (err) {
    console.error('GET loans/my error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/loans/market
router.get('/market', authMiddleware, async (req, res) => {
  try {
    const result = await execute(
      `SELECT l.id, l.title, l.amount, l.currency, l.term_months, l.interest_rate,
              l.status, l.risk_level, l.funded_percent, l.funded_amount,
              l.purpose, u.name AS borrower_name
       FROM ls_loans l JOIN ls_users u ON l.borrower_id = u.id
       WHERE l.status IN ('APPROVED','FUNDED')
       AND UPPER(l.borrower_id) != UPPER(:luid)`,
      { luid: req.user.id }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET loans/market error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/loans/all
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const result = await execute(
      `SELECT l.id, l.title, l.amount, l.status, l.risk_level,
              l.funded_percent, l.purpose, u.name AS borrower_name
       FROM ls_loans l JOIN ls_users u ON l.borrower_id = u.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET loans/all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/loans
router.post('/', authMiddleware, async (req, res) => {
  const { amount, termMonths, purpose } = req.body;
  if (!amount || !termMonths || !purpose)
    return res.status(400).json({ error: 'Completează toate câmpurile' });
  if (amount < 1000 || amount > 50000)
    return res.status(400).json({ error: 'Suma trebuie să fie între 1.000 și 50.000 RON' });
  try {
    const loanRate = amount < 5000 ? 12.0 : amount < 15000 ? 9.5 : 8.0;
    const loanRisk = amount < 5000 ? 'LOW' : amount < 20000 ? 'MEDIUM' : 'HIGH';
    const mr = loanRate / 100.0 / 12.0;
    const monthly = Math.round(amount * mr / (1 - Math.pow(1 + mr, -termMonths)) * 100) / 100;
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1);

    const result = await execute(
      `INSERT INTO ls_loans (title, amount, term_months, interest_rate, status,
        risk_level, purpose, borrower_id, next_payment_date, next_payment_amt)
       VALUES (:ltitle, :lamount, :lterm, :lrate, 'PENDING', :lrisk, :lpurpose, :luid, :lnpd, :lnpa)
       RETURNING id INTO :lnewid`,
      {
        ltitle: purpose.substring(0, 200), lamount: amount, lterm: termMonths,
        lrate: loanRate, lrisk: loanRisk, lpurpose: purpose, luid: req.user.id,
        lnpd: nextDate.toLocaleDateString('ro-RO'), lnpa: monthly,
        lnewid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 36 }
      }
    );
    const loanId = result.outBinds.lnewid[0];

    // Scadenttar
    let remaining = amount;
    for (let i = 1; i <= termMonths; i++) {
      const repInt = Math.round(remaining * mr * 100) / 100;
      const repPr  = Math.round((monthly - repInt) * 100) / 100;
      remaining = Math.max(0, Math.round((remaining - repPr) * 100) / 100);
      const dd = new Date(); dd.setMonth(dd.getMonth() + i);
      await execute(
        `INSERT INTO ls_repayments (loan_id, due_date, amount, principal, interest)
         VALUES (:rlid, :rdd, :ramt, :rpr, :rintr)`,
        { rlid: loanId, rdd: dd.toLocaleDateString('ro-RO'), ramt: monthly, rpr: repPr, rintr: repInt }
      );
    }
    await execute(
      `INSERT INTO ls_notifications (user_id, type, title, message)
       VALUES (:luid, 'LOAN_APPROVED', 'Cerere trimisa', :lmsg)`,
      { luid: req.user.id, lmsg: 'Cererea ta de ' + amount + ' RON a fost inregistrata.' }
    );
    res.status(201).json({ message: 'Cerere creată cu succes', loanId, monthlyPayment: monthly });
  } catch (err) {
    console.error('Create loan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/loans/:id/approve
router.patch('/:id/approve', authMiddleware, async (req, res) => {
  try {
    await execute(`UPDATE ls_loans SET status = 'APPROVED' WHERE id = :alid`, { alid: req.params.id });
    const loan = await execute(`SELECT borrower_id, amount, title FROM ls_loans WHERE id = :alid`, { alid: req.params.id });
    if (loan.rows.length > 0) {
      const { BORROWER_ID, AMOUNT, TITLE } = loan.rows[0];
      await execute(
        `INSERT INTO ls_notifications (user_id, type, title, message)
         VALUES (:anuid, 'LOAN_APPROVED', 'Imprumut aprobat!', :anmsg)`,
        { anuid: BORROWER_ID, anmsg: 'Cererea "' + TITLE + '" de ' + AMOUNT + ' RON a fost aprobata!' }
      );
    }
    res.json({ message: 'Împrumut aprobat' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/loans/:id/reject
router.patch('/:id/reject', authMiddleware, async (req, res) => {
  try {
    await execute(`UPDATE ls_loans SET status = 'REJECTED' WHERE id = :rlid`, { rlid: req.params.id });
    const loan = await execute(`SELECT borrower_id, title FROM ls_loans WHERE id = :rlid`, { rlid: req.params.id });
    if (loan.rows.length > 0) {
      await execute(
        `INSERT INTO ls_notifications (user_id, type, title, message)
         VALUES (:rnuid, 'LOAN_REJECTED', 'Cerere respinsa', :rnmsg)`,
        { rnuid: loan.rows[0].BORROWER_ID, rnmsg: 'Cererea ta "' + loan.rows[0].TITLE + '" a fost respinsa.' }
      );
    }
    res.json({ message: 'Împrumut respins' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/loans/:id/repayments
router.get('/:id/repayments', authMiddleware, async (req, res) => {
  try {
    const result = await execute(
      `SELECT id, loan_id, due_date, amount, principal, interest, is_paid, paid_at
       FROM ls_repayments WHERE loan_id = :rlid`,
      { rlid: req.params.id }
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/loans/repayments/:id/pay
router.post('/repayments/:id/pay', authMiddleware, async (req, res) => {
  try {
    const rep = await execute(
      `SELECT r.*, l.borrower_id, l.title, l.id AS loan_id2
       FROM ls_repayments r JOIN ls_loans l ON r.loan_id = l.id WHERE r.id = :paid`,
      { paid: req.params.id }
    );
    if (rep.rows.length === 0) return res.status(404).json({ error: 'Rata negăsită' });
    const { AMOUNT, BORROWER_ID, LOAN_ID, TITLE } = rep.rows[0];

    if (BORROWER_ID.toUpperCase() !== req.user.id.toUpperCase())
      return res.status(403).json({ error: 'Nu poți plăti rata altcuiva' });

    const userRes = await execute(`SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:puid)`, { puid: BORROWER_ID });
    const balance = userRes.rows[0].WALLET_BALANCE;
    if (balance < AMOUNT) return res.status(400).json({ error: 'Fonduri insuficiente: ' + balance + ' RON' });

    await execute(`UPDATE ls_repayments SET is_paid = 1, paid_at = CURRENT_TIMESTAMP WHERE id = :paid`, { paid: req.params.id });
    await execute(`UPDATE ls_users SET wallet_balance = wallet_balance - :pamt WHERE UPPER(id) = UPPER(:puid)`, { pamt: AMOUNT, puid: BORROWER_ID });
    await execute(
      `INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
       VALUES (:puid, 'REPAYMENT_RECEIVED', 'Rata achitata', :pamt, 0, :pdt)`,
      { puid: BORROWER_ID, pamt: AMOUNT, pdt: new Date().toLocaleDateString('ro-RO') }
    );
    await execute(
      `INSERT INTO ls_notifications (user_id, type, title, message)
       VALUES (:puid, 'REPAYMENT_RECEIVED', 'Rata achitata', :pmsg)`,
      { puid: BORROWER_ID, pmsg: 'Rata de ' + AMOUNT + ' RON a fost procesata cu succes.' }
    );

    const unpaid = await execute(`SELECT COUNT(*) AS cnt FROM ls_repayments WHERE loan_id = :plid AND is_paid = 0`, { plid: LOAN_ID });
    if (unpaid.rows[0].CNT === 0)
      await execute(`UPDATE ls_loans SET status = 'COMPLETED' WHERE id = :plid`, { plid: LOAN_ID });

    const newBal = await execute(`SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:puid)`, { puid: BORROWER_ID });
    res.json({ message: 'Rată achitată!', amountPaid: AMOUNT, newBalance: newBal.rows[0].WALLET_BALANCE });
  } catch (err) {
    console.error('Pay repayment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
