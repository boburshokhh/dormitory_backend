const { createDatabaseError } = require('./errorHandler')

// Утилита для построения динамических WHERE условий
const buildWhereClause = (conditions, params) => {
  try {
    let whereClause = 'WHERE 1=1'
    let paramCount = 0

    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        whereClause += ` AND ${key} = $${++paramCount}`
        params.push(value)
      }
    })

    return { whereClause, paramCount }
  } catch (error) {
    throw createDatabaseError('Ошибка построения WHERE условий', 'query_builder', error)
  }
}

// Построение условий для фильтрации заявок
const buildApplicationFilters = (userRole, userId, filters = {}) => {
  try {
    const conditions = {}
    const params = []

    // Фильтрация по роли пользователя
    if (userRole === 'student') {
      conditions['a.student_id'] = userId
    }

    // Остальные фильтры
    const { status, dormitory_id, academic_year, semester } = filters

    if (status) conditions['a.status'] = status
    if (dormitory_id) conditions['a.dormitory_id'] = dormitory_id
    if (academic_year) conditions['a.academic_year'] = academic_year
    if (semester) conditions['a.semester'] = semester

    const { whereClause, paramCount } = buildWhereClause(conditions, params)

    return { whereClause, params, paramCount }
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
      g.name as group_name, 
      g.course,
      
      -- Название общежития
      d.name AS dormitory_name

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
      student_id, dormitory_id, preferred_room_type,
      academic_year, semester, documents, notes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
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
