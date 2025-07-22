const express = require('express')
const { query } = require('../config/database')
const { authenticateToken } = require('../middleware/auth')
const loggingService = require('../services/loggingService')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/profile - Получить профиль текущего пользователя
router.get('/', async (req, res) => {
  try {
    // Получаем данные пользователя напрямую из таблицы users
    const result = await query(
      `
      SELECT 
        id, username, contact, contact_type, first_name, last_name, middle_name,
        birth_date, gender, region, address, phone, parent_phone, email,
        passport_series, passport_pinfl,
        course, group_id, student_id, is_profile_filled, role,
        created_at, updated_at
      FROM users 
      WHERE id = $1
    `,
      [req.user.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const profile = result.rows[0]

    // Вычисляем процент заполнения профиля для студентов
    let profileCompletionPercentage = 100
    if (profile.role === 'student') {
      const fields = [
        'first_name',
        'last_name',
        'middle_name',
        'birth_date',
        'gender',
        'region',
        'address',
        'phone',
        'parent_phone',
        'passport_series',
        'passport_pinfl',
        'course',
        'group_id',
      ]

      const filledFields = fields.filter((field) => profile[field])
      profileCompletionPercentage = Math.round((filledFields.length / fields.length) * 100)
    }

    // Получаем информацию о группе, если она выбрана
    let groupInfo = null
    if (profile.group_id) {
      const groupResult = await query(
        'SELECT id, name, course, faculty FROM groups WHERE id = $1',
        [profile.group_id],
      )
      if (groupResult.rows.length > 0) {
        groupInfo = groupResult.rows[0]
      }
    }

    res.json({
      profile: {
        ...profile,
        group: groupInfo,
        profile_completion_percentage: profileCompletionPercentage,
        birth_date: profile.birth_date ? profile.birth_date.toISOString().split('T')[0] : null,
      },
    })
  } catch (error) {
    console.error('Ошибка получения профиля:', error)
    res.status(500).json({ error: 'Ошибка получения профиля' })
  }
})

// ОТКЛЮЧЕННЫЕ РОУТЫ ДЛЯ УПРОЩЕНИЯ СИСТЕМЫ
// Эти роуты больше не используются после упрощения интерфейса

// POST /api/profile/files - УДАЛЕН, теперь используется /api/files/upload
// DELETE /api/profile/file/:type - УДАЛЕН, теперь используется /api/files/:id

// PUT /api/profile - Общее обновление профиля (ОСНОВНОЙ РОУТ ДЛЯ УПРОЩЕННОЙ СИСТЕМЫ)
router.put('/', async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      middle_name,
      birth_date,
      gender,
      region,
      address,
      phone,
      parent_phone,
      passport_series,
      passport_pinfl,
      course,
      group_id,
      student_id,
    } = req.body

    // Валидация обязательных полей
    if (!first_name || !last_name) {
      return res.status(400).json({
        error: 'Имя и фамилия обязательны',
      })
    }

    // Валидация даты рождения (если указана)
    if (birth_date) {
      const birthDate = new Date(birth_date)
      const today = new Date()
      const age = today.getFullYear() - birthDate.getFullYear()

      if (age < 16 || age > 100) {
        return res.status(400).json({
          error: 'Возраст должен быть от 16 до 100 лет',
        })
      }
    }

    // Валидация пола (если указан)
    if (gender && !['male', 'female'].includes(gender)) {
      return res.status(400).json({
        error: 'Указан неверный пол',
      })
    }

    // Валидация телефонов
    const phoneRegex = /^\+?[0-9\-\s()]+$/
    if (phone && !phoneRegex.test(phone)) {
      return res.status(400).json({
        error: 'Неверный формат номера телефона',
      })
    }

    if (parent_phone && !phoneRegex.test(parent_phone)) {
      return res.status(400).json({
        error: 'Неверный формат номера телефона родителя',
      })
    }

    // Валидация ПИНФЛ (если указан)
    if (passport_pinfl && !/^[0-9]{14}$/.test(passport_pinfl)) {
      return res.status(400).json({
        error: 'ПИНФЛ должен содержать ровно 14 цифр',
      })
    }

    // Проверяем уникальность ПИНФЛ (если указан)
    if (passport_pinfl) {
      const existingUser = await query(
        'SELECT id FROM users WHERE passport_pinfl = $1 AND id != $2',
        [passport_pinfl, req.user.id],
      )

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: 'Пользователь с таким ПИНФЛ уже существует',
        })
      }
    }

    // Валидация курса (если указан)
    if (course && (course < 1 || course > 5)) {
      return res.status(400).json({
        error: 'Курс должен быть от 1 до 5',
      })
    }

    // Проверяем существование группы (если указана)
    if (group_id) {
      const groupResult = await query(
        'SELECT id, name, course as group_course FROM groups WHERE id = $1 AND is_active = true',
        [group_id],
      )

      if (groupResult.rows.length === 0) {
        return res.status(400).json({
          error: 'Выбранная группа не найдена или неактивна',
        })
      }

      const group = groupResult.rows[0]

      // Проверяем соответствие курса и группы
      if (course && parseInt(course) !== parseInt(group.group_course)) {
        return res.status(400).json({
          error: `Выбранная группа относится к ${group.group_course} курсу, а не к ${course}`,
        })
      }
    }

    // Строим динамический запрос для обновления только переданных полей
    const updates = []
    const params = []
    let paramIndex = 1

    if (first_name !== undefined) {
      updates.push(`first_name = $${paramIndex}`)
      params.push(first_name.trim())
      paramIndex++
    }

    if (last_name !== undefined) {
      updates.push(`last_name = $${paramIndex}`)
      params.push(last_name.trim())
      paramIndex++
    }

    if (middle_name !== undefined) {
      updates.push(`middle_name = $${paramIndex}`)
      params.push(middle_name?.trim() || null)
      paramIndex++
    }

    if (birth_date !== undefined) {
      updates.push(`birth_date = $${paramIndex}`)
      params.push(birth_date || null)
      paramIndex++
    }

    if (gender !== undefined) {
      updates.push(`gender = $${paramIndex}`)
      params.push(gender || null)
      paramIndex++
    }

    if (region !== undefined) {
      updates.push(`region = $${paramIndex}`)
      params.push(region?.trim() || null)
      paramIndex++
    }

    if (address !== undefined) {
      updates.push(`address = $${paramIndex}`)
      params.push(address?.trim() || null)
      paramIndex++
    }

    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex}`)
      params.push(phone?.trim() || null)
      paramIndex++
    }

    if (parent_phone !== undefined) {
      updates.push(`parent_phone = $${paramIndex}`)
      params.push(parent_phone?.trim() || null)
      paramIndex++
    }

    if (passport_series !== undefined) {
      updates.push(`passport_series = $${paramIndex}`)
      params.push(passport_series?.trim() || null)
      paramIndex++
    }

    if (passport_pinfl !== undefined) {
      updates.push(`passport_pinfl = $${paramIndex}`)
      params.push(passport_pinfl?.trim() || null)
      paramIndex++
    }

    if (course !== undefined) {
      updates.push(`course = $${paramIndex}`)
      params.push(course || null)
      paramIndex++
    }

    if (group_id !== undefined) {
      updates.push(`group_id = $${paramIndex}`)
      params.push(group_id || null)
      paramIndex++
    }

    if (student_id !== undefined) {
      updates.push(`student_id = $${paramIndex}`)
      params.push(student_id?.trim() || null)
      paramIndex++
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Не указаны данные для обновления' })
    }

    updates.push(`updated_at = NOW()`)
    params.push(req.user.id)

    const queryStr = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, username, contact, contact_type, first_name, last_name, middle_name,
                birth_date, gender, region, address, phone, parent_phone, email,
                passport_series, passport_pinfl,
                course, group_id, student_id, is_profile_filled, role,
                created_at, updated_at
    `

    const result = await query(queryStr, params)

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const updatedProfile = result.rows[0]

    // Получаем информацию о группе, если она выбрана
    let groupInfo = null
    if (updatedProfile.group_id) {
      const groupResult = await query(
        'SELECT id, name, course, faculty FROM groups WHERE id = $1',
        [updatedProfile.group_id],
      )
      if (groupResult.rows.length > 0) {
        groupInfo = groupResult.rows[0]
      }
    }

    // Логируем обновление профиля
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'profile_update',
      actionDescription: 'User updated profile information',
      req,
      success: true,
      requestData: { updatedFields: Object.keys(req.body) },
    })

    res.json({
      message: 'Профиль успешно обновлен',
      profile: {
        ...updatedProfile,
        group: groupInfo,
        birth_date: updatedProfile.birth_date
          ? updatedProfile.birth_date.toISOString().split('T')[0]
          : null,
      },
    })
  } catch (error) {
    console.error('Ошибка обновления профиля:', error)

    // Логируем ошибку обновления профиля
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'profile_update',
      actionDescription: 'Failed to update profile information',
      req,
      success: false,
      errorMessage: error.message,
      requestData: { updatedFields: Object.keys(req.body) },
    })

    res.status(500).json({ error: 'Ошибка обновления профиля' })
  }
})

// POST /api/profile/submit - Финальная отправка заполненного профиля
router.post('/submit', async (req, res) => {
  try {
    // Получаем текущий профиль пользователя
    const profileResult = await query(
      `
      SELECT 
        first_name, last_name, middle_name, birth_date, gender, 
        region, address, phone, parent_phone, email,
        passport_series, passport_pinfl,
        course, group_id, is_profile_filled
      FROM users 
      WHERE id = $1 AND role = 'student'
    `,
      [req.user.id],
    )

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Профиль студента не найден' })
    }

    const profile = profileResult.rows[0]

    // Проверяем заполненность всех обязательных полей
    const requiredFields = [
      'first_name',
      'last_name',
      'middle_name',
      'birth_date',
      'gender',
      'region',
      'address',
      'phone',
      'parent_phone',
      'passport_series',
      'passport_pinfl',
      'course',
      'group_id',
    ]

    const missingFields = requiredFields.filter((field) => !profile[field])

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Не заполнены все обязательные поля',
        missingFields,
      })
    }

    // Если профиль уже был отправлен ранее
    if (profile.is_profile_filled) {
      return res.status(400).json({
        error: 'Профиль уже был отправлен ранее',
      })
    }

    // Отмечаем профиль как заполненный
    await query(
      `
      UPDATE users 
      SET is_profile_filled = true, updated_at = NOW()
      WHERE id = $1
    `,
      [req.user.id],
    )

    // Логируем отправку профиля
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'profile_submit',
      actionDescription: 'User submitted completed profile',
      req,
      success: true,
    })

    res.json({
      message: 'Профиль успешно отправлен! Теперь вы можете подавать заявку на место в общежитии.',
      profile_submitted: true,
    })
  } catch (error) {
    console.error('Ошибка отправки профиля:', error)

    // Логируем ошибку отправки профиля
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'profile_submit',
      actionDescription: 'Failed to submit profile',
      req,
      success: false,
      errorMessage: error.message,
    })

    res.status(500).json({ error: 'Ошибка отправки профиля' })
  }
})

// GET /api/profile/regions - Получить список регионов для выбора
router.get('/regions', async (req, res) => {
  try {
    // Статичный список регионов Узбекистана
    const regions = [
      'Андижанская область',
      'Бухарская область',
      'Джизакская область',
      'Кашкадарьинская область',
      'Навоийская область',
      'Наманганская область',
      'Самаркандская область',
      'Сурхандарьинская область',
      'Сырдарьинская область',
      'Ташкентская область',
      'Ферганская область',
      'Хорезмская область',
      'Республика Каракалпакстан',
      'г. Ташкент',
    ]

    res.json({ regions })
  } catch (error) {
    console.error('Ошибка получения списка регионов:', error)
    res.status(500).json({ error: 'Ошибка получения данных' })
  }
})

module.exports = router
