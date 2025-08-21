const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')

// Глобальные обработчики ошибок ДОЛЖНЫ быть в самом начале
process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION - Сервер будет остановлен:')
  console.error('Error name:', error.name)
  console.error('Error message:', error.message)
  console.error('Stack trace:', error.stack)

  // Дополнительная отладочная информация
  if (error.code) console.error('Error code:', error.code)
  if (error.errno) console.error('Error errno:', error.errno)
  if (error.syscall) console.error('Error syscall:', error.syscall)

  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION:')
  console.error('Promise:', promise)
  console.error('Reason:', reason)

  if (reason && reason.stack) {
    console.error('Stack trace:', reason.stack)
  }

  // В разработке завершаем процесс, в продакшене логируем
  if (process.env.NODE_ENV !== 'production') {
    console.error('Завершение процесса из-за необработанного отклонения промиса')
    process.exit(1)
  }
})

// Загружаем переменные окружения
try {
  require('dotenv').config({ path: './.env' })
  console.log('✅ Переменные окружения загружены')
} catch (error) {
  console.error('❌ Ошибка загрузки .env файла:', error.message)
}

// Функция безопасной загрузки модулей
function safeRequire(modulePath, description) {
  try {
    console.log(`🔄 Загрузка ${description}: ${modulePath}`)
    const module = require(modulePath)
    console.log(`✅ ${description} загружен успешно`)
    return module
  } catch (error) {
    console.error(`❌ ОШИБКА ЗАГРУЗКИ ${description.toUpperCase()}:`)
    console.error('Модуль:', modulePath)
    console.error('Ошибка:', error.message)
    console.error('Стек:', error.stack)

    // Дополнительная информация об ошибке
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('💡 Модуль не найден. Проверьте:')
      console.error('   - Правильность пути к файлу')
      console.error('   - Существование файла')
      console.error('   - Права доступа')
    }

    throw error
  }
}

// Безопасная загрузка основных модулей
console.log('📋 Начало загрузки модулей сервера')

let db, initializeBucket, requestLogger, errorLogger, clientIPMiddleware

try {
  db = safeRequire('./config/database', 'Database config')
} catch (error) {
  console.error('Критическая ошибка: не удается загрузить конфигурацию базы данных')
  process.exit(1)
}

try {
  const minioModule = safeRequire('./config/minio', 'MinIO config')
  initializeBucket = minioModule.initializeBucket
} catch (error) {
  console.warn('Предупреждение: MinIO недоступен, некоторые функции могут не работать')
  initializeBucket = async () => {
    throw new Error('MinIO не инициализирован')
  }
}

try {
  const loggingModule = safeRequire('./middleware/logging', 'Logging middleware')
  requestLogger = loggingModule.requestLogger
  errorLogger = loggingModule.errorLogger
} catch (error) {
  console.warn('Предупреждение: Middleware логирования недоступен')
  requestLogger = (req, res, next) => next()
  errorLogger = (error, req, res, next) => next(error)
}

try {
  const clientIPModule = safeRequire('./middleware/clientIP', 'ClientIP middleware')
  clientIPMiddleware = clientIPModule.clientIPMiddleware
} catch (error) {
  console.warn('Предупреждение: ClientIP middleware недоступен')
  clientIPMiddleware = (req, res, next) => next()
}

// Загрузка маршрутов с детальным логированием
console.log('📋 Начало загрузки маршрутов')

const routes = {}

// Список маршрутов для загрузки
const routesToLoad = [
  { key: 'welcome', path: './routes/welcome', description: 'Welcome routes', critical: false },
  { key: 'auth', path: './routes/auth', description: 'Auth routes', critical: true },
  { key: 'profile', path: './routes/profile', description: 'Profile routes', critical: false },
  {
    key: 'dormitories',
    path: './routes/dormitories',
    description: 'Dormitories routes',
    critical: false,
  },
  { key: 'floors', path: './routes/floors', description: 'Floors routes', critical: false },
  { key: 'blocks', path: './routes/blocks', description: 'Blocks routes', critical: false },
  { key: 'rooms', path: './routes/rooms', description: 'Rooms routes', critical: false },
  { key: 'beds', path: './routes/beds', description: 'Beds routes', critical: false },
  {
    key: 'applications',
    path: './routes/applications',
    description: 'Applications routes',
    critical: false,
  },
  { key: 'users', path: './routes/users', description: 'Users routes', critical: false },
  {
    key: 'structure',
    path: './routes/structure',
    description: 'Structure routes',
    critical: false,
  },
  { key: 'groups', path: './routes/groups', description: 'Groups routes', critical: false },
  { key: 'files', path: './routes/files', description: 'Files routes', critical: false },
  {
    key: 'documents',
    path: './routes/documents',
    description: 'Documents routes',
    critical: false,
  },
  {
    key: 'testTelegram',
    path: './routes/test-telegram',
    description: 'Telegram Test routes',
    critical: false,
  },
]

// Загружаем каждый маршрут отдельно
for (const route of routesToLoad) {
  try {
    console.log(`🔍 Пытаемся загрузить: ${route.description}`)

    // Проверяем существование файла
    if (!fs.existsSync(route.path + '.js')) {
      console.warn(`⚠️ Файл не существует: ${route.path}.js`)
      if (route.critical) {
        throw new Error(`Критический маршрут не найден: ${route.path}`)
      }
      continue
    }

    routes[route.key] = safeRequire(route.path, route.description)
    console.log(`✅ Маршрут загружен: ${route.key}`)
  } catch (error) {
    console.error(`❌ ОШИБКА ЗАГРУЗКИ МАРШРУТА ${route.key.toUpperCase()}:`)
    console.error('Путь:', route.path)
    console.error('Ошибка:', error.message)
    console.error('Стек:', error.stack)

    // Анализируем тип ошибки
    if (error.message.includes('Cannot resolve module')) {
      console.error('💡 Проблема с зависимостями модуля')
    } else if (error.message.includes('SyntaxError')) {
      console.error('💡 Синтаксическая ошибка в файле маршрута')
    } else if (error.message.includes('ReferenceError')) {
      console.error('💡 Ошибка обращения к неопределенной переменной')
    }

    if (route.critical) {
      console.error('🚨 Критический маршрут не загружен, остановка сервера')
      process.exit(1)
    } else {
      console.warn(`⚠️ Некритический маршрут пропущен: ${route.key}`)
      routes[route.key] = null
    }
  }
}

console.log('📋 Загрузка маршрутов завершена')
console.log(
  'Успешно загружено маршрутов:',
  Object.keys(routes).filter((key) => routes[key] !== null).length,
)

// Environment variables validation
const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName])
if (missingEnvVars.length > 0) {
  console.error(`❌ Отсутствуют обязательные переменные окружения: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 3000
const HTTPS_PORT = process.env.HTTPS_PORT || 443
const isProduction = process.env.NODE_ENV === 'production'

console.log('📋 Настройка Express приложения')

// Trust proxy settings
if (isProduction) {
  app.set('trust proxy', ['127.0.0.1', '::1', '192.168.1.253', '90.156.198.42'])
} else {
  app.set('trust proxy', ['127.0.0.1', '::1'])
}

// SSL Configuration
let sslOptions = null
if (isProduction) {
  try {
    const keyPath = process.env.SSL_KEY_PATH || '/etc/ssl/certs/api.dormitory.gubkin.uz/privkey.pem'
    const certPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/api.dormitory.gubkin.uz/cert.pem'
    const caPath = process.env.SSL_CA_PATH || '/etc/ssl/certs/api.dormitory.gubkin.uz/chain.pem'

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      }

      if (fs.existsSync(caPath)) {
        sslOptions.ca = fs.readFileSync(caPath)
      }
      console.log('✅ SSL сертификаты загружены')
    } else {
      console.warn('⚠️ SSL сертификаты не найдены, используется только HTTP')
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки SSL сертификатов:', error.message)
  }
}

// CORS configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://dormitory-gubkin.netlify.app',
  'https://dormitory.gubkin.uz',
  'https://9e4890cdc062.ngrok-free.app',
  'http://192.168.1.253',
  'http://90.156.198.42',
  process.env.FRONTEND_URL,
].filter(Boolean)

console.log('📋 Настройка middleware')

// Security middleware
try {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
    }),
  )
  console.log('✅ Helmet middleware настроен')
} catch (error) {
  console.error('❌ Ошибка настройки Helmet:', error.message)
}

try {
  app.use(
    cors({
      origin: isProduction ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Cache-Control',
        'Pragma',
      ],
    }),
  )
  console.log('✅ CORS настроен')
} catch (error) {
  console.error('❌ Ошибка настройки CORS:', error.message)
}

// Logging middleware
try {
  app.use(morgan(isProduction ? 'combined' : 'dev'))
  console.log('✅ Morgan logger настроен')
} catch (error) {
  console.error('❌ Ошибка настройки Morgan:', error.message)
}

// Body parsing middleware
try {
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, res, buf) => {
        try {
          JSON.parse(buf)
        } catch (e) {
          res.status(400).json({ error: 'Invalid JSON format' })
          throw new Error('Invalid JSON')
        }
      },
    }),
  )
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  console.log('✅ Body parsing middleware настроен')
} catch (error) {
  console.error('❌ Ошибка настройки body parsing:', error.message)
}

// Rate limiting
try {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 1000 : 10000,
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const forwardedFor = req.headers['x-forwarded-for']
      if (forwardedFor && app.get('trust proxy')) {
        const clientIP = forwardedFor.split(',')[0].trim()
        return clientIP
      }
      return req.connection.remoteAddress || req.ip || 'unknown'
    },
    skip: (req) => {
      return req.path === '/api/health'
    },
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  })
  app.use(limiter)
  console.log('✅ Rate limiting настроен')
} catch (error) {
  console.error('❌ Ошибка настройки rate limiting:', error.message)
}

// Static files
const uploadsPath = isProduction ? '/var/www/uploads' : 'uploads'
if (fs.existsSync(uploadsPath)) {
  try {
    app.use(
      '/uploads',
      express.static(uploadsPath, {
        maxAge: '1d',
        etag: true,
        lastModified: true,
      }),
    )
    console.log('✅ Static files настроены:', uploadsPath)
  } catch (error) {
    console.error('❌ Ошибка настройки static files:', error.message)
  }
} else {
  console.warn(`⚠️ Папка uploads не найдена: ${uploadsPath}`)
}

// Custom middleware
try {
  app.use(clientIPMiddleware)
  app.use(requestLogger)
  console.log('✅ Custom middleware настроен')
} catch (error) {
  console.error('❌ Ошибка настройки custom middleware:', error.message)
}

// Health check
app.get('/api/health', async (req, res) => {
  console.log('🏥 Health check запрошен')
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  }

  try {
    if (db && db.pool) {
      await db.pool.query('SELECT 1')
      healthCheck.database = 'connected'
    } else {
      healthCheck.database = 'not_configured'
    }
  } catch (error) {
    healthCheck.database = 'disconnected'
    healthCheck.status = 'WARNING'
    console.error('Health check - database error:', error.message)
  }

  const statusCode = healthCheck.status === 'OK' ? 200 : 503
  res.status(statusCode).json(healthCheck)
})

// Подключение маршрутов с обработкой ошибок
console.log('📋 Подключение маршрутов к приложению')

const routeMappings = [
  { path: '/', route: 'welcome', name: 'Welcome' },
  { path: '/api/auth', route: 'auth', name: 'Auth' },
  { path: '/api/profile', route: 'profile', name: 'Profile' },
  { path: '/api/dormitories', route: 'dormitories', name: 'Dormitories' },
  { path: '/api/floors', route: 'floors', name: 'Floors' },
  { path: '/api/blocks', route: 'blocks', name: 'Blocks' },
  { path: '/api/rooms', route: 'rooms', name: 'Rooms' },
  { path: '/api/beds', route: 'beds', name: 'Beds' },
  { path: '/api/applications', route: 'applications', name: 'Applications' },
  { path: '/api/users', route: 'users', name: 'Users' },
  { path: '/api/structure', route: 'structure', name: 'Structure' },
  { path: '/api/groups', route: 'groups', name: 'Groups' },
  { path: '/api/files', route: 'files', name: 'Files' },
  { path: '/api/documents', route: 'documents', name: 'Documents' },
  { path: '/api/test', route: 'testTelegram', name: 'Telegram Test' },
]

for (const mapping of routeMappings) {
  try {
    if (routes[mapping.route]) {
      console.log(`🔗 Подключение ${mapping.name} routes к ${mapping.path}`)
      app.use(mapping.path, routes[mapping.route])
      console.log(`✅ ${mapping.name} routes подключены успешно`)
    } else {
      console.warn(`⚠️ ${mapping.name} routes пропущены (не загружены)`)
    }
  } catch (error) {
    console.error(`❌ ОШИБКА ПОДКЛЮЧЕНИЯ ${mapping.name.toUpperCase()} ROUTES:`)
    console.error('Путь:', mapping.path)
    console.error('Ошибка:', error.message)
    console.error('Стек:', error.stack)
  }
}

// 404 handler
app.use('*', (req, res) => {
  console.log(`❓ 404 - Маршрут не найден: ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  })
})

// Error handling middleware
app.use(errorLogger)
app.use((error, req, res, next) => {
  console.error('🚨 EXPRESS ERROR HANDLER:')
  console.error('URL:', req.originalUrl)
  console.error('Method:', req.method)
  console.error('Error:', error.message)
  console.error('Stack:', error.stack)

  // Handle specific error types
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON format' })
  }

  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload too large' })
  }

  // Default error response
  const statusCode = error.statusCode || error.status || 500
  const response = {
    error: statusCode === 500 ? 'Internal server error' : error.message,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  }

  if (process.env.NODE_ENV === 'development') {
    response.details = error.message
    response.stack = error.stack
  }

  if (!res.headersSent) {
    res.status(statusCode).json(response)
  }
})

// Функции инициализации
async function checkDatabaseConnection() {
  try {
    console.log('🔄 Проверка подключения к базе данных')
    if (!db || !db.pool) {
      throw new Error('Database pool не инициализирован')
    }
    await db.pool.query('SELECT 1')
    console.log('✅ Подключение к базе данных установлено')
    return true
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error.message)
    return false
  }
}

async function initializeMinIO() {
  try {
    console.log('🔄 Инициализация MinIO')
    await initializeBucket()
    console.log('✅ MinIO инициализирован')
  } catch (error) {
    console.error('❌ Ошибка инициализации MinIO:', error.message)
    console.warn('⚠️ Некоторые функции файлов могут не работать')
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n📢 Получен сигнал ${signal}, начинаем корректное завершение...`)

  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Принудительное завершение из-за таймаута')
    process.exit(1)
  }, 30000)

  try {
    if (global.httpServer) {
      await new Promise((resolve) => {
        global.httpServer.close(resolve)
      })
      console.log('✅ HTTP сервер закрыт')
    }

    if (global.httpsServer) {
      await new Promise((resolve) => {
        global.httpsServer.close(resolve)
      })
      console.log('✅ HTTPS сервер закрыт')
    }

    if (db && db.pool) {
      await db.pool.end()
      console.log('✅ Пул базы данных закрыт')
    }

    clearTimeout(shutdownTimeout)
    console.log('✅ Корректное завершение завершено')
    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка во время завершения:', error)
    clearTimeout(shutdownTimeout)
    process.exit(1)
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Server startup
async function startServer() {
  try {
    console.log('🚀 Запуск сервера')
    console.log('Окружение:', process.env.NODE_ENV || 'development')
    console.log('Порт:', PORT)

    // Проверяем базу данных
    const dbConnected = await checkDatabaseConnection()
    if (!dbConnected && isProduction) {
      console.error('❌ Невозможно запустить сервер без подключения к базе данных в продакшене')
      process.exit(1)
    }

    // Инициализируем MinIO
    await initializeMinIO()

    // Инициализируем Telegram уведомления
    const telegramService = safeRequire('./services/telegramService', 'Telegram Service')
    if (telegramService) {
      console.log('🤖 Инициализация Telegram уведомлений...')
      try {
        await telegramService.testConnection()
      } catch (error) {
        console.warn('⚠️ Ошибка инициализации Telegram:', error.message)
      }
    }

    // Запускаем серверы
    if (sslOptions && isProduction) {
      // HTTP редирект
      const httpApp = express()
      httpApp.use((req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`)
      })

      global.httpServer = http.createServer(httpApp)
      global.httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🔄 HTTP redirect сервер запущен на порту ${PORT}`)
      })

      // HTTPS сервер
      global.httpsServer = https.createServer(sslOptions, app)
      global.httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🚀 HTTPS сервер запущен на порту ${HTTPS_PORT}`)
      })
    } else {
      // HTTP сервер
      global.httpServer = http.createServer(app)
      global.httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`)
        if (isProduction) {
          console.log('⚠️ Работа в продакшене без HTTPS')
        }
      })
    }

    console.log('✅ Сервер успешно запущен')
  } catch (error) {
    console.error('❌ КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА СЕРВЕРА:')
    console.error('Ошибка:', error.message)
    console.error('Стек:', error.stack)
    process.exit(1)
  }
}

// Запуск сервера
if (require.main === module) {
  startServer().catch((error) => {
    console.error('❌ Не удалось запустить сервер:', error)
    process.exit(1)
  })
}

module.exports = app
