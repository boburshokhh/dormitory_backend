const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { query, transaction } = require('../config/database')
const notificationService = require('../services/notificationService')
const loggingService = require('../services/loggingService')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// Вспомогательные функции
function generateTokens(user) {
  const payload = {
    id: user.id,
    username: user.username,
    contact: user.contact,
    role: user.role,
  }

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h', // Увеличено до 24 часов
  })

  const refreshToken = jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  })

  return { accessToken, refreshToken }
}

// 1. РЕГИСТРАЦИЯ: Запрос кода подтверждения для регистрации
router.post('/register-request', async (req, res) => {
  try {
    const { contact } = req.body

    if (!contact) {
      return res.status(400).json({ error: 'Контакт обязателен' })
    }

    // Определяем тип контакта и валидируем
    const contactInfo = notificationService.detectContactType(contact)
    if (!contactInfo) {
      return res.status(400).json({ error: 'Неверный формат email или телефона' })
    }

    const { type: contactType, normalized: normalizedContact } = contactInfo

    // Проверяем, что пользователь с таким контактом не существует
    const existingUser = await query('SELECT id FROM users WHERE contact = $1', [normalizedContact])

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: 'Пользователь с таким контактом уже существует. Используйте вход в систему.',
      })
    }

    // Проверяем rate limiting через PostgreSQL функцию
    const rateLimitCheck = await query('SELECT check_rate_limits($1, $2)', [req.ip, 'request_code'])

    if (!rateLimitCheck.rows[0].check_rate_limits) {
      return res.status(429).json({
        error: 'Слишком много запросов. Попробуйте позже.',
        waitSeconds: 60,
      })
    }

    // Генерируем и отправляем код
    const { code, hashedCode, result } = await notificationService.sendVerificationCode(
      normalizedContact,
      contactType,
    )

    // Логируем отправку кода подтверждения
    await loggingService.logVerificationCode({
      contact: normalizedContact,
      contactType,
      actionType: 'verification_code_sent',
      success: result.success,
      errorMessage: result.success ? null : result.error,
      req,
    })

    if (!result.success) {
      console.error('Ошибка отправки кода:', result.error)
      return res.status(500).json({ error: 'Ошибка отправки кода' })
    }

    // Сохраняем код в БД
    await query(
      `INSERT INTO verification_codes (contact, contact_type, code_hash, expires_at, ip_address) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (contact) 
       DO UPDATE SET 
         code_hash = EXCLUDED.code_hash, 
         expires_at = EXCLUDED.expires_at, 
         ip_address = EXCLUDED.ip_address,
         created_at = CURRENT_TIMESTAMP`,
      [
        normalizedContact,
        contactType,
        hashedCode,
        new Date(Date.now() + parseInt(process.env.CODE_EXPIRY_MINUTES || 10) * 60000),
        req.ip,
      ],
    )

    console.log(`📧 Код регистрации отправлен на ${normalizedContact}`)

    res.json({
      message: 'Код подтверждения отправлен',
      contact: normalizedContact,
      contactType,
      expiresIn: parseInt(process.env.CODE_EXPIRY_MINUTES || 10) * 60,
    })
  } catch (error) {
    console.error('Ошибка запроса кода регистрации:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 2. РЕГИСТРАЦИЯ: Подтверждение кода и создание аккаунта
router.post('/register-verify', async (req, res) => {
  try {
    const { contact, code, username, password } = req.body

    if (!contact || !code || !username || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' })
    }

    // Валидация пароля
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' })
    }

    // Валидация username
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Логин должен содержать от 3 до 50 символов' })
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Логин может содержать только буквы, цифры, _ и -' })
    }

    await transaction(async (client) => {
      // Проверяем код
      const codeResult = await client.query(
        `SELECT code_hash, contact_type, attempts, expires_at 
         FROM verification_codes 
         WHERE contact = $1 AND expires_at > CURRENT_TIMESTAMP`,
        [contact],
      )

      if (codeResult.rows.length === 0) {
        throw new Error('Код не найден или истёк')
      }

      const { code_hash, contact_type, attempts } = codeResult.rows[0]

      // Проверяем количество попыток
      if (attempts >= parseInt(process.env.MAX_CODE_ATTEMPTS || 5)) {
        throw new Error('Превышено количество попыток ввода кода')
      }

      // Проверяем код
      const isValidCode = notificationService.verifyCode(code, code_hash)

      if (!isValidCode) {
        // Увеличиваем счетчик попыток
        await client.query(
          'UPDATE verification_codes SET attempts = attempts + 1 WHERE contact = $1',
          [contact],
        )
        throw new Error('Неверный код')
      }

      // Проверяем уникальность username
      const usernameCheck = await client.query('SELECT id FROM users WHERE username = $1', [
        username,
      ])

      if (usernameCheck.rows.length > 0) {
        throw new Error('Логин уже занят')
      }

      // Хэшируем пароль
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || 12)
      const passwordHash = await bcrypt.hash(password, saltRounds)

      // Создаем пользователя
      const userResult = await client.query(
        `INSERT INTO users (username, password_hash, contact, contact_type, is_verified, role) 
         VALUES ($1, $2, $3, $4, true, 'student') 
         RETURNING id, username, contact, contact_type, role, created_at`,
        [username, passwordHash, contact, contact_type],
      )

      const user = userResult.rows[0]

      // Удаляем использованный код
      await client.query('DELETE FROM verification_codes WHERE contact = $1', [contact])

      // Логируем успешную регистрацию
      await loggingService.logUserActivity({
        userId: user.id,
        actionType: 'register_success',
        actionDescription: 'User registered successfully',
        req,
        success: true,
        requestData: { username, contact, contactType: contact_type },
      })

      // Генерируем токены
      const tokens = generateTokens(user)

      console.log(`✅ Новый пользователь зарегистрирован: ${username} (${contact})`)

      return res.json({
        message: 'Регистрация завершена успешно',
        user: {
          id: user.id,
          username: user.username,
          contact: user.contact,
          contactType: user.contact_type,
          role: user.role,
          isVerified: true,
          createdAt: user.created_at,
        },
        tokens,
        isNewUser: true,
      })
    })
  } catch (error) {
    console.error('Ошибка подтверждения регистрации:', error)
    res.status(400).json({ error: error.message || 'Ошибка регистрации' })
  }
})

// 3. ВХОД: Обычная аутентификация по логину и паролю
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' })
    }

    // Упрощенная проверка rate limiting для логина - только базовая защита
    // (более строгие ограничения можно добавить позже при необходимости)

    // Ищем пользователя
    const userResult = await query(
      `SELECT id, username, password_hash, contact, contact_type, role, is_verified, created_at 
       FROM users 
       WHERE username = $1`,
      [username],
    )

    if (userResult.rows.length === 0) {
      // Записываем неудачную попытку
      await query(
        'INSERT INTO auth_attempts (ip_address, username, success) VALUES ($1, $2, false)',
        [req.ip, username],
      )

      // Логируем неудачную попытку входа
      await loggingService.logUserActivity({
        userId: null,
        actionType: 'login_failed',
        actionDescription: 'Login failed - user not found',
        req,
        success: false,
        errorMessage: 'Неверный логин или пароль',
        requestData: { username },
      })

      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }

    const user = userResult.rows[0]

    // Проверяем пароль
    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      // Записываем неудачную попытку
      await query(
        'INSERT INTO auth_attempts (ip_address, username, success) VALUES ($1, $2, false)',
        [req.ip, username],
      )

      // Логируем неудачную попытку входа
      await loggingService.logUserActivity({
        userId: user.id,
        actionType: 'login_failed',
        actionDescription: 'Login failed - wrong password',
        req,
        success: false,
        errorMessage: 'Неверный логин или пароль',
        requestData: { username },
      })

      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }

    // Записываем успешную попытку
    await query('INSERT INTO auth_attempts (ip_address, username, success) VALUES ($1, $2, true)', [
      req.ip,
      username,
    ])

    // Логируем успешный вход
    await loggingService.logUserActivity({
      userId: user.id,
      actionType: 'login_success',
      actionDescription: 'User logged in successfully',
      req,
      success: true,
      requestData: { username },
    })

    // Генерируем токены
    const tokens = generateTokens(user)

    console.log(`✅ Пользователь вошел в систему: ${username}`)

    res.json({
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        username: user.username,
        contact: user.contact,
        contactType: user.contact_type,
        role: user.role,
        isVerified: user.is_verified,
        createdAt: user.created_at,
      },
      tokens,
      isNewUser: false,
    })
  } catch (error) {
    console.error('Ошибка входа:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 4. Получение информации о текущем пользователе
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT id, username, contact, contact_type, role, is_verified, created_at, updated_at
       FROM users 
       WHERE id = $1`,
      [req.user.id],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const user = userResult.rows[0]

    res.json({
      id: user.id,
      username: user.username,
      contact: user.contact,
      contactType: user.contact_type,
      role: user.role,
      isVerified: user.is_verified,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    })
  } catch (error) {
    console.error('Ошибка получения пользователя:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 5. Обновление токена
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token обязателен' })
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET)

    // Получаем актуальные данные пользователя
    const userResult = await query(
      'SELECT id, username, contact, contact_type, role FROM users WHERE id = $1',
      [decoded.id],
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' })
    }

    const user = userResult.rows[0]
    const tokens = generateTokens(user)

    res.json({ tokens })
  } catch (error) {
    console.error('Ошибка обновления токена:', error)
    res.status(401).json({ error: 'Неверный refresh token' })
  }
})

// 6. Выход из системы
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Логируем выход из системы
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'logout',
      actionDescription: 'User logged out',
      req,
      success: true,
    })

    // В будущем здесь можно добавить blacklist токенов
    console.log(`👋 Пользователь ${req.user.username} вышел из системы`)

    res.json({ message: 'Выход выполнен успешно' })
  } catch (error) {
    console.error('Ошибка выхода:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 7. Проверка доступности username
router.get('/check-username', async (req, res) => {
  try {
    const { username } = req.query

    if (!username) {
      return res.status(400).json({ error: 'Логин обязателен' })
    }

    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({
        available: false,
        error: 'Логин должен содержать от 3 до 50 символов',
      })
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({
        available: false,
        error: 'Логин может содержать только буквы, цифры, _ и -',
      })
    }

    const result = await query('SELECT check_username_unique($1)', [username])
    const available = result.rows[0].check_username_unique

    res.json({
      available,
      message: available ? 'Логин доступен' : 'Логин уже занят',
    })
  } catch (error) {
    console.error('Ошибка проверки логина:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

module.exports = router
