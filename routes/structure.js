const express = require('express')
const { query, transaction } = require('../config/database')
const {
  authenticateToken,
  requireAdmin,
  validateUUID,
  logAdminAction,
} = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// ============================================================================
// ОБЩЕЖИТИЯ (DORMITORIES)
// ============================================================================

// GET /api/structure/dormitories - Получить все общежития
router.get('/dormitories', async (req, res) => {
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

// GET /api/structure/dormitories/:id - Получить общежитие с полной структурой
router.get('/dormitories/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params

    // Получаем общежитие
    const dormitoryResult = await query(
      'SELECT * FROM dormitories WHERE id = $1 AND is_active = true',
      [id],
    )

    if (dormitoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Общежитие не найдено' })
    }

    const dormitory = dormitoryResult.rows[0]

    // Получаем этажи
    const floorsResult = await query(
      'SELECT * FROM floors WHERE dormitory_id = $1 AND is_active = true ORDER BY floor_number',
      [id],
    )

    const floors = []

    for (const floor of floorsResult.rows) {
      const floorData = {
        id: floor.id,
        number: floor.floor_number,
        description: floor.description,
        createdAt: floor.created_at,
      }

      if (dormitory.type === 'type_1') {
        // Для ДПС №1: получаем комнаты напрямую
        const roomsResult = await query(
          `
          SELECT r.*, 
            COUNT(b.id) as bed_count,
            COUNT(CASE WHEN b.is_occupied = true THEN 1 END) as occupied_beds
          FROM rooms r
          LEFT JOIN beds b ON r.id = b.room_id AND b.is_active = true
          WHERE r.floor_id = $1 AND r.is_active = true
          GROUP BY r.id
          ORDER BY r.room_number::integer
        `,
          [floor.id],
        )

        floorData.rooms = await Promise.all(
          roomsResult.rows.map(async (room) => {
            const bedsResult = await query(
              `SELECT b.id, b.bed_number, b.is_occupied, b.student_id, b.assigned_at,
                      u.first_name, u.last_name, u.middle_name, u.student_id as student_number, u.group_name, u.course
               FROM beds b
               LEFT JOIN users u ON b.student_id = u.id
               WHERE b.room_id = $1 AND b.is_active = true 
               ORDER BY b.bed_number`,
              [room.id],
            )

            return {
              id: room.id,
              number: parseInt(room.room_number),
              bedCount: parseInt(room.bed_count) || 0,
              occupiedBeds: parseInt(room.occupied_beds) || 0,
              beds: bedsResult.rows.map((bed) => ({
                id: bed.id,
                number: bed.bed_number,
                isOccupied: bed.is_occupied,
                studentId: bed.student_id,
                assignedAt: bed.assigned_at,
                student: bed.student_id
                  ? {
                      firstName: bed.first_name,
                      lastName: bed.last_name,
                      middleName: bed.middle_name,
                      studentNumber: bed.student_number,
                      groupName: bed.group_name,
                      course: bed.course,
                    }
                  : null,
              })),
              createdAt: room.created_at,
            }
          }),
        )
      } else {
        // Для ДПС №2: получаем блоки и их комнаты
        const blocksResult = await query(
          'SELECT * FROM blocks WHERE floor_id = $1 AND is_active = true ORDER BY block_number',
          [floor.id],
        )

        floorData.blocks = await Promise.all(
          blocksResult.rows.map(async (block) => {
            const roomsResult = await query(
              `
            SELECT r.*,
              COUNT(b.id) as bed_count,
              COUNT(CASE WHEN b.is_occupied = true THEN 1 END) as occupied_beds
            FROM rooms r
            LEFT JOIN beds b ON r.id = b.room_id AND b.is_active = true
            WHERE r.block_id = $1 AND r.is_active = true
            GROUP BY r.id
            ORDER BY r.block_room_number
          `,
              [block.id],
            )

            const rooms = await Promise.all(
              roomsResult.rows.map(async (room) => {
                const bedsResult = await query(
                  `SELECT b.id, b.bed_number, b.is_occupied, b.student_id, b.assigned_at,
                          u.first_name, u.last_name, u.middle_name, u.student_id as student_number, u.group_name, u.course
                   FROM beds b
                   LEFT JOIN users u ON b.student_id = u.id
                   WHERE b.room_id = $1 AND b.is_active = true 
                   ORDER BY b.bed_number`,
                  [room.id],
                )

                return {
                  id: room.id,
                  number: room.room_number,
                  blockRoomNumber: room.block_room_number,
                  bedCount: parseInt(room.bed_count) || 0,
                  occupiedBeds: parseInt(room.occupied_beds) || 0,
                  beds: bedsResult.rows.map((bed) => ({
                    id: bed.id,
                    number: bed.bed_number,
                    isOccupied: bed.is_occupied,
                    studentId: bed.student_id,
                    assignedAt: bed.assigned_at,
                    student: bed.student_id
                      ? {
                          firstName: bed.first_name,
                          lastName: bed.last_name,
                          middleName: bed.middle_name,
                          studentNumber: bed.student_number,
                          groupName: bed.group_name,
                          course: bed.course,
                        }
                      : null,
                  })),
                  createdAt: room.created_at,
                }
              }),
            )

            return {
              id: block.id,
              number: block.block_number,
              roomCount: block.room_count,
              rooms,
              createdAt: block.created_at,
            }
          }),
        )
      }

      floors.push(floorData)
    }

    const response = {
      id: dormitory.id,
      name: dormitory.name,
      type: dormitory.type === 'type_1' ? 1 : 2,
      address: dormitory.address,
      maxFloors: dormitory.max_floors,
      description: dormitory.description,
      floors,
      createdAt: dormitory.created_at,
      updatedAt: dormitory.updated_at,
    }

    res.json(response)
  } catch (error) {
    console.error('Ошибка получения структуры общежития:', error)
    res.status(500).json({ error: 'Ошибка получения структуры общежития' })
  }
})

// ============================================================================
// УПРАВЛЕНИЕ КОЙКАМИ
// ============================================================================

// GET /api/structure/students - Получить список студентов для назначения на койки
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const { search, course, group, available_only = 'false', approved_only = 'false' } = req.query

    let whereClause = "WHERE u.role = 'student' AND u.is_active = true"
    const params = []
    let paramIndex = 1

    if (available_only === 'true') {
      whereClause += ' AND b.id IS NULL'
    }

    if (approved_only === 'true') {
      whereClause += " AND a.status = 'approved'"
    }

    if (search) {
      whereClause += ` AND (u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex} OR u.student_id ILIKE $${paramIndex})`
      params.push(`%${search}%`)
      paramIndex++
    }

    if (course) {
      whereClause += ` AND u.course = $${paramIndex}`
      params.push(parseInt(course))
      paramIndex++
    }

    if (group) {
      whereClause += ` AND u.group_name ILIKE $${paramIndex}`
      params.push(`%${group}%`)
      paramIndex++
    }

    const result = await query(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.middle_name, 
              u.student_id, u.group_name, u.course, u.phone, u.email,
              b.id as bed_id, r.room_number, d.name as dormitory_name,
              a.id as application_id, a.status as application_status, a.submission_date
       FROM users u
       LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
       LEFT JOIN rooms r ON b.room_id = r.id
       LEFT JOIN floors f ON r.floor_id = f.id
       LEFT JOIN blocks bl ON r.block_id = bl.id
       LEFT JOIN floors f2 ON bl.floor_id = f2.id
       LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
       LEFT JOIN applications a ON u.id = a.student_id AND a.status = 'approved'
       ${whereClause}
       ORDER BY u.last_name, u.first_name
       LIMIT 100`,
      params,
    )

    const students = result.rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      middleName: row.middle_name,
      fullName: `${row.last_name} ${row.first_name}${row.middle_name ? ` ${row.middle_name}` : ''}`,
      studentId: row.student_id,
      groupName: row.group_name,
      course: row.course,
      phone: row.phone,
      email: row.email,
      currentBed: row.bed_id
        ? {
            bedId: row.bed_id,
            roomNumber: row.room_number,
            dormitoryName: row.dormitory_name,
          }
        : null,
      application: row.application_id
        ? {
            id: row.application_id,
            status: row.application_status,
            submissionDate: row.submission_date,
          }
        : null,
    }))

    res.json({ students })
  } catch (error) {
    console.error('Ошибка получения списка студентов:', error)
    res.status(500).json({ error: 'Ошибка получения списка студентов' })
  }
})

// PUT /api/structure/beds/:bedId/assign - Назначить студента на койку
router.put(
  '/beds/:bedId/assign',
  requireAdmin,
  validateUUID('bedId'),
  logAdminAction('assign_bed'),
  async (req, res) => {
    try {
      const { bedId } = req.params
      const { studentId } = req.body

      if (!studentId) {
        return res.status(400).json({ error: 'ID студента обязателен' })
      }

      // Проверяем существование койки
      const bedResult = await query(
        `SELECT b.*, r.room_number, d.name as dormitory_name
         FROM beds b
         JOIN rooms r ON b.room_id = r.id
         LEFT JOIN floors f ON r.floor_id = f.id
         LEFT JOIN blocks bl ON r.block_id = bl.id
         LEFT JOIN floors f2 ON bl.floor_id = f2.id
         LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
         WHERE b.id = $1 AND b.is_active = true`,
        [bedId],
      )

      if (bedResult.rows.length === 0) {
        return res.status(404).json({ error: 'Койка не найдена' })
      }

      const bed = bedResult.rows[0]

      if (bed.is_occupied) {
        return res.status(409).json({ error: 'Койка уже занята' })
      }

      // Проверяем существование студента
      const studentResult = await query(
        'SELECT id, first_name, last_name, role, is_active FROM users WHERE id = $1',
        [studentId],
      )

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Студент не найден' })
      }

      const student = studentResult.rows[0]

      if (student.role !== 'student') {
        return res.status(400).json({ error: 'Пользователь не является студентом' })
      }

      if (!student.is_active) {
        return res.status(400).json({ error: 'Аккаунт студента неактивен' })
      }

      // Проверяем, не занимает ли студент уже другую койку
      const existingBedResult = await query(
        'SELECT id FROM beds WHERE student_id = $1 AND is_active = true',
        [studentId],
      )

      if (existingBedResult.rows.length > 0) {
        return res.status(409).json({ error: 'Студент уже занимает другую койку' })
      }

      // Назначаем студента на койку
      await query(
        'UPDATE beds SET student_id = $1, is_occupied = true, assigned_at = NOW(), updated_at = NOW() WHERE id = $2',
        [studentId, bedId],
      )

      res.json({
        message: `Студент ${student.first_name} ${student.last_name} назначен на койку ${bed.bed_number} в комнате ${bed.room_number} (${bed.dormitory_name})`,
        bedId,
        studentId,
        assignedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Ошибка назначения студента на койку:', error)
      res.status(500).json({ error: 'Ошибка назначения студента на койку' })
    }
  },
)

// PUT /api/structure/beds/:bedId/unassign - Освободить койку
router.put(
  '/beds/:bedId/unassign',
  requireAdmin,
  validateUUID('bedId'),
  logAdminAction('unassign_bed'),
  async (req, res) => {
    try {
      const { bedId } = req.params

      // Проверяем существование и статус койки
      const bedResult = await query(
        `SELECT b.*, r.room_number, d.name as dormitory_name,
                u.first_name, u.last_name
         FROM beds b
         JOIN rooms r ON b.room_id = r.id
         LEFT JOIN floors f ON r.floor_id = f.id
         LEFT JOIN blocks bl ON r.block_id = bl.id
         LEFT JOIN floors f2 ON bl.floor_id = f2.id
         LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
         LEFT JOIN users u ON b.student_id = u.id
         WHERE b.id = $1 AND b.is_active = true`,
        [bedId],
      )

      if (bedResult.rows.length === 0) {
        return res.status(404).json({ error: 'Койка не найдена' })
      }

      const bed = bedResult.rows[0]

      if (!bed.is_occupied || !bed.student_id) {
        return res.status(400).json({ error: 'Койка уже свободна' })
      }

      // Освобождаем койку
      await query(
        'UPDATE beds SET student_id = NULL, is_occupied = false, assigned_at = NULL, updated_at = NOW() WHERE id = $1',
        [bedId],
      )

      res.json({
        message: `Койка ${bed.bed_number} в комнате ${bed.room_number} (${bed.dormitory_name}) освобождена. Студент ${bed.first_name} ${bed.last_name} больше не назначен на эту койку`,
        bedId,
        freedAt: new Date().toISOString(),
      })
    } catch (error) {
      console.error('Ошибка освобождения койки:', error)
      res.status(500).json({ error: 'Ошибка освобождения койки' })
    }
  },
)

// ============================================================================
// ЭТАЖИ (FLOORS)
// ============================================================================

// POST /api/structure/dormitories/:dormitoryId/floors - Добавить этаж
router.post(
  '/dormitories/:dormitoryId/floors',
  requireAdmin,
  validateUUID('dormitoryId'),
  logAdminAction('create_floor'),
  async (req, res) => {
    try {
      const { dormitoryId } = req.params
      const { floorNumber, description } = req.body

      if (!floorNumber || floorNumber < 1) {
        return res.status(400).json({ error: 'Неверный номер этажа' })
      }

      // Проверяем существование общежития
      const dormitoryResult = await query(
        'SELECT max_floors FROM dormitories WHERE id = $1 AND is_active = true',
        [dormitoryId],
      )

      if (dormitoryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Общежитие не найдено' })
      }

      const maxFloors = dormitoryResult.rows[0].max_floors
      if (floorNumber > maxFloors) {
        return res.status(400).json({
          error: `Максимальное количество этажей: ${maxFloors}`,
        })
      }

      // Проверяем дубликат
      const existingFloor = await query(
        'SELECT id FROM floors WHERE dormitory_id = $1 AND floor_number = $2',
        [dormitoryId, floorNumber],
      )

      if (existingFloor.rows.length > 0) {
        return res.status(409).json({ error: 'Этаж уже существует' })
      }

      // Создаем этаж
      const result = await query(
        'INSERT INTO floors (dormitory_id, floor_number, description) VALUES ($1, $2, $3) RETURNING *',
        [dormitoryId, floorNumber, description || null],
      )

      const floor = result.rows[0]
      res.status(201).json({
        id: floor.id,
        number: floor.floor_number,
        description: floor.description,
        createdAt: floor.created_at,
      })
    } catch (error) {
      console.error('Ошибка создания этажа:', error)
      res.status(500).json({ error: 'Ошибка создания этажа' })
    }
  },
)

// DELETE /api/structure/floors/:id - Удалить этаж
router.delete(
  '/floors/:id',
  requireAdmin,
  validateUUID('id'),
  logAdminAction('delete_floor'),
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await query(
        'UPDATE floors SET is_active = false WHERE id = $1 RETURNING floor_number',
        [id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Этаж не найден' })
      }

      res.json({ message: `Этаж ${result.rows[0].floor_number} удален` })
    } catch (error) {
      console.error('Ошибка удаления этажа:', error)
      res.status(500).json({ error: 'Ошибка удаления этажа' })
    }
  },
)

// ============================================================================
// КОМНАТЫ ДЛЯ ДПС №1 (прямо на этаже)
// ============================================================================

// POST /api/structure/floors/:floorId/rooms - Добавить комнату на этаж (ДПС №1)
router.post(
  '/floors/:floorId/rooms',
  requireAdmin,
  validateUUID('floorId'),
  logAdminAction('create_room'),
  async (req, res) => {
    try {
      const { floorId } = req.params
      const { roomNumber, description } = req.body

      if (!roomNumber) {
        return res.status(400).json({ error: 'Номер комнаты обязателен' })
      }

      // Проверяем этаж и тип общежития
      const floorResult = await query(
        `
        SELECT f.floor_number, d.type 
        FROM floors f 
        JOIN dormitories d ON f.dormitory_id = d.id 
        WHERE f.id = $1 AND f.is_active = true
      `,
        [floorId],
      )

      if (floorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Этаж не найден' })
      }

      const { floor_number, type } = floorResult.rows[0]

      if (type !== 'type_1') {
        return res.status(400).json({
          error: 'Добавление комнат напрямую доступно только для ДПС №1',
        })
      }

      // Проверяем формат номера комнаты
      const roomStr = roomNumber.toString()
      if (!roomStr.startsWith(floor_number.toString())) {
        return res.status(400).json({
          error: `Номер комнаты должен начинаться с ${floor_number}`,
        })
      }

      // Проверяем дубликат
      const existingRoom = await query(
        'SELECT id FROM rooms WHERE floor_id = $1 AND room_number = $2',
        [floorId, roomNumber],
      )

      if (existingRoom.rows.length > 0) {
        return res.status(409).json({ error: 'Комната уже существует' })
      }

      // Создаем комнату и места в транзакции
      const result = await transaction(async (client) => {
        // Создаем комнату
        const roomResult = await client.query(
          'INSERT INTO rooms (floor_id, room_number, description, bed_count) VALUES ($1, $2, $3, 2) RETURNING *',
          [floorId, roomNumber, description || null],
        )

        const room = roomResult.rows[0]

        // Создаем 2 места
        await client.query('INSERT INTO beds (room_id, bed_number) VALUES ($1, 1), ($1, 2)', [
          room.id,
        ])

        // Получаем созданные места
        const bedsResult = await client.query(
          'SELECT id, bed_number, is_occupied FROM beds WHERE room_id = $1 ORDER BY bed_number',
          [room.id],
        )

        return {
          id: room.id,
          number: parseInt(room.room_number),
          bedCount: room.bed_count,
          beds: bedsResult.rows.map((bed) => ({
            id: bed.id,
            number: bed.bed_number,
            isOccupied: bed.is_occupied,
            studentId: null,
          })),
          createdAt: room.created_at,
        }
      })

      res.status(201).json(result)
    } catch (error) {
      console.error('Ошибка создания комнаты:', error)
      res.status(500).json({ error: 'Ошибка создания комнаты' })
    }
  },
)

// ============================================================================
// БЛОКИ ДЛЯ ДПС №2
// ============================================================================

// POST /api/structure/floors/:floorId/blocks - Добавить блок на этаж (ДПС №2)
router.post(
  '/floors/:floorId/blocks',
  requireAdmin,
  validateUUID('floorId'),
  logAdminAction('create_block'),
  async (req, res) => {
    try {
      const { floorId } = req.params
      const { blockNumber, roomCount, description } = req.body

      if (!blockNumber || !roomCount) {
        return res.status(400).json({ error: 'Номер блока и количество комнат обязательны' })
      }

      if (roomCount < 1 || roomCount > 3) {
        return res.status(400).json({ error: 'Количество комнат должно быть от 1 до 3' })
      }

      // Проверяем этаж и тип общежития
      const floorResult = await query(
        `
        SELECT f.floor_number, d.type 
        FROM floors f 
        JOIN dormitories d ON f.dormitory_id = d.id 
        WHERE f.id = $1 AND f.is_active = true
      `,
        [floorId],
      )

      if (floorResult.rows.length === 0) {
        return res.status(404).json({ error: 'Этаж не найден' })
      }

      const { floor_number, type } = floorResult.rows[0]

      if (type !== 'type_2') {
        return res.status(400).json({
          error: 'Добавление блоков доступно только для ДПС №2',
        })
      }

      // Проверяем формат номера блока
      const blockStr = blockNumber.toString()
      if (!blockStr.startsWith(floor_number.toString())) {
        return res.status(400).json({
          error: `Номер блока должен начинаться с ${floor_number}`,
        })
      }

      // Проверяем дубликат
      const existingBlock = await query(
        'SELECT id FROM blocks WHERE floor_id = $1 AND block_number = $2',
        [floorId, blockNumber],
      )

      if (existingBlock.rows.length > 0) {
        return res.status(409).json({ error: 'Блок уже существует' })
      }

      // Создаем блок, комнаты и места в транзакции
      const result = await transaction(async (client) => {
        // Создаем блок
        const blockResult = await client.query(
          'INSERT INTO blocks (floor_id, block_number, room_count, description) VALUES ($1, $2, $3, $4) RETURNING *',
          [floorId, blockNumber, roomCount, description || null],
        )

        const block = blockResult.rows[0]
        const rooms = []

        // Создаем комнаты для блока
        for (let i = 1; i <= roomCount; i++) {
          const roomResult = await client.query(
            'INSERT INTO rooms (block_id, room_number, block_room_number, bed_count) VALUES ($1, $2, $3, 2) RETURNING *',
            [block.id, `${blockNumber}/${i}`, i],
          )

          const room = roomResult.rows[0]

          // Создаем 2 места для каждой комнаты
          await client.query('INSERT INTO beds (room_id, bed_number) VALUES ($1, 1), ($1, 2)', [
            room.id,
          ])

          // Получаем созданные места
          const bedsResult = await client.query(
            'SELECT id, bed_number, is_occupied FROM beds WHERE room_id = $1 ORDER BY bed_number',
            [room.id],
          )

          rooms.push({
            id: room.id,
            number: room.room_number,
            blockRoomNumber: room.block_room_number,
            bedCount: room.bed_count,
            beds: bedsResult.rows.map((bed) => ({
              id: bed.id,
              number: bed.bed_number,
              isOccupied: bed.is_occupied,
              studentId: null,
            })),
            createdAt: room.created_at,
          })
        }

        return {
          id: block.id,
          number: block.block_number,
          roomCount: block.room_count,
          rooms,
          createdAt: block.created_at,
        }
      })

      res.status(201).json(result)
    } catch (error) {
      console.error('Ошибка создания блока:', error)
      res.status(500).json({ error: 'Ошибка создания блока' })
    }
  },
)

// DELETE /api/structure/blocks/:id - Удалить блок
router.delete(
  '/blocks/:id',
  requireAdmin,
  validateUUID('id'),
  logAdminAction('delete_block'),
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await query(
        'UPDATE blocks SET is_active = false WHERE id = $1 RETURNING block_number',
        [id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Блок не найден' })
      }

      res.json({ message: `Блок ${result.rows[0].block_number} удален` })
    } catch (error) {
      console.error('Ошибка удаления блока:', error)
      res.status(500).json({ error: 'Ошибка удаления блока' })
    }
  },
)

// DELETE /api/structure/rooms/:id - Удалить комнату
router.delete(
  '/rooms/:id',
  requireAdmin,
  validateUUID('id'),
  logAdminAction('delete_room'),
  async (req, res) => {
    try {
      const { id } = req.params

      const result = await query(
        'UPDATE rooms SET is_active = false WHERE id = $1 RETURNING room_number',
        [id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Комната не найдена' })
      }

      res.json({ message: `Комната ${result.rows[0].room_number} удалена` })
    } catch (error) {
      console.error('Ошибка удаления комнаты:', error)
      res.status(500).json({ error: 'Ошибка удаления комнаты' })
    }
  },
)

module.exports = router
