const rateLimit = require('express-rate-limit')

// Rate limiter для верификации документов
const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP за 15 минут
  message: {
    error: 'Слишком много запросов верификации',
    message: 'Превышен лимит запросов. Попробуйте через 15 минут.',
    resetTime: '15 минут',
  },
  standardHeaders: true, // Возвращает rate limit info в заголовках `RateLimit-*`
  legacyHeaders: false, // Отключает заголовки `X-RateLimit-*`
  keyGenerator: (req) => {
    // Используем IP адрес как ключ
    return req.ip || req.connection.remoteAddress
  },
  skip: (req) => {
    // Можно добавить логику для пропуска определенных IP
    return false
  },
  onLimitReached: (req, res, options) => {
    console.log(`⚠️ Rate limit достигнут для IP: ${req.ip}, URL: ${req.originalUrl}`)
  },
})

// Более строгий rate limiter для попыток с неверными ID
const strictVerificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 минут
  max: 10, // максимум 10 неудачных попыток за 5 минут
  message: {
    error: 'Слишком много неудачных попыток',
    message: 'Превышен лимит неудачных попыток верификации. Попробуйте через 5 минут.',
    resetTime: '5 минут',
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress
  },
  skip: (req, res) => {
    // Применяем только для неудачных ответов
    return res.statusCode < 400
  },
})

// Общий rate limiter для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // максимум 1000 запросов с одного IP за 15 минут
  message: {
    error: 'Слишком много запросов к API',
    message: 'Превышен лимит запросов к API. Попробуйте позже.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  verificationLimiter,
  strictVerificationLimiter,
  apiLimiter,
}
