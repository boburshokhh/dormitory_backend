const express = require('express')
const router = express.Router()
const documentsController = require('../controllers/documentsController')
const {
  authenticateToken,
  requireAdmin,
  validateUUID,
  validateDocumentId,
  logAdminAction,
} = require('../middleware/auth')
const { verificationLimiter } = require('../middleware/rateLimit')

// Публичная верификация документа по QR-коду (без аутентификации)
router.get(
  '/verify/:documentId',
  verificationLimiter,
  validateDocumentId,
  documentsController.verifyDocument,
)

// Генерация документа "НАПРАВЛЕНИЕ на размещение в ДПС" для студента
router.post(
  '/generate/dormitory-direction/:studentId',
  authenticateToken,
  requireAdmin,
  validateUUID('studentId'),
  logAdminAction('generate_document'),
  documentsController.generateDormitoryDirection,
)

// Получение списка документов студента
router.get(
  '/student/:studentId',
  authenticateToken,
  validateUUID('studentId'),
  documentsController.getStudentDocuments,
)

// Получение конкретного документа по ID
router.get(
  '/:documentId',
  authenticateToken,
  validateUUID('documentId'),
  documentsController.getDocument,
)

// Удаление документа
router.delete(
  '/:documentId',
  authenticateToken,
  requireAdmin,
  validateUUID('documentId'),
  logAdminAction('delete_document'),
  documentsController.deleteDocument,
)

module.exports = router
