const jwt = require('jsonwebtoken')
const { query } = require('../config/database')

// Middleware для проверки аутентификации
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Токен доступа не предоставлен' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key')

    // Проверяем, существует ли пользователь в БД
    const result = await query(
      'SELECT id, username, contact, contact_type, role, is_verified FROM users WHERE id = $1',
      [decoded.id],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' })
    }

    const user = result.rows[0]

    if (!user.is_verified) {
      return res.status(401).json({ error: 'Аккаунт не подтвержден' })
    }

    req.user = user
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истёк' })
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Недействительный токен' })
    }

    console.error('Ошибка аутентификации:', error)
    return res.status(500).json({ error: 'Ошибка сервера при аутентификации' })
  }
}

// Middleware для проверки ролей
const requireRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется аутентификация' })
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Недостаточно прав доступа',
        required: roles,
        current: req.user.role,
      })
    }

    next()
  }
}

// Middleware для проверки админских прав
const requireAdmin = requireRoles('admin', 'super_admin')

// Middleware для проверки прав супер-админа
const requireSuperAdmin = requireRoles('super_admin')

// Middleware для проверки прав студента или выше
const requireStudent = requireRoles('student', 'admin', 'super_admin')

// Middleware для проверки доступа к собственным ресурсам
const requireOwnershipOrAdmin = (userIdField = 'student_id') => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется аутентификация' })
    }

    // Админы имеют доступ ко всем ресурсам
    if (['admin', 'super_admin'].includes(req.user.role)) {
      return next()
    }

    // Студенты могут работать только со своими ресурсами
    if (req.user.role === 'student') {
      const resourceUserId = req.params[userIdField] || req.body[userIdField]

      if (resourceUserId && resourceUserId !== req.user.id) {
        return res
          .status(403)
          .json({ error: 'Доступ запрещён: можно работать только со своими данными' })
      }
    }

    next()
  }
}

// Middleware для валидации UUID
const validateUUID = (paramName) => {
  return (req, res, next) => {
    const uuid = req.params[paramName]
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({ error: `Неверный формат ${paramName}` })
    }

    next()
  }
}

// Middleware для валидации documentId (специальный формат DOC-timestamp-uuid)
const validateDocumentId = (req, res, next) => {
  const documentId = req.params.documentId
  // Разрешаем любой непустой documentId для публичной верификации
  // Валидация формата будет происходить в контроллере с детальными сообщениями об ошибках
  if (!documentId || documentId.trim() === '') {
    return res.status(400).json({
      error: 'Неверный формат документа',
      message: 'ID документа не может быть пустым',
    })
  }

  next()
}

// Middleware для логирования действий администраторов
const logAdminAction = (action) => {
  return async (req, res, next) => {
    if (req.user && ['admin', 'super_admin'].includes(req.user.role)) {
      console.log(`🔑 Admin action: ${action}`, {
        user: req.user.username,
        contact: req.user.contact,
        role: req.user.role,
        ip: req.ip,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        body: req.method !== 'GET' ? req.body : undefined,
      })
    }
    next()
  }
}

// Генерация JWT токена
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET || 'your-secret-key',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h', // Увеличено до 24 часов
      issuer: 'gubkin-dormitory-system',
    },
  )
}

// Генерация refresh токена
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret',
    {
      expiresIn: '7d',
      issuer: 'gubkin-dormitory-system',
    },
  )
}

module.exports = {
  authenticateToken,
  requireRoles,
  requireAdmin,
  requireSuperAdmin,
  requireStudent,
  requireOwnershipOrAdmin,
  validateUUID,
  validateDocumentId,
  logAdminAction,
  generateToken,
  generateRefreshToken,
}
