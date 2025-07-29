const express = require('express')
const filesController = require('../controllers/filesController')
const { authenticateToken, validateUUID } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// Маршруты файлов с использованием контроллеров
router.post(
  '/upload',
  filesController.getUploadMiddleware(),
  filesController.handleMulterError,
  filesController.uploadFiles.bind(filesController),
)

router.get('/', filesController.getFilesList.bind(filesController))

// Проверка прав администратора
const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Доступ запрещен' })
  }
  next()
}

// Остальные маршруты с использованием контроллеров
router.get('/:id', validateUUID('id'), filesController.getFileById.bind(filesController))
router.delete('/:id', validateUUID('id'), filesController.deleteFile.bind(filesController))
router.get(
  '/user/:userId',
  validateUUID('userId'),
  requireAdmin,
  filesController.getUserFiles.bind(filesController),
)
router.put(
  '/:id/verify',
  validateUUID('id'),
  requireAdmin,
  filesController.verifyFile.bind(filesController),
)
router.post('/activate', filesController.activateFiles.bind(filesController))
router.get('/cleanup', requireAdmin, filesController.cleanupOldFiles.bind(filesController))
router.post(
  '/cleanup-duplicates',
  requireAdmin,
  filesController.cleanupDuplicateFiles.bind(filesController),
)

// Новые маршруты для скачивания файлов
// Генерация временной ссылки для скачивания
router.post(
  '/:id/temp-link',
  validateUUID('id'),
  filesController.generateTempLink.bind(filesController),
)

// Прямое скачивание файла через бэкенд (прокси)
router.get(
  '/:id/download',
  validateUUID('id'),
  filesController.downloadFileProxy.bind(filesController),
)

// Скачивание файла по временной ссылке (без аутентификации)
router.get('/download/temp/:token', filesController.downloadFileByTempLink.bind(filesController))

// Дополнительные маршруты для управления временными ссылками
// Получение статистики временных ссылок пользователя
router.get('/temp-links/stats', filesController.getTempLinksStats.bind(filesController))

// Очистка истекших временных ссылок (только для админов)
router.post(
  '/temp-links/cleanup',
  requireAdmin,
  filesController.cleanupExpiredTempLinks.bind(filesController),
)

module.exports = router
