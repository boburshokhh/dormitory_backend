const fs = require('fs')
const http = require('http')
const https = require('https')
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

// Route imports
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
// const logsRoutes = require('./routes/logs') // Временно отключено

// Environment variables validation
const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASSWORD']
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName])
if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 3000
const HTTPS_PORT = process.env.HTTPS_PORT || 443
const isProduction = process.env.NODE_ENV === 'production'

// Trust proxy settings for proper IP handling behind reverse proxy
if (isProduction) {
  // Trust only specific proxy IPs (nginx, load balancer, etc.)
  app.set('trust proxy', ['127.0.0.1', '::1', '192.168.1.253', '90.156.198.42'])
} else {
  // In development, trust localhost only
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

      // Add CA chain if exists (optional but recommended)
      if (fs.existsSync(caPath)) {
        sslOptions.ca = fs.readFileSync(caPath)
      }
      console.log('✅ SSL certificates loaded')
    } else {
      console.warn('⚠️ SSL certificates not found, using HTTP only')
    }
  } catch (error) {
    console.error('❌ Error loading SSL certificates:', error.message)
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

// Security middleware
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

app.use(
  cors({
    origin: isProduction ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }),
)

// Logging middleware
app.use(morgan(isProduction ? 'combined' : 'dev'))

// Body parsing middleware
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

// Rate limiting with secure configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 1000 : 10000, // More permissive in development
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator for better security
  keyGenerator: (req) => {
    // Use X-Forwarded-For only if we trust the proxy
    const forwardedFor = req.headers['x-forwarded-for']
    if (forwardedFor && app.get('trust proxy')) {
      // Get the first IP in the chain (original client IP)
      const clientIP = forwardedFor.split(',')[0].trim()
      return clientIP
    }
    // Fallback to connection IP
    return req.connection.remoteAddress || req.ip || 'unknown'
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health'
  },
  // Additional security options
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
})
app.use(limiter)

// Static files configuration
const uploadsPath = isProduction ? '/var/www/uploads' : 'uploads'
if (fs.existsSync(uploadsPath)) {
  app.use(
    '/uploads',
    express.static(uploadsPath, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
    }),
  )
} else {
  console.warn(`⚠️ Uploads directory not found: ${uploadsPath}`)
}

// Custom middleware
app.use(clientIPMiddleware)

// Стандартное логирование
app.use(requestLogger)

// Health check (before other routes)
app.get('/api/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  }

  try {
    // Quick database health check
    await db.pool.query('SELECT 1')
    healthCheck.database = 'connected'
  } catch (error) {
    healthCheck.database = 'disconnected'
    healthCheck.status = 'WARNING'
  }

  const statusCode = healthCheck.status === 'OK' ? 200 : 503
  res.status(statusCode).json(healthCheck)
})

// API Routes
app.use('/', welcomeRoutes)
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
// app.use('/api/logs', logsRoutes) // Временно отключено

// 404 handler (must be before error handlers)
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  })
})

// Error handling middleware (must be last)
app.use(errorLogger)
app.use((error, req, res, next) => {
  console.error('Server error:', error)

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

  // Include error details only in development
  if (process.env.NODE_ENV === 'development') {
    response.details = error.message
    response.stack = error.stack
  }

  res.status(statusCode).json(response)
})

// Database connection check
async function checkDatabaseConnection() {
  try {
    await db.pool.query('SELECT 1')
    console.log('✅ Database connection established')
    return true
  } catch (error) {
    console.error('❌ Database connection failed:', error.message)
    return false
  }
}

// Initialize MinIO
async function initializeMinIO() {
  try {
    await initializeBucket()
    console.log('✅ MinIO initialized')
  } catch (error) {
    console.error('❌ MinIO initialization failed:', error.message)
    // Don't exit on MinIO failure, it's not critical for basic functionality
  }
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`\n📢 Received ${signal}, initiating graceful shutdown...`)

  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Forced shutdown due to timeout')
    process.exit(1)
  }, 30000) // 30 seconds timeout

  try {
    // Close HTTP server
    if (global.httpServer) {
      await new Promise((resolve) => {
        global.httpServer.close(resolve)
      })
      console.log('✅ HTTP server closed')
    }

    // Close HTTPS server
    if (global.httpsServer) {
      await new Promise((resolve) => {
        global.httpsServer.close(resolve)
      })
      console.log('✅ HTTPS server closed')
    }

    // Close database connections
    if (db && db.pool) {
      await db.pool.end()
      console.log('✅ Database pool closed')
    }

    clearTimeout(shutdownTimeout)
    console.log('✅ Graceful shutdown completed')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    clearTimeout(shutdownTimeout)
    process.exit(1)
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  // Don't exit in production, just log
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Exiting due to unhandled rejection in development')
    process.exit(1)
  }
})

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  gracefulShutdown('UNCAUGHT_EXCEPTION')
})

// Server startup
async function startServer() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection()
    if (!dbConnected && isProduction) {
      console.error('❌ Cannot start server without database connection in production')
      process.exit(1)
    }

    // Initialize MinIO
    await initializeMinIO()

    // Create HTTP app for redirect (in production with SSL)
    if (sslOptions && isProduction) {
      const httpApp = express()
      httpApp.use((req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`)
      })

      global.httpServer = http.createServer(httpApp)
      global.httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🔄 HTTP redirect server started on port ${PORT}`)
      })

      // Start HTTPS server
      global.httpsServer = https.createServer(sslOptions, app)
      global.httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🚀 HTTPS server started on port ${HTTPS_PORT}`)
      })
    } else {
      // Start HTTP server only (development or no SSL)
      global.httpServer = http.createServer(app)
      global.httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server started on port ${PORT}`)
        if (isProduction) {
          console.log('⚠️ Running in production without HTTPS')
        }
      })
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error)
  process.exit(1)
})

module.exports = app
