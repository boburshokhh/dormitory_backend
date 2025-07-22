const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const path = require('path')
const { query } = require('../config/database')
const {
  initializeBucket,
  uploadFile,
  getFileUrl,
  getPublicFileUrl,
  deleteFile,
  generateFileName,
  fileExists,
} = require('../config/minio')
const loggingService = require('../services/loggingService')
const { authenticateToken, validateUUID } = require('../middleware/auth')

const router = express.Router()

// Применяем аутентификацию ко всем маршрутам
router.use(authenticateToken)

// Конфигурация multer для обработки загружаемых файлов
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 5, // максимум 5 файлов за раз
  },
  fileFilter: (req, file, cb) => {
    // Разрешенные типы файлов
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Неподдерживаемый тип файла: ${file.mimetype}`), false)
    }
  },
})

// Инициализация MinIO при запуске модуля
initializeBucket().catch(console.error)

// Функция для вычисления хеша файла
const calculateFileHash = (buffer) => {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// Функция для определения типа файла по имени
const determineFileType = (originalName, fieldName) => {
  const extension = path.extname(originalName).toLowerCase()

  if (fieldName === 'passport_file') return 'passport'
  if (fieldName === 'photo_3x4') return 'photo_3x4'
  if (fieldName === 'avatar') return 'avatar'

  // По расширению
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
    return fieldName === 'photo_3x4' ? 'photo_3x4' : 'document'
  }

  return 'document'
}

// POST /api/files/upload - Загрузка файлов
router.post('/upload', upload.array('files', 5), async (req, res) => {
  try {
    const { fileType, relatedEntityType, relatedEntityId } = req.body
    const files = req.files

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Файлы не выбраны' })
    }

    const uploadResults = []
    const errors = []

    for (const file of files) {
      try {
        console.log(`📤 Обработка файла: ${file.originalname}`)
        console.log(`   Размер: ${file.size} байт`)
        console.log(`   MIME тип: ${file.mimetype}`)

        // Вычисляем хеш файла
        const fileHash = calculateFileHash(file.buffer)

        // Проверяем, нет ли уже такого файла у пользователя (среди активных и загружающихся)
        const existingFile = await query(
          `SELECT id, file_name, status FROM files 
           WHERE user_id = $1 AND file_hash = $2 AND file_type = $3 AND status IN ('active', 'uploading') AND deleted_at IS NULL`,
          [req.user.id, fileHash, fileType || determineFileType(file.originalname, file.fieldname)],
        )

        if (existingFile.rows.length > 0) {
          // Файл уже существует
          const existingFileData = existingFile.rows[0]
          const fileUrl = await getFileUrl(existingFileData.file_name)

          uploadResults.push({
            id: existingFileData.id,
            originalName: file.originalname,
            url: fileUrl,
            status: existingFileData.status,
            message:
              existingFileData.status === 'active'
                ? 'Файл уже существует'
                : 'Файл уже загружен и ожидает активации',
          })

          console.log(
            `📋 Найден существующий файл: ${existingFileData.file_name} (статус: ${existingFileData.status})`,
          )
          continue
        }

        // Генерируем уникальное имя файла
        const minioFileName = generateFileName(
          file.originalname,
          req.user.id,
          fileType || determineFileType(file.originalname, file.fieldname),
        )

        console.log(`📁 Генерируем имя файла: ${minioFileName}`)

        // Загружаем файл в MinIO
        console.log(`🔄 Загружаем файл в MinIO...`)
        const uploadResult = await uploadFile(file.buffer, minioFileName, file.mimetype, {
          'uploaded-by': req.user.id,
          'original-name': Buffer.from(file.originalname, 'utf8').toString('base64'),
        })

        console.log(`✅ Файл успешно загружен в MinIO: ${minioFileName}`)

        // Сохраняем метаданные в БД со статусом 'uploading' (временный)
        const fileRecord = await query(
          `INSERT INTO files (
            user_id, related_entity_type, related_entity_id,
            original_name, file_name, file_type, mime_type, file_size,
            file_hash, public_url, status, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id, created_at`,
          [
            req.user.id,
            relatedEntityType || 'user',
            relatedEntityId || req.user.id,
            file.originalname,
            minioFileName,
            fileType || determineFileType(file.originalname, file.fieldname),
            file.mimetype,
            file.size,
            fileHash,
            getPublicFileUrl(minioFileName),
            'uploading', // Временный статус
            JSON.stringify({
              etag: uploadResult.etag,
              uploadedAt: new Date().toISOString(),
            }),
          ],
        )

        // Получаем URL для доступа к файлу
        const fileUrl = await getFileUrl(minioFileName)

        uploadResults.push({
          id: fileRecord.rows[0].id,
          originalName: file.originalname,
          fileName: minioFileName,
          url: fileUrl,
          size: file.size,
          mimeType: file.mimetype,
          createdAt: fileRecord.rows[0].created_at,
        })
      } catch (fileError) {
        console.error(`❌ Ошибка загрузки файла ${file.originalname}:`, fileError)
        console.error('🔍 Детали ошибки:', {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          errorMessage: fileError.message,
          errorCode: fileError.code,
          errorStack: fileError.stack,
        })

        errors.push({
          fileName: file.originalname,
          error: fileError.message,
        })
      }
    }

    // Логируем успешную загрузку
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'file_upload',
      actionDescription: `Uploaded ${uploadResults.length} files`,
      req,
      success: true,
      requestData: {
        fileCount: files.length,
        fileTypes: files.map((f) => f.mimetype),
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
      },
    })

    res.json({
      message: 'Файлы обработаны',
      uploaded: uploadResults,
      errors: errors,
      success: errors.length === 0,
    })
  } catch (error) {
    console.error('Ошибка загрузки файлов:', error)

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'file_upload',
      actionDescription: 'Failed to upload files',
      req,
      success: false,
      errorMessage: error.message,
    })

    res.status(500).json({ error: 'Ошибка загрузки файлов' })
  }
})

// GET /api/files - Получить список файлов пользователя
router.get('/', async (req, res) => {
  try {
    const { fileType, page = 1, limit = 20 } = req.query
    const pageNum = parseInt(page)
    const limitNum = parseInt(limit)
    const offset = (pageNum - 1) * limitNum

    let whereClause = 'WHERE user_id = $1 AND status IN ($2, $3) '
    const params = [req.user.id, 'active', 'uploading']
    console.log('params', params)
    let paramCount = 3

    if (fileType) {
      whereClause += ` AND file_type = $${++paramCount}`
      params.push(fileType)
    }

    const result = await query(
      `SELECT 
        id, original_name, file_name, file_type, mime_type, file_size,
        status, is_verified, download_count, created_at, updated_at
       FROM files 
       ${whereClause}
       ORDER BY created_at DESC`,
      [...params, limitNum, offset],
    )

    // Генерируем временные URL для файлов
    const filesWithUrls = await Promise.all(
      result.rows.map(async (file) => {
        try {
          const url = await getFileUrl(file.file_name)
          return { ...file, url }
        } catch (error) {
          console.error(`Ошибка получения URL для файла ${file.file_name}:`, error)
          return { ...file, url: null }
        }
      }),
    )

    // Подсчет общего количества
    const countResult = await query(
      `SELECT COUNT(*) as total FROM files ${whereClause}`,
      params.slice(0, paramCount - 2),
    )

    res.json({
      files: filesWithUrls,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limitNum),
      },
    })
  } catch (error) {
    console.error('Ошибка получения файлов:', error)
    res.status(500).json({ error: 'Ошибка получения файлов' })
  }
})

// GET /api/files/:id - Получить конкретный файл
router.get('/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params
    const { download = false } = req.query

    const result = await query(
      `SELECT * FROM files WHERE id = $1 AND status IN ('active', 'uploading') AND deleted_at IS NULL`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' })
    }

    const file = result.rows[0]

    // Проверяем права доступа
    if (file.user_id !== req.user.id) {
      // Проверяем, может ли пользователь просматривать чужие файлы
      if (!['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен' })
      }
    }

    // Генерируем URL для доступа к файлу
    const fileUrl = await getFileUrl(file.file_name, 3600) // 1 час

    // Если это скачивание, обновляем счетчик
    if (download === 'true') {
      await query(`UPDATE files SET download_count = download_count + 1 WHERE id = $1`, [id])
    }

    res.json({
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
    })
  } catch (error) {
    console.error('Ошибка получения файла:', error)
    res.status(500).json({ error: 'Ошибка получения файла' })
  }
})

// DELETE /api/files/:id - Удалить файл
router.delete('/:id', validateUUID('id'), async (req, res) => {
  try {
    const { id } = req.params

    const result = await query(
      `SELECT * FROM files WHERE id = $1 AND status IN ('active', 'uploading') AND deleted_at IS NULL`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' })
    }

    const file = result.rows[0]

    // Проверяем права доступа
    if (file.user_id !== req.user.id) {
      if (!['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Доступ запрещен' })
      }
    }

    // Мягкое удаление в БД
    await query(`UPDATE files SET status = 'deleted', deleted_at = NOW() WHERE id = $1`, [id])

    // Удаляем файл из MinIO (опционально)
    try {
      await deleteFile(file.file_name)
    } catch (minioError) {
      console.error('Ошибка удаления файла из MinIO:', minioError)
      // Не прерываем операцию, так как запись в БД уже обновлена
    }

    // Логируем удаление
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'file_delete',
      actionDescription: `Deleted file: ${file.original_name}`,
      req,
      success: true,
      requestData: { fileId: id, fileName: file.original_name },
    })

    res.json({ message: 'Файл удален' })
  } catch (error) {
    console.error('Ошибка удаления файла:', error)
    res.status(500).json({ error: 'Ошибка удаления файла' })
  }
})

// GET /api/files/user/:userId - Получить файлы пользователя (только для админов)
router.get('/user/:userId', validateUUID('userId'), async (req, res) => {
  try {
    // Проверяем права администратора
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ запрещен' })
    }

    const { userId } = req.params
    const { fileType } = req.query

    let whereClause = 'WHERE f.user_id = $1 AND f.status = $2'
    const params = [userId, 'active']
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
        try {
          const url = await getFileUrl(file.file_name)
          return { ...file, url }
        } catch (error) {
          console.error(`Ошибка получения URL для файла ${file.file_name}:`, error)
          return { ...file, url: null }
        }
      }),
    )

    res.json({ files: filesWithUrls })
  } catch (error) {
    console.error('Ошибка получения файлов пользователя:', error)
    res.status(500).json({ error: 'Ошибка получения файлов пользователя' })
  }
})

// PUT /api/files/:id/verify - Подтвердить файл (только для админов)
router.put('/:id/verify', validateUUID('id'), async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Доступ запрещен' })
    }

    const { id } = req.params
    const { verified = true } = req.body

    const result = await query(
      `UPDATE files 
       SET is_verified = $1, verified_by = $2, verified_at = NOW()
       WHERE id = $3 AND status = 'active'
       RETURNING original_name`,
      [verified, req.user.id, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Файл не найден' })
    }

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'file_verify',
      actionDescription: `${verified ? 'Verified' : 'Unverified'} file: ${result.rows[0].original_name}`,
      req,
      success: true,
      requestData: { fileId: id, verified },
    })

    res.json({
      message: verified ? 'Файл подтвержден' : 'Подтверждение файла снято',
    })
  } catch (error) {
    console.error('Ошибка подтверждения файла:', error)
    res.status(500).json({ error: 'Ошибка подтверждения файла' })
  }
})

// POST /api/files/activate - Активировать файлы пользователя (при сохранении профиля)
router.post('/activate', async (req, res) => {
  try {
    const { fileIds, relatedEntityType, relatedEntityId } = req.body

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'Необходимо указать файлы для активации' })
    }

    // Проверяем, что все файлы принадлежат пользователю
    const filesCheck = await query(
      `SELECT id, file_name, original_name, status FROM files 
       WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL`,
      [fileIds, req.user.id],
    )

    if (filesCheck.rows.length !== fileIds.length) {
      return res.status(403).json({ error: 'Некоторые файлы не найдены или не принадлежат вам' })
    }

    // Активируем файлы и обновляем связанную сущность
    const activatedFiles = await query(
      `UPDATE files 
       SET status = 'active', 
           related_entity_type = $1,
           related_entity_id = $2,
           updated_at = now()
       WHERE id = ANY($3) AND user_id = $4 AND deleted_at IS NULL
       RETURNING id, file_name, original_name, file_type, status`,
      [relatedEntityType || 'user', relatedEntityId || req.user.id, fileIds, req.user.id],
    )

    // Логируем активацию
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'files_activate',
      actionDescription: `Activated ${activatedFiles.rows.length} files`,
      req,
      success: true,
      requestData: {
        fileIds,
        relatedEntityType: relatedEntityType || 'user',
        relatedEntityId: relatedEntityId || req.user.id,
      },
    })

    res.json({
      message: 'Файлы успешно активированы',
      activatedFiles: activatedFiles.rows,
    })
  } catch (error) {
    console.error('Ошибка активации файлов:', error)

    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'files_activate',
      actionDescription: 'Failed to activate files',
      req,
      success: false,
      errorMessage: error.message,
    })

    res.status(500).json({ error: 'Ошибка активации файлов' })
  }
})

// GET /api/files/cleanup - Очистить старые временные файлы (админская функция)
router.get('/cleanup', async (req, res) => {
  try {
    // Проверяем права админа
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' })
    }

    const { daysOld = 7 } = req.query

    // Находим старые временные файлы
    const oldFiles = await query(
      `SELECT id, file_name, original_name, user_id, created_at 
       FROM files 
       WHERE status = 'uploading' 
       AND created_at < now() - interval '${parseInt(daysOld)} days'
       AND deleted_at IS NULL`,
    )

    const deletedFiles = []
    const errors = []

    // Удаляем старые файлы
    for (const file of oldFiles.rows) {
      try {
        // Удаляем из MinIO
        await deleteFile(file.file_name)

        // Помечаем как удаленный в БД
        await query(`UPDATE files SET status = 'deleted', deleted_at = now() WHERE id = $1`, [
          file.id,
        ])

        deletedFiles.push({
          id: file.id,
          name: file.original_name,
          createdAt: file.created_at,
        })
      } catch (error) {
        console.error(`Ошибка удаления файла ${file.file_name}:`, error)
        errors.push({
          id: file.id,
          name: file.original_name,
          error: error.message,
        })
      }
    }

    // Логируем очистку
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'files_cleanup',
      actionDescription: `Cleaned up ${deletedFiles.length} old temporary files`,
      req,
      success: true,
      requestData: { daysOld: parseInt(daysOld), deletedCount: deletedFiles.length },
    })

    res.json({
      message: 'Очистка завершена',
      deleted: deletedFiles,
      errors,
      total: oldFiles.rows.length,
    })
  } catch (error) {
    console.error('Ошибка очистки файлов:', error)
    res.status(500).json({ error: 'Ошибка очистки файлов' })
  }
})

// POST /api/files/cleanup-duplicates - Очистить дубликаты файлов (админская функция)
router.post('/cleanup-duplicates', async (req, res) => {
  try {
    // Проверяем права админа
    if (!['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' })
    }

    // Находим дубликаты по хешу файла
    const duplicates = await query(
      `WITH ranked_files AS (
        SELECT 
          id, file_name, original_name, user_id, file_hash, file_type, created_at, status,
          ROW_NUMBER() OVER (PARTITION BY user_id, file_hash, file_type ORDER BY created_at ASC) as rn
        FROM files 
        WHERE status IN ('active', 'uploading') AND deleted_at IS NULL
      )
      SELECT * FROM ranked_files WHERE rn > 1`,
    )

    const deletedFiles = []
    const errors = []

    // Удаляем дубликаты (оставляем только самый первый файл)
    for (const file of duplicates.rows) {
      try {
        // Удаляем из MinIO
        await deleteFile(file.file_name)

        // Помечаем как удаленный в БД
        await query(`UPDATE files SET status = 'deleted', deleted_at = now() WHERE id = $1`, [
          file.id,
        ])

        deletedFiles.push({
          id: file.id,
          name: file.original_name,
          userId: file.user_id,
          createdAt: file.created_at,
        })
      } catch (error) {
        console.error(`Ошибка удаления дубликата ${file.file_name}:`, error)
        errors.push({
          id: file.id,
          name: file.original_name,
          error: error.message,
        })
      }
    }

    // Логируем очистку дубликатов
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'files_cleanup_duplicates',
      actionDescription: `Cleaned up ${deletedFiles.length} duplicate files`,
      req,
      success: true,
      requestData: { deletedCount: deletedFiles.length },
    })

    res.json({
      message: 'Очистка дубликатов завершена',
      deleted: deletedFiles,
      errors,
      total: duplicates.rows.length,
    })
  } catch (error) {
    console.error('Ошибка очистки дубликатов:', error)
    res.status(500).json({ error: 'Ошибка очистки дубликатов' })
  }
})

module.exports = router
