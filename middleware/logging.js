// Упрощенное middleware для логирования запросов

const requestLogger = (req, res, next) => {
  const start = Date.now()

  // Логируем начало запроса
  console.log(`📥 ${req.method} ${req.originalUrl} - ${req.ip} - ${new Date().toISOString()}`)

  // Перехватываем завершение ответа
  const originalSend = res.send
  res.send = function (data) {
    const duration = Date.now() - start
    console.log(`📤 ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`)

    if (res.statusCode >= 400) {
      console.error(`❌ Error Response: ${res.statusCode} - ${req.originalUrl}`)
    }

    return originalSend.call(this, data)
  }

  next()
}

// Логирование ошибок
const errorLogger = (err, req, res, next) => {
  console.error(`🚨 Unhandled Error: ${err.message}`)
  console.error(`📍 Route: ${req.method} ${req.originalUrl}`)
  console.error(`👤 User: ${req.user?.id || 'Anonymous'}`)
  console.error(`🔍 Stack: ${err.stack}`)

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    })
  }

  next()
}

module.exports = {
  requestLogger,
  errorLogger,
}
