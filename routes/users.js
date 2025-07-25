const express = require('express')
const bcrypt = require('bcryptjs')
const { query } = require('../config/database')
const {
  authenticateToken,
  requireAdmin,
  requireSuperAdmin,
  validateUUID,
  logAdminAction,
} = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/users - Получить всех пользователей (только админы)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const {
      role,
      course,
      group_name,
      is_active,
      page = 1,
      limit = 20,
      search,
      dormitory_id,
      dormitory_type,
      floor_number,
      block_number,
      room_number,
      bed_number,
      region,
      has_accommodation,
    } = req.query

    const offset = (page - 1) * limit

    let whereClause = 'WHERE 1=1'
    const params = []
    let paramCount = 0

    // Фильтры
    if (role) {
      whereClause += ` AND u.role = $${++paramCount}`
      params.push(role)
    }

    if (course) {
      whereClause += ` AND u.course = $${++paramCount}`
      params.push(parseInt(course))
    }

    if (group_name) {
      whereClause += ` AND u.group_name ILIKE $${++paramCount}`
      params.push(`%${group_name}%`)
    }

    if (is_active !== undefined) {
      whereClause += ` AND u.is_active = $${++paramCount}`
      params.push(is_active === 'true')
    }

    if (region) {
      whereClause += ` AND u.region ILIKE $${++paramCount}`
      params.push(`%${region}%`)
    }

    // Валидируем UUID только для dormitory_id
    if (dormitory_id) {
      // Проверяем формат UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (uuidRegex.test(dormitory_id)) {
        whereClause += ` AND d.id = $${++paramCount}`
        params.push(dormitory_id)
      }
    }

    if (dormitory_type) {
      whereClause += ` AND d.type = $${++paramCount}`
      params.push(dormitory_type === '1' ? 'type_1' : 'type_2')
    }

    if (floor_number) {
      whereClause += ` AND (f1.floor_number = $${++paramCount} OR f2.floor_number = $${paramCount})`
      params.push(parseInt(floor_number))
    }

    if (block_number) {
      whereClause += ` AND bl.block_number = $${++paramCount}`
      params.push(parseInt(block_number))
    }

    if (room_number) {
      whereClause += ` AND r.room_number ILIKE $${++paramCount}`
      params.push(`%${room_number}%`)
    }

    if (bed_number) {
      whereClause += ` AND b.bed_number = $${++paramCount}`
      params.push(parseInt(bed_number))
    }

    if (has_accommodation === 'true') {
      whereClause += ` AND b.id IS NOT NULL`
    } else if (has_accommodation === 'false') {
      whereClause += ` AND b.id IS NULL`
    }

    if (search) {
      whereClause += ` AND (u.first_name ILIKE $${++paramCount} OR u.last_name ILIKE $${paramCount} OR u.contact ILIKE $${paramCount} OR u.student_id ILIKE $${paramCount})`
      params.push(`%${search}%`)
    }

    const result = await query(
      `
      SELECT 
        u.id, u.contact, u.first_name, u.last_name, u.middle_name, u.phone,
        u.role, u.student_id, u.group_name, u.course, u.is_active,
        u.is_verified, u.created_at, u.updated_at, u.region, u.address,
        u.birth_date, u.gender, u.parent_phone, u.email, u.photo_3x4_url,
        -- Информация о проживании
        b.id as bed_id, b.bed_number, b.assigned_at,
        r.id as room_id, r.room_number, r.block_room_number,
        bl.id as block_id, bl.block_number,
        f1.id as floor_id, f1.floor_number,
        f2.id as floor_id_2, f2.floor_number as floor_number_2,
        d.id as dormitory_id, d.name as dormitory_name, d.type as dormitory_type,
        -- Информация о группе
        g.id as group_id_ref, g.faculty, g.speciality
      FROM users u
      LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
      LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
      LEFT JOIN floors f1 ON r.floor_id = f1.id AND f1.is_active = true
      LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
      LEFT JOIN floors f2 ON bl.floor_id = f2.id AND f2.is_active = true
      LEFT JOIN dormitories d ON (f1.dormitory_id = d.id OR f2.dormitory_id = d.id) AND d.is_active = true
      LEFT JOIN groups g ON u.group_id = g.id AND g.is_active = true
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `,
      [...params, limit, offset],
    )

    // Подсчет общего количества
    const countResult = await query(
      `
      SELECT COUNT(DISTINCT u.id) as total 
      FROM users u
      LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
      LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
      LEFT JOIN floors f1 ON r.floor_id = f1.id AND f1.is_active = true
      LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
      LEFT JOIN floors f2 ON bl.floor_id = f2.id AND f2.is_active = true
      LEFT JOIN dormitories d ON (f1.dormitory_id = d.id OR f2.dormitory_id = d.id) AND d.is_active = true
      LEFT JOIN groups g ON u.group_id = g.id AND g.is_active = true
      ${whereClause}
    `,
      params.slice(0, -2),
    )

    const users = result.rows.map((user) => ({
      id: user.id,
      contact: user.contact,
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      fullName: `${user.last_name} ${user.first_name}${user.middle_name ? ' ' + user.middle_name : ''}`,
      phone: user.phone,
      email: user.email,
      role: user.role,
      studentId: user.student_id,
      groupName: user.group_name,
      course: user.course,
      isActive: user.is_active,
      isVerified: user.is_verified,
      region: user.region,
      address: user.address,
      birthDate: user.birth_date,
      gender: user.gender,
      parentPhone: user.parent_phone,
      photo3x4Url: user.photo_3x4_url,
      createdAt: user.created_at,
      updatedAt: user.updated_at,

      // Информация о группе
      group: user.group_id_ref
        ? {
            id: user.group_id_ref,
            faculty: user.faculty,
            speciality: user.speciality,
          }
        : null,

      // Информация о проживании
      accommodation: user.bed_id
        ? {
            bedId: user.bed_id,
            bedNumber: user.bed_number,
            assignedAt: user.assigned_at,
            room: {
              id: user.room_id,
              number: user.room_number,
              blockRoomNumber: user.block_room_number,
            },
            block: user.block_id
              ? {
                  id: user.block_id,
                  number: user.block_number,
                }
              : null,
            floor: {
              id: user.floor_id || user.floor_id_2,
              number: user.floor_number || user.floor_number_2,
            },
            dormitory: {
              id: user.dormitory_id,
              name: user.dormitory_name,
              type: user.dormitory_type === 'type_1' ? 1 : 2,
            },
          }
        : null,
    }))

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    })
  } catch (error) {
    console.error('Ошибка получения пользователей:', error)
    res.status(500).json({ error: 'Ошибка получения пользователей' })
  }
})

// GET /api/users/filters - Получить данные для фильтров
router.get('/filters', requireAdmin, async (req, res) => {
  try {
    // Получаем все регионы
    const regionsResult = await query(`
      SELECT name FROM regions 
      WHERE name IS NOT NULL AND name != ''
      ORDER BY name
    `)

    // Получаем все группы
    const groupsResult = await query(`
      SELECT DISTINCT group_name, course
      FROM users 
      WHERE group_name IS NOT NULL AND group_name != ''
      ORDER BY course, group_name
    `)

    // Получаем общежития
    const dormitoriesResult = await query(`
      SELECT DISTINCT d.id, d.name, d.type
      FROM dormitories d
      WHERE d.is_active = true
      ORDER BY d.name
    `)

    // Получаем этажи (группированные по общежитиям и типам ДПС)
    const floorsResult = await query(`
      SELECT DISTINCT 
        d.id as dormitory_id, 
        d.name as dormitory_name,
        d.type as dormitory_type,
        f.floor_number
      FROM floors f
      JOIN dormitories d ON f.dormitory_id = d.id
      WHERE f.is_active = true AND d.is_active = true
      ORDER BY d.name, f.floor_number
    `)

    // Получаем блоки (только для ДПС 2)
    const blocksResult = await query(`
      SELECT DISTINCT 
        d.id as dormitory_id,
        d.name as dormitory_name,
        d.type as dormitory_type,
        f.floor_number,
        bl.block_number
      FROM blocks bl
      JOIN floors f ON bl.floor_id = f.id
      JOIN dormitories d ON f.dormitory_id = d.id
      WHERE bl.is_active = true AND f.is_active = true AND d.is_active = true
      ORDER BY d.name, f.floor_number, bl.block_number
    `)

    // Получаем комнаты
    const roomsResult = await query(`
      SELECT DISTINCT 
        d.id as dormitory_id,
        d.name as dormitory_name,
        d.type as dormitory_type,
        COALESCE(f1.floor_number, f2.floor_number) as floor_number,
        bl.block_number,
        r.room_number
      FROM rooms r
      LEFT JOIN floors f1 ON r.floor_id = f1.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      JOIN dormitories d ON (f1.dormitory_id = d.id OR f2.dormitory_id = d.id)
      WHERE r.is_active = true AND d.is_active = true
      ORDER BY d.name, floor_number, bl.block_number, r.room_number
    `)

    // Группируем данные
    const regions = regionsResult.rows.map((row) => row.name)

    const groups = groupsResult.rows.map((row) => ({
      name: row.group_name,
      course: row.course,
    }))

    const dormitories = dormitoriesResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type === 'type_1' ? 1 : 2,
    }))

    // Группируем этажи по общежитиям и типам ДПС
    const floorsByDormitory = {}
    const floorsByType = {}

    floorsResult.rows.forEach((row) => {
      // По общежитиям
      if (!floorsByDormitory[row.dormitory_id]) {
        floorsByDormitory[row.dormitory_id] = {
          dormitoryName: row.dormitory_name,
          dormitoryType: row.dormitory_type === 'type_1' ? 1 : 2,
          floors: [],
        }
      }
      floorsByDormitory[row.dormitory_id].floors.push(row.floor_number)

      // По типам ДПС
      const type = row.dormitory_type === 'type_1' ? 1 : 2
      if (!floorsByType[type]) {
        floorsByType[type] = []
      }
      if (!floorsByType[type].includes(row.floor_number)) {
        floorsByType[type].push(row.floor_number)
      }
    })

    // Сортируем этажи по типам
    Object.keys(floorsByType).forEach((type) => {
      floorsByType[type].sort((a, b) => a - b)
    })

    // Группируем блоки
    const blocksByFloor = {}
    const blocksByType = {}

    blocksResult.rows.forEach((row) => {
      // По этажам
      const key = `${row.dormitory_id}_${row.floor_number}`
      if (!blocksByFloor[key]) {
        blocksByFloor[key] = {
          dormitoryId: row.dormitory_id,
          dormitoryName: row.dormitory_name,
          dormitoryType: row.dormitory_type === 'type_1' ? 1 : 2,
          floorNumber: row.floor_number,
          blocks: [],
        }
      }
      blocksByFloor[key].blocks.push(row.block_number)

      // По типам (только ДПС 2)
      if (row.dormitory_type === 'type_2') {
        if (!blocksByType[2]) {
          blocksByType[2] = []
        }
        if (!blocksByType[2].includes(row.block_number)) {
          blocksByType[2].push(row.block_number)
        }
      }
    })

    // Сортируем блоки
    if (blocksByType[2]) {
      blocksByType[2].sort((a, b) => a - b)
    }

    // Группируем комнаты
    const roomsByLocation = {}

    roomsResult.rows.forEach((row) => {
      const key = `${row.dormitory_id}_${row.floor_number}_${row.block_number || 'no_block'}`
      if (!roomsByLocation[key]) {
        roomsByLocation[key] = {
          dormitoryId: row.dormitory_id,
          dormitoryName: row.dormitory_name,
          dormitoryType: row.dormitory_type === 'type_1' ? 1 : 2,
          floorNumber: row.floor_number,
          blockNumber: row.block_number,
          rooms: [],
        }
      }
      roomsByLocation[key].rooms.push(row.room_number)
    })

    res.json({
      regions,
      groups,
      dormitories,
      floorsByDormitory,
      floorsByType,
      blocksByFloor: Object.values(blocksByFloor),
      blocksByType,
      roomsByLocation: Object.values(roomsByLocation),
    })
  } catch (error) {
    console.error('Ошибка получения данных для фильтров:', error)
    res.status(500).json({ error: 'Ошибка получения данных для фильтров' })
  }
})

// GET /api/users/:id - Получить пользователя по ID
router.get('/:id', validateUUID('id'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `
      SELECT 
        id, email, first_name, last_name, middle_name, phone,
        role, student_id, group_name, course, is_active,
        email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const user = result.rows[0]

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      phone: user.phone,
      role: user.role,
      studentId: user.student_id,
      groupName: user.group_name,
      course: user.course,
      isActive: user.is_active,
      emailVerified: user.email_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    })
  } catch (error) {
    console.error('Ошибка получения пользователя:', error)
    res.status(500).json({ error: 'Ошибка получения пользователя' })
  }
})

// POST /api/users - Создать нового пользователя (только супер-админы)
router.post('/', requireSuperAdmin, logAdminAction('create_user'), async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      middleName,
      phone,
      role,
      studentId,
      groupName,
      course,
    } = req.body

    // Валидация
    if (!email || !password || !firstName || !lastName || !role) {
      return res.status(400).json({
        error: 'Email, пароль, имя, фамилия и роль обязательны',
      })
    }

    if (!['student', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({
        error: 'Неверная роль',
      })
    }

    if (role === 'student' && (!studentId || !groupName || !course)) {
      return res.status(400).json({
        error: 'Для студентов обязательны: номер студенческого билета, группа, курс',
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Пароль должен содержать минимум 6 символов',
      })
    }

    // Проверить существование email
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Пользователь с таким email уже существует',
      })
    }

    // Проверить существование студенческого билета
    if (studentId) {
      const existingStudent = await query('SELECT id FROM users WHERE student_id = $1', [studentId])

      if (existingStudent.rows.length > 0) {
        return res.status(409).json({
          error: 'Студент с таким номером уже существует',
        })
      }
    }

    // Хешировать пароль
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Создать пользователя
    const result = await query(
      `
        INSERT INTO users (
          email, password_hash, first_name, last_name, middle_name, phone,
          role, student_id, group_name, course
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, email, first_name, last_name, role, created_at
      `,
      [
        email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        middleName || null,
        phone || null,
        role,
        studentId || null,
        groupName || null,
        course || null,
      ],
    )

    const user = result.rows[0]

    res.status(201).json({
      message: 'Пользователь создан',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at,
      },
    })
  } catch (error) {
    console.error('Ошибка создания пользователя:', error)
    res.status(500).json({ error: 'Ошибка создания пользователя' })
  }
})

// PUT /api/users/:id - Обновить пользователя
router.put(
  '/:id',
  validateUUID('id'),
  requireAdmin,
  logAdminAction('update_user'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { firstName, lastName, middleName, phone, studentId, groupName, course, isActive } =
        req.body

      if (!firstName || !lastName) {
        return res.status(400).json({
          error: 'Имя и фамилия обязательны',
        })
      }

      // Проверяем существование пользователя
      const userResult = await query('SELECT role FROM users WHERE id = $1', [id])

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' })
      }

      // Обновляем пользователя
      const result = await query(
        `
        UPDATE users 
        SET 
          first_name = $1, 
          last_name = $2, 
          middle_name = $3, 
          phone = $4,
          student_id = $5,
          group_name = $6,
          course = $7,
          is_active = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING first_name, last_name, updated_at
      `,
        [
          firstName,
          lastName,
          middleName || null,
          phone || null,
          studentId || null,
          groupName || null,
          course || null,
          isActive !== undefined ? isActive : true,
          id,
        ],
      )

      res.json({
        message: 'Пользователь обновлен',
        updatedAt: result.rows[0].updated_at,
      })
    } catch (error) {
      console.error('Ошибка обновления пользователя:', error)
      res.status(500).json({ error: 'Ошибка обновления пользователя' })
    }
  },
)

// PUT /api/users/:id/role - Изменить роль пользователя (только супер-админы)
router.put(
  '/:id/role',
  validateUUID('id'),
  requireSuperAdmin,
  logAdminAction('change_user_role'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { role } = req.body

      if (!['student', 'admin', 'super_admin'].includes(role)) {
        return res.status(400).json({ error: 'Неверная роль' })
      }

      // Проверяем, что не меняем роль самого себя
      if (id === req.user.id) {
        return res.status(400).json({
          error: 'Нельзя изменить собственную роль',
        })
      }

      const result = await query(
        `
        UPDATE users 
        SET role = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, role, updated_at
      `,
        [role, id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' })
      }

      const user = result.rows[0]

      res.json({
        message: `Роль пользователя ${user.email} изменена на ${role}`,
        updatedAt: user.updated_at,
      })
    } catch (error) {
      console.error('Ошибка изменения роли:', error)
      res.status(500).json({ error: 'Ошибка изменения роли' })
    }
  },
)

// PUT /api/users/:id/status - Активировать/деактивировать пользователя
router.put(
  '/:id/status',
  validateUUID('id'),
  requireAdmin,
  logAdminAction('change_user_status'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { isActive } = req.body

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive должно быть boolean' })
      }

      // Проверяем, что не деактивируем самого себя
      if (id === req.user.id && !isActive) {
        return res.status(400).json({
          error: 'Нельзя деактивировать собственный аккаунт',
        })
      }

      const result = await query(
        `
        UPDATE users 
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, is_active, updated_at
      `,
        [isActive, id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' })
      }

      const user = result.rows[0]

      res.json({
        message: `Пользователь ${user.email} ${isActive ? 'активирован' : 'деактивирован'}`,
        isActive: user.is_active,
        updatedAt: user.updated_at,
      })
    } catch (error) {
      console.error('Ошибка изменения статуса:', error)
      res.status(500).json({ error: 'Ошибка изменения статуса' })
    }
  },
)

// PUT /api/users/:id/password - Сбросить пароль пользователя (только супер-админы)
router.put(
  '/:id/password',
  validateUUID('id'),
  requireSuperAdmin,
  logAdminAction('reset_user_password'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { newPassword } = req.body

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          error: 'Новый пароль должен содержать минимум 6 символов',
        })
      }

      // Хешировать новый пароль
      const saltRounds = 12
      const passwordHash = await bcrypt.hash(newPassword, saltRounds)

      const result = await query(
        `
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING email, updated_at
      `,
        [passwordHash, id],
      )

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Пользователь не найден' })
      }

      const user = result.rows[0]

      res.json({
        message: `Пароль пользователя ${user.email} сброшен`,
        updatedAt: user.updated_at,
      })
    } catch (error) {
      console.error('Ошибка сброса пароля:', error)
      res.status(500).json({ error: 'Ошибка сброса пароля' })
    }
  },
)

// GET /api/users/export-pdf - Экспорт пользователей в PDF
router.get('/export-pdf', requireAdmin, async (req, res) => {
  try {
    // Используем те же параметры фильтрации что и в основном запросе
    const {
      role,
      course,
      group_name,
      is_active,
      search,
      dormitory_id,
      dormitory_type,
      floor_number,
      block_number,
      room_number,
      bed_number,
      region,
      has_accommodation,
    } = req.query

    let whereClause = 'WHERE 1=1'
    const params = []
    let paramCount = 0

    // Применяем те же фильтры
    if (role) {
      whereClause += ` AND u.role = $${++paramCount}`
      params.push(role)
    }

    if (course) {
      whereClause += ` AND u.course = $${++paramCount}`
      params.push(parseInt(course))
    }

    if (group_name) {
      whereClause += ` AND u.group_name ILIKE $${++paramCount}`
      params.push(`%${group_name}%`)
    }

    if (is_active !== undefined) {
      whereClause += ` AND u.is_active = $${++paramCount}`
      params.push(is_active === 'true')
    }

    if (region) {
      whereClause += ` AND u.region ILIKE $${++paramCount}`
      params.push(`%${region}%`)
    }

    if (dormitory_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (uuidRegex.test(dormitory_id)) {
        whereClause += ` AND d.id = $${++paramCount}`
        params.push(dormitory_id)
      }
    }

    if (dormitory_type) {
      whereClause += ` AND d.type = $${++paramCount}`
      params.push(dormitory_type === '1' ? 'type_1' : 'type_2')
    }

    if (floor_number) {
      whereClause += ` AND (f1.floor_number = $${++paramCount} OR f2.floor_number = $${paramCount})`
      params.push(parseInt(floor_number))
    }

    if (block_number) {
      whereClause += ` AND bl.block_number = $${++paramCount}`
      params.push(parseInt(block_number))
    }

    if (room_number) {
      whereClause += ` AND r.room_number ILIKE $${++paramCount}`
      params.push(`%${room_number}%`)
    }

    if (bed_number) {
      whereClause += ` AND b.bed_number = $${++paramCount}`
      params.push(parseInt(bed_number))
    }

    if (has_accommodation === 'true') {
      whereClause += ` AND b.id IS NOT NULL`
    } else if (has_accommodation === 'false') {
      whereClause += ` AND b.id IS NULL`
    }

    if (search) {
      whereClause += ` AND (u.first_name ILIKE $${++paramCount} OR u.last_name ILIKE $${paramCount} OR u.contact ILIKE $${paramCount} OR u.student_id ILIKE $${paramCount})`
      params.push(`%${search}%`)
    }

    // Получаем все данные без лимита для экспорта
    const result = await query(
      `
      SELECT 
        u.id, u.contact, u.first_name, u.last_name, u.middle_name, u.phone,
        u.role, u.student_id, u.group_name, u.course, u.is_active,
        u.is_verified, u.created_at, u.updated_at, u.region, u.address,
        u.birth_date, u.gender, u.parent_phone, u.email,
        -- Информация о проживании
        b.id as bed_id, b.bed_number, b.assigned_at,
        r.id as room_id, r.room_number, r.block_room_number,
        bl.id as block_id, bl.block_number,
        f1.id as floor_id, f1.floor_number,
        f2.id as floor_id_2, f2.floor_number as floor_number_2,
        d.id as dormitory_id, d.name as dormitory_name, d.type as dormitory_type,
        -- Информация о группе
        g.id as group_id_ref, g.faculty, g.speciality
      FROM users u
      LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
      LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
      LEFT JOIN floors f1 ON r.floor_id = f1.id AND f1.is_active = true
      LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
      LEFT JOIN floors f2 ON bl.floor_id = f2.id AND f2.is_active = true
      LEFT JOIN dormitories d ON (f1.dormitory_id = d.id OR f2.dormitory_id = d.id) AND d.is_active = true
      LEFT JOIN groups g ON u.group_id = g.id AND g.is_active = true
      ${whereClause}
      ORDER BY u.last_name, u.first_name
    `,
      params,
    )

    const users = result.rows

    // Формируем метаданные для PDF
    const filterInfo = {
      totalUsers: users.length,
      appliedFilters: {},
      generatedAt: new Date().toISOString(),
      generatedBy: req.user.username || req.user.contact,
    }

    if (role) filterInfo.appliedFilters.role = role
    if (course) filterInfo.appliedFilters.course = course
    if (group_name) filterInfo.appliedFilters.group = group_name
    if (region) filterInfo.appliedFilters.region = region
    if (dormitory_type) filterInfo.appliedFilters.dormitoryType = dormitory_type
    if (search) filterInfo.appliedFilters.search = search

    res.json({
      success: true,
      users: users,
      filterInfo: filterInfo,
    })
  } catch (error) {
    console.error('Ошибка экспорта пользователей:', error)
    res.status(500).json({ error: 'Ошибка экспорта пользователей' })
  }
})

// GET /api/users/stats - Статистика пользователей (только админы)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        role,
        COUNT(*) as count,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
      FROM users
      GROUP BY role
    `)

    const roleStats = {
      student: { total: 0, active: 0 },
      admin: { total: 0, active: 0 },
      super_admin: { total: 0, active: 0 },
    }

    result.rows.forEach((row) => {
      roleStats[row.role] = {
        total: parseInt(row.count),
        active: parseInt(row.active_count),
      }
    })

    const totalUsers = Object.values(roleStats).reduce((acc, stat) => acc + stat.total, 0)
    const totalActive = Object.values(roleStats).reduce((acc, stat) => acc + stat.active, 0)

    res.json({
      roleStats,
      totalUsers,
      totalActive,
      totalInactive: totalUsers - totalActive,
    })
  } catch (error) {
    console.error('Ошибка получения статистики:', error)
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
})

module.exports = router
