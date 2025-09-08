const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireRole } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// ==========================================
// МАРШРУТЫ ДЛЯ КОМЕНДАНТА
// ==========================================

// GET /api/roll-call/sessions/today - Получить сегодняшнюю сессию переклички
router.get('/sessions/today', requireRole(['supervisor']), async (req, res) => {
  try {
    const userId = req.user.id
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Получаем ДПС коменданта
    const dormitoryResult = await query(
      `
      SELECT dormitory_id FROM supervisor_dormitories 
      WHERE user_id = $1 AND is_active = true
    `,
      [userId],
    )

    if (dormitoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комендант не назначен ни на один ДПС' })
    }

    const dormitoryId = dormitoryResult.rows[0].dormitory_id

    // Ищем сегодняшнюю сессию
    let sessionResult = await query(
      `
      SELECT * FROM roll_call_sessions 
      WHERE dormitory_id = $1 AND session_date = $2
    `,
      [dormitoryId, today],
    )

    // Если сессии нет, создаем её
    if (sessionResult.rows.length === 0) {
      // Считаем количество студентов в ДПС
      const studentsCountResult = await query(
        `
        SELECT COUNT(*) as total_students
        FROM users u
        JOIN beds b ON u.id = b.student_id
        JOIN rooms r ON b.room_id = r.id
        JOIN floors f ON r.floor_id = f.id
        WHERE f.dormitory_id = $1 AND u.role = 'student' AND u.is_active = true AND b.is_occupied = true
      `,
        [dormitoryId],
      )

      const totalStudents = parseInt(studentsCountResult.rows[0]?.total_students || 0)

      // Создаем новую сессию
      const createSessionResult = await query(
        `
        INSERT INTO roll_call_sessions (dormitory_id, supervisor_id, session_date, total_students, unknown_count)
        VALUES ($1, $2, $3, $4, $4)
        RETURNING *
      `,
        [dormitoryId, userId, today, totalStudents],
      )

      const sessionId = createSessionResult.rows[0].id

      // Создаем записи для всех студентов в правильном порядке
      await query(
        `
        INSERT INTO roll_call_records (session_id, student_id, bed_id, room_number, floor_number, status)
        SELECT $1, u.id, b.id, r.room_number, f.floor_number, 'unknown'
        FROM users u
        JOIN beds b ON u.id = b.student_id
        JOIN rooms r ON b.room_id = r.id
        JOIN floors f ON r.floor_id = f.id
        WHERE f.dormitory_id = $2 AND u.role = 'student' AND u.is_active = true AND b.is_occupied = true
        ORDER BY 
          -- Сначала по номеру комнаты (числовое сравнение)
          CASE 
            WHEN r.room_number ~ '^[0-9]+$' THEN r.room_number::integer 
            ELSE 999999 
          END,
          -- Затем по этажу
          f.floor_number,
          -- Затем по фамилии
          u.last_name,
          -- И по имени
          u.first_name
      `,
        [sessionId, dormitoryId],
      )

      sessionResult = createSessionResult
    }

    res.json(sessionResult.rows[0])
  } catch (error) {
    console.error('Ошибка получения/создания сессии переклички:', error)
    res.status(500).json({ error: 'Ошибка получения сессии переклички' })
  }
})

// GET /api/roll-call/sessions/:sessionId/students - Получить список студентов для переклички
router.get('/sessions/:sessionId/students', requireRole(['supervisor']), async (req, res) => {
  try {
    const { sessionId } = req.params
    const { search = '', status = '', page = 1, limit = 50 } = req.query // Лимит по умолчанию 50

    let whereConditions = ['r.session_id = $1']
    let params = [sessionId]
    let paramIndex = 2

    if (search) {
      whereConditions.push(`(
        u.first_name ILIKE $${paramIndex} OR 
        u.last_name ILIKE $${paramIndex} OR 
        u.student_id ILIKE $${paramIndex} OR
        r.room_number ILIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (status && status !== 'all') {
      whereConditions.push(`r.status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    // Получаем общее количество
    const countResult = await query(
      `
      SELECT COUNT(*) as total
      FROM roll_call_records r
      JOIN users u ON r.student_id = u.id
      WHERE ${whereConditions.join(' AND ')}
    `,
      params,
    )

    const total = parseInt(countResult.rows[0]?.total || 0)

    // Получаем студентов с пагинацией
    const offset = (page - 1) * limit
    params.push(limit, offset)

    const studentsResult = await query(
      `
      SELECT 
        r.id as record_id,
        r.student_id,
        r.status,
        r.marked_at,
        r.marked_by,
        r.notes,
        r.room_number,
        r.floor_number,
        u.first_name,
        u.last_name,
        u.student_id as student_number,
        u.course,
        u.group_name,
        u.phone
      FROM roll_call_records r
      JOIN users u ON r.student_id = u.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY 
        -- Сначала сортируем по номеру комнаты (числовое сравнение)
        CASE 
          WHEN r.room_number ~ '^[0-9]+$' THEN r.room_number::integer 
          ELSE 999999 
        END,
        -- Затем по этажу
        r.floor_number,
        -- Затем по фамилии
        u.last_name,
        -- И по имени
        u.first_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      params,
    )

    res.json({
      students: studentsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Ошибка получения списка студентов:', error)
    res.status(500).json({ error: 'Ошибка получения списка студентов' })
  }
})

// PUT /api/roll-call/records/:recordId/status - Обновить статус студента
router.put('/records/:recordId/status', requireRole(['supervisor']), async (req, res) => {
  try {
    const { recordId } = req.params
    const { status, notes = '' } = req.body
    const userId = req.user.id

    // Валидация статуса
    const validStatuses = ['unknown', 'present', 'absent', 'late', 'excused']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' })
    }

    // Обновляем запись
    const result = await query(
      `
      UPDATE roll_call_records 
      SET status = $1, notes = $2, marked_at = NOW(), marked_by = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `,
      [status, notes, userId, recordId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Ошибка обновления статуса студента:', error)
    res.status(500).json({ error: 'Ошибка обновления статуса' })
  }
})

// POST /api/roll-call/sessions/:sessionId/complete - Завершить перекличку
router.post('/sessions/:sessionId/complete', requireRole(['supervisor']), async (req, res) => {
  try {
    const { sessionId } = req.params
    const { notes = '' } = req.body

    // Завершаем сессию
    const result = await query(
      `
      UPDATE roll_call_sessions 
      SET is_completed = true, completed_at = NOW(), notes = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [notes, sessionId],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('Ошибка завершения переклички:', error)
    res.status(500).json({ error: 'Ошибка завершения переклички' })
  }
})

// GET /api/roll-call/sessions/history - История переклички
router.get('/sessions/history', requireRole(['supervisor']), async (req, res) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 10 } = req.query

    // Получаем ДПС коменданта
    const dormitoryResult = await query(
      `
      SELECT dormitory_id FROM supervisor_dormitories 
      WHERE user_id = $1 AND is_active = true
    `,
      [userId],
    )

    if (dormitoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комендант не назначен ни на один ДПС' })
    }

    const dormitoryId = dormitoryResult.rows[0].dormitory_id

    // Получаем общее количество сессий
    const countResult = await query(
      `
      SELECT COUNT(*) as total
      FROM roll_call_sessions
      WHERE dormitory_id = $1
    `,
      [dormitoryId],
    )

    const total = parseInt(countResult.rows[0]?.total || 0)

    // Получаем историю с пагинацией
    const offset = (page - 1) * limit

    const historyResult = await query(
      `
      SELECT 
        s.*,
        d.name as dormitory_name,
        CASE 
          WHEN s.total_students > 0 THEN 
            ROUND((s.present_count + s.late_count) * 100.0 / s.total_students, 2)
          ELSE 0 
        END as attendance_rate
      FROM roll_call_sessions s
      JOIN dormitories d ON s.dormitory_id = d.id
      WHERE s.dormitory_id = $1
      ORDER BY s.session_date DESC, s.created_at DESC
      LIMIT $2 OFFSET $3
    `,
      [dormitoryId, limit, offset],
    )

    res.json({
      sessions: historyResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Ошибка получения истории переклички:', error)
    res.status(500).json({ error: 'Ошибка получения истории' })
  }
})

// GET /api/roll-call/statistics - Статистика переклички
router.get('/statistics', requireRole(['supervisor']), async (req, res) => {
  try {
    const userId = req.user.id
    const { period = '30' } = req.query // дней для анализа

    // Получаем ДПС коменданта
    const dormitoryResult = await query(
      `
      SELECT dormitory_id FROM supervisor_dormitories 
      WHERE user_id = $1 AND is_active = true
    `,
      [userId],
    )

    if (dormitoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Комендант не назначен ни на один ДПС' })
    }

    const dormitoryId = dormitoryResult.rows[0].dormitory_id

    // Общая статистика за период
    const overallStatsResult = await query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN is_completed = true THEN 1 END) as completed_sessions,
        AVG(CASE WHEN total_students > 0 THEN (present_count + late_count) * 100.0 / total_students ELSE 0 END) as avg_attendance_rate,
        SUM(total_students) as total_checks,
        SUM(present_count) as total_present,
        SUM(absent_count) as total_absent
      FROM roll_call_sessions
      WHERE dormitory_id = $1 
      AND session_date >= CURRENT_DATE - INTERVAL '${period} days'
    `,
      [dormitoryId],
    )

    // Статистика по дням недели
    const weekdayStatsResult = await query(
      `
      SELECT 
        EXTRACT(DOW FROM session_date) as day_of_week,
        TO_CHAR(session_date, 'Day') as day_name,
        COUNT(*) as sessions_count,
        AVG(CASE WHEN total_students > 0 THEN (present_count + late_count) * 100.0 / total_students ELSE 0 END) as avg_attendance
      FROM roll_call_sessions
      WHERE dormitory_id = $1 
      AND session_date >= CURRENT_DATE - INTERVAL '${period} days'
      GROUP BY EXTRACT(DOW FROM session_date), TO_CHAR(session_date, 'Day')
      ORDER BY day_of_week
    `,
      [dormitoryId],
    )

    // Топ отсутствующих студентов
    const absentStudentsResult = await query(
      `
      SELECT 
        u.first_name,
        u.last_name,
        u.student_id as student_number,
        r.room_number,
        COUNT(CASE WHEN r.status = 'absent' THEN 1 END) as absent_count,
        COUNT(*) as total_checks,
        ROUND(COUNT(CASE WHEN r.status = 'absent' THEN 1 END) * 100.0 / COUNT(*), 2) as absent_rate
      FROM roll_call_records r
      JOIN users u ON r.student_id = u.id
      JOIN roll_call_sessions s ON r.session_id = s.id
      WHERE s.dormitory_id = $1 
      AND s.session_date >= CURRENT_DATE - INTERVAL '${period} days'
      GROUP BY u.id, u.first_name, u.last_name, u.student_id, r.room_number
      HAVING COUNT(CASE WHEN r.status = 'absent' THEN 1 END) > 0
      ORDER BY absent_count DESC, absent_rate DESC
      LIMIT 10
    `,
      [dormitoryId],
    )

    res.json({
      overall: overallStatsResult.rows[0],
      weekdays: weekdayStatsResult.rows,
      absentStudents: absentStudentsResult.rows,
    })
  } catch (error) {
    console.error('Ошибка получения статистики:', error)
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
})

// ==========================================
// МАРШРУТЫ ДЛЯ СТУДЕНТОВ
// ==========================================

// GET /api/roll-call/my-attendance - История посещаемости студента
router.get('/my-attendance', requireRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 20 } = req.query

    // Получаем общее количество записей
    const countResult = await query(
      `
      SELECT COUNT(*) as total
      FROM roll_call_records r
      JOIN roll_call_sessions s ON r.session_id = s.id
      WHERE r.student_id = $1
    `,
      [userId],
    )

    const total = parseInt(countResult.rows[0]?.total || 0)

    // Получаем историю посещаемости
    const offset = (page - 1) * limit

    const attendanceResult = await query(
      `
      SELECT 
        s.session_date,
        s.session_time,
        s.is_completed,
        r.status,
        r.marked_at,
        r.notes,
        d.name as dormitory_name
      FROM roll_call_records r
      JOIN roll_call_sessions s ON r.session_id = s.id
      JOIN dormitories d ON s.dormitory_id = d.id
      WHERE r.student_id = $1
      ORDER BY s.session_date DESC, s.session_time DESC
      LIMIT $2 OFFSET $3
    `,
      [userId, limit, offset],
    )

    // Статистика студента
    const statsResult = await query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN r.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN r.status = 'absent' THEN 1 END) as absent_count,
        COUNT(CASE WHEN r.status = 'late' THEN 1 END) as late_count,
        COUNT(CASE WHEN r.status = 'excused' THEN 1 END) as excused_count,
        ROUND(COUNT(CASE WHEN r.status IN ('present', 'late') THEN 1 END) * 100.0 / COUNT(*), 2) as attendance_rate
      FROM roll_call_records r
      JOIN roll_call_sessions s ON r.session_id = s.id
      WHERE r.student_id = $1 AND s.is_completed = true
    `,
      [userId],
    )

    res.json({
      attendance: attendanceResult.rows,
      statistics: statsResult.rows[0],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Ошибка получения истории посещаемости:', error)
    res.status(500).json({ error: 'Ошибка получения истории посещаемости' })
  }
})

// ==========================================
// МАРШРУТЫ ДЛЯ АДМИНИСТРАТОРОВ
// ==========================================

// GET /api/roll-call/admin/overview - Обзор всех перекличек для админа
router.get('/admin/overview', requireRole(['admin', 'super_admin']), async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query

    // Общий обзор за день
    const overviewResult = await query(
      `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN is_completed = true THEN 1 END) as completed_sessions,
        SUM(total_students) as total_students,
        SUM(present_count) as total_present,
        SUM(absent_count) as total_absent,
        CASE 
          WHEN SUM(total_students) > 0 THEN 
            ROUND(SUM(present_count + late_count) * 100.0 / SUM(total_students), 2)
          ELSE 0 
        END as overall_attendance_rate
      FROM roll_call_sessions
      WHERE session_date = $1
    `,
      [date],
    )

    // Статистика по общежитиям
    const dormitoryStatsResult = await query(
      `
      SELECT 
        d.name as dormitory_name,
        d.type as dormitory_type,
        s.is_completed,
        s.total_students,
        s.present_count,
        s.absent_count,
        s.late_count,
        s.excused_count,
        CASE 
          WHEN s.total_students > 0 THEN 
            ROUND((s.present_count + s.late_count) * 100.0 / s.total_students, 2)
          ELSE 0 
        END as attendance_rate,
        u.first_name || ' ' || u.last_name as supervisor_name
      FROM roll_call_sessions s
      JOIN dormitories d ON s.dormitory_id = d.id
      LEFT JOIN users u ON s.supervisor_id = u.id
      WHERE s.session_date = $1
      ORDER BY d.name
    `,
      [date],
    )

    res.json({
      overview: overviewResult.rows[0],
      dormitories: dormitoryStatsResult.rows,
    })
  } catch (error) {
    console.error('Ошибка получения обзора для админа:', error)
    res.status(500).json({ error: 'Ошибка получения обзора' })
  }
})

module.exports = router
