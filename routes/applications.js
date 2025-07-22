const express = require('express')
const { query, transaction } = require('../config/database')
const loggingService = require('../services/loggingService')
const { getFileUrl } = require('../config/minio')
const {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin,
  validateUUID,
  logAdminAction,
} = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// Константы для валидации
const VALID_STATUSES = ['submitted', 'approved', 'rejected', 'cancelled']
const VALID_ROOM_TYPES = ['single', 'double', 'triple']
const VALID_REVIEW_STATUSES = ['approved', 'rejected']

// Утилита для построения динамических WHERE условий
const buildWhereClause = (conditions, params) => {
  let whereClause = 'WHERE 1=1'
  let paramCount = 0

  Object.entries(conditions).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      whereClause += ` AND ${key} = $${++paramCount}`
      params.push(value)
    }
  })

  return { whereClause, paramCount }
}

// GET /api/applications - Получить заявки (с фильтрацией по роли)
router.get('/', async (req, res) => {
  try {
    const {
      status,
      dormitory_id,
      academic_year,
      semester,
      page = 1,
      limit = 20,
      sort_by = 'submission_date',
      sort_order = 'DESC',
    } = req.query

    // Валидация входных параметров
    const pageNum = Math.max(1, parseInt(page) || 1)
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20))
    const offset = (pageNum - 1) * limitNum

    // Валидация статуса
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус заявки' })
    }

    // Валидация сортировки
    const validSortFields = ['submission_date', 'status', 'academic_year', 'priority_score']
    const validSortOrders = ['ASC', 'DESC']
    const sortBy = validSortFields.includes(sort_by) ? sort_by : 'submission_date'
    const sortOrder = validSortOrders.includes(sort_order?.toUpperCase())
      ? sort_order.toUpperCase()
      : 'DESC'

    const params = []
    const conditions = {}

    // Фильтрация по роли пользователя
    if (req.user.role === 'student') {
      conditions['a.student_id'] = req.user.id
    }

    // Добавляем остальные фильтры
    if (status) conditions['a.status'] = status
    if (dormitory_id) conditions['a.dormitory_id'] = dormitory_id
    if (academic_year) conditions['a.academic_year'] = academic_year
    if (semester) conditions['a.semester'] = semester

    const { whereClause, paramCount } = buildWhereClause(conditions, params)

    // Оптимизированный запрос для списка заявок (только основные данные)
    const result = await query(
      `
      SELECT 
        a.id, 
        a.status, 
        a.submission_date,
        a.academic_year, 
        a.semester,
        a.preferred_room_type,

        -- Основные данные студента для таблицы
        u.first_name, 
        u.last_name, 
        u.email, 
        u.student_id as student_number,
        g.name as group_name, 
        g.course,

        -- Название общежития
        d.name AS dormitory_name

      FROM applications a
      JOIN users u ON a.student_id = u.id
      LEFT JOIN dormitories d ON a.dormitory_id = d.id
      left join groups g on u.group_id=g.id

      ${whereClause}

      ORDER BY 
        CASE 
          WHEN a.status = 'submitted' THEN 1
          WHEN a.status = 'approved' THEN 2
          WHEN a.status = 'rejected' THEN 3
          ELSE 4
        END,
        a.${sortBy} ${sortOrder}

      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `,
      [...params, limitNum, offset],
    )

    // Подсчет общего количества
    const countResult = await query(
      `
      SELECT COUNT(*) as total
      FROM applications a
      JOIN users u ON a.student_id = u.id
      ${whereClause}
      `,
      params,
    )

    // Формируем минимальный ответ для списка заявок
    const applications = result.rows.map((app) => ({
      id: app.id,
      status: app.status,
      submissionDate: app.submission_date,
      academicYear: app.academic_year,
      semester: app.semester,
      preferredRoomType: app.preferred_room_type,
      student: {
        firstName: app.first_name,
        lastName: app.last_name,
        email: app.email,
        studentId: app.student_number,
        groupName: app.group_name,
        course: app.course,
      },
      dormitory: app.dormitory_name ? { name: app.dormitory_name } : null,
    }))

    const total = parseInt(countResult.rows[0].total)

    res.json({
      success: true,
      data: {
        applications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum * limitNum < total,
          hasPrevPage: pageNum > 1,
        },
        filters: {
          status,
          dormitory_id,
          academic_year,
          semester,
        },
      },
    })
  } catch (error) {
    console.error('Ошибка получения заявок:', error)

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'applications_fetch_error',
      actionDescription: 'Error fetching applications',
      req,
      success: false,
      errorMessage: error.message,
    })

    res.status(500).json({
      success: false,
      error: 'Ошибка получения заявок',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

// GET /api/applications/stats - Статистика заявок (только админы)
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { academic_year, semester, dormitory_id } = req.query

    const params = []
    const conditions = {}

    if (academic_year) conditions['academic_year'] = academic_year
    if (semester) conditions['semester'] = semester
    if (dormitory_id) conditions['dormitory_id'] = dormitory_id

    const { whereClause } = buildWhereClause(conditions, params)

    // Получаем статистику по статусам
    const statusResult = await query(
      `
      SELECT 
        status,
        COUNT(*) as count,
        ROUND(AVG(priority_score), 2) as avg_priority
      FROM applications
      ${whereClause}
      GROUP BY status
      `,
      params,
    )

    // Получаем статистику по общежитиям
    const dormitoryResult = await query(
      `
      SELECT 
        d.name as dormitory_name,
        COUNT(a.*) as applications_count,
        COUNT(CASE WHEN a.status = 'approved' THEN 1 END) as approved_count
      FROM dormitories d
      LEFT JOIN applications a ON d.id = a.dormitory_id ${whereClause.replace('WHERE', 'AND')}
      GROUP BY d.id, d.name
      ORDER BY applications_count DESC
      `,
      params,
    )

    const statusStats = {
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    }

    let totalPrioritySum = 0
    let applicationsWithPriority = 0

    statusResult.rows.forEach((row) => {
      statusStats[row.status] = parseInt(row.count)
      if (row.avg_priority) {
        totalPrioritySum += parseFloat(row.avg_priority) * parseInt(row.count)
        applicationsWithPriority += parseInt(row.count)
      }
    })

    const totalApplications = Object.values(statusStats).reduce((a, b) => a + b, 0)
    const approvalRate =
      totalApplications > 0 ? Math.round((statusStats.approved / totalApplications) * 100) : 0
    const avgPriority =
      applicationsWithPriority > 0
        ? Math.round((totalPrioritySum / applicationsWithPriority) * 100) / 100
        : 0

    res.json({
      success: true,
      data: {
        statusStats,
        totalApplications,
        approvalRate,
        avgPriorityScore: avgPriority,
        dormitoryStats: dormitoryResult.rows.map((row) => ({
          name: row.dormitory_name,
          totalApplications: parseInt(row.applications_count),
          approvedApplications: parseInt(row.approved_count),
          approvalRate:
            parseInt(row.applications_count) > 0
              ? Math.round((parseInt(row.approved_count) / parseInt(row.applications_count)) * 100)
              : 0,
        })),
      },
    })
  } catch (error) {
    console.error('Ошибка получения статистики:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка получения статистики',
    })
  }
})

// GET /api/applications/:id - Получить заявку по ID
router.get('/:id', validateUUID('id'), requireOwnershipOrAdmin('student_id'), async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `
SELECT a.*,
       u.first_name,
       u.last_name,
       u.email,
       u.student_id        as student_number,
       g.name              as group_name,
       g.course,
       u.phone,
       u.gender,
       u.birth_date,
       u.middle_name,
       u.region,
       u.address,
       u.parent_phone,
       u.passport_series,
       u.passport_pinfl,
       d.name              as dormitory_name,
       d.type              as dormitory_type,
       d.address           as dormitory_address,
       reviewer.first_name as reviewer_first_name,
       reviewer.last_name  as reviewer_last_name,
       reviewer.email      as reviewer_email
FROM applications a
         JOIN users u ON a.student_id = u.id
         LEFT JOIN dormitories d ON a.dormitory_id = d.id
         LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
         left join groups g on u.group_id = g.id
WHERE a.id = $1;
      `,
      [id],
    )

    // Получаем файлы пользователя отдельным запросом
    const filesResult = await query(
      `
      SELECT 
        id,
        original_name,
        file_name,
        file_type,
        mime_type,
        file_size,
        status,
        is_verified,
        download_count,
        created_at,
        updated_at,
        public_url,
        is_public,
        metadata
      FROM files 
      WHERE user_id = $1 AND status IN ('active', 'uploading') AND deleted_at IS NULL
      ORDER BY created_at DESC
      `,
      [result.rows[0].student_id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Заявка не найдена',
      })
    }

    const app = result.rows[0]

    // Проверяем права доступа для студентов
    if (req.user.role === 'student' && app.student_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Доступ запрещен',
      })
    }

    const application = {
      id: app.id,
      student: {
        id: app.student_id,
        firstName: app.first_name,
        lastName: app.last_name,
        middleName: app.middle_name,
        email: app.email,
        phone: app.phone,
        studentId: app.student_number,
        groupName: app.group_name,
        course: app.course,
        gender: app.gender,
        birthDate: app.birth_date,
        region: app.region,
        address: app.address,
        parentPhone: app.parent_phone,
        passportSeries: app.passport_series,
        passportPinfl: app.passport_pinfl,
      },
      dormitory: app.dormitory_id
        ? {
            id: app.dormitory_id,
            name: app.dormitory_name,
            type: app.dormitory_type,
            address: app.dormitory_address,
          }
        : null,
      preferredRoomType: app.preferred_room_type,
      academicYear: app.academic_year,
      semester: app.semester,
      status: app.status,
      submissionDate: app.submission_date,
      reviewDate: app.review_date,
      reviewer: app.reviewed_by
        ? {
            firstName: app.reviewer_first_name,
            lastName: app.reviewer_last_name,
            email: app.reviewer_email,
          }
        : null,
      rejectionReason: app.rejection_reason,
      documents: Array.isArray(app.documents)
        ? app.documents
        : app.documents
          ? JSON.parse(app.documents)
          : [],
      notes: app.notes,
      priorityScore: app.priority_score,
      createdAt: app.created_at,
      updatedAt: app.updated_at,
      files: await Promise.all(
        filesResult.rows.map(async (file) => {
          let fileUrl = null
          try {
            fileUrl = await getFileUrl(file.file_name, 3600) // 1 час
          } catch (error) {
            console.error(`Ошибка получения URL для файла ${file.file_name}:`, error)
          }

          return {
            id: file.id,
            originalName: file.original_name,
            fileName: file.file_name,
            fileType: file.file_type,
            mimeType: file.mime_type,
            fileSize: file.file_size,
            status: file.status,
            isVerified: file.is_verified,
            downloadCount: file.download_count,
            createdAt: file.created_at,
            updatedAt: file.updated_at,
            publicUrl: fileUrl, // Используем подписанный URL
            isPublic: file.is_public,
            metadata: file.metadata,
          }
        }),
      ),
    }

    res.json({
      success: true,
      data: application,
    })
  } catch (error) {
    console.error('Ошибка получения заявки:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка получения заявки',
    })
  }
})

// POST /api/applications - Создать новую заявку
router.post('/', async (req, res) => {
  // Деструктурируем переменные в начале для доступности во всей функции
  const { dormitoryId, preferredRoomType, academicYear, semester, documents, notes } = req.body

  try {
    // Расширенная валидация
    const validationErrors = []

    if (!academicYear || typeof academicYear !== 'string' || academicYear.trim().length === 0) {
      validationErrors.push('Учебный год обязателен и должен быть строкой')
    }

    if (!semester || !['1', '2', 'summer'].includes(semester)) {
      validationErrors.push('Семестр должен быть "1", "2" или "summer"')
    }

    if (preferredRoomType && !VALID_ROOM_TYPES.includes(preferredRoomType)) {
      validationErrors.push('Недопустимый тип комнаты')
    }

    if (documents && !Array.isArray(documents)) {
      validationErrors.push('Документы должны быть массивом')
    }

    if (notes && typeof notes !== 'string') {
      validationErrors.push('Примечания должны быть строкой')
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ошибки валидации',
        details: validationErrors,
      })
    }

    // Проверяем, что студент может подавать заявки
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        error: 'Только студенты могут подавать заявки',
      })
    }

    // Используем транзакцию для атомарности операций
    const result = await transaction(async (client) => {
      // Проверяем наличие активной заявки
      const existingApplication = await client.query(
        `
        SELECT id, status FROM applications 
        WHERE student_id = $1 AND academic_year = $2 AND semester = $3 
        AND status IN ('submitted', 'approved')
        `,
        [req.user.id, academicYear, semester],
      )

      if (existingApplication.rows.length > 0) {
        const existing = existingApplication.rows[0]
        throw new Error(
          `У вас уже есть ${existing.status === 'submitted' ? 'поданная' : 'одобренная'} заявка на этот период`,
        )
      }

      // Получаем информацию о студенте
      const userResult = await client.query(
        `
        SELECT course, gender, is_profile_filled 
        FROM users 
        WHERE id = $1 AND role = 'student' AND is_active = true
        `,
        [req.user.id],
      )

      if (userResult.rows.length === 0) {
        throw new Error('Студент не найден или неактивен')
      }

      const { course, gender, is_profile_filled } = userResult.rows[0]

      if (!is_profile_filled) {
        throw new Error('Необходимо заполнить профиль перед подачей заявки')
      }

      // Проверяем общежитие если указано
      if (dormitoryId) {
        // Определяем доступные типы общежитий
        let availableTypes = []

        if (course === 1 && gender === 'female') {
          availableTypes = ['type_1']
        } else if (course >= 2 && course <= 5) {
          availableTypes = ['type_2']
        }

        if (availableTypes.length === 0) {
          throw new Error('Нет доступных общежитий для вашего курса и пола')
        }

        // Исправленный запрос без поля capacity
        const dormitoryResult = await client.query(
          'SELECT id, type FROM dormitories WHERE id = $1 AND is_active = true AND type = ANY($2)',
          [dormitoryId, availableTypes],
        )

        if (dormitoryResult.rows.length === 0) {
          let message = 'Выбранное общежитие недоступно для вас. '
          if (course === 1 && gender === 'female') {
            message += 'Студенты 1 курса (девочки) могут выбрать только ДПС 1.'
          } else if (course >= 2 && course <= 5) {
            message += 'Студенты 2-5 курса могут выбрать только ДПС 2.'
          }
          throw new Error(message)
        }

        // Вычисляем вместимость общежития через количество кроватей
        const capacityResult = await client.query(
          `
          SELECT COUNT(b.id) as total_capacity
          FROM dormitories d
          JOIN floors f ON d.id = f.dormitory_id
          JOIN rooms r ON f.id = r.floor_id OR r.block_id IN (
            SELECT bl.id FROM blocks bl WHERE bl.floor_id = f.id
          )
          JOIN beds b ON r.id = b.room_id
          WHERE d.id = $1 AND d.is_active = true AND f.is_active = true 
            AND r.is_active = true AND b.is_active = true
          `,
          [dormitoryId],
        )

        // Проверяем заполненность общежития
        const occupancyResult = await client.query(
          `
          SELECT COUNT(*) as current_occupancy
          FROM applications 
          WHERE dormitory_id = $1 AND status = 'approved' AND academic_year = $2 AND semester = $3
          `,
          [dormitoryId, academicYear, semester],
        )

        const currentOccupancy = parseInt(occupancyResult.rows[0].current_occupancy)
        const totalCapacity = parseInt(capacityResult.rows[0].total_capacity || 0)

        // Если нет кроватей или общежитие заполнено
        if (totalCapacity === 0) {
          throw new Error('В выбранном общежитии нет доступных мест')
        }

        if (currentOccupancy >= totalCapacity) {
          throw new Error('Выбранное общежитие заполнено')
        }
      }

      // Создаем заявку
      const applicationResult = await client.query(
        `
        INSERT INTO applications (
          student_id, dormitory_id, preferred_room_type,
          academic_year, semester, documents, notes, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
        RETURNING id, submission_date, status, created_at
        `,
        [
          req.user.id,
          dormitoryId || null,
          preferredRoomType || null,
          academicYear,
          semester,
          JSON.stringify(documents || []),
          notes || null,
        ],
      )

      return applicationResult.rows[0]
    })

    // Логируем создание заявки
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_submit',
      actionDescription: 'Student submitted new application',
      req,
      success: true,
      requestData: {
        dormitoryId,
        preferredRoomType,
        academicYear,
        semester,
        applicationId: result.id,
      },
    })

    res.status(201).json({
      success: true,
      message: 'Заявка успешно подана',
      data: {
        id: result.id,
        status: result.status,
        submissionDate: result.submission_date,
        createdAt: result.created_at,
      },
    })
  } catch (error) {
    console.error('Ошибка создания заявки:', error)

    // Логируем ошибку создания заявки
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_submit',
      actionDescription: 'Failed to submit application',
      req,
      success: false,
      errorMessage: error.message,
      requestData: { dormitoryId, preferredRoomType, academicYear, semester },
    })

    res.status(400).json({
      success: false,
      error: error.message || 'Ошибка создания заявки',
    })
  }
})

// PUT /api/applications/:id - Обновить заявку
router.put('/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params
    const { dormitoryId, preferredRoomType, documents, notes } = req.body

    // Валидация входных данных
    const validationErrors = []

    if (preferredRoomType && !VALID_ROOM_TYPES.includes(preferredRoomType)) {
      validationErrors.push('Недопустимый тип комнаты')
    }

    if (documents && !Array.isArray(documents)) {
      validationErrors.push('Документы должны быть массивом')
    }

    if (notes && typeof notes !== 'string') {
      validationErrors.push('Примечания должны быть строкой')
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Ошибки валидации',
        details: validationErrors,
      })
    }

    const result = await transaction(async (client) => {
      // Получаем заявку
      const applicationResult = await client.query(
        'SELECT student_id, status, dormitory_id FROM applications WHERE id = $1',
        [id],
      )

      if (applicationResult.rows.length === 0) {
        throw new Error('Заявка не найдена')
      }

      const application = applicationResult.rows[0]

      // Проверяем права доступа
      if (req.user.role === 'student' && application.student_id !== req.user.id) {
        throw new Error('Доступ запрещен')
      }

      // Студенты могут изменять только поданные заявки
      if (req.user.role === 'student' && application.status !== 'submitted') {
        throw new Error('Можно изменять только поданные заявки')
      }

      // Проверяем общежитие если указано и изменилось
      if (dormitoryId && dormitoryId !== application.dormitory_id) {
        const dormitoryResult = await client.query(
          'SELECT id, is_active FROM dormitories WHERE id = $1',
          [dormitoryId],
        )

        if (dormitoryResult.rows.length === 0 || !dormitoryResult.rows[0].is_active) {
          throw new Error('Общежитие не найдено или неактивно')
        }
      }

      // Обновляем заявку
      const updateResult = await client.query(
        `
        UPDATE applications 
        SET 
          dormitory_id = $1,
          preferred_room_type = $2,
          documents = $3,
          notes = $4,
          updated_at = NOW()
        WHERE id = $5
        RETURNING updated_at
        `,
        [
          dormitoryId || null,
          preferredRoomType || null,
          JSON.stringify(documents || []),
          notes || null,
          id,
        ],
      )

      return updateResult.rows[0]
    })

    // Логируем обновление заявки
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_update',
      actionDescription: 'Application updated successfully',
      req,
      success: true,
      requestData: { applicationId: id, dormitoryId, preferredRoomType },
    })

    res.json({
      success: true,
      message: 'Заявка успешно обновлена',
      data: {
        updatedAt: result.updated_at,
      },
    })
  } catch (error) {
    console.error('Ошибка обновления заявки:', error)

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_update',
      actionDescription: 'Failed to update application',
      req,
      success: false,
      errorMessage: error.message,
      requestData: { applicationId: req.params.id },
    })

    res.status(400).json({
      success: false,
      error: error.message || 'Ошибка обновления заявки',
    })
  }
})

// PUT /api/applications/:id/review - Рассмотреть заявку (только админы)
router.put(
  '/:id/review',
  validateUUID('id'),
  requireAdmin,
  logAdminAction('review_application'),
  async (req, res) => {
    try {
      const { id } = req.params
      const { status, rejectionReason, notes, priorityScore } = req.body

      // Валидация входных данных
      const validationErrors = []

      if (!VALID_REVIEW_STATUSES.includes(status)) {
        validationErrors.push('Статус должен быть "approved" или "rejected"')
      }

      if (status === 'rejected' && (!rejectionReason || rejectionReason.trim().length === 0)) {
        validationErrors.push('При отклонении заявки необходимо указать причину')
      }

      if (
        priorityScore !== undefined &&
        (isNaN(priorityScore) || priorityScore < 0 || priorityScore > 100)
      ) {
        validationErrors.push('Приоритетный балл должен быть числом от 0 до 100')
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Ошибки валидации',
          details: validationErrors,
        })
      }

      const result = await transaction(async (client) => {
        // Проверяем заявку
        const applicationResult = await client.query(
          `
          SELECT a.student_id, a.status, a.dormitory_id, a.academic_year, a.semester,
                 u.first_name, u.last_name, u.email
          FROM applications a
          JOIN users u ON a.student_id = u.id
          WHERE a.id = $1
          `,
          [id],
        )

        if (applicationResult.rows.length === 0) {
          throw new Error('Заявка не найдена')
        }

        const application = applicationResult.rows[0]

        if (application.status !== 'submitted') {
          throw new Error('Можно рассматривать только поданные заявки')
        }

        // Если одобряем заявку, проверяем доступность мест
        if (status === 'approved' && application.dormitory_id) {
          // Вычисляем вместимость общежития через количество кроватей
          const capacityResult = await client.query(
            `
            SELECT COUNT(b.id) as total_capacity
            FROM dormitories d
            JOIN floors f ON d.id = f.dormitory_id
            JOIN rooms r ON f.id = r.floor_id OR r.block_id IN (
              SELECT bl.id FROM blocks bl WHERE bl.floor_id = f.id
            )
            JOIN beds b ON r.id = b.room_id
            WHERE d.id = $1 AND d.is_active = true AND f.is_active = true 
              AND r.is_active = true AND b.is_active = true
            `,
            [application.dormitory_id],
          )

          const occupancyResult = await client.query(
            `
            SELECT COUNT(*) as current_occupancy
            FROM applications 
            WHERE dormitory_id = $1 AND status = 'approved' 
              AND academic_year = $2 AND semester = $3
            `,
            [application.dormitory_id, application.academic_year, application.semester],
          )

          const totalCapacity = parseInt(capacityResult.rows[0].total_capacity || 0)
          const currentOccupancy = parseInt(occupancyResult.rows[0].current_occupancy || 0)

          if (totalCapacity === 0) {
            throw new Error('В выбранном общежитии нет доступных мест')
          }

          if (currentOccupancy >= totalCapacity) {
            throw new Error('В выбранном общежитии нет свободных мест')
          }
        }

        // Обновляем заявку
        const updateResult = await client.query(
          `
          UPDATE applications 
          SET 
            status = $1,
            review_date = NOW(),
            reviewed_by = $2,
            rejection_reason = $3,
            notes = $4,
            priority_score = $5,
            updated_at = NOW()
          WHERE id = $6
          RETURNING review_date, updated_at
          `,
          [
            status,
            req.user.id,
            status === 'rejected' ? rejectionReason : null,
            notes || null,
            priorityScore || 0,
            id,
          ],
        )

        return {
          ...updateResult.rows[0],
          studentInfo: {
            firstName: application.first_name,
            lastName: application.last_name,
            email: application.email,
          },
        }
      })

      res.json({
        success: true,
        message: `Заявка ${status === 'approved' ? 'одобрена' : 'отклонена'}`,
        data: {
          reviewDate: result.review_date,
          updatedAt: result.updated_at,
          status: status,
        },
      })
    } catch (error) {
      console.error('Ошибка рассмотрения заявки:', error)
      res.status(400).json({
        success: false,
        error: error.message || 'Ошибка рассмотрения заявки',
      })
    }
  },
)

// DELETE /api/applications/:id - Отозвать/удалить заявку
router.delete('/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params

    const result = await transaction(async (client) => {
      // Получаем заявку
      const applicationResult = await client.query(
        'SELECT student_id, status, academic_year, semester FROM applications WHERE id = $1',
        [id],
      )

      if (applicationResult.rows.length === 0) {
        throw new Error('Заявка не найдена')
      }

      const application = applicationResult.rows[0]

      // Проверяем права доступа
      if (req.user.role === 'student') {
        if (application.student_id !== req.user.id) {
          throw new Error('Доступ запрещен')
        }

        if (application.status === 'approved') {
          throw new Error('Нельзя отозвать одобренную заявку')
        }

        if (application.status === 'cancelled') {
          throw new Error('Заявка уже отозвана')
        }
      }

      // Обновляем статус на отозванную
      const updateResult = await client.query(
        'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING updated_at',
        ['cancelled', id],
      )

      return updateResult.rows[0]
    })

    // Логируем отзыв заявки
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_cancel',
      actionDescription: 'Application cancelled successfully',
      req,
      success: true,
      requestData: { applicationId: id },
    })

    res.json({
      success: true,
      message: 'Заявка отозвана',
      data: {
        updatedAt: result.updated_at,
      },
    })
  } catch (error) {
    console.error('Ошибка отзыва заявки:', error)

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'application_cancel',
      actionDescription: 'Failed to cancel application',
      req,
      success: false,
      errorMessage: error.message,
      requestData: { applicationId: req.params.id },
    })

    res.status(400).json({
      success: false,
      error: error.message || 'Ошибка отзыва заявки',
    })
  }
})

// GET /api/applications/:id/history - История изменений заявки (только админы)
router.get('/:id/history', validateUUID('id'), requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Проверяем существование заявки
    const applicationExists = await query('SELECT id FROM applications WHERE id = $1', [id])

    if (applicationExists.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Заявка не найдена',
      })
    }

    // Получаем историю из логов
    const historyResult = await query(
      `
      SELECT 
        al.id,
        al.action_type,
        al.action_description,
        al.created_at,
        al.request_data,
        al.success,
        al.error_message,
        u.first_name,
        u.last_name,
        u.role
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.request_data->>'applicationId' = $1
      ORDER BY al.created_at DESC
      `,
      [id],
    )

    const history = historyResult.rows.map((log) => ({
      id: log.id,
      actionType: log.action_type,
      description: log.action_description,
      timestamp: log.created_at,
      user: {
        firstName: log.first_name,
        lastName: log.last_name,
        role: log.role,
      },
      success: log.success,
      errorMessage: log.error_message,
      details: log.request_data,
    }))

    res.json({
      success: true,
      data: {
        applicationId: id,
        history,
      },
    })
  } catch (error) {
    console.error('Ошибка получения истории заявки:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка получения истории заявки',
    })
  }
})

// POST /api/applications/bulk-review - Массовое рассмотрение заявок (только админы)
router.post('/bulk-review', requireAdmin, logAdminAction('bulk_review'), async (req, res) => {
  try {
    const { applicationIds, action, rejectionReason, notes } = req.body

    // Валидация
    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать массив ID заявок',
      })
    }

    if (!VALID_REVIEW_STATUSES.includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'Действие должно быть "approved" или "rejected"',
      })
    }

    if (action === 'rejected' && !rejectionReason) {
      return res.status(400).json({
        success: false,
        error: 'При отклонении заявок необходимо указать причину',
      })
    }

    if (applicationIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Можно обработать максимум 50 заявок за раз',
      })
    }

    const results = await transaction(async (client) => {
      const successfulIds = []
      const failedIds = []

      for (const appId of applicationIds) {
        try {
          // Проверяем заявку
          const appResult = await client.query(
            'SELECT id, status, student_id FROM applications WHERE id = $1 AND status = $2',
            [appId, 'submitted'],
          )

          if (appResult.rows.length === 0) {
            failedIds.push({ id: appId, reason: 'Заявка не найдена или уже обработана' })
            continue
          }

          // Обновляем заявку
          await client.query(
            `
            UPDATE applications 
            SET 
              status = $1,
              review_date = NOW(),
              reviewed_by = $2,
              rejection_reason = $3,
              notes = $4,
              updated_at = NOW()
            WHERE id = $5
            `,
            [
              action,
              req.user.id,
              action === 'rejected' ? rejectionReason : null,
              notes || null,
              appId,
            ],
          )

          successfulIds.push(appId)
        } catch (error) {
          failedIds.push({ id: appId, reason: error.message })
        }
      }

      return { successfulIds, failedIds }
    })

    res.json({
      success: true,
      message: `Массовое ${action === 'approved' ? 'одобрение' : 'отклонение'} завершено`,
      data: {
        processed: applicationIds.length,
        successful: results.successfulIds.length,
        failed: results.failedIds.length,
        successfulIds: results.successfulIds,
        failedItems: results.failedIds,
      },
    })
  } catch (error) {
    console.error('Ошибка массового рассмотрения:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка массового рассмотрения заявок',
    })
  }
})

// GET /api/applications/export - Экспорт заявок в CSV (только админы)
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const { status, academic_year, semester, dormitory_id, format = 'csv' } = req.query

    const params = []
    const conditions = {}

    if (status) conditions['a.status'] = status
    if (academic_year) conditions['a.academic_year'] = academic_year
    if (semester) conditions['a.semester'] = semester
    if (dormitory_id) conditions['a.dormitory_id'] = dormitory_id

    const { whereClause } = buildWhereClause(conditions, params)

    const result = await query(
      `
      SELECT 
        a.id,
        u.first_name || ' ' || u.last_name as student_name,
        u.student_id as student_number,
        u.group_name,
        u.course,
        u.email,
        u.phone,
        d.name as dormitory_name,
        a.preferred_room_type,
        a.academic_year,
        a.semester,
        a.status,
        a.submission_date,
        a.review_date,
        reviewer.first_name || ' ' || reviewer.last_name as reviewer_name,
        a.rejection_reason,
        a.priority_score,
        a.notes
      FROM applications a
      JOIN users u ON a.student_id = u.id
      LEFT JOIN dormitories d ON a.dormitory_id = d.id
      LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
      ${whereClause}
      ORDER BY a.submission_date DESC
      `,
      params,
    )

    if (format === 'json') {
      res.json({
        success: true,
        data: result.rows,
      })
    } else {
      // CSV format
      const csvHeaders = [
        'ID заявки',
        'Студент',
        'Номер студента',
        'Группа',
        'Курс',
        'Email',
        'Телефон',
        'Общежитие',
        'Тип комнаты',
        'Учебный год',
        'Семестр',
        'Статус',
        'Дата подачи',
        'Дата рассмотрения',
        'Рассмотрел',
        'Причина отклонения',
        'Приоритетный балл',
        'Примечания',
      ]

      const csvData = result.rows.map((row) => [
        row.id,
        row.student_name,
        row.student_number,
        row.group_name,
        row.course,
        row.email,
        row.phone,
        row.dormitory_name || '',
        row.preferred_room_type || '',
        row.academic_year,
        row.semester,
        row.status,
        row.submission_date,
        row.review_date || '',
        row.reviewer_name || '',
        row.rejection_reason || '',
        row.priority_score || '',
        row.notes || '',
      ])

      const csv = [csvHeaders, ...csvData]
        .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n')

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename=applications_${Date.now()}.csv`)
      res.send('\ufeff' + csv) // BOM for UTF-8
    }
  } catch (error) {
    console.error('Ошибка экспорта заявок:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка экспорта заявок',
    })
  }
})

module.exports = router
