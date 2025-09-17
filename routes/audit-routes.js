import express from 'express';
import { Pool } from 'pg';
import requestContext from '../middleware/requestContext.js';

const router = express.Router();
const pool = new Pool({
  connectionString: 'postgresql://postgres:1234bobur$@192.168.1.253:5432/gubkin_dormitory',
  ssl: false
});

function requireAdmin(req, res, next) {
  const role = req?.user?.role;
  if (role === 'admin' || role === 'superadmin') return next();
  return res.status(403).json({ success: false, message: 'Недостаточно прав' });
}

router.get('/', requestContext({ requireAuth: true }), requireAdmin, async (req, res) => {
  try {
    const { userId, tableName, action, dateFrom, dateTo } = req.query;
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');

    let where = 'WHERE 1=1';
    const params = [];
    let i = 1;

    if (userId) { where += ` AND user_id = $${i++}`; params.push(parseInt(userId)); }
    if (tableName) { where += ` AND table_name = $${i++}`; params.push(tableName); }
    if (action) { where += ` AND action = $${i++}`; params.push(action); }
    if (dateFrom) { where += ` AND created_at >= $${i++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND created_at <= $${i++}`; params.push(dateTo); }

    const dataSql = `
      SELECT id, user_id, action, table_name, record_id, old_data, new_data, ip_address, user_agent, created_at
      FROM audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(limit, offset);

    const countSql = `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`;

    const [dataRes, countRes] = await Promise.all([
      pool.query(dataSql, params),
      pool.query(countSql, params.slice(0, i - 3))
    ]);

    return res.json({ success: true, data: dataRes.rows, total: countRes.rows[0].total, limit, offset });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Ошибка получения аудита', error: err.message });
  }
});

router.get('/stats', requestContext({ requireAuth: true }), requireAdmin, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const params = [];
    let i = 1;
    let where = 'WHERE 1=1';
    if (dateFrom) { where += ` AND created_at >= $${i++}`; params.push(dateFrom); }
    if (dateTo) { where += ` AND created_at <= $${i++}`; params.push(dateTo); }

    const byTableSql = `SELECT table_name, COUNT(*)::int AS cnt FROM audit_logs ${where} GROUP BY table_name ORDER BY cnt DESC LIMIT 20`;
    const byActionSql = `SELECT action, COUNT(*)::int AS cnt FROM audit_logs ${where} GROUP BY action ORDER BY cnt DESC`;
    const activeUsersSql = `SELECT user_id, COUNT(*)::int AS cnt FROM audit_logs ${where} AND user_id IS NOT NULL GROUP BY user_id ORDER BY cnt DESC LIMIT 20`;

    const [byTable, byAction, activeUsers] = await Promise.all([
      pool.query(byTableSql, params),
      pool.query(byActionSql, params),
      pool.query(activeUsersSql, params)
    ]);

    return res.json({
      success: true,
      data: {
        byTable: byTable.rows,
        byAction: byAction.rows,
        activeUsers: activeUsers.rows
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Ошибка получения статистики аудита', error: err.message });
  }
});

export default router;


