const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireRole } = require('../middleware/auth')

const router = express.Router()
router.use(authenticateToken)

// GET /api/beds/my-room - Получить информацию о комнате текущего студента
router.get('/my-room', requireRole(['student']), async (req, res) => {
  try {
    const userId = req.user.id

    const result = await query(
      `
      SELECT 
        -- Информация о койке
        b.id as bed_id,
        b.bed_number,
        b.assigned_at,
        -- Информация о комнате
        r.id as room_id,
        r.room_number,
        r.block_room_number,
        r.bed_count,
        r.is_reserved,
        r.is_female,
        -- Информация о блоке (если есть)
        bl.id as block_id,
        bl.block_number,
        -- Информация об этаже
        COALESCE(f1.id, f2.id) as floor_id,
        COALESCE(f1.floor_number, f2.floor_number) as floor_number,
        -- Информация об общежитии
        d.id as dormitory_id,
        d.name as dormitory_name,
        d.type as dormitory_type,
        d.address as dormitory_address,
        -- Соседи по комнате
        (
          SELECT json_agg(
            json_build_object(
              'bed_number', b2.bed_number,
              'student_name', COALESCE(u2.first_name || ' ' || u2.last_name, 'Свободно'),
              'student_id', u2.student_id,
              'course', u2.course,
              'group_name', u2.group_name,
              'is_occupied', b2.is_occupied
            )
          )
          FROM beds b2
          LEFT JOIN users u2 ON b2.student_id = u2.id
          WHERE b2.room_id = r.id AND b2.is_active = true
          ORDER BY b2.bed_number
        ) as roommates
      FROM users u
      LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
      LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
      LEFT JOIN floors f1 ON r.floor_id = f1.id AND f1.is_active = true
      LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
      LEFT JOIN floors f2 ON bl.floor_id = f2.id AND f2.is_active = true
      LEFT JOIN dormitories d ON (f1.dormitory_id = d.id OR f2.dormitory_id = d.id) AND d.is_active = true
      WHERE u.id = $1
    `,
      [userId],
    )

    if (result.rows.length === 0 || !result.rows[0].bed_id) {
      return res.json({
        hasRoom: false,
        message: 'Студент не назначен на койку',
      })
    }

    const roomData = result.rows[0]

    // Формируем полный номер комнаты
    let fullRoomNumber = roomData.room_number
    if (roomData.block_number && roomData.block_room_number) {
      fullRoomNumber = `${roomData.block_number}-${roomData.block_room_number}`
    }

    res.json({
      hasRoom: true,
      room: {
        // Информация о койке
        bed: {
          id: roomData.bed_id,
          number: roomData.bed_number,
          assignedAt: roomData.assigned_at,
        },
        // Информация о комнате
        room: {
          id: roomData.room_id,
          number: roomData.room_number,
          fullNumber: fullRoomNumber,
          bedCount: roomData.bed_count,
          isReserved: roomData.is_reserved,
          isFemale: roomData.is_female,
        },
        // Информация о блоке
        block: roomData.block_id
          ? {
              id: roomData.block_id,
              number: roomData.block_number,
            }
          : null,
        // Информация об этаже
        floor: {
          id: roomData.floor_id,
          number: roomData.floor_number,
        },
        // Информация об общежитии
        dormitory: {
          id: roomData.dormitory_id,
          name: roomData.dormitory_name,
          type: roomData.dormitory_type,
          address: roomData.dormitory_address,
        },
        // Соседи по комнате
        roommates: roomData.roommates || [],
      },
    })
  } catch (error) {
    console.error('Ошибка получения информации о комнате:', error)
    res.status(500).json({ error: 'Ошибка получения информации о комнате' })
  }
})

// Простые CRUD операции для мест
// Основная логика в /api/structure

module.exports = router
