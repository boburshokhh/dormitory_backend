const winston = require('winston')
require('winston-daily-rotate-file')
const path = require('path')
const fs = require('fs')
const telegramService = require('../services/telegramService')

// Создаем папку для логов если её нет
const logDir = path.join(__dirname, '..', 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Кастомные форматы
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
    }

    return log
  }),
)

// Цветной формат для консоли
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`

    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
    }

    return log
  }),
)

// Транспорты для файлов
const fileTransports = [
  // Общие логи
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'info',
  }),

  // Логи ошибок
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    level: 'error',
  }),

  // Логи HTTP запросов
  new winston.transports.DailyRotateFile({
    filename: path.join(logDir, 'http-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '7d',
    level: 'info',
  }),
]

// Создаем основной логгер
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    ...fileTransports,
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    }),
  ],
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
})

// Специальный логгер для HTTP запросов
const httpLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '7d',
    }),
  ],
})

// Специальный логгер для безопасности
const securityLogger = winston.createLogger({
  level: 'warn',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'security-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
    }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
})

// Утилиты для логирования
const logUtils = {
  // Логирование HTTP запросов
  logRequest: (req, res, duration) => {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id || 'anonymous',
      userRole: req.user?.role || 'anonymous',
    }

    if (res.statusCode >= 400) {
      httpLogger.warn('HTTP Request Error', logData)
    } else {
      httpLogger.info('HTTP Request', logData)
    }
  },

  // Логирование ошибок безопасности
  logSecurityEvent: async (event, details) => {
    // Логируем в файл как обычно
    securityLogger.warn('Security Event', {
      event,
      ...details,
      timestamp: new Date().toISOString(),
    })

    // Отправляем события безопасности в Telegram
    try {
      await telegramService.sendSecurityAlert(event, details)
    } catch (telegramError) {
      logger.warn('Telegram Security Alert Failed', {
        originalEvent: event,
        telegramError: telegramError.message,
      })
    }
  },

  // Логирование ошибок приложения
  logError: async (error, context = {}) => {
    // Логируем в файл как обычно
    logger.error('Application Error', {
      message: error.message,
      stack: error.stack,
      ...context,
    })

    // Отправляем критические ошибки в Telegram
    if (error.name !== 'ValidationError' && context.statusCode >= 500) {
      try {
        await telegramService.sendErrorNotification(error, context)
      } catch (telegramError) {
        // Логируем ошибку отправки в Telegram, но не останавливаем выполнение
        logger.warn('Telegram Notification Failed', {
          originalError: error.message,
          telegramError: telegramError.message,
        })
      }
    }
  },

  // Логирование бизнес-логики
  logBusinessEvent: (event, data) => {
    logger.info('Business Event', {
      event,
      ...data,
      timestamp: new Date().toISOString(),
    })
  },

  // Логирование производительности
  logPerformance: (operation, duration, details = {}) => {
    logger.info('Performance', {
      operation,
      duration: `${duration}ms`,
      ...details,
    })
  },
}

module.exports = {
  logger,
  httpLogger,
  securityLogger,
  logUtils,
}
