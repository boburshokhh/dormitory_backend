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

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// GET /api/applications - Получить заявки (с фильтрацией по роли)
router.get('/', applicationsController.getApplicationsList)

// GET /api/applications/stats - Статистика заявок (только админы)
router.get('/stats', requireAdmin, applicationsController.getApplicationsStats)

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

module.exports = router
