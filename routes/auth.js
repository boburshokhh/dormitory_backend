const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { query, transaction } = require('../config/database')
const { authenticateToken } = require('../middleware/auth')
const notificationService = require('../services/notificationService')

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

    if (!result.success) {
      console.error('Ошибка отправки кода:', result.error)
      return res.status(500).json({ error: 'Ошибка отправки кода' })
    }

    // Сохраняем код в БД
    await query(
      `INSERT INTO verification_codes (contact, contact_type, code_hash, expires_at, ip_address, type) 
       VALUES ($1, $2, $3, $4, $5, 'registration')
       ON CONFLICT (contact, type) 
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

    const result = await transaction(async (client) => {
      // Проверяем код
      const codeResult = await client.query(
        `SELECT code_hash, contact_type, attempts, expires_at 
         FROM verification_codes 
         WHERE contact = $1 AND type = 'registration' AND expires_at > CURRENT_TIMESTAMP`,
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
          'UPDATE verification_codes SET attempts = attempts + 1 WHERE contact = $1 AND type = $2',
          [contact, 'registration'],
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
      await client.query('DELETE FROM verification_codes WHERE contact = $1 AND type = $2', [
        contact,
        'registration',
      ])

      // Логируем успешную регистрацию
      // await loggingService.logUserActivity({
      //   userId: user.id,
      //   actionType: 'register_success',
      //   actionDescription: 'User registered successfully',
      //   req,
      //   success: true,
      //   requestData: { username, contact, contactType: contact_type },
      // })

      // Генерируем токены
      const tokens = generateTokens(user)

      console.log(`✅ Новый пользователь зарегистрирован: ${username} (${contact})`)

      return {
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
      }
    })

    res.json(result)
  } catch (error) {
    console.error('Ошибка подтверждения регистрации:', error)
    res.status(400).json({ error: error.message || 'Ошибка регистрации' })
  }
})

// 3. ВХОД: Обычная аутентификация по логину/email и паролю
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Логин/email и пароль обязательны' })
    }

    // Упрощенная проверка rate limiting для логина - только базовая защита
    // (более строгие ограничения можно добавить позже при необходимости)

    // Ищем пользователя по username или email
    const userResult = await query(
      `SELECT id, username, password_hash, contact, contact_type, role, is_verified, created_at 
       FROM users 
       WHERE username = $1 OR contact = $1`,
      [username],
    )

    if (userResult.rows.length === 0) {
      // Записываем неудачную попытку
      await query(
        'INSERT INTO auth_attempts (ip_address, username, success) VALUES ($1, $2, false)',
        [req.ip, username],
      )

      // Логируем неудачную попытку входа
      // await loggingService.logUserActivity({
      //   userId: null,
      //   actionType: 'login_failed',
      //   actionDescription: 'Login failed - user not found',
      //   req,
      //   success: false,
      //   errorMessage: 'Неверный логин или пароль',
      //   requestData: { username },
      // })

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
      // await loggingService.logUserActivity({
      //   userId: user.id,
      //   actionType: 'login_failed',
      //   actionDescription: 'Login failed - wrong password',
      //   req,
      //   success: false,
      //   errorMessage: 'Неверный логин или пароль',
      //   requestData: { username },
      // })

      return res.status(401).json({ error: 'Неверный логин или пароль' })
    }

    // Записываем успешную попытку
    await query('INSERT INTO auth_attempts (ip_address, username, success) VALUES ($1, $2, true)', [
      req.ip,
      username,
    ])

    // Логируем успешный вход
    // await loggingService.logUserActivity({
    //   userId: user.id,
    //   actionType: 'login_success',
    //   actionDescription: 'User logged in successfully',
    //   req,
    //   success: true,
    //   requestData: { username },
    // })

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
      `SELECT u.id, u.username, u.contact, u.contact_type, u.role, u.is_verified, u.created_at, u.updated_at,
              u.first_name, u.last_name, u.middle_name, u.phone, u.email, u.student_id, u.group_name, u.course,
              f.file_name as avatar_file_name
       FROM users u
       LEFT JOIN files f ON u.avatar_file_id = f.id AND f.status = 'active' AND f.deleted_at IS NULL
       WHERE u.id = $1`,
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
      avatarFileName: user.avatar_file_name,
      // Добавляем ФИО и дополнительную информацию
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      phone: user.phone,
      email: user.email,
      studentId: user.student_id,
      groupName: user.group_name,
      course: user.course,
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
    // await loggingService.logUserActivity({
    //   userId: req.user.id,
    //   actionType: 'logout',
    //   actionDescription: 'User logged out',
    //   req,
    //   success: true,
    // })

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

// 7.1. Проверка существования email (для восстановления пароля)
router.get('/check-email', async (req, res) => {
  try {
    const { email } = req.query

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' })
    }

    // Простая валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }

    // Проверяем существование пользователя с таким email
    const userResult = await query('SELECT id FROM users WHERE contact = $1', [email])

    res.json({
      exists: userResult.rows.length > 0,
      message: userResult.rows.length > 0 ? 'Email найден' : 'Email не найден',
    })
  } catch (error) {
    console.error('Ошибка проверки email:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 7.2. Запрос сброса пароля по email (без аутентификации)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({ error: 'Email обязателен' })
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }

    // Проверяем существование пользователя
    const userResult = await query(
      'SELECT id, contact, contact_type FROM users WHERE contact = $1',
      [email],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' })
    }

    const user = userResult.rows[0]

    // Проверяем rate limiting
    const rateLimitCheck = await query('SELECT check_rate_limits($1, $2)', [
      req.ip,
      'forgot_password',
    ])

    if (!rateLimitCheck.rows[0].check_rate_limits) {
      return res.status(429).json({
        error: 'Слишком много запросов. Попробуйте через 2 минуты.',
        waitSeconds: 120,
      })
    }

    // Генерируем и отправляем код
    const { code, hashedCode, result } = await notificationService.sendVerificationCode(
      user.contact,
      user.contact_type,
    )

    if (!result.success) {
      console.error('Ошибка отправки кода восстановления пароля:', result.error)
      return res.status(500).json({ error: 'Ошибка отправки кода' })
    }

    console.log(`🔢 Код для восстановления пароля: ${code}, хэш: ${hashedCode}`)

    // Сохраняем код в БД
    await query(
      `INSERT INTO verification_codes (contact, contact_type, code_hash, expires_at, ip_address, type) 
       VALUES ($1, $2, $3, $4, $5, 'password_reset')
       ON CONFLICT (contact, type) 
       DO UPDATE SET 
         code_hash = EXCLUDED.code_hash, 
         expires_at = EXCLUDED.expires_at, 
         ip_address = EXCLUDED.ip_address,
         created_at = CURRENT_TIMESTAMP`,
      [
        user.contact,
        user.contact_type,
        hashedCode,
        new Date(Date.now() + parseInt(process.env.CODE_EXPIRY_MINUTES || 10) * 60000),
        req.ip,
      ],
    )

    console.log(`📧 Код восстановления пароля отправлен на ${user.contact}`)

    res.json({
      message: 'Код подтверждения отправлен на ваш email',
      contact: user.contact,
      contactType: user.contact_type,
      expiresIn: parseInt(process.env.CODE_EXPIRY_MINUTES || 10) * 60,
    })
  } catch (error) {
    console.error('Ошибка запроса восстановления пароля:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 7.3. Проверка кода для сброса пароля (без аутентификации)
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { code, email } = req.body

    if (!code || !email) {
      return res.status(400).json({ error: 'Код и email обязательны' })
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }

    // Проверяем существование пользователя
    const userResult = await query(
      'SELECT id, contact, contact_type FROM users WHERE contact = $1',
      [email],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' })
    }

    const user = userResult.rows[0]

    // Проверяем код
    const codeResult = await query(
      `SELECT code_hash, attempts, expires_at 
       FROM verification_codes 
       WHERE contact = $1 AND type = 'password_reset' AND expires_at > CURRENT_TIMESTAMP`,
      [user.contact],
    )

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Код не найден или истек' })
    }

    const codeData = codeResult.rows[0]

    // Проверяем количество попыток
    if (codeData.attempts >= 5) {
      return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' })
    }

    // Проверяем код
    const isValidCode = notificationService.verifyCode(code, codeData.code_hash)

    if (!isValidCode) {
      // Увеличиваем счетчик попыток
      await query(
        'UPDATE verification_codes SET attempts = attempts + 1 WHERE contact = $1 AND type = $2',
        [user.contact, 'password_reset'],
      )
      return res.status(400).json({ error: 'Неверный код' })
    }

    // Сбрасываем счетчик попыток при успешном вводе
    await query('UPDATE verification_codes SET attempts = 0 WHERE contact = $1 AND type = $2', [
      user.contact,
      'password_reset',
    ])

    console.log(`✅ Код подтвержден для сброса пароля пользователя ${user.contact}`)

    res.json({
      message: 'Код подтвержден',
      contact: user.contact,
      userId: user.id,
    })
  } catch (error) {
    console.error('Ошибка проверки кода сброса пароля:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 7.4. Установка нового пароля (без аутентификации)
router.post('/set-new-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, код и новый пароль обязательны' })
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }

    // Валидация пароля (такие же требования как при регистрации)
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' })
    }

    // Проверяем существование пользователя
    const userResult = await query(
      'SELECT id, contact, contact_type FROM users WHERE contact = $1',
      [email],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' })
    }

    const user = userResult.rows[0]

    // Проверяем код еще раз
    const codeResult = await query(
      `SELECT code_hash, attempts, expires_at 
       FROM verification_codes 
       WHERE contact = $1 AND type = 'password_reset' AND expires_at > CURRENT_TIMESTAMP`,
      [user.contact],
    )

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Код не найден или истек' })
    }

    const codeData = codeResult.rows[0]

    // Проверяем количество попыток
    if (codeData.attempts >= 5) {
      return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' })
    }

    // Проверяем код
    const isValidCode = notificationService.verifyCode(code, codeData.code_hash)

    if (!isValidCode) {
      return res.status(400).json({ error: 'Неверный код' })
    }

    // Хэшируем новый пароль
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || 12)
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds)

    // Обновляем пароль пользователя
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      user.id,
    ])

    // Удаляем использованный код
    await query('DELETE FROM verification_codes WHERE contact = $1 AND type = $2', [
      user.contact,
      'password_reset',
    ])

    console.log(`✅ Пароль успешно изменен для пользователя ${user.contact}`)

    res.json({
      message: 'Пароль успешно изменен',
      contact: user.contact,
    })
  } catch (error) {
    console.error('Ошибка установки нового пароля:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 7.5. Сброс пароля по коду (без аутентификации) - LEGACY
router.post('/reset-password-by-code', async (req, res) => {
  try {
    const { code, email } = req.body

    if (!code || !email) {
      return res.status(400).json({ error: 'Код и email обязательны' })
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' })
    }

    // Проверяем существование пользователя
    const userResult = await query(
      'SELECT id, contact, contact_type FROM users WHERE contact = $1',
      [email],
    )

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь с таким email не найден' })
    }

    const user = userResult.rows[0]

    // Проверяем код
    const codeResult = await query(
      `SELECT code_hash, attempts, expires_at 
       FROM verification_codes 
       WHERE contact = $1 AND type = 'password_reset' AND expires_at > CURRENT_TIMESTAMP`,
      [user.contact],
    )

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Код не найден или истек' })
    }

    const codeData = codeResult.rows[0]

    // Проверяем количество попыток
    if (codeData.attempts >= 5) {
      return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' })
    }

    // Проверяем код
    const isValidCode = notificationService.verifyCode(code, codeData.code_hash)

    if (!isValidCode) {
      // Увеличиваем счетчик попыток
      await query(
        'UPDATE verification_codes SET attempts = attempts + 1 WHERE contact = $1 AND type = $2',
        [user.contact, 'password_reset'],
      )
      return res.status(400).json({ error: 'Неверный код' })
    }

    // Сбрасываем счетчик попыток при успешном вводе
    await query('UPDATE verification_codes SET attempts = 0 WHERE contact = $1 AND type = $2', [
      user.contact,
      'password_reset',
    ])

    // Генерируем новый пароль
    const newPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4)
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Обновляем пароль пользователя
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashedPassword,
      user.id,
    ])

    // Удаляем использованный код
    await query('DELETE FROM verification_codes WHERE contact = $1 AND type = $2', [
      user.contact,
      'password_reset',
    ])

    // Отправляем новый пароль на email
    const emailResult = await notificationService.sendPasswordResetEmail(user.contact, newPassword)

    if (!emailResult.success) {
      console.error('Ошибка отправки нового пароля:', emailResult.error)
      return res.status(500).json({ error: 'Ошибка отправки нового пароля' })
    }

    console.log(`✅ Пароль успешно сброшен для пользователя ${user.contact}`)

    res.json({
      message: 'Новый пароль отправлен на ваш email',
      contact: user.contact,
    })
  } catch (error) {
    console.error('Ошибка сброса пароля:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

// 8. Изменение username
router.put('/change-username', authenticateToken, async (req, res) => {
  try {
    const { newUsername, password } = req.body

    if (!newUsername || !password) {
      return res.status(400).json({ error: 'Новый логин и пароль обязательны' })
    }

    // Валидация нового username
    if (newUsername.length < 3 || newUsername.length > 50) {
      return res.status(400).json({ error: 'Логин должен содержать от 3 до 50 символов' })
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
      return res.status(400).json({ error: 'Логин может содержать только буквы, цифры, _ и -' })
    }

    // Проверяем текущий пароль
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash)

    if (!isValidPassword) {
      return res.status(400).json({ error: 'Неверный пароль' })
    }

    // Проверяем уникальность нового username
    const usernameCheck = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [
      newUsername,
      req.user.id,
    ])

    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Этот логин уже занят' })
    }

    // Обновляем username
    await query('UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2', [
      newUsername,
      req.user.id,
    ])

    console.log(`✅ Пользователь ${req.user.username} изменил логин на: ${newUsername}`)

    res.json({
      message: 'Логин успешно изменен',
      newUsername,
    })
  } catch (error) {
    console.error('Ошибка изменения логина:', error)
    res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
})

module.exports = router
