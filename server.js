const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
require('dotenv').config({ path: './.env' })

const db = require('./config/database')
const { initializeBucket } = require('./config/minio')
const { requestLogger, errorLogger } = require('./middleware/logging')
const { clientIPMiddleware } = require('./middleware/clientIP')
const welcomeRoutes = require('./routes/welcome')
const authRoutes = require('./routes/auth')
const profileRoutes = require('./routes/profile')
const dormitoriesRoutes = require('./routes/dormitories')
const floorsRoutes = require('./routes/floors')
const blocksRoutes = require('./routes/blocks')
const roomsRoutes = require('./routes/rooms')
const bedsRoutes = require('./routes/beds')
const applicationsRoutes = require('./routes/applications')
const usersRoutes = require('./routes/users')
const structureRoutes = require('./routes/structure')
const groupsRoutes = require('./routes/groups')
const filesRoutes = require('./routes/files')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet()) // Безопасность заголовков

// CORS конфигурация для поддержки нескольких доменов
const allowedOrigins = [
  'http://localhost:5173', // Development
  'http://localhost:3000', // Local development
  'https://dormitory-gubkin.netlify.app', // Production Netlify
  'https://dormitory.gubkin.uz', // Production domain
  'https://9e4890cdc062.ngrok-free.app', // ngrok tunnel
  process.env.FRONTEND_URL, // Дополнительный домен из конфига
].filter(Boolean)

app.use(
  cors({
    origin: function (origin, callback) {
      // Разрешаем запросы без origin (например, мобильные приложения, Postman)
      if (!origin) return callback(null, true)

      // Проверяем точное совпадение с разрешенными доменами
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true)
        return
      }

      // Разрешаем все поддомены gubkin.uz
      if (origin && origin.match(/^https?:\/\/.*\.gubkin\.uz$/)) {
        callback(null, true)
        return
      }

      // Разрешаем localhost для разработки
      if (origin && origin.match(/^https?:\/\/localhost(:\d+)?$/)) {
        callback(null, true)
        return
      }

      console.log(`❌ CORS blocked origin: ${origin}`)
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'Pragma',
    ],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 200, // Для старых браузеров
  }),
)
app.use(morgan('combined')) // Логирование

// Дополнительные CORS заголовки
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin)
  }
  res.header('Access-Control-Allow-Credentials', 'true')
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS')
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma',
  )

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Статические файлы для загруженных изображений и документов
const isProduction = process.env.NODE_ENV === 'production'
const uploadsPath = isProduction ? '/var/www/uploads' : 'uploads'

app.use('/uploads', express.static(uploadsPath))

// Rate limiting - более мягкие ограничения
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000, // максимум 1000 запросов с одного IP (увеличено)
  message: 'Слишком много запросов с этого IP, попробуйте позже.',
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(limiter)

// Проверка подключения к БД
app.use(async (req, res, next) => {
  try {
    await db.query('SELECT 1')
    next()
  } catch (error) {
    console.error('Ошибка подключения к БД:', error)
    res.status(503).json({ error: 'Сервис временно недоступен' })
  }
})

// Middleware для получения IP адреса клиента
app.use(clientIPMiddleware)

// Middleware для логирования API запросов
app.use(requestLogger)

// Routes
app.use('/', welcomeRoutes) // Страница приветствия
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/dormitories', dormitoriesRoutes)
app.use('/api/floors', floorsRoutes)
app.use('/api/blocks', blocksRoutes)
app.use('/api/rooms', roomsRoutes)
app.use('/api/beds', bedsRoutes)
app.use('/api/applications', applicationsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/structure', structureRoutes)
app.use('/api/groups', groupsRoutes)
app.use('/api/files', filesRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' })
})

// Global error handler
app.use(errorLogger)
app.use((error, req, res, next) => {
  console.error('Ошибка сервера:', error)

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Неверный формат JSON' })
  }

  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    ...(process.env.NODE_ENV === 'development' && { details: error.message }),
  })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Получен сигнал SIGTERM, завершаем сервер...')
  try {
    await db.pool.end()
    console.log('✅ Пул подключений закрыт')
  } catch (error) {
    console.error('Ошибка закрытия пула:', error)
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('Получен сигнал SIGINT, завершаем сервер...')
  try {
    await db.pool.end()
    console.log('✅ Пул подключений закрыт')
  } catch (error) {
    console.error('Ошибка закрытия пула:', error)
  }
  process.exit(0)
})

app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 Database: ${process.env.DB_NAME || 'gubkin_dormitory'}`)

  // Инициализация MinIO
  try {
    await initializeBucket()
    console.log(
      `📦 MinIO bucket инициализирован: ${process.env.MINIO_BUCKET_NAME || 'gubkin-dormitory'}`,
    )
  } catch (error) {
    console.error('❌ Ошибка инициализации MinIO:', error)
  }
})

module.exports = app
