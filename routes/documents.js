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

// Тестовый роут для проверки работы
router.get('/test', (req, res) => {
  res.json({ message: 'Documents route is working', timestamp: new Date().toISOString() })
})

// Простой тестовый роут для получения документов без аутентификации
router.get('/test-all', async (req, res) => {
  try {
    const documentsController = require('../controllers/documentsController')
    console.log('Test route: checking documents controller...')

    // Простой SQL запрос
    const { query } = require('../config/database')
    const result = await query('SELECT COUNT(*) as count FROM documents WHERE is_active = true')

    res.json({
      message: 'Test route working',
      documentsCount: result.rows[0].count,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Test route error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Публичная верификация документа по QR-коду (без аутентификации)
router.get(
  '/verify/:documentId',
  verificationLimiter,
  validateDocumentId,
  documentsController.verifyDocument,
)

// Получение всех документов с информацией о студентах (только для админов)
// Должен быть размещен выше роута с параметром /:documentId
router.get('/all', authenticateToken, requireAdmin, documentsController.getAllDocuments)

// Альтернативная версия с логированием (для отладки)
router.get(
  '/all-with-log',
  authenticateToken,
  requireAdmin,
  logAdminAction('view_all_documents'),
  documentsController.getAllDocuments,
)

// Получение списка документов студента
router.get(
  '/student/:studentId',
  authenticateToken,
  validateUUID('studentId'),
  documentsController.getStudentDocuments,
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

// Деактивация всех документов студента (при освобождении койки)
router.put(
  '/student/:studentId/deactivate',
  authenticateToken,
  requireAdmin,
  validateUUID('studentId'),
  logAdminAction('deactivate_student_documents'),
  documentsController.deactivateStudentDocuments,
)

// Получение конкретного документа по ID (должен быть последним)
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
