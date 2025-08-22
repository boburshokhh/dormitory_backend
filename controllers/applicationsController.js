const { query, transaction } = require('../config/database')
const applicationsService = require('../services/applicationsService')
const {
  handleApplicationError,
  createNotFoundError,
  createPermissionError,
} = require('../utils/errorHandler')
const {
  validateListParams,
  validateCreateApplication,
  validateUpdateApplication,
  validateReviewApplication,
  validateBulkReview,
  validateUUID,
} = require('../validators/applicationValidator')
const { getCurrentMonthRange } = require('../utils/dateUtils')

class ApplicationsController {
  // GET /api/applications - Получить список заявок
  async getApplicationsList(req, res) {
    const context = { function: 'getApplicationsList', actionType: 'admin_action' }

    try {
      // Валидация параметров
      const validatedParams = validateListParams(req.query)

      // Получаем текущий месяц для значений по умолчанию
      const currentMonthRange = getCurrentMonthRange()

      const {
        status,
        dormitory_id,
        academic_year,
        semester,
        group_id,
        region,
        course,
        dormitory_type,
        has_social_protection,
        search,
        gender,
        date_from = currentMonthRange.from, // Используем текущий месяц по умолчанию
        date_to = currentMonthRange.to, // Используем текущий месяц по умолчанию
      } = req.query

      // Фильтры
      const filters = {
        status,
        dormitory_id,
        academic_year,
        semester,
        group_id,
        region,
        course,
        dormitory_type,
        has_social_protection,
        search,
        gender,
        date_from,
        date_to,
      }

      // Получаем данные через сервис
      const result = await applicationsService.getApplicationsList(
        req.user.role,
        req.user.id,
        filters,
        validatedParams,
      )

      res.json({
        success: true,
        data: {
          applications: result.applications,
          pagination: result.pagination,
          filters,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/applications/stats - Статистика заявок (только админы)
  async getApplicationsStats(req, res) {
    const context = { function: 'getApplicationsStats', actionType: 'applications_stats' }

    try {
      const { academic_year, semester, dormitory_id } = req.query

      const params = []
      const conditions = {}

      if (academic_year) conditions['academic_year'] = academic_year
      if (semester) conditions['semester'] = semester
      if (dormitory_id) conditions['dormitory_id'] = dormitory_id

      // Строим WHERE условие
      let whereClause = 'WHERE 1=1'
      let paramCount = 0

      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          whereClause += ` AND ${key} = $${++paramCount}`
          params.push(value)
        }
      })

      // Получаем статистику по статусам
      const statusResult = await query(
        `SELECT status, COUNT(*) as count, ROUND(AVG(priority_score), 2) as avg_priority
         FROM applications ${whereClause} GROUP BY status`,
        params,
      )

      // Получаем статистику по общежитиям
      const dormitoryResult = await query(
        `SELECT d.name as dormitory_name, COUNT(a.*) as applications_count,
                COUNT(CASE WHEN a.status = 'approved' THEN 1 END) as approved_count
         FROM dormitories d
         LEFT JOIN applications a ON d.id = a.dormitory_id ${whereClause.replace('WHERE', 'AND')}
         GROUP BY d.id, d.name ORDER BY applications_count DESC`,
        params,
      )

      // Обрабатываем статистику
      const statusStats = { submitted: 0, approved: 0, rejected: 0, cancelled: 0 }
      let totalPrioritySum = 0
      let applicationsWithPriority = 0

      statusResult.rows.forEach((row) => {
        statusStats[row.status] = parseInt(row.count)
        if (row.avg_priority) {
          totalPrioritySum += parseFloat(row.avg_priority) * parseInt(row.count)
          applicationsWithPriority += parseInt(row.count)
        }
      })

      const totalApplications = Object.values(statusStats).reduce((a, b) => a + b, 0)
      const approvalRate =
        totalApplications > 0 ? Math.round((statusStats.approved / totalApplications) * 100) : 0
      const avgPriority =
        applicationsWithPriority > 0
          ? Math.round((totalPrioritySum / applicationsWithPriority) * 100) / 100
          : 0

      const stats = {
        statusStats,
        totalApplications,
        approvalRate,
        avgPriorityScore: avgPriority,
        dormitoryStats: dormitoryResult.rows.map((row) => ({
          name: row.dormitory_name,
          totalApplications: parseInt(row.applications_count),
          approvedApplications: parseInt(row.approved_count),
          approvalRate:
            parseInt(row.applications_count) > 0
              ? Math.round((parseInt(row.approved_count) / parseInt(row.applications_count)) * 100)
              : 0,
        })),
      }

      res.json({ success: true, data: stats })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/applications/:id - Получить заявку по ID
  async getApplicationById(req, res) {
    const context = { function: 'getApplicationById', actionType: 'application_view' }

    try {
      const applicationId = validateUUID(req.params.id, 'ID заявки')

      const application = await applicationsService.getApplicationDetail(
        applicationId,
        req.user.role,
        req.user.id,
      )

      res.json({ success: true, data: application })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/applications - Создать новую заявку
  async createApplication(req, res) {
    const context = { function: 'createApplication', actionType: 'application_submit' }
    const startTime = Date.now()

    try {
      console.log('🔄 Начало обработки создания заявки')

      // Проверяем роль пользователя
      if (req.user.role !== 'student') {
        throw createPermissionError('подача заявок', 'Только студенты могут подавать заявки')
      }

      // Валидация входных данных
      const validatedData = validateCreateApplication(req.body)
      console.log('✅ Данные валидированы')

      // Создаем заявку через сервис
      const result = await applicationsService.createApplication(req.user.id, validatedData)

      const totalTime = Date.now() - startTime
      console.log(`✅ Заявка создана успешно за ${totalTime}ms`)

      res.status(201).json({
        success: true,
        message: 'Заявка успешно подана',
        data: {
          id: result.id,
          status: result.status,
          submissionDate: result.submission_date,
          createdAt: result.created_at,
          processingTime: totalTime,
        },
      })
    } catch (error) {
      const totalTime = Date.now() - startTime
      console.error(`❌ Ошибка создания заявки (${totalTime}ms):`, error.message)

      // Добавляем информацию о времени обработки в контекст
      context.processingTime = totalTime
      context.userId = req.user.id

      await handleApplicationError(error, req, res, context)
    }
  }

  // PUT /api/applications/:id - Обновить заявку
  async updateApplication(req, res) {
    const context = { function: 'updateApplication', actionType: 'application_update' }

    try {
      const applicationId = validateUUID(req.params.id, 'ID заявки')
      const validatedData = validateUpdateApplication(req.body)

      // Обновляем заявку через сервис
      const result = await applicationsService.updateApplication(
        applicationId,
        req.user.id,
        req.user.role,
        validatedData,
      )

      res.json({
        success: true,
        message: 'Заявка успешно обновлена',
        data: { updatedAt: result.updated_at },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // PUT /api/applications/:id/review - Рассмотреть заявку (только админы)
  async reviewApplication(req, res) {
    const context = { function: 'reviewApplication', actionType: 'application_review' }

    try {
      const applicationId = validateUUID(req.params.id, 'ID заявки')
      const validatedData = validateReviewApplication(req.body)

      // Рассматриваем заявку через сервис
      const result = await applicationsService.reviewApplication(
        applicationId,
        req.user.id,
        validatedData,
      )

      res.json({
        success: true,
        message: `Заявка ${validatedData.status === 'approved' ? 'одобрена' : 'отклонена'}`,
        data: {
          reviewDate: result.review_date,
          updatedAt: result.updated_at,
          status: validatedData.status,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // DELETE /api/applications/:id - Отозвать/удалить заявку
  async cancelApplication(req, res) {
    const context = { function: 'cancelApplication', actionType: 'application_cancel' }

    try {
      const applicationId = validateUUID(req.params.id, 'ID заявки')

      // Отзываем заявку через сервис
      const result = await applicationsService.cancelApplication(
        applicationId,
        req.user.id,
        req.user.role,
      )

      res.json({
        success: true,
        message: 'Заявка отозвана',
        data: { updatedAt: result.updated_at },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/applications/:id/history - История изменений заявки (только админы)
  async getApplicationHistory(req, res) {
    const context = { function: 'getApplicationHistory', actionType: 'application_history' }

    try {
      const applicationId = validateUUID(req.params.id, 'ID заявки')

      // Проверяем существование заявки
      const applicationExists = await query('SELECT id FROM applications WHERE id = $1', [
        applicationId,
      ])

      if (applicationExists.rows.length === 0) {
        throw createNotFoundError('Заявка', applicationId)
      }

      // Получаем историю из логов
      const historyResult = await query(
        `SELECT al.id, al.action_type, al.action_description, al.created_at, al.request_data,
                al.success, al.error_message, u.first_name, u.last_name, u.role
         FROM activity_logs al
         JOIN users u ON al.user_id = u.id
         WHERE al.request_data->>'applicationId' = $1
         ORDER BY al.created_at DESC`,
        [applicationId],
      )

      const history = historyResult.rows.map((log) => ({
        id: log.id,
        actionType: log.action_type,
        description: log.action_description,
        timestamp: log.created_at,
        user: {
          firstName: log.first_name,
          lastName: log.last_name,
          role: log.role,
        },
        success: log.success,
        errorMessage: log.error_message,
        details: log.request_data,
      }))

      res.json({
        success: true,
        data: { applicationId, history },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/applications/bulk-review - Массовое рассмотрение заявок (только админы)
  async bulkReviewApplications(req, res) {
    const context = { function: 'bulkReviewApplications', actionType: 'bulk_review' }

    try {
      const validatedData = validateBulkReview(req.body)

      // Массовое рассмотрение через сервис
      const results = await applicationsService.bulkReviewApplications(
        validatedData.applicationIds,
        req.user.id,
        validatedData,
      )

      res.json({
        success: true,
        message: `Массовое ${validatedData.action === 'approved' ? 'одобрение' : 'отклонение'} завершено`,
        data: {
          processed: validatedData.applicationIds.length,
          successful: results.successfulIds.length,
          failed: results.failedIds.length,
          successfulIds: results.successfulIds,
          failedItems: results.failedIds,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/applications/export - Экспорт заявок в CSV (только админы)
  async exportApplications(req, res) {
    const context = { function: 'exportApplications', actionType: 'applications_export' }

    try {
      const { status, academic_year, semester, dormitory_id, format = 'csv' } = req.query

      const params = []
      const conditions = {}

      if (status) conditions['a.status'] = status
      if (academic_year) conditions['a.academic_year'] = academic_year
      if (semester) conditions['a.semester'] = semester
      if (dormitory_id) conditions['a.dormitory_id'] = dormitory_id

      // Строим WHERE условие
      let whereClause = 'WHERE 1=1'
      let paramCount = 0

      Object.entries(conditions).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          whereClause += ` AND ${key} = $${++paramCount}`
          params.push(value)
        }
      })

      const result = await query(
        `SELECT a.id, u.first_name || ' ' || u.last_name as student_name,
                u.student_id as student_number, g.name as group_name, g.course,
                u.email, u.phone, d.name as dormitory_name, a.preferred_room_type,
                a.academic_year, a.semester, a.status, a.submission_date, a.review_date,
                reviewer.first_name || ' ' || reviewer.last_name as reviewer_name,
                a.rejection_reason, a.priority_score, a.notes
         FROM applications a
         JOIN users u ON a.student_id = u.id
         LEFT JOIN groups g ON u.group_id = g.id
         LEFT JOIN dormitories d ON a.dormitory_id = d.id
         LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
         ${whereClause} ORDER BY a.submission_date DESC`,
        params,
      )

      if (format === 'json') {
        res.json({ success: true, data: result.rows })
      } else {
        // CSV format
        const csvHeaders = [
          'ID заявки',
          'Студент',
          'Номер студента',
          'Группа',
          'Курс',
          'Email',
          'Телефон',
          'Общежитие',
          'Тип комнаты',
          'Учебный год',
          'Семестр',
          'Статус',
          'Дата подачи',
          'Дата рассмотрения',
          'Рассмотрел',
          'Причина отклонения',
          'Приоритетный балл',
          'Примечания',
        ]

        const csvData = result.rows.map((row) => [
          row.id,
          row.student_name,
          row.student_number,
          row.group_name,
          row.course,
          row.email,
          row.phone,
          row.dormitory_name || '',
          row.preferred_room_type || '',
          row.academic_year,
          row.semester,
          row.status,
          row.submission_date,
          row.review_date || '',
          row.reviewer_name || '',
          row.rejection_reason || '',
          row.priority_score || '',
          row.notes || '',
        ])

        const csv = [csvHeaders, ...csvData]
          .map((row) => row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(','))
          .join('\n')

        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename=applications_${Date.now()}.csv`)
        res.send('\ufeff' + csv) // BOM for UTF-8
      }
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }
}

module.exports = new ApplicationsController()
