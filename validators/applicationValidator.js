const {
  VALID_STATUSES,
  VALID_ROOM_TYPES,
  VALID_REVIEW_STATUSES,
  VALID_SEMESTERS,
  VALID_SORT_FIELDS,
  VALID_SORT_ORDERS,
  PAGINATION,
  BULK_OPERATIONS,
} = require('../constants/applicationConstants')

const { createValidationError } = require('../utils/errorHandler')
const { isValidDateString } = require('../utils/dateUtils')

// Валидация параметров пагинации и сортировки
const validateListParams = (query) => {
  const errors = []
  const {
    status,
    page = PAGINATION.DEFAULT_PAGE,
    limit = PAGINATION.DEFAULT_LIMIT,
    sort_by = PAGINATION.DEFAULT_SORT_BY,
    sort_order = PAGINATION.DEFAULT_SORT_ORDER,
    date_from,
    date_to,
  } = query

  // Валидация статуса
  if (status && !VALID_STATUSES.includes(status)) {
    errors.push(
      `Недопустимый статус заявки: ${status}. Допустимые значения: ${VALID_STATUSES.join(', ')}`,
    )
  }

  // Валидация пагинации
  const pageNum = parseInt(page)
  if (isNaN(pageNum) || pageNum < 1) {
    errors.push(`Номер страницы должен быть положительным числом, получено: ${page}`)
  }

  // Проверяем, является ли limit значением "ALL"
  let limitNum
  if (limit === 'ALL' || limit === 'all') {
    limitNum = 'ALL'
  } else {
    limitNum = parseInt(limit)
    if (isNaN(limitNum) || limitNum < 1 || limitNum > PAGINATION.MAX_LIMIT) {
      errors.push(
        `Лимит должен быть числом от 1 до ${PAGINATION.MAX_LIMIT} или 'ALL', получено: ${limit}`,
      )
    }
  }

  // Валидация сортировки
  if (!VALID_SORT_FIELDS.includes(sort_by)) {
    errors.push(
      `Недопустимое поле сортировки: ${sort_by}. Допустимые значения: ${VALID_SORT_FIELDS.join(', ')}`,
    )
  }

  if (!VALID_SORT_ORDERS.includes(sort_order?.toUpperCase())) {
    errors.push(
      `Недопустимый порядок сортировки: ${sort_order}. Допустимые значения: ${VALID_SORT_ORDERS.join(', ')}`,
    )
  }

  // Валидация дат фильтрации
  let fromDate, toDate

  if (date_from) {
    if (!isValidDateString(date_from)) {
      errors.push(`Неверный формат или значение даты "от": ${date_from}. Ожидается YYYY-MM-DD`)
    } else {
      fromDate = new Date(date_from)
    }
  }

  if (date_to) {
    if (!isValidDateString(date_to)) {
      errors.push(`Неверный формат или значение даты "до": ${date_to}. Ожидается YYYY-MM-DD`)
    } else {
      toDate = new Date(date_to)
    }
  }

  // Проверяем логику диапазона дат
  if (fromDate && toDate && fromDate > toDate) {
    errors.push('Дата "от" не может быть больше даты "до"')
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации параметров запроса: ${errors.join('; ')}`,
      'query_params',
      query,
    )
  }

  return {
    pageNum: Math.max(1, pageNum),
    limitNum: limitNum === 'ALL' ? 'ALL' : Math.min(PAGINATION.MAX_LIMIT, Math.max(1, limitNum)),
    sortBy: VALID_SORT_FIELDS.includes(sort_by) ? sort_by : PAGINATION.DEFAULT_SORT_BY,
    sortOrder: VALID_SORT_ORDERS.includes(sort_order?.toUpperCase())
      ? sort_order.toUpperCase()
      : PAGINATION.DEFAULT_SORT_ORDER,
  }
}

// Валидация данных при создании заявки
const validateCreateApplication = (body) => {
  const errors = []
  const { dormitoryId, documents, notes } = body

  // Обязательные поля
  if (!dormitoryId || typeof dormitoryId !== 'string' || dormitoryId.trim().length === 0) {
    errors.push('ID общежития обязателен и должен быть непустой строкой')
  }

  if (documents !== undefined) {
    if (!Array.isArray(documents)) {
      errors.push('Документы должны быть массивом')
    } else if (documents.length > 0) {
      documents.forEach((doc, index) => {
        if (!doc || typeof doc !== 'object') {
          errors.push(`Документ с индексом ${index} должен быть объектом`)
        }
      })
    }
  }

  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('Примечания должны быть строкой')
    } else if (notes.length > 1000) {
      errors.push('Примечания не должны превышать 1000 символов')
    }
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации данных заявки: ${errors.join('; ')}`,
      'application_data',
      body,
    )
  }

  return {
    dormitoryId: dormitoryId.trim(),
    documents: documents || [],
    notes: notes || null,
  }
}

// Валидация данных при обновлении заявки
const validateUpdateApplication = (body) => {
  const errors = []
  const { dormitoryId, preferredRoomType, documents, notes } = body

  // Все поля необязательные при обновлении
  if (dormitoryId !== undefined && dormitoryId !== null) {
    if (typeof dormitoryId !== 'string' || dormitoryId.trim().length === 0) {
      errors.push('ID общежития должен быть непустой строкой')
    }
  }

  if (preferredRoomType !== undefined && preferredRoomType !== null) {
    if (!VALID_ROOM_TYPES.includes(preferredRoomType)) {
      errors.push(
        `Недопустимый тип комнаты: ${preferredRoomType}. Допустимые значения: ${VALID_ROOM_TYPES.join(', ')}`,
      )
    }
  }

  if (documents !== undefined) {
    if (!Array.isArray(documents)) {
      errors.push('Документы должны быть массивом')
    } else if (documents.length > 0) {
      documents.forEach((doc, index) => {
        if (!doc || typeof doc !== 'object') {
          errors.push(`Документ с индексом ${index} должен быть объектом`)
        }
      })
    }
  }

  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('Примечания должны быть строкой')
    } else if (notes.length > 1000) {
      errors.push('Примечания не должны превышать 1000 символов')
    }
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации данных обновления заявки: ${errors.join('; ')}`,
      'update_data',
      body,
    )
  }

  return {
    dormitoryId: dormitoryId === undefined ? undefined : dormitoryId || null,
    preferredRoomType: preferredRoomType === undefined ? undefined : preferredRoomType || null,
    documents: documents === undefined ? undefined : documents || [],
    notes: notes === undefined ? undefined : notes || null,
  }
}

// Валидация данных рассмотрения заявки
const validateReviewApplication = (body) => {
  const errors = []
  const { status, rejectionReason, notes, priorityScore } = body

  // Статус обязателен
  if (!status) {
    errors.push('Статус рассмотрения обязателен')
  } else if (!VALID_REVIEW_STATUSES.includes(status)) {
    errors.push(
      `Недопустимый статус рассмотрения: ${status}. Допустимые значения: ${VALID_REVIEW_STATUSES.join(', ')}`,
    )
  }

  // Причина отклонения обязательна при отклонении
  if (status === 'rejected') {
    if (
      !rejectionReason ||
      typeof rejectionReason !== 'string' ||
      rejectionReason.trim().length === 0
    ) {
      errors.push('При отклонении заявки необходимо указать причину отклонения')
    } else if (rejectionReason.trim().length < 10) {
      errors.push('Причина отклонения должна содержать минимум 10 символов')
    } else if (rejectionReason.length > 500) {
      errors.push('Причина отклонения не должна превышать 500 символов')
    }
  }

  // Примечания
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('Примечания должны быть строкой')
    } else if (notes.length > 1000) {
      errors.push('Примечания не должны превышать 1000 символов')
    }
  }

  // Приоритетный балл
  if (priorityScore !== undefined && priorityScore !== null) {
    const score = Number(priorityScore)
    if (isNaN(score) || score < 0 || score > 100) {
      errors.push(`Приоритетный балл должен быть числом от 0 до 100, получено: ${priorityScore}`)
    }
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации данных рассмотрения заявки: ${errors.join('; ')}`,
      'review_data',
      body,
    )
  }

  return {
    status,
    rejectionReason: status === 'rejected' ? rejectionReason.trim() : null,
    notes: notes ? notes.trim() : null,
    priorityScore: priorityScore !== undefined ? Number(priorityScore) : 0,
  }
}

// Валидация массового рассмотрения
const validateBulkReview = (body) => {
  const errors = []
  const { applicationIds, action, rejectionReason, notes } = body

  // Проверка массива ID
  if (!Array.isArray(applicationIds)) {
    errors.push('applicationIds должен быть массивом')
  } else if (applicationIds.length === 0) {
    errors.push('Необходимо указать хотя бы одну заявку для обработки')
  } else if (applicationIds.length > BULK_OPERATIONS.MAX_BULK_SIZE) {
    errors.push(
      `Можно обработать максимум ${BULK_OPERATIONS.MAX_BULK_SIZE} заявок за раз, указано: ${applicationIds.length}`,
    )
  } else {
    // Проверяем каждый ID
    applicationIds.forEach((id, index) => {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        errors.push(`ID заявки с индексом ${index} должен быть непустой строкой`)
      }
    })
  }

  // Действие
  if (!action) {
    errors.push('Действие (action) обязательно')
  } else if (!VALID_REVIEW_STATUSES.includes(action)) {
    errors.push(
      `Недопустимое действие: ${action}. Допустимые значения: ${VALID_REVIEW_STATUSES.join(', ')}`,
    )
  }

  // Причина отклонения для массового отклонения
  if (action === 'rejected') {
    if (
      !rejectionReason ||
      typeof rejectionReason !== 'string' ||
      rejectionReason.trim().length === 0
    ) {
      errors.push('При массовом отклонении заявок необходимо указать причину')
    } else if (rejectionReason.length > 500) {
      errors.push('Причина отклонения не должна превышать 500 символов')
    }
  }

  // Примечания
  if (notes !== undefined && notes !== null) {
    if (typeof notes !== 'string') {
      errors.push('Примечания должны быть строкой')
    } else if (notes.length > 1000) {
      errors.push('Примечания не должны превышать 1000 символов')
    }
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации данных массового рассмотрения: ${errors.join('; ')}`,
      'bulk_review_data',
      body,
    )
  }

  return {
    applicationIds: applicationIds.map((id) => id.trim()),
    action,
    rejectionReason: action === 'rejected' ? rejectionReason.trim() : null,
    notes: notes ? notes.trim() : null,
  }
}

// Валидация UUID
const validateUUID = (value, fieldName = 'ID') => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!value || typeof value !== 'string' || !uuidRegex.test(value)) {
    throw createValidationError(
      `${fieldName} должен быть корректным UUID форматом`,
      fieldName,
      value,
    )
  }
  return value
}

module.exports = {
  validateListParams,
  validateCreateApplication,
  validateUpdateApplication,
  validateReviewApplication,
  validateBulkReview,
  validateUUID,
}
