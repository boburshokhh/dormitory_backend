const express = require('express')
const router = express.Router()
const officeController = require('../controllers/officeController')
const { authenticateToken, requireAdmin } = require('../middleware/auth')
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() })

// === ШАБЛОНЫ ===
// Получить список шаблонов
router.get('/templates', authenticateToken, requireAdmin, officeController.getTemplates)

// Получить конкретный шаблон
router.get('/templates/:id', authenticateToken, requireAdmin, officeController.getTemplate)

// Создать/загрузить новый шаблон
router.post(
  '/templates',
  authenticateToken,
  requireAdmin,
  upload.single('file'),
  officeController.createTemplate,
)

// Обновить шаблон
router.put('/templates/:id', authenticateToken, requireAdmin, officeController.updateTemplate)

// Удалить шаблон
router.delete('/templates/:id', authenticateToken, requireAdmin, officeController.deleteTemplate)

// === ДОКУМЕНТЫ ===
// Получить список документов
router.get('/documents', authenticateToken, requireAdmin, officeController.getDocuments)

// Получить конкретный документ
router.get('/documents/:id', authenticateToken, requireAdmin, officeController.getDocument)

// Генерация документа
router.post('/documents', authenticateToken, requireAdmin, officeController.generateDocument)

// Отменить документ
router.post(
  '/documents/:id/cancel',
  authenticateToken,
  requireAdmin,
  officeController.cancelDocument,
)

// === ПУБЛИЧНЫЕ ЭНДПОИНТЫ ===
// Проверка подлинности
router.get('/verify', officeController.verifyDocument)

// Статистика
router.get('/stats', authenticateToken, requireAdmin, officeController.getStats)

module.exports = router
