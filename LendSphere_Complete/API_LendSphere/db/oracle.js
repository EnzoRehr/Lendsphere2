const oracledb = require('oracledb');

let pool;

async function initialize() {
  try {
    pool = await oracledb.createPool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1
    });
    console.log('✅ Oracle DB conectat cu succes');
  } catch (err) {
    console.error('❌ Eroare conectare Oracle:', err.message);
    throw err;
  }
}

async function execute(sql, binds = [], opts = {}) {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
      ...opts
    });
    return result;
  } finally {
    if (conn) await conn.close();
  }
}

async function closePool() {
  if (pool) await pool.close(0);
}

module.exports = { initialize, execute, closePool };
