// middleware/performance.js
// Middleware для мониторинга производительности

const performanceLogger = {
  log: (message, data = {}) => {
    const timestamp = new Date().toISOString()
    console.log(`[PERFORMANCE] ${timestamp} - ${message}`, data)
  },

  warn: (message, data = {}) => {
    const timestamp = new Date().toISOString()
    console.warn(`[PERFORMANCE WARNING] ${timestamp} - ${message}`, data)
  },

  error: (message, data = {}) => {
    const timestamp = new Date().toISOString()
    console.error(`[PERFORMANCE ERROR] ${timestamp} - ${message}`, data)
  },
}

// Middleware для мониторинга производительности запросов
const performanceMonitor = (req, res, next) => {
  const startTime = Date.now()
  const startMemory = process.memoryUsage()

  // Устанавливаем таймаут для медленных запросов
  const slowRequestThreshold = 5000 // 5 секунд
  const criticalRequestThreshold = 15000 // 15 секунд

  // Перехватываем завершение ответа
  const originalSend = res.send
  res.send = function (data) {
    const duration = Date.now() - startTime
    const endMemory = process.memoryUsage()
    const memoryDiff = {
      rss: endMemory.rss - startMemory.rss,
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
    }

    // Логируем информацию о запросе
    const requestInfo = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id,
      userRole: req.user?.role,
      memoryUsage: memoryDiff,
      userAgent: req.headers['user-agent']?.substring(0, 100),
    }

    // Логируем медленные запросы
    if (duration > criticalRequestThreshold) {
      performanceLogger.error('Критически медленный запрос', requestInfo)
    } else if (duration > slowRequestThreshold) {
      performanceLogger.warn('Медленный запрос', requestInfo)
    } else {
      performanceLogger.log('Запрос выполнен', requestInfo)
    }

    // Добавляем заголовки с информацией о производительности
    res.set('X-Processing-Time', `${duration}ms`)
    res.set('X-Request-ID', req.headers['x-request-id'] || `req-${Date.now()}`)

    // Вызываем оригинальный метод
    return originalSend.call(this, data)
  }

  next()
}

// Middleware для мониторинга использования памяти
const memoryMonitor = (req, res, next) => {
  const memoryUsage = process.memoryUsage()
  const memoryThreshold = 500 * 1024 * 1024 // 500MB

  if (memoryUsage.heapUsed > memoryThreshold) {
    performanceLogger.warn('Высокое использование памяти', {
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      threshold: `${Math.round(memoryThreshold / 1024 / 1024)}MB`,
    })
  }

  next()
}

// Middleware для мониторинга пула соединений БД
const databasePoolMonitor = (req, res, next) => {
  try {
    const { pool } = require('../config/database')
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    }

    // Логируем если много ожидающих запросов
    if (poolStats.waitingCount > 5) {
      performanceLogger.warn('Много ожидающих запросов к БД', poolStats)
    }

    // Добавляем информацию в заголовки
    res.set('X-DB-Pool-Total', poolStats.totalCount)
    res.set('X-DB-Pool-Idle', poolStats.idleCount)
    res.set('X-DB-Pool-Waiting', poolStats.waitingCount)
  } catch (error) {
    // Игнорируем ошибки мониторинга БД
  }

  next()
}

module.exports = {
  performanceMonitor,
  memoryMonitor,
  databasePoolMonitor,
  performanceLogger,
}
