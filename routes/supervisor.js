const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireRole } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/supervisor/dashboard - Получить информацию о ДПС коменданта
router.get('/dashboard', requireRole(['supervisor']), async (req, res) => {
  try {
    const userId = req.user.id

    // Получаем информацию о ДПС, которым управляет комендант
    const dormitoryResult = await query(
      `
      SELECT 
        d.id,
        d.name,
        d.type,
        d.address,
        d.max_floors,
        d.description,
        sd.assigned_at,
        u.first_name as assigned_by_first_name,
        u.last_name as assigned_by_last_name
      FROM supervisor_dormitories sd
      JOIN dormitories d ON sd.dormitory_id = d.id
      JOIN users u ON sd.assigned_by = u.id
      WHERE sd.user_id = $1 AND sd.is_active = true
    `,
      [userId],
    )

    if (dormitoryResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Комендант не назначен ни на один ДПС',
      })
    }

    const dormitory = dormitoryResult.rows[0]

    // Получаем статистику по этажам
    const floorsResult = await query(
      `
      SELECT 
        COUNT(*) as total_floors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_floors
      FROM floors 
      WHERE dormitory_id = $1
    `,
      [dormitory.id],
    )

    // Получаем статистику по комнатам
    const roomsResult = await query(
      `
      SELECT 
        COUNT(*) as total_rooms,
        COUNT(CASE WHEN r.is_active = true THEN 1 END) as active_rooms,
        COUNT(CASE WHEN r.is_reserved = true THEN 1 END) as reserved_rooms
      FROM rooms r
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1
    `,
      [dormitory.id],
    )

    // Получаем статистику по койкам
    const bedsResult = await query(
      `
      SELECT 
        COUNT(*) as total_beds,
        COUNT(CASE WHEN b.is_active = true THEN 1 END) as active_beds,
        COUNT(CASE WHEN b.is_occupied = true THEN 1 END) as occupied_beds,
        COUNT(CASE WHEN b.is_active = true AND b.is_occupied = false THEN 1 END) as available_beds
      FROM beds b
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1
    `,
      [dormitory.id],
    )

    // Получаем статистику по студентам
    const studentsResult = await query(
      `
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN u.is_active = true THEN 1 END) as active_students,
        COUNT(CASE WHEN u.is_violator = true THEN 1 END) as violator_students
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1 AND u.role = 'student'
    `,
      [dormitory.id],
    )

    // Получаем статистику по полу студентов
    const genderStatsResult = await query(
      `
      SELECT 
        u.gender,
        COUNT(*) as count
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1 AND u.role = 'student' AND u.is_active = true
      GROUP BY u.gender
    `,
      [dormitory.id],
    )

    // Получаем статистику по курсам
    const courseStatsResult = await query(
      `
      SELECT 
        u.course,
        COUNT(*) as count
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1 AND u.role = 'student' AND u.is_active = true
      GROUP BY u.course
      ORDER BY u.course
    `,
      [dormitory.id],
    )

    // Получаем последние заселения
    const recentAssignmentsResult = await query(
      `
      SELECT 
        u.first_name,
        u.last_name,
        u.student_id,
        u.course,
        u.gender,
        r.room_number,
        f.floor_number,
        b.assigned_at
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE f.dormitory_id = $1 AND u.role = 'student' AND u.is_active = true
      ORDER BY b.assigned_at DESC
      LIMIT 10
    `,
      [dormitory.id],
    )

    // Формируем ответ
    const dashboardData = {
      dormitory: {
        id: dormitory.id,
        name: dormitory.name,
        type: dormitory.type,
        address: dormitory.address,
        maxFloors: dormitory.max_floors,
        description: dormitory.description,
        assignedAt: dormitory.assigned_at,
        assignedBy: `${dormitory.assigned_by_first_name} ${dormitory.assigned_by_last_name}`.trim(),
      },
      statistics: {
        floors: {
          total: parseInt(floorsResult.rows[0]?.total_floors || 0),
          active: parseInt(floorsResult.rows[0]?.active_floors || 0),
        },
        rooms: {
          total: parseInt(roomsResult.rows[0]?.total_rooms || 0),
          active: parseInt(roomsResult.rows[0]?.active_rooms || 0),
          reserved: parseInt(roomsResult.rows[0]?.reserved_rooms || 0),
        },
        beds: {
          total: parseInt(bedsResult.rows[0]?.total_beds || 0),
          active: parseInt(bedsResult.rows[0]?.active_beds || 0),
          occupied: parseInt(bedsResult.rows[0]?.occupied_beds || 0),
          available: parseInt(bedsResult.rows[0]?.available_beds || 0),
        },
        students: {
          total: parseInt(studentsResult.rows[0]?.total_students || 0),
          active: parseInt(studentsResult.rows[0]?.active_students || 0),
          violators: parseInt(studentsResult.rows[0]?.violator_students || 0),
        },
      },
      demographics: {
        gender: genderStatsResult.rows.reduce((acc, row) => {
          acc[row.gender] = parseInt(row.count)
          return acc
        }, {}),
        courses: courseStatsResult.rows.reduce((acc, row) => {
          acc[`course_${row.course}`] = parseInt(row.count)
          return acc
        }, {}),
      },
      recentAssignments: recentAssignmentsResult.rows.map((row) => ({
        firstName: row.first_name,
        lastName: row.last_name,
        studentId: row.student_id,
        course: row.course,
        gender: row.gender,
        roomNumber: row.room_number,
        floorNumber: row.floor_number,
        assignedAt: row.assigned_at,
      })),
    }

    res.json(dashboardData)
  } catch (error) {
    console.error('Ошибка получения данных дашборда коменданта:', error)
    res.status(500).json({ error: 'Ошибка получения данных дашборда' })
  }
})

// GET /api/supervisor/students - Получить список студентов ДПС
router.get('/students', requireRole(['supervisor']), async (req, res) => {
  try {
    const userId = req.user.id
    const { page = 1, limit = 20, search = '', course, gender } = req.query

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

    // Формируем WHERE условия для поиска
    let whereConditions = ['f.dormitory_id = $1', "u.role = 'student'"]
    let params = [dormitoryId]
    let paramIndex = 2

    if (search) {
      whereConditions.push(`(
        u.first_name ILIKE $${paramIndex} OR 
        u.last_name ILIKE $${paramIndex} OR 
        u.student_id ILIKE $${paramIndex}
      )`)
      params.push(`%${search}%`)
      paramIndex++
    }

    if (course) {
      whereConditions.push(`u.course = $${paramIndex}`)
      params.push(course)
      paramIndex++
    }

    if (gender) {
      whereConditions.push(`u.gender = $${paramIndex}`)
      params.push(gender)
      paramIndex++
    }

    // Получаем общее количество студентов
    const countResult = await query(
      `
      SELECT COUNT(*) as total
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
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
        u.id,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.student_id,
        u.course,
        u.gender,
        u.phone,
        u.email,
        u.is_violator,
        u.is_active,
        r.room_number,
        f.floor_number,
        b.bed_number,
        b.assigned_at
      FROM users u
      JOIN beds b ON u.id = b.student_id
      JOIN rooms r ON b.room_id = r.id
      JOIN floors f ON r.floor_id = f.id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY u.last_name, u.first_name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
      params,
    )

    const students = studentsResult.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      studentId: row.student_id,
      course: row.course,
      gender: row.gender,
      phone: row.phone,
      email: row.email,
      isViolator: row.is_violator,
      isActive: row.is_active,
      accommodation: {
        roomNumber: row.room_number,
        floorNumber: row.floor_number,
        bedNumber: row.bed_number,
        assignedAt: row.assigned_at,
      },
    }))

    res.json({
      students,
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

module.exports = router
