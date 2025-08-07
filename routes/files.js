const express = require('express')
const router = express.Router()
const filesController = require('../controllers/filesController')
const { authenticateToken } = require('../middleware/auth')
const { validateUUID } = require('../validators/fileValidator')

// Скачивание файла по временной ссылке (без аутентификации)
router.get('/download/temp/:token', filesController.downloadFileByTempLink.bind(filesController))

// Маршруты для файлов (требуют аутентификации)
router.use(authenticateToken)

// Получение списка файлов пользователя
router.get('/', filesController.getFilesList.bind(filesController))

// Получение файлов конкретного пользователя (только для админов)
router.get('/user/:userId', filesController.getUserFiles.bind(filesController))

// Получение информации о файле
router.get(
  '/:id',
  (req, res, next) => {
    try {
      validateUUID(req.params.id, 'id')
      next()
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  },
  filesController.getFileById.bind(filesController),
)

// Загрузка файлов
router.post(
  '/upload',
  filesController.getUploadMiddleware(),
  filesController.handleMulterError.bind(filesController),
  filesController.uploadFiles.bind(filesController),
)

// Удаление файла
router.delete(
  '/:id',
  (req, res, next) => {
    try {
      validateUUID(req.params.id, 'id')
      next()
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  },
  filesController.deleteFile.bind(filesController),
)

// Дополнительные маршруты для управления временными ссылками
// Создание временной ссылки
router.post(
  '/:id/temp-link',
  (req, res, next) => {
    try {
      validateUUID(req.params.id, 'id')
      next()
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  },
  filesController.generateTempLink.bind(filesController),
)

// Получение статистики временных ссылок пользователя
router.get('/temp-links/stats', filesController.getTempLinksStats.bind(filesController))

// Удаление временной ссылки
router.delete(
  '/temp-links/:id',
  (req, res, next) => {
    try {
      validateUUID(req.params.id, 'id')
      next()
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  },
  filesController.deleteTempLink.bind(filesController),
)

module.exports = router
