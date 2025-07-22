const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const rateLimit = require('express-rate-limit')
require('dotenv').config({ path: './services/config.env' })

const db = require('./config/database')
const { initializeBucket } = require('./config/minio')
const { apiLoggingMiddleware, errorLoggingMiddleware } = require('./middleware/logging')
const authRoutes = require('./routes/auth')
const profileRoutes = require('./routes/profile')
const dormitoryRoutes = require('./routes/dormitories')
const floorRoutes = require('./routes/floors')
const blockRoutes = require('./routes/blocks')
const roomRoutes = require('./routes/rooms')
const bedRoutes = require('./routes/beds')
const applicationRoutes = require('./routes/applications')
const userRoutes = require('./routes/users')
const structureRoutes = require('./routes/structure')
const groupRoutes = require('./routes/groups')
const logsRoutes = require('./routes/logs')
const fileRoutes = require('./routes/files')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet()) // Безопасность заголовков

// CORS конфигурация для поддержки нескольких доменов
const allowedOrigins = [
  'http://localhost:5173', // Development
  'https://dormitory-gubkin.netlify.app', // Production
  process.env.FRONTEND_URL, // Дополнительный домен из конфига
].filter(Boolean)

app.use(
  cors({
    origin: function (origin, callback) {
      // Разрешаем запросы без origin (например, мобильные приложения)
      if (!origin) return callback(null, true)

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  }),
)
app.use(morgan('combined')) // Логирование
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

// Middleware для логирования API запросов
app.use(apiLoggingMiddleware)

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/dormitories', dormitoryRoutes)
app.use('/api/floors', floorRoutes)
app.use('/api/blocks', blockRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/beds', bedRoutes)
app.use('/api/applications', applicationRoutes)
app.use('/api/users', userRoutes)
app.use('/api/structure', structureRoutes)
app.use('/api/groups', groupRoutes)
app.use('/api/logs', logsRoutes)
app.use('/api/files', fileRoutes)

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
app.use(errorLoggingMiddleware)
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
  await db.end()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('Получен сигнал SIGINT, завершаем сервер...')
  await db.end()
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
