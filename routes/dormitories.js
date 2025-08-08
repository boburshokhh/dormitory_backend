const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/dormitories - Получить все общежития
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        d.*,
        COUNT(DISTINCT f.id) as total_floors,
        COUNT(DISTINCT r.id) as total_rooms,
        COUNT(DISTINCT b.id) as total_beds,
        COUNT(DISTINCT CASE WHEN b.is_occupied = true THEN b.id END) as occupied_beds
      FROM dormitories d
      LEFT JOIN floors f ON d.id = f.dormitory_id AND f.is_active = true
      LEFT JOIN rooms r ON (f.id = r.floor_id OR (f.id IN (SELECT bl.floor_id FROM blocks bl WHERE bl.id = r.block_id))) AND r.is_active = true
      LEFT JOIN beds b ON r.id = b.room_id AND b.is_active = true
      WHERE d.is_active = true
      GROUP BY d.id
      ORDER BY d.name
    `)

    const dormitories = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type === 'type_1' ? 1 : 2,
      address: row.address,
      maxFloors: row.max_floors,
      description: row.description,
      stats: {
        totalFloors: parseInt(row.total_floors) || 0,
        totalRooms: parseInt(row.total_rooms) || 0,
        totalBeds: parseInt(row.total_beds) || 0,
        occupiedBeds: parseInt(row.occupied_beds) || 0,
        availableBeds: (parseInt(row.total_beds) || 0) - (parseInt(row.occupied_beds) || 0),
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    res.json({ dormitories })
  } catch (error) {
    console.error('Ошибка получения общежитий:', error)
    res.status(500).json({ error: 'Ошибка получения данных общежитий' })
  }
})

// GET /api/dormitories/available - Получить доступные общежития для студента
router.get('/available', async (req, res) => {
  try {
    // Получаем информацию о студенте
    const userResult = await query(
      `
      SELECT course, gender 
      FROM users 
      WHERE id = $1 AND role = 'student'
    `,
      [req.user.id],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Студент не найден' })
    }

    const { course, gender } = userResult.rows[0]

    // Определяем доступные типы общежитий
    let availableTypes = []

    if (gender === 'female') {
      // Все девочки (независимо от курса) - только ДПС 1
      availableTypes = ['type_1']
    } else if (gender === 'male' && course === 1) {
      // Парни 1-го курса - только ДПС 1
      availableTypes = ['type_1']
    } else if (gender === 'male' && course >= 2 && course <= 5) {
      // Парни 2-5 курса - только ДПС 2
      availableTypes = ['type_2']
    }

    if (availableTypes.length === 0) {
      return res.json({
        dormitories: [],
        message: 'Нет доступных общежитий для вашего курса и пола',
      })
    }

    // Получаем доступные общежития
    const result = await query(
      `
      SELECT 
        d.*,
        COUNT(DISTINCT f.id) as total_floors,
        COUNT(DISTINCT r.id) as total_rooms,
        COUNT(DISTINCT b.id) as total_beds,
        COUNT(DISTINCT CASE WHEN b.is_occupied = true THEN b.id END) as occupied_beds
      FROM dormitories d
      LEFT JOIN floors f ON d.id = f.dormitory_id AND f.is_active = true
      LEFT JOIN rooms r ON (f.id = r.floor_id OR (f.id IN (SELECT bl.floor_id FROM blocks bl WHERE bl.id = r.block_id))) AND r.is_active = true
      LEFT JOIN beds b ON r.id = b.room_id AND b.is_active = true
      WHERE d.is_active = true AND d.type = ANY($1)
      GROUP BY d.id
      ORDER BY d.name
    `,
      [availableTypes],
    )

    const dormitories = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type === 'type_1' ? 1 : 2,
      address: row.address,
      maxFloors: row.max_floors,
      description: row.description,
      stats: {
        totalFloors: parseInt(row.total_floors) || 0,
        totalRooms: parseInt(row.total_rooms) || 0,
        totalBeds: parseInt(row.total_beds) || 0,
        occupiedBeds: parseInt(row.occupied_beds) || 0,
        availableBeds: (parseInt(row.total_beds) || 0) - (parseInt(row.occupied_beds) || 0),
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    res.json({
      dormitories,
      eligibilityInfo: {
        course,
        gender,
        availableTypes: availableTypes.map((type) => (type === 'type_1' ? 'ДПС 1' : 'ДПС 2')),
      },
    })
  } catch (error) {
    console.error('Ошибка получения доступных общежитий:', error)
    res.status(500).json({ error: 'Ошибка получения данных общежитий' })
  }
})

module.exports = router
