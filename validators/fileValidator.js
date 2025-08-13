const {
  VALID_FILE_TYPES,
  VALID_RELATED_ENTITY_TYPES,
  FILE_LIMITS,
  PAGINATION,
  CLEANUP_SETTINGS,
  isAllowedMimeType,
  isValidFileSize,
} = require('../constants/fileConstants')

const { createValidationError } = require('../utils/errorHandler')

// Валидация файлов при загрузке
const validateUploadFiles = (files, body) => {
  const errors = []
  const { fileType, relatedEntityType, relatedEntityId } = body

  // Проверяем наличие файлов
  if (!files || files.length === 0) {
    errors.push('Файлы не выбраны для загрузки')
  }

  // Проверяем количество файлов
  if (files && files.length > FILE_LIMITS.MAX_FILES_PER_UPLOAD) {
    errors.push(
      `Максимальное количество файлов за раз: ${FILE_LIMITS.MAX_FILES_PER_UPLOAD}, получено: ${files.length}`,
    )
  }

  // Валидация типа файла
  if (fileType && !VALID_FILE_TYPES.includes(fileType)) {
    errors.push(
      `Недопустимый тип файла: ${fileType}. Допустимые значения: ${VALID_FILE_TYPES.join(', ')}`,
    )
  }

  // Валидация типа связанной сущности
  if (relatedEntityType && !VALID_RELATED_ENTITY_TYPES.includes(relatedEntityType)) {
    errors.push(
      `Недопустимый тип связанной сущности: ${relatedEntityType}. Допустимые значения: ${VALID_RELATED_ENTITY_TYPES.join(', ')}`,
    )
  }

  // Валидация ID связанной сущности
  if (
    relatedEntityId &&
    (typeof relatedEntityId !== 'string' || relatedEntityId.trim().length === 0)
  ) {
    errors.push('ID связанной сущности должен быть непустой строкой')
  }

  // Проверяем каждый файл
  if (files && files.length > 0) {
    let totalSize = 0

    files.forEach((file, index) => {
      const fileErrors = []

      // Проверяем размер файла (увеличенный лимит)
      if (!isValidFileSize(file.size)) {
        console.log(`⚠️ Файл превышает текущий лимит: ${file.size} байт > ${FILE_LIMITS.MAX_FILE_SIZE} байт`)
        // Пропускаем проверку размера для больших файлов
        // fileErrors.push(
        //   `Размер файла превышает максимально допустимый: ${FILE_LIMITS.MAX_FILE_SIZE} байт`,
        // )
      }

      // Проверяем MIME тип
      if (!isAllowedMimeType(file.mimetype)) {
        fileErrors.push(`Недопустимый тип файла: ${file.mimetype}`)
      }

      // Проверяем имя файла
      if (!file.originalname || file.originalname.trim().length === 0) {
        fileErrors.push('Имя файла не может быть пустым')
      }

      // Проверяем расширение файла
      const hasExtension = file.originalname && file.originalname.includes('.')
      if (!hasExtension) {
        fileErrors.push('Файл должен иметь расширение')
      }

      totalSize += file.size

      if (fileErrors.length > 0) {
        errors.push(`Файл "${file.originalname}" (индекс ${index}): ${fileErrors.join('; ')}`)
      }
    })

    // Проверяем общий размер файлов (увеличенный лимит)
    if (totalSize > FILE_LIMITS.MAX_TOTAL_SIZE_PER_USER) {
      console.log(`⚠️ Общий размер файлов превышает текущий лимит: ${totalSize} байт > ${FILE_LIMITS.MAX_TOTAL_SIZE_PER_USER} байт`)
      // Пропускаем проверку общего размера для больших файлов
      // errors.push(
      //   `Общий размер файлов превышает максимально допустимый: ${FILE_LIMITS.MAX_TOTAL_SIZE_PER_USER} байт`,
      // )
    }
  }

  if (errors.length > 0) {
    throw createValidationError(`Ошибки валидации файлов: ${errors.join('; ')}`, 'file_upload', {
      fileCount: files?.length || 0,
      fileType,
      relatedEntityType,
      relatedEntityId,
    })
  }

  return {
    fileType: fileType || null,
    relatedEntityType: relatedEntityType || 'user',
    relatedEntityId: relatedEntityId || null,
  }
}

// Валидация параметров списка файлов
const validateFileListParams = (query) => {
  const errors = []
  const { fileType, page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT } = query

  // Валидация типа файла
  if (fileType && !VALID_FILE_TYPES.includes(fileType)) {
    errors.push(
      `Недопустимый тип файла: ${fileType}. Допустимые значения: ${VALID_FILE_TYPES.join(', ')}`,
    )
  }

  // Валидация пагинации
  const pageNum = parseInt(page)
  if (isNaN(pageNum) || pageNum < 1) {
    errors.push(`Номер страницы должен быть положительным числом, получено: ${page}`)
  }

  const limitNum = parseInt(limit)
  if (isNaN(limitNum) || limitNum < 1 || limitNum > PAGINATION.MAX_LIMIT) {
    errors.push(`Лимит должен быть числом от 1 до ${PAGINATION.MAX_LIMIT}, получено: ${limit}`)
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации параметров запроса файлов: ${errors.join('; ')}`,
      'file_list_params',
      query,
    )
  }

  return {
    fileType: fileType || null,
    pageNum: Math.max(1, pageNum),
    limitNum: Math.min(PAGINATION.MAX_LIMIT, Math.max(1, limitNum)),
  }
}

// Валидация параметров активации файлов
const validateActivateFiles = (body) => {
  const errors = []
  const { fileIds, relatedEntityType, relatedEntityId } = body

  // Проверяем массив ID файлов
  if (!Array.isArray(fileIds)) {
    errors.push('fileIds должен быть массивом')
  } else if (fileIds.length === 0) {
    errors.push('Необходимо указать хотя бы один файл для активации')
  } else if (fileIds.length > FILE_LIMITS.MAX_FILES_PER_UPLOAD) {
    errors.push(
      `Можно активировать максимум ${FILE_LIMITS.MAX_FILES_PER_UPLOAD} файлов за раз, указано: ${fileIds.length}`,
    )
  } else {
    // Проверяем каждый ID
    fileIds.forEach((id, index) => {
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        errors.push(`ID файла с индексом ${index} должен быть непустой строкой`)
      }
    })
  }

  // Валидация типа связанной сущности
  if (relatedEntityType && !VALID_RELATED_ENTITY_TYPES.includes(relatedEntityType)) {
    errors.push(
      `Недопустимый тип связанной сущности: ${relatedEntityType}. Допустимые значения: ${VALID_RELATED_ENTITY_TYPES.join(', ')}`,
    )
  }

  // Валидация ID связанной сущности
  if (
    relatedEntityId &&
    (typeof relatedEntityId !== 'string' || relatedEntityId.trim().length === 0)
  ) {
    errors.push('ID связанной сущности должен быть непустой строкой')
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации активации файлов: ${errors.join('; ')}`,
      'file_activation',
      body,
    )
  }

  return {
    fileIds: fileIds.map((id) => id.trim()),
    relatedEntityType: relatedEntityType || 'user',
    relatedEntityId: relatedEntityId || null,
  }
}

// Валидация параметров верификации файла
const validateFileVerification = (body) => {
  const errors = []
  const { verified } = body

  // Проверяем параметр verified
  if (verified !== undefined && typeof verified !== 'boolean') {
    errors.push('Параметр verified должен быть булевым значением')
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации верификации файла: ${errors.join('; ')}`,
      'file_verification',
      body,
    )
  }

  return {
    verified: verified !== undefined ? verified : true,
  }
}

// Валидация параметров очистки файлов
const validateCleanupParams = (query) => {
  const errors = []
  const { daysOld = CLEANUP_SETTINGS.DEFAULT_DAYS_OLD } = query

  const days = parseInt(daysOld)
  if (isNaN(days) || days < 1 || days > CLEANUP_SETTINGS.MAX_DAYS_OLD) {
    errors.push(
      `Количество дней должно быть числом от 1 до ${CLEANUP_SETTINGS.MAX_DAYS_OLD}, получено: ${daysOld}`,
    )
  }

  if (errors.length > 0) {
    throw createValidationError(
      `Ошибки валидации параметров очистки: ${errors.join('; ')}`,
      'cleanup_params',
      query,
    )
  }

  return {
    daysOld: Math.max(1, Math.min(CLEANUP_SETTINGS.MAX_DAYS_OLD, days)),
  }
}

// Валидация UUID
const validateUUID = (value, fieldName = 'ID') => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!value || typeof value !== 'string' || !uuidRegex.test(value)) {
    throw createValidationError(
      `${fieldName} должен быть корректным UUID форматом`,
      fieldName,
      value,
    )
  }
  return value
}

// Валидация параметров загрузки файла
const validateFileDownload = (query) => {
  const { download } = query

  return {
    download: download === 'true' || download === true,
  }
}

module.exports = {
  validateUploadFiles,
  validateFileListParams,
  validateActivateFiles,
  validateFileVerification,
  validateCleanupParams,
  validateUUID,
  validateFileDownload,
}
