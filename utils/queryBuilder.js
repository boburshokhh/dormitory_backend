const { createDatabaseError } = require('./errorHandler')

// Утилита для построения динамических WHERE условий (поддержка raw-выражений)
const buildWhereClause = (conditions, params, rawConditions = []) => {
  try {
    let whereClause = 'WHERE 1=1'
    let paramCount = 0

    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        whereClause += ` AND ${key} = $${++paramCount}`
        params.push(value)
      }
    })

    if (Array.isArray(rawConditions) && rawConditions.length > 0) {
      rawConditions.forEach((expr) => {
        if (expr && typeof expr === 'string') {
          whereClause += ` AND (${expr})`
        }
      })
    }

    return { whereClause, paramCount }
  } catch (error) {
    throw createDatabaseError('Ошибка построения WHERE условий', 'query_builder', error)
  }
}

// Построение условий для фильтрации заявок
const buildApplicationFilters = (userRole, userId, filters = {}) => {
  try {
    const conditions = {}
    const rawConditions = []
    const params = []

    // Фильтрация по роли пользователя
    if (userRole === 'student') {
      conditions['a.student_id'] = userId
    }

    // Остальные фильтры
    const {
      status,
      dormitory_id,
      academic_year,
      semester,
      group_id,
      region,
      course,
      dormitory_type,
      has_social_protection,
      search,
      gender,
      room_assigned,
      floor,
      date_from,
      date_to,
    } = filters

    if (status) conditions['a.status'] = status
    if (dormitory_id) conditions['a.dormitory_id'] = dormitory_id
    if (academic_year) conditions['a.academic_year'] = academic_year
    if (semester) conditions['a.semester'] = semester
    // Фильтр по группе: приводим к тексту для совместимости типов (UUID/INT)
    if (group_id) conditions['CAST(g.id AS TEXT)'] = String(group_id).trim()
    if (region) conditions['u.region'] = region
    if (course) conditions['g.course'] = Number(course)
    if (gender) conditions['u.gender'] = String(gender).trim()
    if (dormitory_type) {
      const normalizedDormType = String(dormitory_type).trim()
      conditions['d.type'] =
        normalizedDormType === '1'
          ? 'type_1'
          : normalizedDormType === '2'
            ? 'type_2'
            : normalizedDormType
    }

    // Фильтр по наличию/отсутствию документа соц. защиты
    if (has_social_protection === 'true') {
      rawConditions.push(`EXISTS (
        SELECT 1 FROM files f
        WHERE f.user_id = u.id AND f.file_type = 'social_protection'
          AND f.status IN ('active','uploading') AND f.deleted_at IS NULL
      )`)
    } else if (has_social_protection === 'false') {
      rawConditions.push(`NOT EXISTS (
        SELECT 1 FROM files f
        WHERE f.user_id = u.id AND f.file_type = 'social_protection'
          AND f.status IN ('active','uploading') AND f.deleted_at IS NULL
      )`)
    }

    // Фильтр по назначению комнаты
    if (room_assigned === 'true') {
      rawConditions.push(`EXISTS (
        SELECT 1 FROM beds b
        JOIN rooms r ON b.room_id = r.id
        JOIN floors f ON r.floor_id = f.id
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
      )`)
    } else if (room_assigned === 'false') {
      rawConditions.push(`NOT EXISTS (
        SELECT 1 FROM beds b
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
      )`)
    }

    // Фильтр по этажу (только если комната назначена)
    if (floor && room_assigned === 'true') {
      rawConditions.push(`EXISTS (
        SELECT 1 FROM beds b
        JOIN rooms r ON b.room_id = r.id
        JOIN floors f ON r.floor_id = f.id
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
          AND f.floor_number = $${paramCount + 1}
      )`)
      params.push(Number(floor))
      paramCount += 1
    }

    const { whereClause, paramCount } = buildWhereClause(conditions, params, rawConditions)

    // Фильтрация по диапазону дат подачи заявки (добавляем после buildWhereClause)
    let finalWhere = whereClause
    let finalParamCount = paramCount

    if (date_from && String(date_from).trim()) {
      const fromDate = String(date_from).trim()
      // Валидация формата даты YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
        finalWhere += ` AND DATE(a.submission_date) >= $${finalParamCount + 1}`
        params.push(fromDate)
        finalParamCount += 1
      }
    }

    if (date_to && String(date_to).trim()) {
      const toDate = String(date_to).trim()
      // Валидация формата даты YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
        finalWhere += ` AND DATE(a.submission_date) <= $${finalParamCount + 1}`
        params.push(toDate)
        finalParamCount += 1
      }
    }

    // Поиск по ФИО/Email/студ. номеру (ILIKE) — добавляем после дат
    if (search && String(search).trim().length > 0) {
      const term = `%${String(search).trim()}%`
      finalWhere += ` AND (u.first_name ILIKE $${finalParamCount + 1} OR u.last_name ILIKE $${finalParamCount + 1} OR u.email ILIKE $${finalParamCount + 1} OR u.student_id ILIKE $${finalParamCount + 1})`
      params.push(term)
      finalParamCount += 1
    }

    return { whereClause: finalWhere, params, paramCount: finalParamCount }
  } catch (error) {
    throw createDatabaseError('Ошибка построения фильтров заявок', 'applications', error)
  }
}

// SQL запросы для заявок
const QUERIES = {
  // Список заявок с основными данными
  GET_APPLICATIONS_LIST: `
    SELECT 
      a.id, 
      a.application_number,
      a.status, 
      a.submission_date,
      a.academic_year, 
      a.semester,
      a.preferred_room_type,
      a.rejection_reason,
      
      -- Основные данные студента
      u.first_name, 
      u.last_name, 
      u.email, 
      u.student_id as student_number,
      u.region,
      u.gender,
      g.name as group_name, 
      g.course,
      -- Признак социальной защиты (наличие активного файла соответствующего типа)
      EXISTS (
        SELECT 1 FROM files f
        WHERE f.user_id = u.id
          AND f.file_type = 'social_protection'
          AND f.status IN ('active','uploading')
          AND f.deleted_at IS NULL
      ) AS has_social_protection,
      
      -- Название общежития
      d.name AS dormitory_name,
      d.type AS dormitory_type,
      
      -- Информация о назначении комнаты
      EXISTS (
        SELECT 1 FROM beds b
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
      ) AS room_assigned,
      
      -- Информация об этаже (если комната назначена)
      (
        SELECT f.floor_number 
        FROM beds b
        JOIN rooms r ON b.room_id = r.id
        JOIN floors f ON r.floor_id = f.id
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
        LIMIT 1
      ) AS floor_number,
      
      -- Информация о комнате (если назначена)
      (
        SELECT r.room_number 
        FROM beds b
        JOIN rooms r ON b.room_id = r.id
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
        LIMIT 1
      ) AS room_number,
      
      -- Номер койки (если назначена)
      (
        SELECT b.bed_number 
        FROM beds b
        WHERE b.student_id = u.id AND b.is_active = true AND b.is_occupied = true
        LIMIT 1
      ) AS bed_number

    FROM applications a
    JOIN users u ON a.student_id = u.id
    LEFT JOIN dormitories d ON a.dormitory_id = d.id
    LEFT JOIN groups g ON u.group_id = g.id
  `,

  // Детальная информация о заявке
  GET_APPLICATION_DETAIL: `
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
             LEFT JOIN groups g ON u.group_id = g.id
    WHERE a.id = $1
  `,

  // Файлы пользователя
  GET_USER_FILES: `
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
    WHERE user_id = $1 
      AND status IN ('active', 'uploading') 
      AND deleted_at IS NULL
    ORDER BY created_at DESC
  `,

  // Подсчет заявок
  COUNT_APPLICATIONS: `
    SELECT COUNT(*) as total
    FROM applications a
    JOIN users u ON a.student_id = u.id
    LEFT JOIN dormitories d ON a.dormitory_id = d.id
    LEFT JOIN groups g ON u.group_id = g.id
  `,

  // Проверка существующей заявки
  CHECK_EXISTING_APPLICATION: `
    SELECT id, status 
    FROM applications 
    WHERE student_id = $1 
      AND academic_year = $2
      AND semester = $3
      AND status IN ('submitted', 'approved')
  `,

  // Проверка студента
  GET_STUDENT_INFO: `
    SELECT course, gender, is_profile_filled 
    FROM users 
    WHERE id = $1 
      AND role = 'student' 
      AND is_active = true
  `,

  // Подробная проверка студента с полями профиля
  GET_STUDENT_INFO_DETAILED: `
    SELECT 
      course, gender, is_profile_filled,
      first_name, last_name, middle_name, birth_date,
      region, address, phone, parent_phone,
      passport_series, passport_pinfl, group_id
    FROM users 
    WHERE id = $1 
      AND role = 'student' 
      AND is_active = true
  `,

  // Проверка общежития
  CHECK_DORMITORY: `
    SELECT id, type, is_active 
    FROM dormitories 
    WHERE id = $1
  `,

  // Подсчет вместимости общежития
  GET_DORMITORY_CAPACITY: `
    SELECT COUNT(b.id) as total_capacity
    FROM dormitories d
    JOIN floors f ON d.id = f.dormitory_id
    JOIN rooms r ON f.id = r.floor_id OR r.block_id IN (
      SELECT bl.id FROM blocks bl WHERE bl.floor_id = f.id
    )
    JOIN beds b ON r.id = b.room_id
    WHERE d.id = $1 
      AND d.is_active = true 
      AND f.is_active = true 
      AND r.is_active = true 
      AND b.is_active = true
  `,

  // Подсчет текущей заполненности
  GET_DORMITORY_OCCUPANCY: `
    SELECT COUNT(*) as current_occupancy
    FROM applications 
    WHERE dormitory_id = $1 
      AND status = 'approved' 
      AND academic_year = $2 
      AND semester = $3
  `,

  // Создание заявки
  CREATE_APPLICATION: `
    INSERT INTO applications (
      student_id, dormitory_id, documents, notes, status, academic_year, semester
    ) VALUES ($1, $2, $3, $4, 'submitted', $5, $6)
    RETURNING id, submission_date, status, created_at
  `,

  // Обновление заявки
  UPDATE_APPLICATION: `
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

  // Рассмотрение заявки
  REVIEW_APPLICATION: `
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

  // Отзыв заявки
  CANCEL_APPLICATION: `
    UPDATE applications 
    SET status = 'cancelled', updated_at = NOW() 
    WHERE id = $1 
    RETURNING updated_at
  `,

  // Статистика по статусам
  GET_STATUS_STATS: `
    SELECT 
      status,
      COUNT(*) as count,
      ROUND(AVG(priority_score), 2) as avg_priority
    FROM applications
  `,

  // Статистика по общежитиям
  GET_DORMITORY_STATS: `
    SELECT 
      d.name as dormitory_name,
      COUNT(a.*) as applications_count,
      COUNT(CASE WHEN a.status = 'approved' THEN 1 END) as approved_count
    FROM dormitories d
    LEFT JOIN applications a ON d.id = a.dormitory_id
  `,

  // История заявки
  GET_APPLICATION_HISTORY: `
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

  // Экспорт заявок
  EXPORT_APPLICATIONS: `
    SELECT 
      a.id,
      u.first_name || ' ' || u.last_name as student_name,
      u.student_id as student_number,
      g.name as group_name,
      g.course,
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
    LEFT JOIN groups g ON u.group_id = g.id
    LEFT JOIN dormitories d ON a.dormitory_id = d.id
    LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
  `,
}

// Построение ORDER BY клаузулы
const buildOrderByClause = (sortBy, sortOrder) => {
  try {
    // Если сортируем по номеру заявки, то не применяем приоритет по статусу
    if (sortBy === 'application_number') {
      return `ORDER BY a.application_number ${sortOrder}`
    }

    // Для остальных полей применяем приоритет по статусу
    return `
      ORDER BY 
        CASE 
          WHEN a.status = 'submitted' THEN 1
          WHEN a.status = 'approved' THEN 2
          WHEN a.status = 'rejected' THEN 3
          ELSE 4
        END,
        a.${sortBy} ${sortOrder}
    `
  } catch (error) {
    throw createDatabaseError('Ошибка построения ORDER BY', 'query_builder', error)
  }
}

// Построение LIMIT OFFSET клаузулы
const buildPaginationClause = (limit, offset, paramCount) => {
  try {
    // Если limit = 'ALL', не применяем пагинацию
    if (limit === 'ALL' || limit === 'all') {
      return {
        clause: '',
        params: [],
      }
    }

    return {
      clause: `LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      params: [limit, offset],
    }
  } catch (error) {
    throw createDatabaseError('Ошибка построения пагинации', 'query_builder', error)
  }
}

module.exports = {
  buildWhereClause,
  buildApplicationFilters,
  buildOrderByClause,
  buildPaginationClause,
  QUERIES,
}
