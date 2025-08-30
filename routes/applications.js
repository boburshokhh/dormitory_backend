const express = require('express')
const applicationsController = require('../controllers/applicationsController')
const { query } = require('../config/database')
const {
  authenticateToken,
  requireAdmin,
  requireOwnershipOrAdmin,
  validateUUID,
  logAdminAction,
} = require('../middleware/auth')

const router = express.Router()

// Публичный endpoint для очереди (без аутентификации)
router.get('/public/queue', applicationsController.getPublicQueueData)

// Применяем аутентификацию к остальным маршрутам
router.use(authenticateToken)

// GET /api/applications - Получить заявки (с фильтрацией по роли)
router.get('/', applicationsController.getApplicationsList)

// GET /api/applications/stats - Статистика заявок (только админы)
router.get('/stats', requireAdmin, applicationsController.getApplicationsStats)

// GET /api/applications/photos - Получить фотографии студентов (только админы)
router.get('/photos', requireAdmin, applicationsController.getStudentPhotos)

// GET /api/applications/user/:userId - Получить все заявки пользователя (админы)
router.get('/user/:userId', validateUUID('userId'), requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params

    const result = await query(
      `
        SELECT 
          a.id, a.student_id, a.dormitory_id, a.preferred_room_type,
          a.academic_year, a.semester, a.status, a.submission_date,
          a.review_date, a.reviewed_by, a.rejection_reason, a.documents,
          a.notes, a.priority_score, a.created_at, a.updated_at,
          d.name as dormitory_name, d.type as dormitory_type,
          reviewer.first_name as reviewer_first_name,
          reviewer.last_name as reviewer_last_name
        FROM applications a
        LEFT JOIN dormitories d ON a.dormitory_id = d.id
        LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
        WHERE a.student_id = $1
        ORDER BY a.created_at DESC
      `,
      [userId],
    )

    const applications = result.rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      dormitoryId: row.dormitory_id,
      dormitoryName: row.dormitory_name,
      dormitoryType: row.dormitory_type,
      preferredRoomType: row.preferred_room_type,
      academicYear: row.academic_year,
      semester: row.semester,
      status: row.status,
      submissionDate: row.submission_date,
      reviewDate: row.review_date,
      reviewedBy: row.reviewed_by,
      reviewerName:
        row.reviewer_first_name && row.reviewer_last_name
          ? `${row.reviewer_first_name} ${row.reviewer_last_name}`
          : null,
      rejectionReason: row.rejection_reason,
      documents: row.documents,
      notes: row.notes,
      priorityScore: row.priority_score,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    res.json({
      success: true,
      applications,
      total: applications.length,
    })
  } catch (error) {
    console.error('Ошибка получения заявлений пользователя:', error)
    res.status(500).json({
      success: false,
      error: 'Ошибка получения заявлений пользователя',
    })
  }
})

// Маршруты с использованием контроллеров
router.get(
  '/:id',
  validateUUID('id'),
  requireOwnershipOrAdmin('student_id'),
  applicationsController.getApplicationById,
)
router.post('/', applicationsController.createApplication)
router.put('/:id', validateUUID('id'), applicationsController.updateApplication)
router.put(
  '/:id/review',
  validateUUID('id'),
  requireAdmin,
  logAdminAction('review_application'),
  applicationsController.reviewApplication,
)
router.delete('/:id', validateUUID('id'), applicationsController.cancelApplication)
router.get(
  '/:id/history',
  validateUUID('id'),
  requireAdmin,
  applicationsController.getApplicationHistory,
)
router.post(
  '/bulk-review',
  requireAdmin,
  logAdminAction('bulk_review'),
  applicationsController.bulkReviewApplications,
)
router.get('/export', requireAdmin, applicationsController.exportApplications)

// GET /api/applications/export-pdf - Экспорт списка заявок в PDF с учетом фильтров
router.get('/export-pdf', requireAdmin, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit')
    const {
      buildApplicationFilters,
      buildOrderByClause,
      QUERIES,
    } = require('../utils/queryBuilder')
    const { query } = require('../config/database')

    // Валидируем параметры пагинации/сортировки через существующий валидатор
    const { validateListParams } = require('../validators/applicationValidator')
    const validatedParams = validateListParams(req.query)

    // Собираем фильтры, как в списке
    const filters = {
      status: req.query.status,
      dormitory_id: req.query.dormitory_id,
      academic_year: req.query.academic_year,
      semester: req.query.semester,
      group_id: req.query.group_id,
      region: req.query.region,
      course: req.query.course,
      dormitory_type: req.query.dormitory_type,
    }

    // Строим WHERE
    const { whereClause, params } = buildApplicationFilters(req.user.role, req.user.id, filters)

    // Сортировка как в списке
    const orderClause = buildOrderByClause(validatedParams.sortBy, validatedParams.sortOrder)

    // Берем все данные без лимита (для экспорта)
    const sql = `${QUERIES.GET_APPLICATIONS_LIST} ${whereClause} ${orderClause}`
    const result = await query(sql, params)

    // Готовим PDF
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename=applications_${Date.now()}.pdf`)

    const doc = new PDFDocument({ size: 'A4', margin: 36 })
    doc.pipe(res)

    // Заголовок
    doc.fontSize(16).text('Список заявок на заселение', { align: 'center' })
    doc.moveDown(0.5)

    // Краткая информация о фильтрах
    const filterLines = []
    if (filters.status) filterLines.push(`Статус: ${filters.status}`)
    if (filters.course) filterLines.push(`Курс: ${filters.course}`)
    if (filters.group_id) filterLines.push(`Группа ID: ${filters.group_id}`)
    if (filters.region) filterLines.push(`Регион: ${filters.region}`)
    if (filters.dormitory_type)
      filterLines.push(
        `ДПС: ${filters.dormitory_type === 'type_1' || filters.dormitory_type === '1' ? 'ДПС 1' : 'ДПС 2'}`,
      )

    doc
      .fontSize(10)
      .fillColor('#444')
      .text(filterLines.join(' | ') || 'Без фильтров')
    doc.moveDown(0.5)

    // Заголовок таблицы
    doc.fillColor('#000').fontSize(11)
    const col = (x, text, width) => {
      doc.text(text, x, doc.y, { width, continued: true })
    }
    const line = () => {
      doc.moveDown(0.4)
    }

    // Колонки: ФИО | Группа | ДПС | Соц. защита | Статус
    const cols = [
      { x: 36, w: 180, title: 'ФИО' },
      { x: 220, w: 100, title: 'Группа' },
      { x: 325, w: 60, title: 'ДПС' },
      { x: 390, w: 90, title: 'Соц. защита' },
      { x: 485, w: 90, title: 'Статус' },
    ]
    cols.forEach((c, idx) => {
      doc.text(c.title, c.x, doc.y, { width: c.w, continued: idx !== cols.length - 1 })
    })
    doc.moveDown(0.2)
    doc.moveTo(36, doc.y).lineTo(559, doc.y).strokeColor('#999').stroke()
    doc.moveDown(0.3)

    // Строки
    result.rows.forEach((row) => {
      const fullName = `${row.last_name || ''} ${row.first_name || ''}`.trim()
      const groupName = row.group_name || ''
      const dormitoryType = row.dormitory_name
        ? row.dormitory_type === 'type_1'
          ? 'ДПС 1'
          : 'ДПС 2'
        : ''

      // Признак соц. защиты: по файлам профиля с типом social_protection
      // Упростим: если в таблице files есть хотя бы один активный файл с типом 'social_protection' у пользователя
      // (Чтобы не делать N+1 запрос, можно было бы JOIN, но оставим простой подход одним дополнительным запросом на пользователя)
      // Для производительности в больших выгрузках это можно оптимизировать отдельно.
      // Здесь делаем синхронно с Promise.all позже, но проще: добавим поле после основного цикла.
    })

    // Получим флаги соц.защиты пачкой одним запросом по всем student_id
    const studentIds = Array.from(new Set(result.rows.map((r) => r.student_number))).filter(Boolean)
    let socialMap = {}
    if (studentIds.length > 0) {
      const filesRes = await query(
        `SELECT u.student_id as student_number, COUNT(f.id) as cnt
         FROM users u
         JOIN files f ON f.user_id = u.id AND f.status = 'active' AND f.deleted_at IS NULL
         WHERE u.student_id = ANY($1) AND f.file_type = 'social_protection'
         GROUP BY u.student_id`,
        [studentIds],
      )
      socialMap = Object.fromEntries(
        filesRes.rows.map((r) => [r.student_number, parseInt(r.cnt) > 0]),
      )
    }

    // Теперь реально рендерим строки с признаком соц. защиты
    result.rows.forEach((row) => {
      const fullName = `${row.last_name || ''} ${row.first_name || ''}`.trim()
      const groupName = row.group_name || ''
      const dormType = row.dormitory_name
        ? row.dormitory_type === 'type_1'
          ? 'ДПС 1'
          : 'ДПС 2'
        : ''
      const hasSocial = socialMap[row.student_number] ? 'Да' : 'Нет'

      doc.text(fullName, cols[0].x, doc.y, { width: cols[0].w, continued: true })
      doc.text(groupName, cols[1].x, doc.y, { width: cols[1].w, continued: true })
      doc.text(dormType, cols[2].x, doc.y, { width: cols[2].w, continued: true })
      doc.text(hasSocial, cols[3].x, doc.y, { width: cols[3].w, continued: true })
      doc.text(row.status, cols[4].x, doc.y, { width: cols[4].w, continued: false })
      line()

      // Переход на новую страницу при нехватке места
      if (doc.y > 770) {
        doc.addPage()
      }
    })

    doc.end()
  } catch (error) {
    console.error('Ошибка экспорта заявок в PDF:', error)
    res.status(500).json({ error: 'Ошибка экспорта заявок в PDF' })
  }
})

module.exports = router
