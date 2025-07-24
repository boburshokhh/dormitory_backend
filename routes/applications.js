const express = require('express')
const applicationsController = require('../controllers/applicationsController')
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
