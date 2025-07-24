const loggingService = require('../services/loggingService')

// Типы ошибок для более детального логирования
const ERROR_TYPES = {
  VALIDATION: 'VALIDATION_ERROR',
  DATABASE: 'DATABASE_ERROR',
  PERMISSION: 'PERMISSION_ERROR',
  NOT_FOUND: 'NOT_FOUND_ERROR',
  BUSINESS_LOGIC: 'BUSINESS_LOGIC_ERROR',
  EXTERNAL_SERVICE: 'EXTERNAL_SERVICE_ERROR',
  SYSTEM: 'SYSTEM_ERROR',
}

class ApplicationError extends Error {
  constructor(message, type = ERROR_TYPES.SYSTEM, details = {}) {
    super(message)
    this.name = 'ApplicationError'
    this.type = type
    this.details = details
    this.timestamp = new Date().toISOString()
  }
}

// Детальное логирование ошибки
const logDetailedError = (error, context = {}) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error_type: error.type || ERROR_TYPES.SYSTEM,
    error_message: error.message,
    error_stack: error.stack,
    context: {
      file: context.file || 'unknown',
      function: context.function || 'unknown',
      user_id: context.userId || null,
      request_id: context.requestId || null,
      endpoint: context.endpoint || null,
      method: context.method || null,
      ...context,
    },
    details: error.details || {},
    raw_error: error,
  }

  console.error('🔥 ДЕТАЛЬНАЯ ОШИБКА 🔥')
  console.error('═'.repeat(80))
  console.error(`📍 МЕСТОПОЛОЖЕНИЕ: ${errorLog.context.file} -> ${errorLog.context.function}`)
  console.error(`🕐 ВРЕМЯ: ${errorLog.timestamp}`)
  console.error(`⚠️  ТИП ОШИБКИ: ${errorLog.error_type}`)
  console.error(`💬 СООБЩЕНИЕ: ${errorLog.error_message}`)

  if (errorLog.context.endpoint) {
    console.error(`🛣️  ENDPOINT: ${errorLog.context.method} ${errorLog.context.endpoint}`)
  }

  if (errorLog.context.user_id) {
    console.error(`👤 ПОЛЬЗОВАТЕЛЬ: ${errorLog.context.user_id}`)
  }

  if (Object.keys(errorLog.details).length > 0) {
    console.error(`📋 ДЕТАЛИ:`)
    console.error(JSON.stringify(errorLog.details, null, 2))
  }

  if (errorLog.context.request_data) {
    console.error(`📥 ДАННЫЕ ЗАПРОСА:`)
    console.error(JSON.stringify(errorLog.context.request_data, null, 2))
  }

  console.error(`📚 СТЕК ОШИБКИ:`)
  console.error(errorLog.error_stack)
  console.error('═'.repeat(80))

  return errorLog
}

// Обработчик ошибок для маршрутов заявок
const handleApplicationError = async (error, req, res, context = {}) => {
  const extendedContext = {
    file: 'applications.js',
    endpoint: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    requestId: req.id || Math.random().toString(36).substring(7),
    request_data: req.body,
    query_params: req.query,
    url_params: req.params,
    ...context,
  }

  // Детальное логирование
  const errorLog = logDetailedError(error, extendedContext)

  // Логирование в базу данных
  try {
    await loggingService.logUserActivity({
      userId: req.user?.id,
      actionType: context.actionType || 'error',
      actionDescription: `Error in ${context.function || 'unknown function'}: ${error.message}`,
      req,
      success: false,
      errorMessage: error.message,
      requestData: {
        endpoint: req.originalUrl,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params,
      },
    })
  } catch (loggingError) {
    console.error('🚨 ОШИБКА ЛОГИРОВАНИЯ:', loggingError.message)
  }

  // Определяем HTTP статус и сообщение ответа
  let statusCode = 500
  let userMessage = 'Внутренняя ошибка сервера'

  switch (error.type) {
    case ERROR_TYPES.VALIDATION:
      statusCode = 400
      userMessage = error.message
      break
    case ERROR_TYPES.PERMISSION:
      statusCode = 403
      userMessage = error.message || 'Доступ запрещен'
      break
    case ERROR_TYPES.NOT_FOUND:
      statusCode = 404
      userMessage = error.message || 'Ресурс не найден'
      break
    case ERROR_TYPES.BUSINESS_LOGIC:
      statusCode = 400
      userMessage = error.message
      break
    case ERROR_TYPES.DATABASE:
      statusCode = 500
      userMessage = 'Ошибка базы данных'
      break
    default:
      statusCode = 500
      userMessage = 'Внутренняя ошибка сервера'
  }

  // Формируем ответ
  const response = {
    success: false,
    error: userMessage,
    error_code: error.type,
    timestamp: errorLog.timestamp,
    request_id: extendedContext.requestId,
  }

  // В режиме разработки добавляем больше деталей
  if (process.env.NODE_ENV === 'development') {
    response.debug = {
      original_message: error.message,
      stack: error.stack,
      details: error.details,
      context: extendedContext,
    }
  }

  res.status(statusCode).json(response)
}

// Создание конкретных ошибок
const createValidationError = (message, field = null, value = null) => {
  return new ApplicationError(message, ERROR_TYPES.VALIDATION, { field, value })
}

const createNotFoundError = (resource, id = null) => {
  return new ApplicationError(
    `${resource} не найден${id ? ` с ID: ${id}` : ''}`,
    ERROR_TYPES.NOT_FOUND,
    { resource, id },
  )
}

const createPermissionError = (action, resource = null) => {
  return new ApplicationError(
    `Недостаточно прав для выполнения действия: ${action}${resource ? ` на ресурсе: ${resource}` : ''}`,
    ERROR_TYPES.PERMISSION,
    { action, resource },
  )
}

const createBusinessLogicError = (message, code = null, data = {}) => {
  return new ApplicationError(message, ERROR_TYPES.BUSINESS_LOGIC, { code, ...data })
}

const createDatabaseError = (operation, table = null, originalError = null) => {
  return new ApplicationError(
    `Ошибка базы данных при выполнении операции: ${operation}${table ? ` в таблице: ${table}` : ''}`,
    ERROR_TYPES.DATABASE,
    { operation, table, original_error: originalError?.message },
  )
}

module.exports = {
  ERROR_TYPES,
  ApplicationError,
  logDetailedError,
  handleApplicationError,
  createValidationError,
  createNotFoundError,
  createPermissionError,
  createBusinessLogicError,
  createDatabaseError,
}
