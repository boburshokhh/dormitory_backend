const express = require('express')
const { query } = require('../config/database')
const { authenticateToken } = require('../middleware/auth')
const filesController = require('../controllers/filesController')

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
        u.id, u.username, u.contact, u.contact_type, u.first_name, u.last_name, u.middle_name,
        u.birth_date, u.gender, u.region, u.address, u.phone, u.parent_phone, u.email,
        u.passport_series, u.passport_pinfl,
        u.course, u.group_id, u.student_id, u.is_profile_filled, u.role,
        u.created_at, u.updated_at, u.avatar_file_id,
        f.file_name as avatar_file_name, f.public_url as avatar_url
      FROM users u
      LEFT JOIN files f ON u.avatar_file_id = f.id AND f.status = 'active' AND f.deleted_at IS NULL
      WHERE u.id = $1
    `,
      [req.user.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' })
    }

    const profile = result.rows[0]

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
    console.error('❌ Ошибка обновления профиля:', error)
    console.error('🔍 Stack trace:', error.stack)

    res.status(500).json({
      error: 'Ошибка обновления профиля',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

// PUT /api/profile/avatar - Установить файл как аватар
router.put('/avatar', async (req, res) => {
  try {
    const { fileId } = req.body

    if (!fileId) {
      return res.status(400).json({
        error: 'ID файла обязателен',
      })
    }

    // Проверяем, что файл существует и принадлежит пользователю
    const fileResult = await query(
      `SELECT id, file_type, file_name FROM files 
       WHERE id = $1 AND user_id = $2 AND status = 'active' AND deleted_at IS NULL`,
      [fileId, req.user.id],
    )

    if (fileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Файл не найден или не принадлежит вам',
      })
    }

    const file = fileResult.rows[0]

    // Проверяем, что это фото
    if (file.file_type !== 'photo_3x4') {
      return res.status(400).json({
        error: 'Только фото 3x4 можно установить как аватар',
      })
    }

    // Обновляем профиль пользователя с avatar_file_id
    await query(`UPDATE users SET avatar_file_id = $1, updated_at = NOW() WHERE id = $2`, [
      fileId,
      req.user.id,
    ])

    res.json({
      message: 'Аватар успешно установлен',
      avatarFileId: fileId,
    })
  } catch (error) {
    console.error('❌ Ошибка установки аватара:', error)

    res.status(500).json({
      error: 'Ошибка установки аватара',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
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

    res.json({
      message: 'Профиль успешно отправлен! Теперь вы можете подавать заявку на место в общежитии.',
      profile_submitted: true,
    })
  } catch (error) {
    console.error('Ошибка отправки профиля:', error)

    res.status(500).json({ error: 'Ошибка отправки профиля' })
  }
})

// POST /api/profile/submit-with-files - Финальная отправка профиля с файлами
router.post(
  '/submit-with-files',
  filesController.getUploadMiddleware(),
  filesController.handleMulterError,
  async (req, res) => {
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

      const files = req.files

      // Валидация обязательных полей профиля
      const requiredFields = {
        first_name: 'Имя',
        last_name: 'Фамилия',
        middle_name: 'Отчество',
        birth_date: 'Дата рождения',
        gender: 'Пол',
        region: 'Регион',
        address: 'Адрес',
        phone: 'Телефон',
        parent_phone: 'Телефон родителя',
        passport_series: 'Серия паспорта',
        passport_pinfl: 'ПИНФЛ',
        course: 'Курс',
        group_id: 'Группа',
      }

      const missingFields = Object.keys(requiredFields).filter((field) => !req.body[field])

      if (missingFields.length > 0) {
        return res.status(400).json({
          error: 'Не заполнены обязательные поля',
          missingFields: missingFields.map((field) => requiredFields[field]),
        })
      }

      // Валидация файлов
      if (!files || files.length === 0) {
        return res.status(400).json({
          error: 'Необходимо загрузить файлы паспорта и фото',
        })
      }

      // Проверяем наличие паспорта и фото
      const fileTypes = Array.isArray(req.body.fileTypes)
        ? req.body.fileTypes
        : [req.body.fileTypes].filter(Boolean)

      const hasPassport = fileTypes.includes('passport')
      const hasPhoto = fileTypes.includes('photo_3x4')

      if (!hasPassport) {
        return res.status(400).json({
          error: 'Необходимо загрузить скан паспорта',
        })
      }

      if (!hasPhoto) {
        return res.status(400).json({
          error: 'Необходимо загрузить фото 3x4',
        })
      }

      // Проверяем, что профиль еще не заполнен
      const existingProfile = await query('SELECT is_profile_filled FROM users WHERE id = $1', [
        req.user.id,
      ])

      if (existingProfile.rows[0]?.is_profile_filled) {
        return res.status(400).json({
          error: 'Профиль уже был отправлен ранее',
        })
      }

      // Дополнительные валидации
      // Валидация даты рождения
      const birthDate = new Date(birth_date)
      const today = new Date()
      const age = today.getFullYear() - birthDate.getFullYear()

      if (age < 16 || age > 100) {
        return res.status(400).json({
          error: 'Возраст должен быть от 16 до 100 лет',
        })
      }

      // Валидация ПИНФЛ
      if (!/^[0-9]{14}$/.test(passport_pinfl)) {
        return res.status(400).json({
          error: 'ПИНФЛ должен содержать ровно 14 цифр',
        })
      }

      // Проверяем уникальность ПИНФЛ
      const existingUser = await query(
        'SELECT id FROM users WHERE passport_pinfl = $1 AND id != $2',
        [passport_pinfl, req.user.id],
      )

      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          error: 'Пользователь с таким ПИНФЛ уже существует',
        })
      }

      // Проверяем существование группы
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
      if (parseInt(course) !== parseInt(group.group_course)) {
        return res.status(400).json({
          error: `Выбранная группа относится к ${group.group_course} курсу, а не к ${course}`,
        })
      }

      // Начинаем транзакцию
      await query('BEGIN')

      try {
        // 1. Обновляем профиль пользователя
        const updateResult = await query(
          `
          UPDATE users 
          SET 
            first_name = $1, last_name = $2, middle_name = $3,
            birth_date = $4, gender = $5, region = $6, address = $7,
            phone = $8, parent_phone = $9, passport_series = $10,
            passport_pinfl = $11, course = $12, group_id = $13,
            student_id = $14, is_profile_filled = true, updated_at = NOW()
          WHERE id = $15
          RETURNING id, first_name, last_name, email
        `,
          [
            first_name.trim(),
            last_name.trim(),
            middle_name?.trim(),
            birth_date,
            gender,
            region?.trim(),
            address?.trim(),
            phone?.trim(),
            parent_phone?.trim(),
            passport_series?.trim(),
            passport_pinfl.trim(),
            course,
            group_id,
            student_id?.trim(),
            req.user.id,
          ],
        )

        if (updateResult.rows.length === 0) {
          throw new Error('Не удалось обновить профиль')
        }

        // 2. Загружаем файлы через файловый сервис
        const filesService = require('../services/filesService')

        // Создаем модифицированный массив файлов с правильными типами
        const filesWithTypes = files.map((file, index) => {
          const fileType = fileTypes[index] || 'document'
          return {
            ...file,
            fieldname: fileType, // Устанавливаем fieldname для правильного определения типа
          }
        })

        const { uploadResults, errors } = await filesService.uploadFiles(
          filesWithTypes,
          {
            relatedEntityType: 'profile',
            relatedEntityId: req.user.id,
          },
          req.user.id,
        )

        if (errors.length > 0) {
          throw new Error(`Ошибки загрузки файлов: ${errors.map((e) => e.error).join(', ')}`)
        }

        // 3. Активируем загруженные файлы
        const fileIds = uploadResults.map((result) => result.id)
        await filesService.activateFiles(fileIds, req.user.id, 'profile', req.user.id)

        // Коммитим транзакцию
        await query('COMMIT')

        res.json({
          success: true,
          message:
            'Профиль и файлы успешно загружены! Теперь вы можете подавать заявку на место в общежитии.',
          data: {
            profile: updateResult.rows[0],
            uploadedFiles: uploadResults,
            filesCount: uploadResults.length,
          },
        })
      } catch (innerError) {
        // Откатываем транзакцию при ошибке
        await query('ROLLBACK')
        throw innerError
      }
    } catch (error) {
      console.error('Ошибка отправки профиля с файлами:', error)

      res.status(500).json({
        error: 'Ошибка отправки профиля с файлами',
        details: error.message,
      })
    }
  },
)

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
