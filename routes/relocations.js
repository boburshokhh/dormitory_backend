const express = require('express')
const { query, transaction } = require('../config/database')
const {
  authenticateToken,
  requireAdmin,
  validateUUID,
  requireOwnershipOrAdmin,
} = require('../middleware/auth')

const router = express.Router()

// Все маршруты требуют аутентификации
router.use(authenticateToken)

// GET /api/relocations/my - мои заявки на переселение
router.get('/my', async (req, res) => {
  try {
    const result = await query(
      `SELECT r.*, d.name AS target_dormitory_name, rm.room_number AS target_room_number
       FROM relocations r
       LEFT JOIN dormitories d ON d.id = r.target_dormitory_id
       LEFT JOIN rooms rm ON rm.id = r.target_room_id
       WHERE r.student_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id],
    )

    res.json({ success: true, data: result.rows })
  } catch (error) {
    console.error('Ошибка получения заявок на переселение:', error)
    res.status(500).json({ success: false, error: 'Ошибка получения заявок' })
  }
})

// GET /api/relocations/:id - получить детальную информацию о заявке на переселение
router.get('/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // Получаем основную информацию о заявке на переселение
    const result = await query(
      `SELECT 
        r.*,
        -- Размещение по переезду
        td.name AS target_dormitory_name,
        td.type AS target_dormitory_type,
        tf.floor_number AS target_floor_number,
        tr.room_number AS target_room_number,
        tr.bed_count AS target_total_beds,
        -- Информация о студенте
        u.first_name,
        u.last_name,
        u.middle_name,
        u.email,
        u.phone,
        u.course,
        u.group_name
      FROM relocations r
      LEFT JOIN users u ON u.id = r.student_id
      -- Размещение по переезду
      LEFT JOIN rooms tr ON tr.id = r.target_room_id
      LEFT JOIN floors tf ON tf.id = tr.floor_id
      LEFT JOIN dormitories td ON td.id = tf.dormitory_id
      WHERE r.id = $1 AND r.student_id = $2`,
      [id, userId]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Заявка на переселение не найдена' })
    }

    const row = result.rows[0]

    // Получаем информацию о текущем размещении отдельным запросом
    let currentAccommodation = null
    try {
      // Сначала пробуем получить из student_accommodations
      const currentAccResult = await query(
        `SELECT 
          d.name AS dormitory_name,
          d.type AS dormitory_type,
          f.floor_number AS floor_number,
          r.room_number,
          b.bed_number,
          sa.created_at AS assigned_at
        FROM student_accommodations sa
        JOIN beds b ON b.id = sa.bed_id
        JOIN rooms r ON r.id = b.room_id
        JOIN floors f ON f.id = r.floor_id
        JOIN dormitories d ON d.id = f.dormitory_id
        WHERE sa.student_id = $1 AND sa.is_active = true
        ORDER BY sa.created_at DESC
        LIMIT 1`,
        [userId]
      )

      if (currentAccResult.rowCount > 0) {
        const currentRow = currentAccResult.rows[0]
        currentAccommodation = {
          dormitoryName: currentRow.dormitory_name,
          dormitoryType: currentRow.dormitory_type,
          floorNumber: currentRow.floor_number,
          roomNumber: currentRow.room_number,
          bedNumber: currentRow.bed_number,
          assignedAt: currentRow.assigned_at,
          // Добавляем структурированные данные для фронтенда
          dormitory: {
            name: currentRow.dormitory_name,
            type: currentRow.dormitory_type
          },
          floor: {
            number: currentRow.floor_number
          },
          room: {
            number: currentRow.room_number
          },
          bed: {
            bedNumber: currentRow.bed_number
          }
        }
      } else {
        // Фоллбек: если нет в student_accommodations, ищем в beds
        const bedResult = await query(
          `SELECT 
            d.name AS dormitory_name,
            d.type AS dormitory_type,
            f.floor_number AS floor_number,
            r.room_number,
            b.bed_number,
            b.assigned_at AS assigned_at
          FROM beds b
          JOIN rooms r ON r.id = b.room_id
          JOIN floors f ON f.id = r.floor_id
          JOIN dormitories d ON d.id = f.dormitory_id
          WHERE b.student_id = $1 AND b.is_active = true AND b.is_occupied = true
          ORDER BY COALESCE(b.assigned_at, r.updated_at) DESC
          LIMIT 1`,
          [userId]
        )

        if (bedResult.rowCount > 0) {
          const bedRow = bedResult.rows[0]
          currentAccommodation = {
            dormitoryName: bedRow.dormitory_name,
            dormitoryType: bedRow.dormitory_type,
            floorNumber: bedRow.floor_number,
            roomNumber: bedRow.room_number,
            bedNumber: bedRow.bed_number,
            assignedAt: bedRow.assigned_at,
            // Добавляем структурированные данные для фронтенда
            dormitory: {
              name: bedRow.dormitory_name,
              type: bedRow.dormitory_type
            },
            floor: {
              number: bedRow.floor_number
            },
            room: {
              number: bedRow.room_number
            },
            bed: {
              bedNumber: bedRow.bed_number
            }
          }
        }
      }
    } catch (error) {
      console.error('Ошибка получения текущего размещения:', error)
    }

    // Получаем информацию об однокомнатниках по целевому размещению
    let targetRoommates = []
    if (row.target_room_id) {
      try {
        const roommatesResult = await query(
          `SELECT 
            b.bed_number,
            u.id AS user_id,
            u.first_name,
            u.last_name,
            u.middle_name,
            u.student_id,
            g.name AS group_name,
            u.course,
            b.assigned_at
          FROM beds b
          LEFT JOIN users u ON u.id = b.student_id
          LEFT JOIN groups g ON g.id = u.group_id
          WHERE b.room_id = $1 AND b.is_active = true AND b.is_occupied = true
          ORDER BY b.bed_number`,
          [row.target_room_id]
        )

        targetRoommates = roommatesResult.rows.map((r) => ({
          id: r.user_id,
          bedNumber: r.bed_number,
          fullName: `${r.last_name || ''} ${r.first_name || ''} ${r.middle_name || ''}`.trim(),
          studentId: r.student_id,
          groupName: r.group_name,
          course: r.course,
          assignedAt: r.assigned_at,
        }))
      } catch (error) {
        console.error('Ошибка получения однокомнатников по целевому размещению:', error)
        targetRoommates = []
      }
    }

    // Формируем структурированный ответ
    const relocation = {
      id: row.id,
      status: row.status,
      comment: row.comment,
      admin_comment: row.admin_comment,
      created_at: row.created_at,
      reviewed_at: row.reviewed_at,
      student: {
        firstName: row.first_name,
        lastName: row.last_name,
        middleName: row.middle_name,
        email: row.email,
        phone: row.phone,
        course: row.course,
        groupName: row.group_name
      },
      currentAccommodation,
      targetAccommodation: row.target_dormitory_name ? {
        dormitoryName: row.target_dormitory_name,
        dormitoryType: row.target_dormitory_type,
        floorNumber: row.target_floor_number,
        roomNumber: row.target_room_number,
        totalBeds: row.target_total_beds
      } : null,
      targetRoommates
    }

    res.json({ success: true, data: relocation })
  } catch (error) {
    console.error('Ошибка получения детальной информации о заявке на переселение:', error)
    console.error('Stack trace:', error.stack)
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка получения информации о заявке',
      details: error.message 
    })
  }
})

// GET /api/relocations - список заявок (админы)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const {
      status,
      search,
      course,
      group_id,
      current_dormitory_type,
      target_dormitory_type,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1,
      limit = 20
    } = req.query

    const params = []
    let paramCount = 0

    // Базовый запрос с JOIN'ами для получения полной информации
    let baseQuery = `
      FROM relocations r
      JOIN users u ON u.id = r.student_id
      LEFT JOIN groups g ON g.id = u.group_id
      LEFT JOIN dormitories td ON td.id = r.target_dormitory_id
      LEFT JOIN rooms tr ON tr.id = r.target_room_id
      LEFT JOIN floors tf ON tf.id = tr.floor_id
      LEFT JOIN beds tb ON tb.id = r.target_bed_id
      LEFT JOIN beds cb ON cb.id = r.current_bed_id
      LEFT JOIN student_accommodations sa ON sa.bed_id = cb.id AND sa.is_active = true
      LEFT JOIN rooms cr ON cr.id = cb.room_id
      LEFT JOIN floors cf ON cf.id = cr.floor_id
      LEFT JOIN dormitories cd ON cd.id = cf.dormitory_id
    `

    let where = 'WHERE 1=1'

    // Фильтр по статусу
    if (status) {
      paramCount++
      params.push(status)
      where += ` AND r.status = $${paramCount}`
    }

    // Поиск по ФИО, email или группе
    if (search) {
      paramCount++
      params.push(`%${search}%`)
      where += ` AND (
        CONCAT(u.first_name, ' ', u.last_name) ILIKE $${paramCount} OR
        u.email ILIKE $${paramCount} OR
        g.name ILIKE $${paramCount}
      )`
    }

    // Фильтр по курсу
    if (course) {
      paramCount++
      params.push(course)
      where += ` AND u.course = $${paramCount}`
    }

    // Фильтр по группе
    if (group_id) {
      paramCount++
      params.push(group_id)
      where += ` AND u.group_id = $${paramCount}`
    }

    // Фильтр по типу текущего общежития
    if (current_dormitory_type) {
      paramCount++
      params.push(current_dormitory_type)
      where += ` AND cd.type = $${paramCount}`
    }

    // Фильтр по типу целевого общежития
    if (target_dormitory_type) {
      paramCount++
      params.push(target_dormitory_type)
      where += ` AND td.type = $${paramCount}`
    }

    // Фильтр по дате от
    if (date_from) {
      paramCount++
      params.push(date_from)
      where += ` AND r.created_at >= $${paramCount}`
    }

    // Фильтр по дате до
    if (date_to) {
      paramCount++
      params.push(date_to + ' 23:59:59')
      where += ` AND r.created_at <= $${paramCount}`
    }

    // Сортировка
    const validSortFields = ['created_at', 'status', 'first_name', 'last_name']
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at'
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC'

    // Подсчет общего количества
    const countQuery = `SELECT COUNT(*) as total ${baseQuery} ${where}`
    const countResult = await query(countQuery, params)
    const total = parseInt(countResult.rows[0].total)

    // Пагинация
    let limitParam = limit === 'ALL' ? total : parseInt(limit) || 20
    let offset = 0
    if (limit !== 'ALL') {
      const pageNum = parseInt(page) || 1
      offset = (pageNum - 1) * limitParam
    }

    // Основной запрос
    const mainQuery = `
      SELECT 
        r.*,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.email,
        u.phone,
        u.course,
        g.name as group_name,
        td.name as target_dormitory_name,
        td.type as target_dormitory_type,
        tr.room_number as target_room_number,
        tr.bed_count as target_total_beds,
        tf.floor_number as target_floor_number,
        tb.bed_number as target_bed_number,
        cd.name as current_dormitory_name,
        cd.type as current_dormitory_type,
        cr.room_number as current_room_number,
        cf.floor_number as current_floor_number,
        cb.bed_number as current_bed_number,
        sa.check_in_date as current_assigned_at
      ${baseQuery}
      ${where}
      ORDER BY r.${sortField} ${sortDirection}
      ${limit !== 'ALL' ? `LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}` : ''}
    `

    if (limit !== 'ALL') {
      params.push(limitParam, offset)
    }

    const result = await query(mainQuery, params)

    // Формируем структурированный ответ
    const structuredRelocations = result.rows.map(row => ({
      id: row.id,
      studentId: row.student_id,
      status: row.status,
      comment: row.comment,
      adminComment: row.admin_comment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by,
      student: {
        firstName: row.first_name,
        lastName: row.last_name,
        middleName: row.middle_name,
        email: row.email,
        phone: row.phone,
        course: row.course,
        groupName: row.group_name
      },
      currentAccommodation: row.current_dormitory_name ? {
        dormitoryName: row.current_dormitory_name,
        dormitoryType: row.current_dormitory_type,
        floorNumber: row.current_floor_number,
        roomNumber: row.current_room_number,
        bedNumber: row.current_bed_number,
        assignedAt: row.current_assigned_at
      } : null,
      targetAccommodation: row.target_dormitory_name ? {
        dormitoryName: row.target_dormitory_name,
        dormitoryType: row.target_dormitory_type,
        floorNumber: row.target_floor_number,
        roomNumber: row.target_room_number,
        bedNumber: row.target_bed_number,
        totalBeds: row.target_total_beds
      } : null
    }))

    // Формируем ответ с пагинацией
    const totalPages = limit === 'ALL' ? 1 : Math.ceil(total / limitParam)
    const currentPage = parseInt(page) || 1

    res.json({
      success: true,
      data: {
        relocations: structuredRelocations,
        pagination: {
          total,
          page: currentPage,
          limit: limitParam,
          totalPages,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1
        }
      }
    })
  } catch (error) {
    console.error('Ошибка получения списка переселений:', error)
    console.error('Stack trace:', error.stack)
    res.status(500).json({ success: false, error: 'Ошибка получения списка', details: error.message })
  }
})

// POST /api/relocations - создать заявку на переселение (студент)
router.post('/', async (req, res) => {
  try {
    const { targetDormitoryId, targetRoomId, comment } = req.body
    if (!targetDormitoryId || !targetRoomId) {
      return res.status(400).json({ success: false, error: 'Общежитие и комната обязательны' })
    }

    // Проверим активное размещение студента (основной источник student_accommodations)
    let activeAcc
    {
      const accRes = await query(
        `SELECT sa.id, sa.bed_id, b.room_id AS current_room_id, r.is_reserved, r.is_female
         FROM student_accommodations sa
         JOIN beds b ON b.id = sa.bed_id
         JOIN rooms r ON r.id = b.room_id
         WHERE sa.student_id = $1 AND sa.is_active = true
         ORDER BY sa.created_at DESC
         LIMIT 1`,
        [req.user.id],
      )
      if (accRes.rowCount > 0) {
        activeAcc = accRes.rows[0]
      }
    }

    // Фоллбек: если по какой-то причине запись в student_accommodations отсутствует,
    // используем текущее назначение из beds (как делает /profile/accommodation)
    if (!activeAcc) {
      const bedRes = await query(
        `SELECT NULL::uuid AS id, b.id AS bed_id, b.room_id AS current_room_id, r.is_reserved, r.is_female
         FROM beds b
         JOIN rooms r ON r.id = b.room_id
         WHERE b.student_id = $1 AND b.is_active = true AND b.is_occupied = true
         ORDER BY COALESCE(b.assigned_at, r.updated_at) DESC
         LIMIT 1`,
        [req.user.id],
      )
      if (bedRes.rowCount > 0) {
        activeAcc = bedRes.rows[0]
      }
    }

    if (!activeAcc) {
      return res.status(400).json({ 
        success: false, 
        error: 'У вас нет активного размещения. Сначала подайте и дождитесь одобрения заявки на размещение.' 
      })
    }

    // Проверяем статус последней заявки на переселение
    const lastRelocationRes = await query(
      `SELECT status FROM relocations WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id],
    )
    
    if (lastRelocationRes.rowCount > 0) {
      const lastStatus = lastRelocationRes.rows[0].status
      
      // Если заявка на рассмотрении - нельзя подавать новую
      if (lastStatus === 'submitted') {
        return res
          .status(409)
          .json({ success: false, error: 'У вас уже есть заявка на переселение на рассмотрении' })
      }
      
      // Если заявка одобрена - нельзя подавать новую
      if (lastStatus === 'approved') {
        return res
          .status(409)
          .json({ success: false, error: 'Ваша заявка на переселение уже одобрена' })
      }
      
      // Если заявка отклонена или отозвана - можно подавать новую
      // (это разрешено, продолжаем выполнение)
    }

    // Проверяем, что студент не пытается переселиться в ту же комнату
    if (activeAcc.current_room_id === targetRoomId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Вы уже проживаете в выбранной комнате' 
      })
    }

    // Попытаемся определить целевую свободную койку (если есть), чтобы сохранить пожелание точнее
    const freeBedTry = await query(
      `SELECT id FROM beds WHERE room_id = $1 AND is_active = true AND is_occupied = false ORDER BY bed_number LIMIT 1`,
      [targetRoomId],
    )
    const targetBedId = freeBedTry.rows?.[0]?.id || null

    const insRes = await query(
      `INSERT INTO relocations (
         student_id,
         current_accommodation_id,
         current_bed_id,
         target_dormitory_id,
         target_room_id,
         target_bed_id,
         comment
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.id,
        activeAcc.id,
        activeAcc.bed_id,
        targetDormitoryId,
        targetRoomId,
        targetBedId,
        comment || null,
      ],
    )

    res.status(201).json({ success: true, data: insRes.rows[0] })
  } catch (error) {
    console.error('Ошибка создания заявки на переселение:', error)
    res.status(500).json({ success: false, error: 'Ошибка создания заявки' })
  }
})

// GET /api/relocations/:id - получить детальную информацию о заявке
router.get('/:id', validateUUID('id'), requireOwnershipOrAdmin('student_id', 'relocations'), async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT 
        r.*,
        u.first_name,
        u.last_name,
        u.middle_name,
        u.email,
        u.phone,
        u.course,
        g.name as group_name,
        td.name as target_dormitory_name,
        td.type as target_dormitory_type,
        tr.room_number as target_room_number,
        tr.bed_count as target_total_beds,
        tf.floor_number as target_floor_number,
        tb.bed_number as target_bed_number,
        cd.name as current_dormitory_name,
        cd.type as current_dormitory_type,
        cr.room_number as current_room_number,
        cf.floor_number as current_floor_number,
        cb.bed_number as current_bed_number,
        sa.check_in_date as current_assigned_at
      FROM relocations r
      JOIN users u ON u.id = r.student_id
      LEFT JOIN groups g ON g.id = u.group_id
      LEFT JOIN dormitories td ON td.id = r.target_dormitory_id
      LEFT JOIN rooms tr ON tr.id = r.target_room_id
      LEFT JOIN floors tf ON tf.id = tr.floor_id
      LEFT JOIN beds tb ON tb.id = r.target_bed_id
      LEFT JOIN beds cb ON cb.id = r.current_bed_id
      LEFT JOIN student_accommodations sa ON sa.bed_id = cb.id AND sa.is_active = true
      LEFT JOIN rooms cr ON cr.id = cb.room_id
      LEFT JOIN floors cf ON cf.id = cr.floor_id
      LEFT JOIN dormitories cd ON cd.id = cf.dormitory_id
      WHERE r.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Заявка не найдена' })
    }

    const relocation = result.rows[0]

    // Получаем информацию о проживающих в целевой комнате
    let residents = []
    if (relocation.target_room_id) {
      const residentsResult = await query(
        `SELECT 
          u.id,
          u.first_name,
          u.last_name,
          u.middle_name,
          CONCAT(u.last_name, ' ', u.first_name, ' ', COALESCE(u.middle_name, '')) as full_name,
          u.email,
          u.phone,
          g.name as group_name,
          u.course,
          b.bed_number,
          sa.check_in_date
        FROM beds b
        JOIN student_accommodations sa ON sa.bed_id = b.id AND sa.is_active = true
        JOIN users u ON u.id = sa.student_id
        LEFT JOIN groups g ON g.id = u.group_id
        WHERE b.room_id = $1
        ORDER BY b.bed_number`,
        [relocation.target_room_id]
      )
      residents = residentsResult.rows
    }

    // Формируем структурированный ответ
    const response = {
      success: true,
      data: {
        id: relocation.id,
        status: relocation.status,
        comment: relocation.comment,
        adminComment: relocation.admin_comment,
        createdAt: relocation.created_at,
        updatedAt: relocation.updated_at,
        student: {
          id: relocation.student_id,
          firstName: relocation.first_name,
          lastName: relocation.last_name,
          middleName: relocation.middle_name,
          email: relocation.email,
          phone: relocation.phone,
          course: relocation.course,
          groupName: relocation.group_name
        },
        currentAccommodation: relocation.current_dormitory_name ? {
          dormitory: {
            id: relocation.current_dormitory_id,
            name: relocation.current_dormitory_name,
            type: relocation.current_dormitory_type
          },
          floor: {
            id: relocation.current_floor_id,
            number: relocation.current_floor_number
          },
          room: {
            id: relocation.current_room_id,
            number: relocation.current_room_number
          },
          bedNumber: relocation.current_bed_number,
          assignedAt: relocation.current_assigned_at
        } : null,
        targetRoom: relocation.target_dormitory_name ? {
          id: relocation.target_room_id,
          roomNumber: relocation.target_room_number,
          totalBeds: relocation.target_total_beds,
          occupiedBeds: residents.length,
          availableBeds: relocation.target_total_beds - residents.length,
          dormitory: {
            id: relocation.target_dormitory_id,
            name: relocation.target_dormitory_name,
            type: relocation.target_dormitory_type
          },
          floor: {
            id: relocation.target_floor_id,
            number: relocation.target_floor_number
          },
          residents: residents
        } : null,
        targetBed: relocation.target_bed_number ? {
          id: relocation.target_bed_id,
          bedNumber: relocation.target_bed_number
        } : null
      }
    }

    res.json(response)
  } catch (error) {
    console.error('Ошибка получения заявки на переселение:', error)
    res.status(500).json({ success: false, error: 'Ошибка получения заявки' })
  }
})

// DELETE /api/relocations/:id - отменить свою заявку (если на рассмотрении)
router.delete('/:id', validateUUID('id'), requireOwnershipOrAdmin('student_id', 'relocations'), async (req, res) => {
  try {
    const { id } = req.params
    const rowRes = await query('SELECT * FROM relocations WHERE id = $1', [id])
    if (rowRes.rowCount === 0) return res.status(404).json({ success: false, error: 'Не найдено' })
    const row = rowRes.rows[0]
    if (row.status !== 'submitted') {
      return res.status(400).json({ success: false, error: 'Нельзя отменить обработанную заявку' })
    }
    await query(`UPDATE relocations SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id])
    res.json({ success: true })
  } catch (error) {
    console.error('Ошибка отмены заявки на переселение:', error)
    res.status(500).json({ success: false, error: 'Ошибка отмены заявки' })
  }
})

// PUT /api/relocations/:id/review - рассмотреть заявку (админ): approved/rejected
router.put('/:id/review', validateUUID('id'), requireAdmin, async (req, res) => {
  const status = (req.body?.status || '').toLowerCase()
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: 'status must be approved|rejected' })
  }

  try {
    const { id } = req.params
    const adminComment = req.body?.adminComment || null

    const result = await transaction(async (client) => {
      const { rows, rowCount } = await client.query('SELECT * FROM relocations WHERE id = $1 FOR UPDATE', [id])
      if (rowCount === 0) throw new Error('Not found')
      const relocation = rows[0]
      if (relocation.status !== 'pending') throw new Error('Already reviewed')

      if (status === 'rejected') {
        await client.query(
          `UPDATE relocations SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), admin_comment = $2, updated_at = now() WHERE id = $3`,
          [req.user.id, adminComment, id],
        )
        return { status: 'rejected' }
      }

      // approve: назначаем свободную койку в целевой комнате и снимаем текущую
      const freeBedRes = await client.query(
        `SELECT id FROM beds WHERE room_id = $1 AND is_active = true AND is_occupied = false ORDER BY bed_number LIMIT 1`,
        [relocation.target_room_id],
      )
      if (freeBedRes.rowCount === 0) throw new Error('No free beds in target room')
      const newBedId = freeBedRes.rows[0].id

      // Освобождаем старую койку
      if (relocation.current_bed_id) {
        await client.query(
          `UPDATE beds SET is_occupied = false, student_id = NULL, updated_at = now() WHERE id = $1`,
          [relocation.current_bed_id],
        )
      }

      // Назначаем новую койку
      await client.query(
        `UPDATE beds SET is_occupied = true, student_id = $1, assigned_at = now(), updated_at = now() WHERE id = $2`,
        [relocation.student_id, newBedId],
      )

      // Обновляем запись размещения студента
      if (relocation.current_accommodation_id) {
        await client.query(
          `UPDATE student_accommodations SET bed_id = $1, updated_at = now() WHERE id = $2`,
          [newBedId, relocation.current_accommodation_id],
        )
      }

      // Обновляем заявку
      await client.query(
        `UPDATE relocations SET status = 'approved', reviewed_by = $1, reviewed_at = now(), admin_comment = $2, updated_at = now() WHERE id = $3`,
        [req.user.id, adminComment, id],
      )

      return { status: 'approved', newBedId }
    })

    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Ошибка рассмотрения заявки на переселение:', error)
    const message = /Not found/.test(error.message)
      ? 'Заявка не найдена'
      : /Already reviewed/.test(error.message)
      ? 'Заявка уже рассмотрена'
      : error.message === 'No free beds in target room'
      ? 'Нет свободных мест в выбранной комнате'
      : 'Ошибка рассмотрения заявки'
    res.status(/Not found|Already reviewed|No free beds/.test(error.message) ? 400 : 500).json({ success: false, error: message })
  }
})

// GET /api/relocations/:id/roommates - получить соседей по комнате для заявки на переселение
router.get('/:id/roommates', async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // Проверяем, что заявка принадлежит текущему пользователю
    const relocationRes = await query(
      `SELECT r.*, tr.id as target_room_id
       FROM relocations r
       LEFT JOIN rooms tr ON tr.id = r.target_room_id
       WHERE r.id = $1 AND r.student_id = $2`,
      [id, userId]
    )

    if (relocationRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Заявка на переселение не найдена' })
    }

    const relocation = relocationRes.rows[0]

    // Если заявка не одобрена или нет целевой комнаты, возвращаем пустой список
    if (relocation.status !== 'approved' || !relocation.target_room_id) {
      return res.json({
        success: true,
        data: {
          roommates: []
        }
      })
    }

    // Получаем информацию о соседях по целевой комнате
    const roommatesRes = await query(
      `SELECT b.bed_number,
              u.id AS user_id,
              u.first_name,
              u.last_name,
              u.middle_name,
              u.student_id,
              g.name AS group_name,
              u.course,
              b.assigned_at
       FROM beds b
       LEFT JOIN users u ON u.id = b.student_id
       LEFT JOIN groups g ON g.id = u.group_id
       WHERE b.room_id = $1 AND b.is_active = true AND b.is_occupied = true
       ORDER BY b.bed_number`,
      [relocation.target_room_id]
    )

    const roommates = roommatesRes.rows.map((r) => ({
      id: r.user_id,
      bedNumber: r.bed_number,
      fullName: `${r.last_name || ''} ${r.first_name || ''} ${r.middle_name || ''}`.trim(),
      studentId: r.student_id,
      groupName: r.group_name,
      course: r.course,
      assignedAt: r.assigned_at,
    }))

    res.json({
      success: true,
      data: {
        roommates
      }
    })
  } catch (error) {
    console.error('Ошибка получения соседей по комнате:', error)
    res.status(500).json({ success: false, error: 'Ошибка получения информации о соседях' })
  }
})

module.exports = router


