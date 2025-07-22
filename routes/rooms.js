const express = require('express')
const { query } = require('../config/database')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()
router.use(authenticateToken)

// GET /api/rooms - Получить комнаты с фильтрацией и пагинацией
router.get('/', async (req, res) => {
  try {
    const { dormitoryId, floor, occupancy, page = 1, limit = 12 } = req.query

    const offset = (page - 1) * limit

    let whereClause = 'WHERE r.is_active = true'
    const params = []
    let paramCount = 0

    // Фильтр по общежитию
    if (dormitoryId) {
      whereClause += ` AND d.id = $${++paramCount}`
      params.push(dormitoryId)
    }

    // Фильтр по этажу
    if (floor) {
      whereClause += ` AND f.floor_number = $${++paramCount}`
      params.push(parseInt(floor))
    }

    // Фильтр по занятости
    if (occupancy === 'available') {
      whereClause += ` AND (r.bed_count - COALESCE(occupied_beds.count, 0)) > 0`
    } else if (occupancy === 'full') {
      whereClause += ` AND (r.bed_count - COALESCE(occupied_beds.count, 0)) = 0`
    }

    // Основной запрос для получения комнат
    const roomsQuery = `
      SELECT 
        r.id,
        r.room_number,
        r.bed_count as total_beds,
        r.description,
        r.amenities,
        d.name as dormitory_name,
        f.floor_number,
        COALESCE(occupied_beds.count, 0) as occupied_beds,
        (r.bed_count - COALESCE(occupied_beds.count, 0)) as available_beds
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
      LEFT JOIN (
        SELECT 
          room_id, 
          COUNT(*) as count 
        FROM beds 
        WHERE is_occupied = true AND is_active = true
        GROUP BY room_id
      ) occupied_beds ON r.id = occupied_beds.room_id
      ${whereClause}
      ORDER BY d.name, COALESCE(f.floor_number, f2.floor_number), r.room_number
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `

    params.push(parseInt(limit), offset)

    // Запрос для общего количества
    const countQuery = `
      SELECT COUNT(*) as total
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
      LEFT JOIN (
        SELECT 
          room_id, 
          COUNT(*) as count 
        FROM beds 
        WHERE is_occupied = true AND is_active = true
        GROUP BY room_id
      ) occupied_beds ON r.id = occupied_beds.room_id
      ${whereClause}
    `

    const [roomsResult, countResult] = await Promise.all([
      query(roomsQuery, params),
      query(countQuery, params.slice(0, paramCount - 2)), // Убираем limit и offset для подсчета
    ])

    const rooms = roomsResult.rows.map((row) => ({
      id: row.id,
      roomNumber: row.room_number,
      dormitoryName: row.dormitory_name,
      floorNumber: row.floor_number,
      totalBeds: row.total_beds,
      occupiedBeds: row.occupied_beds,
      availableBeds: row.available_beds,
      description: row.description,
      amenities: row.amenities || [],
    }))

    const totalItems = parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalItems / limit)

    res.json({
      rooms,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error('Ошибка получения комнат:', error)
    res.status(500).json({ error: 'Ошибка получения данных о комнатах' })
  }
})

module.exports = router
