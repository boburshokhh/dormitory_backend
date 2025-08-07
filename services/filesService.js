const crypto = require('crypto')
const { query } = require('../config/database')
const {
  initializeBucket: initializeStorage,
  uploadFile,
  getFileUrl,
  getPublicFileUrl,
  getFileUrlByMode,
  deleteFile,
  generateFileName,
  fileExists,
  getFileStream,
} = require('../config/minio')
const {
  FILE_STATUSES,
  FILE_TYPES,
  FILE_LIMITS,
  getFileTypeByFieldName,
} = require('../constants/fileConstants')
const {
  TEMP_LINK_LIMITS,
  TEMP_LINK_STATUSES,
  TEMP_LINK_ERRORS,
} = require('../constants/tempLinkConstants')
const {
  createNotFoundError,
  createPermissionError,
  createBusinessLogicError,
  createDatabaseError,
  createValidationError,
} = require('../utils/errorHandler')

class FilesService {
  constructor() {
    // Инициализируем MinIO при создании сервиса
    this.initializeStorage()
  }

  async initializeStorage() {
    try {
      await initializeStorage()
      console.log('📦 Файловое хранилище инициализировано успешно')
    } catch (error) {
      console.error('🚨 Ошибка инициализации файлового хранилища:', error.message)
    }
  }

  // Получение списка файлов пользователя
  async getUserFiles(userId, userRole, filters, pagination) {
    try {
      const { fileType } = filters
      const { pageNum, limitNum } = pagination
      const offset = (pageNum - 1) * limitNum

      let whereClause = 'WHERE user_id = $1 AND status IN ($2, $3) AND deleted_at IS NULL'
      const params = [userId, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING]
      let paramCount = 3

      if (fileType) {
        whereClause += ` AND file_type = $${++paramCount}`
        params.push(fileType)
      }

      // Исправляем SQL запрос - добавляем LIMIT и OFFSET
      const result = await query(
        `SELECT 
          id, original_name, file_name, file_type, mime_type, file_size,
          status, is_verified, download_count, created_at, updated_at
         FROM files 
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
        [...params, limitNum, offset],
      )

      // Подсчет общего количества
      const countResult = await query(`SELECT COUNT(*) as total FROM files ${whereClause}`, params)

      // Генерируем URL для файлов
      const filesWithUrls = await Promise.all(
        result.rows.map(async (file) => {
          let fileUrl = null
          try {
            fileUrl = getFileUrlByMode(file.file_name, FILE_LIMITS.PRESIGNED_URL_EXPIRY)
          } catch (error) {
            console.error(`🚨 Ошибка получения URL для файла ${file.file_name}:`, error.message)
          }
          return this.formatFileItem(file, fileUrl)
        }),
      )

      const total = parseInt(countResult.rows[0].total)

      return {
        files: filesWithUrls,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum * limitNum < total,
          hasPrevPage: pageNum > 1,
        },
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка получения списка файлов пользователя', 'files', error)
    }
  }

  // Получение конкретного файла
  async getFileById(fileId, userId, userRole, shouldIncrementDownload = false) {
    try {
      const result = await query(
        `SELECT * FROM files 
         WHERE id = $1 AND status IN ($2, $3) AND deleted_at IS NULL`,
        [fileId, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
      )

      if (result.rows.length === 0) {
        throw createNotFoundError('Файл', fileId)
      }

      const file = result.rows[0]

      // Проверяем права доступа
      if (file.user_id !== userId) {
        if (!['admin', 'super_admin'].includes(userRole)) {
          throw createPermissionError('просмотр чужих файлов')
        }
      }

      // Генерируем URL для доступа к файлу
      const fileUrl = await getFileUrl(file.file_name, FILE_LIMITS.PRESIGNED_URL_EXPIRY)

      // Если это скачивание, обновляем счетчик
      if (shouldIncrementDownload) {
        await query(`UPDATE files SET download_count = download_count + 1 WHERE id = $1`, [fileId])
      }

      return this.formatFileDetail(file, fileUrl)
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка получения файла', 'files', error)
    }
  }

  // Получение файла как stream для скачивания

  // Загрузка файлов
  async uploadFiles(files, uploadData, userId) {
    try {
      const { fileType, relatedEntityType, relatedEntityId } = uploadData
      const uploadResults = []
      const errors = []

      for (const file of files) {
        try {
          console.log(`📤 Обработка файла: ${file.originalname}`)
          console.log(`   Размер: ${file.size} байт`)
          console.log(`   MIME тип: ${file.mimetype}`)

          // Вычисляем хеш файла
          const fileHash = this.calculateFileHash(file.buffer)
          const determinedFileType =
            fileType || getFileTypeByFieldName(file.originalname, file.fieldname)

          // Проверяем, нет ли уже такого файла у пользователя
          const existingFile = await this.checkExistingFile(userId, fileHash, determinedFileType)

          if (existingFile) {
            // Файл уже существует
            const fileUrl = await getFileUrl(
              existingFile.file_name,
              FILE_LIMITS.PRESIGNED_URL_EXPIRY,
            )

            uploadResults.push({
              id: existingFile.id,
              originalName: file.originalname,
              url: fileUrl,
              status: existingFile.status,
              message:
                existingFile.status === FILE_STATUSES.ACTIVE
                  ? 'Файл уже существует'
                  : 'Файл уже загружен и ожидает активации',
            })

            console.log(
              `📋 Найден существующий файл: ${existingFile.file_name} (статус: ${existingFile.status})`,
            )
            continue
          }

          // Генерируем уникальное имя файла
          const minioFileName = generateFileName(file.originalname, userId, determinedFileType)
          console.log(`📁 Генерируем имя файла: ${minioFileName}`)

          // Загружаем файл в MinIO
          console.log(`🔄 Загружаем файл в MinIO...`)
          const uploadResult = await uploadFile(file.buffer, minioFileName, file.mimetype, {
            'uploaded-by': userId,
            'original-name': Buffer.from(file.originalname, 'utf8').toString('base64'),
          })

          console.log(`✅ Файл успешно загружен в MinIO: ${minioFileName}`)

          // Сохраняем метаданные в БД
          const fileRecord = await this.createFileRecord(
            userId,
            file,
            minioFileName,
            determinedFileType,
            fileHash,
            uploadResult,
            relatedEntityType,
            relatedEntityId,
          )

          // Получаем URL для доступа к файлу
          const fileUrl = await getFileUrl(minioFileName, FILE_LIMITS.PRESIGNED_URL_EXPIRY)

          uploadResults.push({
            id: fileRecord.id,
            originalName: file.originalname,
            fileName: minioFileName,
            url: fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            createdAt: fileRecord.created_at,
          })
        } catch (fileError) {
          console.error(`❌ Ошибка загрузки файла ${file.originalname}:`, fileError.message)
          console.error('🔍 Детали ошибки:', {
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            errorMessage: fileError.message,
          })

          errors.push({
            fileName: file.originalname,
            error: fileError.message,
          })
        }
      }

      return { uploadResults, errors }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка загрузки файлов', 'files', error)
    }
  }

  // Удаление файла
  async deleteFile(fileId, userId, userRole) {
    try {
      const result = await query(
        `SELECT * FROM files 
         WHERE id = $1 AND status IN ($2, $3) AND deleted_at IS NULL`,
        [fileId, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
      )

      if (result.rows.length === 0) {
        throw createNotFoundError('Файл', fileId)
      }

      const file = result.rows[0]

      // Проверяем права доступа
      if (file.user_id !== userId) {
        if (!['admin', 'super_admin'].includes(userRole)) {
          throw createPermissionError('удаление чужих файлов')
        }
      }

      // Мягкое удаление в БД
      await query(`UPDATE files SET status = $1, deleted_at = NOW() WHERE id = $2`, [
        FILE_STATUSES.DELETED,
        fileId,
      ])

      // Удаляем файл из MinIO (опционально)
      try {
        await deleteFile(file.file_name)
        console.log(`🗑️ Файл удален из MinIO: ${file.file_name}`)
      } catch (minioError) {
        console.error('🚨 Ошибка удаления файла из MinIO:', minioError.message)
        // Не прерываем операцию, так как запись в БД уже обновлена
      }

      return {
        deletedFile: {
          id: file.id,
          originalName: file.original_name,
          fileName: file.file_name,
        },
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка удаления файла', 'files', error)
    }
  }

  // Получение файлов пользователя (для админов)
  async getUserFilesForAdmin(targetUserId, userRole, filters) {
    try {
      if (!['admin', 'super_admin'].includes(userRole)) {
        throw createPermissionError(
          'просмотр файлов пользователей',
          'Недостаточно прав администратора',
        )
      }

      const { fileType } = filters
      let whereClause = 'WHERE f.user_id = $1 AND f.status = $2 AND f.deleted_at IS NULL'
      const params = [targetUserId, FILE_STATUSES.ACTIVE]
      let paramCount = 2

      if (fileType) {
        whereClause += ` AND f.file_type = $${++paramCount}`
        params.push(fileType)
      }

      const result = await query(
        `SELECT 
          f.id, f.original_name, f.file_name, f.file_type, f.mime_type, f.file_size,
          f.is_verified, f.download_count, f.created_at,
          u.first_name, u.last_name, u.email
         FROM files f
         JOIN users u ON f.user_id = u.id
         ${whereClause}
         ORDER BY f.created_at DESC`,
        params,
      )

      // Генерируем временные URL для файлов
      const filesWithUrls = await Promise.all(
        result.rows.map(async (file) => {
          let fileUrl = null
          try {
            fileUrl = await getFileUrl(file.file_name, FILE_LIMITS.PRESIGNED_URL_EXPIRY)
          } catch (error) {
            console.error(`🚨 Ошибка получения URL для файла ${file.file_name}:`, error.message)
          }

          return {
            ...this.formatFileItem(file, fileUrl),
            user: {
              firstName: file.first_name,
              lastName: file.last_name,
              email: file.email,
            },
          }
        }),
      )

      return { files: filesWithUrls }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка получения файлов пользователя для админа', 'files', error)
    }
  }

  // Верификация файла (только для админов)
  async verifyFile(fileId, userRole, userId, verified) {
    try {
      if (!['admin', 'super_admin'].includes(userRole)) {
        throw createPermissionError('верификацию файлов', 'Недостаточно прав администратора')
      }

      const result = await query(
        `UPDATE files 
         SET is_verified = $1, verified_by = $2, verified_at = NOW()
         WHERE id = $3 AND status = $4 AND deleted_at IS NULL
         RETURNING original_name`,
        [verified, userId, fileId, FILE_STATUSES.ACTIVE],
      )

      if (result.rows.length === 0) {
        throw createNotFoundError('Активный файл для верификации', fileId)
      }

      return {
        fileName: result.rows[0].original_name,
        verified,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка верификации файла', 'files', error)
    }
  }

  // Активация файлов
  async activateFiles(fileIds, userId, relatedEntityType, relatedEntityId) {
    try {
      // Проверяем, что все файлы принадлежат пользователю
      const filesCheck = await query(
        `SELECT id, file_name, original_name, status FROM files 
         WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL`,
        [fileIds, userId],
      )

      if (filesCheck.rows.length !== fileIds.length) {
        throw createBusinessLogicError(
          'Некоторые файлы не найдены или не принадлежат вам',
          'FILES_NOT_FOUND_OR_ACCESS_DENIED',
          {
            requestedCount: fileIds.length,
            foundCount: filesCheck.rows.length,
            fileIds,
          },
        )
      }

      // Активируем файлы и обновляем связанную сущность
      const activatedFiles = await query(
        `UPDATE files 
         SET status = $1, 
             related_entity_type = $2,
             related_entity_id = $3,
             updated_at = NOW()
         WHERE id = ANY($4) AND user_id = $5 AND deleted_at IS NULL
         RETURNING id, file_name, original_name, file_type, status`,
        [FILE_STATUSES.ACTIVE, relatedEntityType, relatedEntityId, fileIds, userId],
      )

      return {
        activatedFiles: activatedFiles.rows,
        count: activatedFiles.rows.length,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка активации файлов', 'files', error)
    }
  }

  // Очистка старых временных файлов
  async cleanupOldFiles(userRole, userId, daysOld) {
    try {
      if (!['admin', 'super_admin'].includes(userRole)) {
        throw createPermissionError('очистку файлов', 'Недостаточно прав администратора')
      }

      // Находим старые временные файлы
      const oldFiles = await query(
        `SELECT id, file_name, original_name, user_id, created_at 
         FROM files 
         WHERE status = $1 
         AND created_at < NOW() - INTERVAL '${parseInt(daysOld)} days'
         AND deleted_at IS NULL`,
        [FILE_STATUSES.UPLOADING],
      )

      const deletedFiles = []
      const errors = []

      // Удаляем старые файлы
      for (const file of oldFiles.rows) {
        try {
          // Удаляем из MinIO
          await deleteFile(file.file_name)

          // Помечаем как удаленный в БД
          await query(`UPDATE files SET status = $1, deleted_at = NOW() WHERE id = $2`, [
            FILE_STATUSES.DELETED,
            file.id,
          ])

          deletedFiles.push({
            id: file.id,
            name: file.original_name,
            createdAt: file.created_at,
          })
        } catch (error) {
          console.error(`🚨 Ошибка удаления файла ${file.file_name}:`, error.message)
          errors.push({
            id: file.id,
            name: file.original_name,
            error: error.message,
          })
        }
      }

      return {
        deleted: deletedFiles,
        errors,
        total: oldFiles.rows.length,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка очистки старых файлов', 'files', error)
    }
  }

  // Очистка дубликатов файлов
  async cleanupDuplicateFiles(userRole, userId) {
    try {
      if (!['admin', 'super_admin'].includes(userRole)) {
        throw createPermissionError('очистку дубликатов файлов', 'Недостаточно прав администратора')
      }

      // Находим дубликаты по хешу файла
      const duplicates = await query(
        `WITH ranked_files AS (
          SELECT 
            id, file_name, original_name, user_id, file_hash, file_type, created_at, status,
            ROW_NUMBER() OVER (PARTITION BY user_id, file_hash, file_type ORDER BY created_at ASC) as rn
          FROM files 
          WHERE status IN ($1, $2) AND deleted_at IS NULL
        )
        SELECT * FROM ranked_files WHERE rn > 1`,
        [FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
      )

      const deletedFiles = []
      const errors = []

      // Удаляем дубликаты (оставляем только самый первый файл)
      for (const file of duplicates.rows) {
        try {
          // Удаляем из MinIO
          await deleteFile(file.file_name)

          // Помечаем как удаленный в БД
          await query(`UPDATE files SET status = $1, deleted_at = NOW() WHERE id = $2`, [
            FILE_STATUSES.DELETED,
            file.id,
          ])

          deletedFiles.push({
            id: file.id,
            name: file.original_name,
            userId: file.user_id,
            createdAt: file.created_at,
          })
        } catch (error) {
          console.error(`🚨 Ошибка удаления дубликата ${file.file_name}:`, error.message)
          errors.push({
            id: file.id,
            name: file.original_name,
            error: error.message,
          })
        }
      }

      return {
        deleted: deletedFiles,
        errors,
        total: duplicates.rows.length,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка очистки дубликатов файлов', 'files', error)
    }
  }

  // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

  // Вычисление хеша файла
  calculateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
  }

  // Проверка существующего файла
  async checkExistingFile(userId, fileHash, fileType) {
    const result = await query(
      `SELECT id, file_name, status FROM files 
       WHERE user_id = $1 AND file_hash = $2 AND file_type = $3 
       AND status IN ($4, $5) AND deleted_at IS NULL`,
      [userId, fileHash, fileType, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
    )

    return result.rows.length > 0 ? result.rows[0] : null
  }

  // Создание записи файла в БД
  async createFileRecord(
    userId,
    file,
    minioFileName,
    fileType,
    fileHash,
    uploadResult,
    relatedEntityType,
    relatedEntityId,
  ) {
    const result = await query(
      `INSERT INTO files (
        user_id, related_entity_type, related_entity_id,
        original_name, file_name, file_type, mime_type, file_size,
        file_hash, public_url, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, created_at`,
      [
        userId,
        relatedEntityType || 'user',
        relatedEntityId || userId,
        file.originalname,
        minioFileName,
        fileType,
        file.mimetype,
        file.size,
        fileHash,
        getPublicFileUrl(minioFileName),
        FILE_STATUSES.UPLOADING, // Временный статус
        JSON.stringify({
          etag: uploadResult.etag,
          uploadedAt: new Date().toISOString(),
        }),
      ],
    )

    return result.rows[0]
  }

  // === ФОРМАТИРОВАНИЕ ДАННЫХ ===

  formatFileItem(file, fileUrl) {
    return {
      id: file.id,
      originalName: file.original_name,
      fileName: file.file_name,
      fileType: file.file_type,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      status: file.status,
      isVerified: file.is_verified,
      downloadCount: file.download_count,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      url: fileUrl,
    }
  }

  formatFileDetail(file, fileUrl) {
    return {
      id: file.id,
      originalName: file.original_name,
      fileName: file.file_name,
      fileType: file.file_type,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      url: fileUrl,
      isVerified: file.is_verified,
      downloadCount: file.download_count,
      createdAt: file.created_at,
      updatedAt: file.updated_at,
      relatedEntityType: file.related_entity_type,
      relatedEntityId: file.related_entity_id,
      metadata: file.metadata,
    }
  }

  // === МЕТОДЫ ДЛЯ ВРЕМЕННЫХ ССЫЛОК ===

  // Генерация временной ссылки для скачивания файла
  async generateTempLink(
    fileId,
    userId,
    userRole,
    expiryHours = TEMP_LINK_LIMITS.DEFAULT_EXPIRY_HOURS,
  ) {
    try {
      // Проверяем существование файла и права доступа
      const result = await query(
        `SELECT * FROM files 
         WHERE id = $1 AND status IN ($2, $3) AND deleted_at IS NULL`,
        [fileId, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
      )

      if (result.rows.length === 0) {
        throw createNotFoundError('Файл', fileId)
      }

      const file = result.rows[0]

      // Проверяем права доступа
      if (file.user_id !== userId) {
        if (!['admin', 'super_admin'].includes(userRole)) {
          throw createPermissionError('создание временных ссылок для чужих файлов')
        }
      }

      // Валидация времени жизни ссылки
      if (
        expiryHours < TEMP_LINK_LIMITS.MIN_EXPIRY_HOURS ||
        expiryHours > TEMP_LINK_LIMITS.MAX_EXPIRY_HOURS
      ) {
        throw createValidationError(
          `Время жизни ссылки должно быть от ${TEMP_LINK_LIMITS.MIN_EXPIRY_HOURS} до ${TEMP_LINK_LIMITS.MAX_EXPIRY_HOURS} часов`,
          'INVALID_EXPIRY_TIME',
          { min: TEMP_LINK_LIMITS.MIN_EXPIRY_HOURS, max: TEMP_LINK_LIMITS.MAX_EXPIRY_HOURS },
        )
      }

      // Проверяем количество активных ссылок пользователя
      const activeLinksCount = await query(
        `SELECT COUNT(*) as count FROM temp_download_links 
         WHERE created_by = $1 AND expires_at > NOW() AND is_used = FALSE`,
        [userId],
      )

      if (parseInt(activeLinksCount.rows[0].count) >= TEMP_LINK_LIMITS.MAX_ACTIVE_LINKS_PER_USER) {
        throw createBusinessLogicError(
          `Превышено максимальное количество активных ссылок (${TEMP_LINK_LIMITS.MAX_ACTIVE_LINKS_PER_USER})`,
          'TOO_MANY_ACTIVE_LINKS',
        )
      }

      // Проверяем количество ссылок на этот файл
      const fileLinksCount = await query(
        `SELECT COUNT(*) as count FROM temp_download_links 
         WHERE file_id = $1 AND expires_at > NOW() AND is_used = FALSE`,
        [fileId],
      )

      if (parseInt(fileLinksCount.rows[0].count) >= TEMP_LINK_LIMITS.MAX_LINKS_PER_FILE) {
        throw createBusinessLogicError(
          `Превышено максимальное количество ссылок на файл (${TEMP_LINK_LIMITS.MAX_LINKS_PER_FILE})`,
          'TOO_MANY_FILE_LINKS',
        )
      }

      // Генерируем уникальный токен
      const token = this.generateSecureToken()
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000)

      // Сохраняем временную ссылку в БД
      await query(
        `INSERT INTO temp_download_links (file_id, token, created_by, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [fileId, token, userId, expiresAt],
      )

      // Формируем полный URL для скачивания
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000'
      const tempLink = `${baseUrl}/api/files/download/temp/${token}`

      console.log(`🔗 Создана временная ссылка для файла ${file.original_name}: ${tempLink}`)

      return {
        tempLink,
        expiresAt,
        fileName: file.original_name,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError('Ошибка создания временной ссылки', 'temp_download_links', error)
    }
  }

  // Скачивание файла по временной ссылке
  async downloadFileByTempLink(token, req) {
    try {
      // Находим активную временную ссылку
      const linkResult = await query(
        `SELECT tdl.*, f.original_name, f.file_name, f.mime_type, f.file_size, f.status
         FROM temp_download_links tdl
         JOIN files f ON tdl.file_id = f.id
         WHERE tdl.token = $1 
         AND tdl.expires_at > NOW()
         AND tdl.is_used = FALSE
         AND f.status IN ($2, $3)
         AND f.deleted_at IS NULL`,
        [token, FILE_STATUSES.ACTIVE, FILE_STATUSES.UPLOADING],
      )

      if (linkResult.rows.length === 0) {
        throw createNotFoundError('Временная ссылка', token)
      }

      const link = linkResult.rows[0]

      // Помечаем ссылку как использованную
      await query(
        `UPDATE temp_download_links 
         SET is_used = TRUE, used_at = NOW(), used_ip = $1
         WHERE id = $2`,
        [this.getClientIP(req), link.id],
      )

      // Получаем stream файла из MinIO
      const fileStream = await getFileStream(link.file_name)

      // Обновляем счетчик скачиваний файла
      await query(`UPDATE files SET download_count = download_count + 1 WHERE id = $1`, [
        link.file_id,
      ])

      console.log(`📥 Скачивание файла по временной ссылке: ${link.original_name}`)

      return {
        stream: fileStream,
        fileName: link.original_name,
        mimeType: link.mime_type,
        fileSize: link.file_size,
      }
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError(
        'Ошибка скачивания файла по временной ссылке',
        'temp_download_links',
        error,
      )
    }
  }

  // Очистка истекших временных ссылок
  async cleanupExpiredTempLinks() {
    try {
      const result = await query(
        `DELETE FROM temp_download_links 
         WHERE expires_at < NOW() OR is_used = TRUE`,
      )

      console.log(`🧹 Очищено ${result.rowCount} истекших временных ссылок`)
      return result.rowCount
    } catch (error) {
      console.error('🚨 Ошибка очистки истекших временных ссылок:', error.message)
      throw error
    }
  }

  // Удаление временной ссылки
  async deleteTempLink(tempLinkId, userId) {
    try {
      const result = await query(
        `DELETE FROM temp_download_links 
         WHERE id = $1 AND created_by = $2 
         RETURNING id`,
        [tempLinkId, userId],
      )

      if (result.rows.length === 0) {
        throw createNotFoundError('Временная ссылка не найдена', 'temp_link')
      }

      console.log(`🗑️ Временная ссылка ${tempLinkId} удалена пользователем ${userId}`)
      return true
    } catch (error) {
      console.error('❌ Ошибка удаления временной ссылки:', error)
      throw error
    }
  }

  // Получение статистики временных ссылок пользователя
  async getTempLinksStats(userId, userRole) {
    try {
      let whereClause = 'WHERE tdl.created_by = $1'
      const params = [userId]

      // Админы могут видеть все ссылки
      if (['admin', 'super_admin'].includes(userRole)) {
        whereClause = ''
        params.length = 0
      }

      const result = await query(
        `SELECT 
          tdl.id, tdl.token, tdl.expires_at, tdl.is_used, tdl.used_at, tdl.created_at,
          f.original_name, f.file_name, f.file_type
         FROM temp_download_links tdl
         JOIN files f ON tdl.file_id = f.id
         ${whereClause}
         ORDER BY tdl.created_at DESC`,
        params,
      )

      return result.rows.map((row) => ({
        id: row.id,
        token: row.token,
        expiresAt: row.expires_at,
        isUsed: row.is_used,
        usedAt: row.used_at,
        createdAt: row.created_at,
        fileName: row.original_name,
        fileType: row.file_type,
        isExpired: new Date(row.expires_at) < new Date(),
      }))
    } catch (error) {
      if (error.type) throw error
      throw createDatabaseError(
        'Ошибка получения статистики временных ссылок',
        'temp_download_links',
        error,
      )
    }
  }

  // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

  // Генерация безопасного токена
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex')
  }

  // Получение IP адреса клиента
  getClientIP(req) {
    // IP адрес должен передаваться из middleware
    return req?.clientIP || '127.0.0.1'
  }
}

module.exports = new FilesService()
