const telegramLogger = require('../services/telegramLoggerService')
const { logger } = require('../utils/logger')

// Middleware для терминального логирования всех HTTP запросов
const terminalTelegramRequestLogger = (req, res, next) => {
  const start = Date.now()
  const requestId = generateRequestId()

  // Добавляем ID запроса к объекту запроса
  req.requestId = requestId

  // Логируем начало запроса в Telegram (если включен терминальный режим)
  if (telegramLogger.terminalMode) {
    telegramLogger.logRequestStart(req.method, req.originalUrl, {
      requestId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id || 'anonymous',
    })
  }

  // Логируем в файл
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
  logger.info('HTTP Request Started', requestData)

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

    // Логируем завершение запроса в файл
    logger.info('HTTP Request Completed', responseData)

    // Логируем в Telegram (терминальный режим)
    if (telegramLogger.terminalMode) {
      telegramLogger.logRequestEnd(req.method, req.originalUrl, res.statusCode, duration, {
        requestId,
        ip: req.ip,
        userId: req.user?.id,
        userRole: req.user?.role,
      })
    }

    return originalSend.call(this, data)
  }

  next()
}

// Middleware для логирования ошибок в терминальном стиле
const terminalTelegramErrorLogger = (err, req, res, next) => {
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

  // Логируем ошибку в Telegram (терминальный режим)
  if (telegramLogger.terminalMode) {
    telegramLogger.logError(`Application Error: ${err.message}`, {
      requestId: req.requestId,
      route: `${req.method} ${req.originalUrl}`,
      userId: req.user?.id,
      ip: req.ip,
      error: err.message,
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

// Функция для интеграции с SQL логированием
const logSqlQuery = (query, duration, context = {}) => {
  if (telegramLogger.terminalMode) {
    telegramLogger.logSqlQuery(query, duration, context)
  }
}

// Патчим console.log для перехвата SQL запросов
const originalConsoleLog = console.log
console.log = function (...args) {
  // Проверяем, является ли это SQL логом
  const message = args.join(' ')
  if (message.includes('🔍 SQL:')) {
    const sqlMatch = message.match(/🔍 SQL: (.+) \| (\d+)ms/)
    if (sqlMatch && telegramLogger.terminalMode) {
      const [, query, duration] = sqlMatch
      telegramLogger.logSqlQuery(query, parseInt(duration))
    }
  }

  // Вызываем оригинальный console.log
  originalConsoleLog.apply(console, args)
}

// Утилиты

// Генерация уникального ID запроса
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

module.exports = {
  terminalTelegramRequestLogger,
  terminalTelegramErrorLogger,
  logSqlQuery,
}
