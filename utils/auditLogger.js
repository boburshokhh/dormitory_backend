const { Pool } = require('pg');

// Используем ту же конфигурацию, что и в server.js
const pool = new Pool({
  connectionString: 'postgresql://postgres:1234bobur$@192.168.1.253:5432/gubkin_dormitory',
  ssl: false
});

function extractContextFromRequest(req) {
  try {
    const userId = req?.user?.id ?? req?.user?.sub ?? null;
    const ipFromHeader = req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim();
    const ipDirect = req?.ip || req?.connection?.remoteAddress || null;
    const ipAddress = req?.ipAddress || ipFromHeader || ipDirect || null;
    const userAgent = req?.headers?.['user-agent'] || req?.userAgent || null;
    return { userId, ipAddress, userAgent };
  } catch {
    return { userId: null, ipAddress: null, userAgent: null };
  }
}

async function logAudit({
  userId = null,
  action,
  tableName,
  recordId = null,
  oldData = null,
  newData = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    const insertSql = `
      INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const params = [
      userId,
      action,
      tableName,
      recordId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress,
      userAgent
    ];
    await pool.query(insertSql, params);
    return { success: true };
  } catch (err) {
    console.warn('Audit log failed:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

async function logInsert(tableName, recordId, newData, context = {}) {
  const { userId = null, ipAddress = null, userAgent = null } = context;
  return logAudit({ userId, action: 'INSERT', tableName, recordId, oldData: null, newData, ipAddress, userAgent });
}

async function logUpdate(tableName, recordId, oldData, newData, context = {}) {
  const { userId = null, ipAddress = null, userAgent = null } = context;
  return logAudit({ userId, action: 'UPDATE', tableName, recordId, oldData, newData, ipAddress, userAgent });
}

async function logDelete(tableName, recordId, oldData, context = {}) {
  const { userId = null, ipAddress = null, userAgent = null } = context;
  return logAudit({ userId, action: 'DELETE', tableName, recordId, oldData, newData: null, ipAddress, userAgent });
}

const auditLogger = { logAudit, logInsert, logUpdate, logDelete, extractContextFromRequest };
module.exports = { auditLogger, logAudit, logInsert, logUpdate, logDelete, extractContextFromRequest };


