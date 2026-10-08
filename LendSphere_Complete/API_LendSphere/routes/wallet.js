const express = require('express');
const oracledb = require('oracledb');
const { execute } = require('../db/oracle');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// GET /api/wallet
router.get('/', authMiddleware, async (req, res) => {
  try {
    const balRes = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:wuid)`,
      { wuid: req.user.id }
    );
    const txRes = await execute(
      `SELECT id, type, title, amount, is_positive, tx_date
       FROM ls_transactions
       WHERE UPPER(user_id) = UPPER(:wuid)
       FETCH FIRST 50 ROWS ONLY`,
      { wuid: req.user.id }
    );
    const invRes = await execute(
      `SELECT NVL(SUM(amount),0) AS total FROM ls_investments WHERE UPPER(lender_id) = UPPER(:wuid)`,
      { wuid: req.user.id }
    );
    res.json({
      balance: balRes.rows[0]?.WALLET_BALANCE || 0,
      lockedInInvestments: invRes.rows[0]?.TOTAL || 0,
      transactions: txRes.rows
    });
  } catch (err) {
    console.error('GET wallet error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/deposit
router.post('/deposit', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0 || amount > 100000)
    return res.status(400).json({ error: 'Suma trebuie să fie între 1 și 100.000 RON' });
  try {
    await execute(
      `UPDATE ls_users SET wallet_balance = wallet_balance + :damt WHERE UPPER(id) = UPPER(:duid)`,
      { damt: amount, duid: req.user.id }
    );
    await execute(
      `INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
       VALUES (:duid, 'DEPOSIT', 'Depunere fonduri', :damt, 1, :ddt)`,
      { duid: req.user.id, damt: amount, ddt: new Date().toLocaleDateString('ro-RO') }
    );
    await execute(
      `INSERT INTO ls_notifications (user_id, type, title, message)
       VALUES (:duid, 'INVESTMENT_FUNDED', 'Depunere confirmata', :dmsg)`,
      { duid: req.user.id, dmsg: amount + ' RON au fost adaugati in contul tau.' }
    );
    const newBal = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:duid)`,
      { duid: req.user.id }
    );
    res.json({ message: 'Depunere confirmată', newBalance: newBal.rows[0].WALLET_BALANCE });
  } catch (err) {
    console.error('Deposit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/withdraw
router.post('/withdraw', authMiddleware, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).json({ error: 'Sumă invalidă' });
  try {
    const balRes = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:wuid)`,
      { wuid: req.user.id }
    );
    const balance = balRes.rows[0].WALLET_BALANCE;
    if (balance < amount)
      return res.status(400).json({ error: 'Fonduri insuficiente. Disponibil: ' + balance + ' RON' });
    await execute(
      `UPDATE ls_users SET wallet_balance = wallet_balance - :wamt WHERE UPPER(id) = UPPER(:wuid)`,
      { wamt: amount, wuid: req.user.id }
    );
    await execute(
      `INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
       VALUES (:wuid, 'WITHDRAWAL', 'Retragere fonduri', :wamt, 0, :wdt)`,
      { wuid: req.user.id, wamt: amount, wdt: new Date().toLocaleDateString('ro-RO') }
    );
    const newBal = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:wuid)`,
      { wuid: req.user.id }
    );
    res.json({ message: 'Retragere procesată', newBalance: newBal.rows[0].WALLET_BALANCE });
  } catch (err) {
    console.error('Withdraw error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wallet/invest
router.post('/invest', authMiddleware, async (req, res) => {
  const { loanId, amount } = req.body;
  if (!loanId || !amount || amount <= 0)
    return res.status(400).json({ error: 'Date incomplete' });
  try {
    const balRes = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:iuid)`,
      { iuid: req.user.id }
    );
    const balance = balRes.rows[0].WALLET_BALANCE;
    if (balance < amount)
      return res.status(400).json({ error: 'Fonduri insuficiente. Disponibil: ' + balance + ' RON' });

    const loanRes = await execute(
      `SELECT * FROM ls_loans WHERE id = :ilid`, { ilid: loanId }
    );
    if (loanRes.rows.length === 0)
      return res.status(404).json({ error: 'Împrumut negăsit' });
    const loan = loanRes.rows[0];

    if (loan.BORROWER_ID.toUpperCase() === req.user.id.toUpperCase())
      return res.status(400).json({ error: 'Nu poți investi în propriul împrumut' });

    const remaining = loan.AMOUNT - loan.FUNDED_AMOUNT;
    if (amount > remaining)
      return res.status(400).json({ error: 'Maximum disponibil: ' + remaining + ' RON' });

    const newFunded  = loan.FUNDED_AMOUNT + amount;
    const newPct     = Math.min(100, Math.round((newFunded / loan.AMOUNT) * 100));
    const newStatus  = newPct >= 100 ? 'ACTIVE' : loan.STATUS;
    const expReturn  = Math.round(amount * (1 + loan.INTEREST_RATE / 100.0) * 100) / 100;

    await execute(
      `UPDATE ls_loans SET funded_amount = :ifa, funded_percent = :ifp, status = :ist WHERE id = :ilid`,
      { ifa: newFunded, ifp: newPct, ist: newStatus, ilid: loanId }
    );
    await execute(
      `INSERT INTO ls_investments (loan_id, lender_id, amount, expected_return)
       VALUES (:ilid, :iuid, :iamt, :iret)`,
      { ilid: loanId, iuid: req.user.id, iamt: amount, iret: expReturn }
    );
    await execute(
      `UPDATE ls_users SET wallet_balance = wallet_balance - :iamt WHERE UPPER(id) = UPPER(:iuid)`,
      { iamt: amount, iuid: req.user.id }
    );
    await execute(
      `INSERT INTO ls_transactions (user_id, type, title, amount, is_positive, tx_date)
       VALUES (:iuid, 'INVESTMENT', :ititle, :iamt, 0, :idt)`,
      { iuid: req.user.id, ititle: 'Investitie - ' + loan.TITLE, iamt: amount, idt: new Date().toLocaleDateString('ro-RO') }
    );
    await execute(
      `INSERT INTO ls_notifications (user_id, type, title, message)
       VALUES (:iuid, 'INVESTMENT_FUNDED', 'Investitie confirmata', :imsg)`,
      { iuid: req.user.id, imsg: 'Ai investit ' + amount + ' RON in "' + loan.TITLE + '".' }
    );

    const newBal = await execute(
      `SELECT wallet_balance FROM ls_users WHERE UPPER(id) = UPPER(:iuid)`,
      { iuid: req.user.id }
    );
    res.json({ message: 'Investiție confirmată!', newBalance: newBal.rows[0].WALLET_BALANCE, fundedPercent: newPct });
  } catch (err) {
    console.error('Invest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wallet/investments
router.get('/investments', authMiddleware, async (req, res) => {
  try {
    const result = await execute(
      `SELECT i.id, i.loan_id, i.amount, i.expected_return,
              l.title, l.interest_rate, l.term_months, l.status,
              l.funded_percent, l.amount AS loan_amount
       FROM ls_investments i JOIN ls_loans l ON i.loan_id = l.id
       WHERE UPPER(i.lender_id) = UPPER(:iuid)`,
      { iuid: req.user.id }
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET investments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
