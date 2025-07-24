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

module.exports = router
