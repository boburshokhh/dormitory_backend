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
  validateFileDownload,
} = require('../validators/fileValidator')
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

  // GET /api/files/:id - Получить конкретный файл
  async getFileById(req, res) {
    const context = { function: 'getFileById', actionType: 'file_view' }

    try {
      const fileId = validateUUID(req.params.id, 'ID файла')
      const { download } = validateFileDownload(req.query)

      if (download) {
        // Скачивание файла как stream
        const fileData = await filesService.downloadFileStream(fileId, req.user.id, req.user.role)

        // Устанавливаем заголовки для скачивания
        res.setHeader('Content-Type', fileData.mimeType)
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(fileData.fileName)}"`,
        )
        res.setHeader('Content-Length', fileData.fileSize)

        // Отправляем файл как stream
        fileData.stream.pipe(res)
      } else {
        // Получаем только метаданные файла
        const file = await filesService.getFileById(fileId, req.user.id, req.user.role, false)

        res.json({
          success: true,
          data: file,
        })
      }
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
