const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireAdmin } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/groups - Получить все группы (доступно всем авторизованным пользователям)
router.get('/', async (req, res) => {
  try {
    const { course, faculty, active_only = 'true' } = req.query

    let queryStr = `
      SELECT 
        g.*,
        COUNT(u.id) as current_student_count
      FROM groups g
      LEFT JOIN users u ON g.id = u.group_id AND u.role = 'student' AND u.is_active = true
      WHERE 1=1
    `

    const params = []
    let paramIndex = 1

    // Фильтрация по активности
    if (active_only === 'true') {
      queryStr += ` AND g.is_active = true`
    }

    // Фильтрация по курсу
    if (course) {
      queryStr += ` AND g.course = $${paramIndex}`
      params.push(parseInt(course))
      paramIndex++
    }

    // Фильтрация по факультету
    if (faculty) {
      queryStr += ` AND g.faculty ILIKE $${paramIndex}`
      params.push(`%${faculty}%`)
      paramIndex++
    }

    queryStr += `
      GROUP BY g.id
      ORDER BY g.course, g.name
    `

    const result = await query(queryStr, params)

    const groups = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      course: row.course,
      faculty: row.faculty,
      speciality: row.speciality,
      description: row.description,
      studentCount: parseInt(row.current_student_count) || 0,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    res.json({ groups })
  } catch (error) {
    console.error('Ошибка получения групп:', error)
    res.status(500).json({ error: 'Ошибка получения данных групп' })
  }
})

// GET /api/groups/:id - Получить группу по ID с детальной информацией
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Получаем информацию о группе
    const groupResult = await query(
      `
      SELECT g.*, COUNT(u.id) as current_student_count
      FROM groups g
      LEFT JOIN users u ON g.id = u.group_id AND u.role = 'student' AND u.is_active = true
      WHERE g.id = $1
      GROUP BY g.id
    `,
      [id],
    )

    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' })
    }

    const group = groupResult.rows[0]

    // Получаем список студентов в группе (только для админов)
    let students = []
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      const studentsResult = await query(
        `
        SELECT 
          id, 
          first_name, 
          last_name, 
          middle_name, 
          email, 
          student_id,
          course,
          is_active,
          created_at
        FROM users 
        WHERE group_id = $1 AND role = 'student'
        ORDER BY last_name, first_name
      `,
        [id],
      )

      students = studentsResult.rows
    }

    res.json({
      group: {
        id: group.id,
        name: group.name,
        course: group.course,
        faculty: group.faculty,
        speciality: group.speciality,
        description: group.description,
        studentCount: parseInt(group.current_student_count) || 0,
        isActive: group.is_active,
        createdAt: group.created_at,
        updatedAt: group.updated_at,
        students,
      },
    })
  } catch (error) {
    console.error('Ошибка получения группы:', error)
    res.status(500).json({ error: 'Ошибка получения данных группы' })
  }
})

// POST /api/groups - Создать новую группу (только для админов)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, course, faculty, speciality, description } = req.body

    // Валидация обязательных полей
    if (!name || !course) {
      return res.status(400).json({
        error: 'Название группы и курс обязательны',
      })
    }

    // Валидация курса
    if (course < 1 || course > 5) {
      return res.status(400).json({
        error: 'Курс должен быть от 1 до 5',
      })
    }

    // Проверяем уникальность названия группы
    const existingGroup = await query('SELECT id FROM groups WHERE name = $1', [name.trim()])

    if (existingGroup.rows.length > 0) {
      return res.status(400).json({
        error: 'Группа с таким названием уже существует',
      })
    }

    // Создаем группу
    const result = await query(
      `
      INSERT INTO groups (name, course, faculty, speciality, description)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
      [
        name.trim(),
        course,
        faculty?.trim() || 'Не указан',
        speciality?.trim() || null,
        description?.trim() || null,
      ],
    )

    const newGroup = result.rows[0]

    res.status(201).json({
      message: 'Группа успешно создана',
      group: {
        id: newGroup.id,
        name: newGroup.name,
        course: newGroup.course,
        faculty: newGroup.faculty,
        speciality: newGroup.speciality,
        description: newGroup.description,
        studentCount: 0,
        isActive: newGroup.is_active,
        createdAt: newGroup.created_at,
        updatedAt: newGroup.updated_at,
      },
    })
  } catch (error) {
    console.error('Ошибка создания группы:', error)
    res.status(500).json({ error: 'Ошибка создания группы' })
  }
})

// PUT /api/groups/:id - Обновить группу (только для админов)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, course, faculty, speciality, description, isActive } = req.body

    // Проверяем существование группы
    const existingGroup = await query('SELECT * FROM groups WHERE id = $1', [id])
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' })
    }

    // Валидация обязательных полей
    if (!name || !course) {
      return res.status(400).json({
        error: 'Название группы и курс обязательны',
      })
    }

    // Валидация курса
    if (course < 1 || course > 5) {
      return res.status(400).json({
        error: 'Курс должен быть от 1 до 5',
      })
    }

    // Проверяем уникальность названия группы (исключая текущую)
    const duplicateGroup = await query('SELECT id FROM groups WHERE name = $1 AND id != $2', [
      name.trim(),
      id,
    ])

    if (duplicateGroup.rows.length > 0) {
      return res.status(400).json({
        error: 'Группа с таким названием уже существует',
      })
    }

    // Обновляем группу
    const result = await query(
      `
      UPDATE groups 
      SET name = $1, course = $2, faculty = $3, speciality = $4, 
          description = $5, is_active = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `,
      [
        name.trim(),
        course,
        faculty?.trim() || 'Не указан',
        speciality?.trim() || null,
        description?.trim() || null,
        isActive !== undefined ? isActive : true,
        id,
      ],
    )

    const updatedGroup = result.rows[0]

    // Получаем актуальное количество студентов
    const studentCountResult = await query(
      `
      SELECT COUNT(*) as count 
      FROM users 
      WHERE group_id = $1 AND role = 'student' AND is_active = true
    `,
      [id],
    )

    res.json({
      message: 'Группа успешно обновлена',
      group: {
        id: updatedGroup.id,
        name: updatedGroup.name,
        course: updatedGroup.course,
        faculty: updatedGroup.faculty,
        speciality: updatedGroup.speciality,
        description: updatedGroup.description,
        studentCount: parseInt(studentCountResult.rows[0].count) || 0,
        isActive: updatedGroup.is_active,
        createdAt: updatedGroup.created_at,
        updatedAt: updatedGroup.updated_at,
      },
    })
  } catch (error) {
    console.error('Ошибка обновления группы:', error)
    res.status(500).json({ error: 'Ошибка обновления группы' })
  }
})

// DELETE /api/groups/:id - Удалить группу (только для суперадминов)
router.delete('/:id', async (req, res) => {
  try {
    // Проверяем права доступа (только для суперадминов)
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Недостаточно прав для удаления группы' })
    }

    const { id } = req.params

    // Проверяем существование группы
    const existingGroup = await query('SELECT * FROM groups WHERE id = $1', [id])
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' })
    }

    // Проверяем, есть ли студенты в группе
    const studentCount = await query('SELECT COUNT(*) as count FROM users WHERE group_id = $1', [
      id,
    ])

    if (parseInt(studentCount.rows[0].count) > 0) {
      return res.status(400).json({
        error:
          'Нельзя удалить группу, в которой есть студенты. Сначала переведите или удалите студентов.',
      })
    }

    // Удаляем группу
    await query('DELETE FROM groups WHERE id = $1', [id])

    res.json({
      message: 'Группа успешно удалена',
    })
  } catch (error) {
    console.error('Ошибка удаления группы:', error)
    res.status(500).json({ error: 'Ошибка удаления группы' })
  }
})

// POST /api/groups/:id/deactivate - Деактивировать группу (для админов)
router.post('/:id/deactivate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Проверяем существование группы
    const existingGroup = await query('SELECT * FROM groups WHERE id = $1', [id])
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' })
    }

    // Деактивируем группу
    await query(
      `
      UPDATE groups 
      SET is_active = false, updated_at = NOW()
      WHERE id = $1
    `,
      [id],
    )

    res.json({
      message: 'Группа успешно деактивирована',
    })
  } catch (error) {
    console.error('Ошибка деактивации группы:', error)
    res.status(500).json({ error: 'Ошибка деактивации группы' })
  }
})

// POST /api/groups/:id/activate - Активировать группу (для админов)
router.post('/:id/activate', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Проверяем существование группы
    const existingGroup = await query('SELECT * FROM groups WHERE id = $1', [id])
    if (existingGroup.rows.length === 0) {
      return res.status(404).json({ error: 'Группа не найдена' })
    }

    // Активируем группу
    await query(
      `
      UPDATE groups 
      SET is_active = true, updated_at = NOW()
      WHERE id = $1
    `,
      [id],
    )

    res.json({
      message: 'Группа успешно активирована',
    })
  } catch (error) {
    console.error('Ошибка активации группы:', error)
    res.status(500).json({ error: 'Ошибка активации группы' })
  }
})

// GET /api/groups/stats/summary - Получить статистику по группам (для админов)
router.get('/stats/summary', requireAdmin, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        COUNT(*) as total_groups,
        COUNT(*) FILTER (WHERE is_active = true) as active_groups,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_groups,
        SUM(student_count) as total_students,
        AVG(student_count) as avg_students_per_group
      FROM groups
    `)

    const courseStats = await query(`
      SELECT 
        course,
        COUNT(*) as group_count,
        SUM(student_count) as student_count
      FROM groups 
      WHERE is_active = true
      GROUP BY course
      ORDER BY course
    `)

    const facultyStats = await query(`
      SELECT 
        faculty,
        COUNT(*) as group_count,
        SUM(student_count) as student_count
      FROM groups 
      WHERE is_active = true
      GROUP BY faculty
      ORDER BY student_count DESC
    `)

    const stats = result.rows[0]

    res.json({
      summary: {
        totalGroups: parseInt(stats.total_groups) || 0,
        activeGroups: parseInt(stats.active_groups) || 0,
        inactiveGroups: parseInt(stats.inactive_groups) || 0,
        totalStudents: parseInt(stats.total_students) || 0,
        avgStudentsPerGroup: parseFloat(stats.avg_students_per_group) || 0,
      },
      byCourse: courseStats.rows.map((row) => ({
        course: row.course,
        groupCount: parseInt(row.group_count) || 0,
        studentCount: parseInt(row.student_count) || 0,
      })),
      byFaculty: facultyStats.rows.map((row) => ({
        faculty: row.faculty,
        groupCount: parseInt(row.group_count) || 0,
        studentCount: parseInt(row.student_count) || 0,
      })),
    })
  } catch (error) {
    console.error('Ошибка получения статистики групп:', error)
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
})

module.exports = router
