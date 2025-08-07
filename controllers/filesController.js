const multer = require('multer')
const path = require('path')
const { query } = require('../config/database')
const filesService = require('../services/filesService')
const { handleApplicationError } = require('../utils/errorHandler')
const {
  validateUploadFiles,
  validateFileListParams,
  validateActivateFiles,
  validateFileVerification,
  validateCleanupParams,
  validateUUID,
} = require('../validators/fileValidator')
const {
  validateTempLinkCreation,
  validateTempLinkToken,
  validateTempLinksStatsParams,
} = require('../validators/tempLinkValidator')
const { FILE_LIMITS, ALLOWED_MIME_TYPES } = require('../constants/fileConstants')

class FilesController {
  constructor() {
    // Настройка multer для загрузки файлов
    this.setupMulter()
  }

  setupMulter() {
    const storage = multer.memoryStorage()

    this.upload = multer({
      storage: storage,
      limits: {
        fileSize: FILE_LIMITS.MAX_FILE_SIZE,
        files: FILE_LIMITS.MAX_FILES_PER_UPLOAD,
      },
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true)
        } else {
          cb(new Error(`Неподдерживаемый тип файла: ${file.mimetype}`), false)
        }
      },
    })
  }

  // POST /api/files/upload - Загрузка файлов
  async uploadFiles(req, res) {
    const context = { function: 'uploadFiles', actionType: 'file_upload' }

    try {
      const files = req.files

      // Валидация файлов и параметров
      const validatedData = validateUploadFiles(files, req.body)

      // Загружаем файлы через сервис
      const result = await filesService.uploadFiles(files, validatedData, req.user.id)

      res.json({
        success: result.errors.length === 0,
        message: 'Файлы обработаны',
        data: {
          uploaded: result.uploadResults,
          errors: result.errors,
          summary: {
            total: files.length,
            successful: result.uploadResults.length,
            failed: result.errors.length,
          },
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files - Получить список файлов пользователя
  async getFilesList(req, res) {
    const context = { function: 'getFilesList', actionType: 'files_list' }

    try {
      // Валидация параметров
      const validatedParams = validateFileListParams(req.query)
      const filters = { fileType: validatedParams.fileType }
      const pagination = {
        pageNum: validatedParams.pageNum,
        limitNum: validatedParams.limitNum,
      }

      // Получаем файлы через сервис
      const result = await filesService.getUserFiles(
        req.user.id,
        req.user.role,
        filters,
        pagination,
      )

      res.json({
        success: true,
        data: {
          files: result.files,
          pagination: result.pagination,
          filters,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files/:id - Получить информацию о файле
  async getFileById(req, res) {
    const context = { function: 'getFileById', actionType: 'file_view' }

    try {
      const fileId = validateUUID(req.params.id, 'ID файла')

      // Получаем метаданные файла
      const file = await filesService.getFileById(fileId, req.user.id, req.user.role, false)

      res.json({
        success: true,
        data: file,
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // DELETE /api/files/:id - Удалить файл
  async deleteFile(req, res) {
    const context = { function: 'deleteFile', actionType: 'file_delete' }

    try {
      const fileId = validateUUID(req.params.id, 'ID файла')

      // Удаляем файл через сервис
      const result = await filesService.deleteFile(fileId, req.user.id, req.user.role)

      res.json({
        success: true,
        message: 'Файл удален',
        data: result.deletedFile,
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files/user/:userId - Получить файлы пользователя (только для админов)
  async getUserFiles(req, res) {
    const context = { function: 'getUserFiles', actionType: 'admin_user_files' }

    try {
      const userId = validateUUID(req.params.userId, 'ID пользователя')
      const filters = { fileType: req.query.fileType }

      // Получаем файлы пользователя через сервис
      const result = await filesService.getUserFilesForAdmin(userId, req.user.role, filters)

      res.json({
        success: true,
        data: result,
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // PUT /api/files/:id/verify - Подтвердить файл (только для админов)
  async verifyFile(req, res) {
    const context = { function: 'verifyFile', actionType: 'file_verify' }

    try {
      const fileId = validateUUID(req.params.id, 'ID файла')
      const { verified } = validateFileVerification(req.body)

      // Верифицируем файл через сервис
      const result = await filesService.verifyFile(fileId, req.user.role, req.user.id, verified)

      res.json({
        success: true,
        message: verified ? 'Файл подтвержден' : 'Подтверждение файла снято',
        data: result,
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/files/activate - Активировать файлы пользователя
  async activateFiles(req, res) {
    const context = { function: 'activateFiles', actionType: 'files_activate' }

    try {
      const validatedData = validateActivateFiles(req.body)

      // Активируем файлы через сервис
      const result = await filesService.activateFiles(
        validatedData.fileIds,
        req.user.id,
        validatedData.relatedEntityType,
        validatedData.relatedEntityId,
      )

      res.json({
        success: true,
        message: 'Файлы успешно активированы',
        data: {
          activatedFiles: result.activatedFiles,
          count: result.count,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files/cleanup - Очистить старые временные файлы (админская функция)
  async cleanupOldFiles(req, res) {
    const context = { function: 'cleanupOldFiles', actionType: 'files_cleanup' }

    try {
      const { daysOld } = validateCleanupParams(req.query)

      // Очищаем старые файлы через сервис
      const result = await filesService.cleanupOldFiles(req.user.role, req.user.id, daysOld)

      res.json({
        success: true,
        message: 'Очистка старых файлов завершена',
        data: {
          summary: {
            total: result.total,
            deleted: result.deleted.length,
            errors: result.errors.length,
          },
          deleted: result.deleted,
          errors: result.errors,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/files/cleanup-duplicates - Очистить дубликаты файлов (админская функция)
  async cleanupDuplicateFiles(req, res) {
    const context = { function: 'cleanupDuplicateFiles', actionType: 'files_cleanup_duplicates' }

    try {
      // Очищаем дубликаты через сервис
      const result = await filesService.cleanupDuplicateFiles(req.user.role, req.user.id)

      res.json({
        success: true,
        message: 'Очистка дубликатов завершена',
        data: {
          summary: {
            total: result.total,
            deleted: result.deleted.length,
            errors: result.errors.length,
          },
          deleted: result.deleted,
          errors: result.errors,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/files/:id/temp-link - Генерация временной ссылки для скачивания
  async generateTempLink(req, res) {
    const context = { function: 'generateTempLink', actionType: 'temp_link_generation' }

    try {
      const fileId = validateUUID(req.params.id, 'ID файла')
      const validatedData = validateTempLinkCreation(req.body)

      // Генерируем временную ссылку через сервис
      const result = await filesService.generateTempLink(
        fileId,
        req.user.id,
        req.user.role,
        validatedData.expiryHours,
      )

      res.json({
        success: true,
        message: 'Временная ссылка создана',
        data: {
          tempLink: result.tempLink,
          expiresAt: result.expiresAt,
          fileName: result.fileName,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files/download/temp/:token - Скачивание файла по временной ссылке (без аутентификации)
  async downloadFileByTempLink(req, res) {
    const context = { function: 'downloadFileByTempLink', actionType: 'file_download_temp_link' }

    try {
      const { token } = req.params
      const validatedToken = validateTempLinkToken(token)

      // Получаем файл по временной ссылке через сервис
      const fileData = await filesService.downloadFileByTempLink(validatedToken, req)

      // Устанавливаем заголовки для скачивания
      res.setHeader('Content-Type', fileData.mimeType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileData.fileName)}"`,
      )
      res.setHeader('Content-Length', fileData.fileSize)
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')

      // Отправляем файл как stream
      fileData.stream.pipe(res)
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // GET /api/files/temp-links/stats - Получение статистики временных ссылок
  async getTempLinksStats(req, res) {
    const context = { function: 'getTempLinksStats', actionType: 'temp_links_stats' }

    try {
      // Получаем статистику через сервис
      const stats = await filesService.getTempLinksStats(req.user.id, req.user.role)

      res.json({
        success: true,
        data: {
          links: stats,
          summary: {
            total: stats.length,
            active: stats.filter((link) => !link.isExpired && !link.isUsed).length,
            used: stats.filter((link) => link.isUsed).length,
            expired: stats.filter((link) => link.isExpired).length,
          },
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // POST /api/files/temp-links/cleanup - Очистка истекших временных ссылок
  async cleanupExpiredTempLinks(req, res) {
    const context = { function: 'cleanupExpiredTempLinks', actionType: 'temp_links_cleanup' }

    try {
      // Очищаем истекшие ссылки через сервис
      const deletedCount = await filesService.cleanupExpiredTempLinks()

      res.json({
        success: true,
        message: 'Очистка истекших временных ссылок завершена',
        data: {
          deletedCount,
        },
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // DELETE /api/files/temp-links/:id - Удаление временной ссылки
  async deleteTempLink(req, res) {
    const context = { function: 'deleteTempLink', actionType: 'temp_link_delete' }

    try {
      // Удаляем временную ссылку через сервис
      await filesService.deleteTempLink(req.params.id, req.user.id)

      res.json({
        success: true,
        message: 'Временная ссылка удалена',
      })
    } catch (error) {
      await handleApplicationError(error, req, res, context)
    }
  }

  // Middleware для обработки загрузки файлов
  getUploadMiddleware() {
    return this.upload.array('files', FILE_LIMITS.MAX_FILES_PER_UPLOAD)
  }

  // Middleware для обработки ошибок multer
  handleMulterError(error, req, res, next) {
    if (error instanceof multer.MulterError) {
      let message = 'Ошибка загрузки файла'
      let details = {}

      switch (error.code) {
        case 'LIMIT_FILE_SIZE':
          message = `Размер файла превышает максимально допустимый: ${FILE_LIMITS.MAX_FILE_SIZE} байт`
          details = { maxSize: FILE_LIMITS.MAX_FILE_SIZE, code: error.code }
          break
        case 'LIMIT_FILE_COUNT':
          message = `Превышено максимальное количество файлов: ${FILE_LIMITS.MAX_FILES_PER_UPLOAD}`
          details = { maxFiles: FILE_LIMITS.MAX_FILES_PER_UPLOAD, code: error.code }
          break
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Неожиданное поле файла'
          details = { field: error.field, code: error.code }
          break
        default:
          message = error.message
          details = { code: error.code }
      }

      return res.status(400).json({
        success: false,
        error: message,
        error_code: 'MULTER_ERROR',
        details,
      })
    }

    if (error.message && error.message.includes('Неподдерживаемый тип файла')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        error_code: 'UNSUPPORTED_FILE_TYPE',
        details: { allowedTypes: ALLOWED_MIME_TYPES },
      })
    }

    next(error)
  }
}

module.exports = new FilesController()
