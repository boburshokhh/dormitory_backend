// Централизованная обработка ошибок

const handleApplicationError = async (error, req, res, context = 'Unknown') => {
  console.error(`❌ ${context} Error:`, error.message)
  console.error('🔍 Stack trace:', error.stack)

  // Определяем тип ошибки и соответствующий HTTP статус
  let statusCode = 500
  let message = 'Внутренняя ошибка сервера'

  if (error.name === 'ValidationError') {
    statusCode = 400
    message = error.message
  } else if (error.code === '23505') {
    // PostgreSQL unique constraint violation
    statusCode = 409
    message = 'Данная запись уже существует'
  } else if (error.code === '23503') {
    // PostgreSQL foreign key constraint violation
    statusCode = 400
    message = 'Ссылка на несуществующую запись'
  } else if (error.code === '42703') {
    // PostgreSQL undefined column
    statusCode = 500
    message = 'Ошибка структуры базы данных'
  } else if (error.message.includes('not found')) {
    statusCode = 404
    message = 'Запись не найдена'
  } else if (error.message.includes('permission') || error.message.includes('access')) {
    statusCode = 403
    message = 'Недостаточно прав доступа'
  }

  // Логируем ошибку в консоль
  console.error(`📋 Error Details:`, {
    context,
    statusCode,
    message,
    originalError: error.message,
    userId: req.user?.id,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
  })

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      details: error.message,
      stack: error.stack,
    }),
  })
}

// Создание конкретных ошибок
const createValidationError = (message, field = null, value = null) => {
  const error = new Error(message)
  error.name = 'ValidationError'
  error.details = { field, value }
  return error
}

const createNotFoundError = (resource, id = null) => {
  const error = new Error(`${resource} не найден${id ? ` с ID: ${id}` : ''}`)
  error.name = 'NotFoundError'
  error.details = { resource, id }
  return error
}

const createPermissionError = (action, resource = null) => {
  const error = new Error(
    `Недостаточно прав для выполнения действия: ${action}${resource ? ` на ресурсе: ${resource}` : ''}`,
  )
  error.name = 'PermissionError'
  error.details = { action, resource }
  return error
}

const createBusinessLogicError = (message, code = null, data = {}) => {
  const error = new Error(message)
  error.name = 'BusinessLogicError'
  error.details = { code, ...data }
  return error
}

const createDatabaseError = (operation, table = null, originalError = null) => {
  const error = new Error(
    `Ошибка базы данных при выполнении операции: ${operation}${table ? ` в таблице: ${table}` : ''}`,
  )
  error.name = 'DatabaseError'
  error.details = { operation, table, original_error: originalError?.message }
  return error
}

module.exports = {
  handleApplicationError,
  createValidationError,
  createNotFoundError,
  createPermissionError,
  createBusinessLogicError,
  createDatabaseError,
}
