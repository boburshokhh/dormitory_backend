const telegramLogger = require('../services/telegramLoggerService')
const { logger } = require('../utils/logger')

// Middleware для логирования HTTP запросов с отправкой в Telegram
const telegramRequestLogger = (req, res, next) => {
  const start = Date.now()
  const requestId = generateRequestId()

  // Добавляем ID запроса к объекту запроса
  req.requestId = requestId

  // Логируем начало запроса
  const requestData = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?.id || 'anonymous',
    userRole: req.user?.role || 'anonymous',
    timestamp: new Date().toISOString(),
  }

  // Логируем в файл
  logger.info('HTTP Request Started', requestData)

  // Логируем в Telegram только важные запросы
  if (shouldLogToTelegram(req)) {
    telegramLogger.logInfo('Начало HTTP запроса', requestData)
  }

  // Перехватываем завершение ответа
  const originalSend = res.send
  res.send = function (data) {
    const duration = Date.now() - start
    const responseData = {
      ...requestData,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: data ? data.length : 0,
    }

    // Логируем завершение запроса
    logger.info('HTTP Request Completed', responseData)

    // Определяем уровень логирования для Telegram
    let telegramLevel = 'info'
    if (res.statusCode >= 500) {
      telegramLevel = 'error'
    } else if (res.statusCode >= 400) {
      telegramLevel = 'warn'
    }

    // Логируем в Telegram
    if (shouldLogToTelegram(req, res.statusCode)) {
      telegramLogger.logApiRequest(req.method, req.originalUrl, res.statusCode, duration, {
        requestId,
        userId: req.user?.id,
        userRole: req.user?.role,
        ip: req.ip,
      })
    }

    // Логируем медленные запросы
    if (duration > 1000) {
      telegramLogger.logPerformance(
        `Медленный запрос: ${req.method} ${req.originalUrl}`,
        duration,
        {
          requestId,
          statusCode: res.statusCode,
          userId: req.user?.id,
        },
      )
    }

    return originalSend.call(this, data)
  }

  next()
}

// Middleware для логирования ошибок с отправкой в Telegram
const telegramErrorLogger = (err, req, res, next) => {
  const errorData = {
    requestId: req.requestId,
    message: err.message,
    stack: err.stack,
    route: `${req.method} ${req.originalUrl}`,
    userId: req.user?.id || 'anonymous',
    userRole: req.user?.role || 'anonymous',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
  }

  // Логируем ошибку в файл
  logger.error('Application Error', errorData)

  // Логируем ошибку в Telegram
  telegramLogger.logError(`Ошибка приложения: ${err.message}`, {
    requestId: req.requestId,
    route: `${req.method} ${req.originalUrl}`,
    userId: req.user?.id,
    userRole: req.user?.role,
    ip: req.ip,
    error: err.message,
  })

  // Специальная обработка ошибок безопасности
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    telegramLogger.logSecurity('Попытка неавторизованного доступа', {
      requestId: req.requestId,
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      userAgent: req.headers['user-agent'],
    })
  } else if (err.name === 'ValidationError') {
    telegramLogger.logWarning('Ошибка валидации данных', {
      requestId: req.requestId,
      route: `${req.method} ${req.originalUrl}`,
      error: err.message,
      userId: req.user?.id,
    })
  }

  // Отправляем ответ клиенту
  if (!res.headersSent) {
    const statusCode = err.status || err.statusCode || 500
    const message =
      statusCode === 500 ? 'Внутренняя ошибка сервера' : err.message || 'Произошла ошибка'

    res.status(statusCode).json({
      error: message,
      requestId: req.requestId,
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message,
        stack: err.stack,
      }),
    })
  }

  next()
}

// Middleware для логирования безопасности
const telegramSecurityLogger = (req, res, next) => {
  // Логируем подозрительные запросы
  const suspiciousPatterns = [
    /\.\.\//, // Path traversal
    /<script/i, // XSS
    /union\s+select/i, // SQL injection
    /eval\s*\(/i, // Code injection
  ]

  const userAgent = req.headers['user-agent'] || ''
  const url = req.originalUrl || ''

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      telegramLogger.logSecurity('Обнаружен подозрительный запрос', {
        requestId: req.requestId,
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        userAgent: req.headers['user-agent'],
        pattern: pattern.toString(),
      })
      break
    }
  }

  // Логируем множественные запросы с одного IP
  if (req.ip) {
    const key = `rate_limit:${req.ip}`
    const currentCount = (req.app.locals[key] || 0) + 1
    req.app.locals[key] = currentCount

    if (currentCount > 100) {
      // Более 100 запросов
      telegramLogger.logSecurity('Высокая активность с IP адреса', {
        requestId: req.requestId,
        ip: req.ip,
        requestCount: currentCount,
        url: req.originalUrl,
        method: req.method,
      })
    }
  }

  next()
}

// Middleware для логирования пользовательских действий
const telegramUserActionLogger = (action) => {
  return (req, res, next) => {
    const userData = {
      requestId: req.requestId,
      action,
      userId: req.user?.id,
      userRole: req.user?.role,
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    }

    // Логируем в файл
    logger.info('User Action', userData)

    // Логируем в Telegram только важные действия
    if (isImportantAction(action)) {
      telegramLogger.logUserAction(action, req.user?.id, {
        requestId: req.requestId,
        ip: req.ip,
        url: req.originalUrl,
      })
    }

    next()
  }
}

// Middleware для логирования файловых операций
const telegramFileOperationLogger = (operation) => {
  return (req, res, next) => {
    const fileData = {
      requestId: req.requestId,
      operation,
      userId: req.user?.id,
      userRole: req.user?.role,
      ip: req.ip,
      filename: req.file?.originalname || req.body?.filename,
      fileSize: req.file?.size,
      timestamp: new Date().toISOString(),
    }

    // Логируем в файл
    logger.info('File Operation', fileData)

    // Логируем в Telegram
    telegramLogger.logFileOperation(
      operation,
      req.file?.originalname || req.body?.filename || 'unknown',
      {
        requestId: req.requestId,
        userId: req.user?.id,
        fileSize: req.file?.size,
      },
    )

    next()
  }
}

// Middleware для логирования операций с базой данных
const telegramDatabaseLogger = (operation, table) => {
  return (req, res, next) => {
    const start = Date.now()

    // Перехватываем завершение операции
    const originalSend = res.send
    res.send = function (data) {
      const duration = Date.now() - start

      const dbData = {
        requestId: req.requestId,
        operation,
        table,
        duration: `${duration}ms`,
        userId: req.user?.id,
        timestamp: new Date().toISOString(),
      }

      // Логируем в файл
      logger.info('Database Operation', dbData)

      // Логируем в Telegram только медленные операции
      if (duration > 500) {
        telegramLogger.logDatabase(operation, table, duration, {
          requestId: req.requestId,
          userId: req.user?.id,
        })
      }

      return originalSend.call(this, data)
    }

    next()
  }
}

// Утилиты

// Генерация уникального ID запроса
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Определение, нужно ли логировать запрос в Telegram
function shouldLogToTelegram(req, statusCode = null) {
  // Не логируем статические файлы
  if (req.path.startsWith('/static') || req.path.startsWith('/uploads')) {
    return false
  }

  // Не логируем health check
  if (req.path === '/health' || req.path === '/ping') {
    return false
  }

  // Логируем все ошибки
  if (statusCode && statusCode >= 400) {
    return true
  }

  // Логируем важные эндпоинты
  const importantEndpoints = [
    '/auth/login',
    '/auth/register',
    '/auth/logout',
    '/profile',
    '/applications',
    '/admin',
  ]

  return importantEndpoints.some((endpoint) => req.path.startsWith(endpoint))
}

// Определение важных действий пользователя
function isImportantAction(action) {
  const importantActions = [
    'login',
    'logout',
    'register',
    'profile_update',
    'application_submit',
    'file_upload',
    'admin_action',
  ]

  return importantActions.includes(action)
}

// Graceful shutdown - принудительная отправка буфера
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, flushing Telegram logs...')
  await telegramLogger.forceFlush()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, flushing Telegram logs...')
  await telegramLogger.forceFlush()
  process.exit(0)
})

module.exports = {
  telegramRequestLogger,
  telegramErrorLogger,
  telegramSecurityLogger,
  telegramUserActionLogger,
  telegramFileOperationLogger,
  telegramDatabaseLogger,
  telegramLogger,
}
