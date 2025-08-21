// middleware/logging.js
// Упрощенная версия без winston для совместимости

// Простая функция логирования
const simpleLog = (level, message, data = {}) => {
  const timestamp = new Date().toISOString()
  const logData = {
    timestamp,
    level,
    message,
    ...data,
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[${level.toUpperCase()}] ${message}`, data)
  } else {
    console.log(JSON.stringify(logData))
  }
}

// Утилиты для логирования
const logUtils = {
  logRequest: (req, res, duration) => {
    simpleLog('info', 'HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
  },

  logError: (error, context = {}) => {
    simpleLog('error', 'Error occurred', {
      message: error.message,
      stack: error.stack,
      ...context,
    })
  },

  logBusinessEvent: (event, data = {}) => {
    simpleLog('info', `Business Event: ${event}`, data)
  },

  logPerformance: (operation, duration, details = {}) => {
    simpleLog('info', `Performance: ${operation}`, {
      duration: `${duration}ms`,
      ...details,
    })
  },
}

// Простой security logger
const securityLogger = {
  warn: (message, data = {}) => {
    simpleLog('warn', `Security Warning: ${message}`, data)
  },

  error: (message, data = {}) => {
    simpleLog('error', `Security Error: ${message}`, data)
  },
}

// Улучшенное middleware для логирования запросов
const requestLogger = (req, res, next) => {
  const start = Date.now()

  // Логируем начало запроса
  logUtils.logRequest(req, res, 0)

  // Перехватываем завершение ответа
  const originalSend = res.send
  res.send = function (data) {
    const duration = Date.now() - start

    // Обновляем статус код если он не был установлен
    if (!res.statusCode) {
      res.statusCode = 200
    }

    // Логируем завершение запроса
    logUtils.logRequest(req, res, duration)

    // Логируем ошибки безопасности
    if (res.statusCode === 401) {
      securityLogger.warn('Unauthorized Access Attempt', {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        userAgent: req.headers['user-agent'],
      })
    } else if (res.statusCode === 403) {
      securityLogger.warn('Forbidden Access Attempt', {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method,
        userId: req.user?.id,
        userRole: req.user?.role,
      })
    } else if (res.statusCode >= 500) {
      logUtils.logError(new Error(`Server Error: ${res.statusCode}`), {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
      })
    }

    return originalSend.call(this, data)
  }

  next()
}

// Улучшенное логирование ошибок
const errorLogger = async (err, req, res, next) => {
  // Логируем ошибку
  await logUtils.logError(err, {
    route: `${req.method} ${req.originalUrl}`,
    userId: req.user?.id || 'anonymous',
    userRole: req.user?.role || 'anonymous',
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    statusCode: err.status || err.statusCode || 500,
  })

  // Логируем ошибки безопасности
  if (err.name === 'UnauthorizedError' || err.status === 401) {
    await logUtils.logSecurityEvent('Authentication Error', {
      ip: req.ip,
      url: req.originalUrl,
      method: req.method,
      error: err.message,
    })
  } else if (err.name === 'ValidationError') {
    logUtils.logBusinessEvent('Validation Error', {
      url: req.originalUrl,
      method: req.method,
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
      ...(process.env.NODE_ENV === 'development' && {
        details: err.message,
        stack: err.stack,
      }),
    })
  }

  next()
}

// Middleware для логирования медленных запросов
const slowRequestLogger = (threshold = 1000) => {
  return (req, res, next) => {
    const start = Date.now()

    res.on('finish', () => {
      const duration = Date.now() - start
      if (duration > threshold) {
        logUtils.logPerformance('Slow Request', duration, {
          url: req.originalUrl,
          method: req.method,
          statusCode: res.statusCode,
          ip: req.ip,
        })
      }
    })

    next()
  }
}

// Middleware для логирования больших запросов
const largeRequestLogger = (sizeThreshold = 1024 * 1024) => {
  // 1MB
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0')

    if (contentLength > sizeThreshold) {
      logUtils.logBusinessEvent('Large Request', {
        url: req.originalUrl,
        method: req.method,
        size: `${(contentLength / 1024 / 1024).toFixed(2)}MB`,
        ip: req.ip,
      })
    }

    next()
  }
}

module.exports = {
  requestLogger,
  errorLogger,
  slowRequestLogger,
  largeRequestLogger,
}
