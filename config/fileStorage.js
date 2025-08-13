/**
 * Конфигурация файлового хранилища
 * Заменяет MinIO на внешние URL для файлов
 */

const crypto = require('crypto')
const path = require('path')

// Конфигурация внешнего файлового хранилища
const FILE_STORAGE_CONFIG = {
  // Основной URL для файлов (приоритетный) - убираем слеш в конце
  PRIMARY_URL: (process.env.FILE_STORAGE_URL || 'https://files.dormitory.gubkin.uz').replace(
    /\/$/,
    '',
  ),

  // Резервный URL (если основной недоступен) - убираем слеш в конце
  FALLBACK_URL: (process.env.FILE_STORAGE_FALLBACK_URL || 'https://45.138.159.79').replace(
    /\/$/,
    '',
  ),

  // Локальный URL для разработки - убираем слеш в конце
  LOCAL_URL: (process.env.FILE_STORAGE_LOCAL_URL || 'https://192.168.1.253:3000').replace(
    /\/$/,
    '',
  ),

  // Режим работы
  MODE: process.env.FILE_STORAGE_MODE || 'external', // 'external', 'local', 'hybrid'

  // Настройки для загрузки файлов
  UPLOAD_ENABLED: process.env.FILE_UPLOAD_ENABLED !== 'false',

  // Таймауты
  TIMEOUT: parseInt(process.env.FILE_STORAGE_TIMEOUT) || 10000,

  // Максимальный размер файла для загрузки
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
}

/**
 * Генерирует уникальное имя файла
 * @param {string} originalName - Оригинальное имя файла
 * @param {string} userId - ID пользователя
 * @param {string} fileType - Тип файла (используется только для метаданных)
 * @returns {string} Уникальное имя файла
 */
const generateFileName = (originalName, userId, fileType) => {
  const timestamp = Date.now()
  const randomString = crypto.randomBytes(8).toString('hex')
  const extension = path.extname(originalName)
  const baseName = path.basename(originalName, extension)

  // Очищаем имя файла от недопустимых символов
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9а-яА-Я\-_]/g, '_')

  // Убираем fileType из пути, чтобы избежать проблем с bucket names
  // Используем только userId и timestamp для уникальности
  return `${userId}/${timestamp}_${randomString}_${cleanBaseName}${extension}`
}

/**
 * Генерирует уникальное имя файла с типом в пути (для совместимости)
 * @param {string} originalName - Оригинальное имя файла
 * @param {string} userId - ID пользователя
 * @param {string} fileType - Тип файла
 * @returns {string} Уникальное имя файла
 */
const generateFileNameWithType = (originalName, userId, fileType) => {
  const timestamp = Date.now()
  const randomString = crypto.randomBytes(8).toString('hex')
  const extension = path.extname(originalName)
  const baseName = path.basename(originalName, extension)

  // Очищаем имя файла от недопустимых символов
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9а-яА-Я\-_]/g, '_')

  return `${fileType}/${userId}/${timestamp}_${randomString}_${cleanBaseName}${extension}`
}

/**
 * Получает URL для файла в зависимости от режима работы
 * @param {string} fileName - Имя файла
 * @param {string} mode - Режим работы ('external', 'local', 'hybrid')
 * @param {string} urlStructure - Структура URL ('simple', 'with-type', 'bucket')
 * @returns {string} URL файла
 */
const getFileUrl = (fileName, mode = FILE_STORAGE_CONFIG.MODE, urlStructure = 'simple') => {
  if (!fileName) {
    throw new Error('Имя файла обязательно')
  }

  let url
  switch (mode) {
    case 'external':
      // Для внешнего хранилища используем простую структуру без bucket names
      if (urlStructure === 'with-type' && fileName.includes('/')) {
        // Если fileName уже содержит путь с типом, используем как есть
        url = `${FILE_STORAGE_CONFIG.PRIMARY_URL}/upload/${fileName}`
      } else {
        // Иначе используем простую структуру
        url = `${FILE_STORAGE_CONFIG.PRIMARY_URL}/upload/${fileName}`
      }
      break

    case 'local':
      url = `${FILE_STORAGE_CONFIG.LOCAL_URL}/upload/${fileName}`
      break

    case 'hybrid':
      // В гибридном режиме используем внешний URL для чтения, локальный для записи
      url = `${FILE_STORAGE_CONFIG.PRIMARY_URL}/upload/${fileName}`
      break

    default:
      url = `${FILE_STORAGE_CONFIG.PRIMARY_URL}/upload/${fileName}`
  }

  // Очищаем URL от двойных слешей
  return url.replace(/([^:])\/+/g, '$1/')
}

/**
 * Получает резервный URL для файла
 * @param {string} fileName - Имя файла
 * @returns {string} Резервный URL файла
 */
const getFallbackFileUrl = (fileName) => {
  if (!fileName) {
    throw new Error('Имя файла обязательно')
  }

  return `${FILE_STORAGE_CONFIG.FALLBACK_URL}/upload/${fileName}`
}

/**
 * Получает локальный URL для файла
 * @param {string} fileName - Имя файла
 * @returns {string} Локальный URL файла
 */
const getLocalFileUrl = (fileName) => {
  if (!fileName) {
    throw new Error('Имя файла обязательно')
  }

  return `${FILE_STORAGE_CONFIG.LOCAL_URL}/upload/${fileName}`
}

/**
 * Проверяет доступность URL
 * @param {string} url - URL для проверки
 * @returns {Promise<boolean>} Доступен ли URL
 */
const checkUrlAvailability = async (url) => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FILE_STORAGE_CONFIG.TIMEOUT)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors',
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch (error) {
    console.warn(`URL недоступен: ${url}`, error.message)
    return false
  }
}

/**
 * Получает лучший доступный URL для файла
 * @param {string} fileName - Имя файла
 * @returns {Promise<string>} Доступный URL файла
 */
const getBestAvailableFileUrl = async (fileName) => {
  if (!fileName) {
    throw new Error('Имя файла обязательно')
  }

  const urls = [
    getFileUrl(fileName, 'external'),
    getFallbackFileUrl(fileName),
    getLocalFileUrl(fileName),
  ]

  for (const url of urls) {
    if (await checkUrlAvailability(url)) {
      return url
    }
  }

  // Если ни один URL не доступен, возвращаем основной
  return urls[0]
}

/**
 * Симулирует загрузку файла (для совместимости с MinIO API)
 * @param {Buffer} fileBuffer - Буфер файла
 * @param {string} fileName - Имя файла
 * @param {string} contentType - MIME тип
 * @param {Object} metadata - Метаданные
 * @returns {Promise<Object>} Результат загрузки
 */
const uploadFile = async (fileBuffer, fileName, contentType, metadata = {}) => {
  if (!FILE_STORAGE_CONFIG.UPLOAD_ENABLED) {
    throw new Error('Загрузка файлов отключена в текущей конфигурации')
  }

  // В реальной реализации здесь была бы загрузка на внешний сервер
  // Пока что симулируем успешную загрузку
  console.log(`📁 Симуляция загрузки файла: ${fileName}`)
  console.log(`📊 Размер: ${fileBuffer.length} байт`)
  console.log(`📋 Тип: ${contentType}`)

  return {
    success: true,
    fileName,
    size: fileBuffer.length,
    etag: crypto.createHash('md5').update(fileBuffer).digest('hex'),
    url: getFileUrl(fileName),
  }
}

/**
 * Симулирует удаление файла (для совместимости с MinIO API)
 * @param {string} fileName - Имя файла
 * @returns {Promise<boolean>} Результат удаления
 */
const deleteFile = async (fileName) => {
  console.log(`🗑️ Симуляция удаления файла: ${fileName}`)
  return true
}

/**
 * Проверяет существование файла
 * @param {string} fileName - Имя файла
 * @returns {Promise<boolean>} Существует ли файл
 */
const fileExists = async (fileName) => {
  try {
    const url = await getBestAvailableFileUrl(fileName)
    return await checkUrlAvailability(url)
  } catch (error) {
    return false
  }
}

/**
 * Получает метаданные файла
 * @param {string} fileName - Имя файла
 * @returns {Promise<Object>} Метаданные файла
 */
const getFileMetadata = async (fileName) => {
  try {
    const url = await getBestAvailableFileUrl(fileName)
    const response = await fetch(url, { method: 'HEAD' })

    if (response.ok) {
      return {
        size: parseInt(response.headers.get('content-length') || '0'),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        lastModified: response.headers.get('last-modified'),
        etag: response.headers.get('etag'),
      }
    }

    return null
  } catch (error) {
    console.error('Ошибка получения метаданных файла:', error)
    return null
  }
}

/**
 * Получает stream файла
 * @param {string} fileName - Имя файла
 * @returns {Promise<ReadableStream>} Stream файла
 */
const getFileStream = async (fileName) => {
  try {
    const url = await getBestAvailableFileUrl(fileName)
    const response = await fetch(url)

    if (response.ok) {
      return response.body
    }

    throw new Error('Файл не найден')
  } catch (error) {
    console.error('Ошибка получения файла:', error)
    throw error
  }
}

/**
 * Инициализация файлового хранилища (для совместимости)
 */
const initializeStorage = async () => {
  console.log('📦 Инициализация внешнего файлового хранилища')
  console.log(`📍 Основной URL: ${FILE_STORAGE_CONFIG.PRIMARY_URL}`)
  console.log(`📍 Резервный URL: ${FILE_STORAGE_CONFIG.FALLBACK_URL}`)
  console.log(`📍 Локальный URL: ${FILE_STORAGE_CONFIG.LOCAL_URL}`)
  console.log(`🔧 Режим: ${FILE_STORAGE_CONFIG.MODE}`)
  console.log(`📤 Загрузка: ${FILE_STORAGE_CONFIG.UPLOAD_ENABLED ? 'включена' : 'отключена'}`)

  // Проверяем доступность основных URL
  const primaryAvailable = await checkUrlAvailability(FILE_STORAGE_CONFIG.PRIMARY_URL)
  const fallbackAvailable = await checkUrlAvailability(FILE_STORAGE_CONFIG.FALLBACK_URL)
  const localAvailable = await checkUrlAvailability(FILE_STORAGE_CONFIG.LOCAL_URL)

  console.log(`✅ Основной URL: ${primaryAvailable ? 'доступен' : 'недоступен'}`)
  console.log(`✅ Резервный URL: ${fallbackAvailable ? 'доступен' : 'недоступен'}`)
  console.log(`✅ Локальный URL: ${localAvailable ? 'доступен' : 'недоступен'}`)

  return {
    primaryAvailable,
    fallbackAvailable,
    localAvailable,
  }
}

/**
 * Обрабатывает существующий URL файла, конвертируя его в новую структуру
 * @param {string} oldUrl - Старый URL с fileType в пути
 * @returns {string} Новый URL с простой структурой
 */
const migrateFileUrl = (oldUrl) => {
  if (!oldUrl) return null

  try {
    const url = new URL(oldUrl)

    // Если URL содержит старую структуру с fileType в пути
    if (
      url.pathname.includes('/photo_3x4/') ||
      url.pathname.includes('/avatar/') ||
      url.pathname.includes('/profile/')
    ) {
      // Извлекаем имя файла из старого пути
      const pathParts = url.pathname.split('/')
      const fileName = pathParts[pathParts.length - 1]

      // Создаем новый URL с простой структурой
      return `${FILE_STORAGE_CONFIG.PRIMARY_URL}/upload/${fileName}`
    }

    // Если URL уже в новой структуре, возвращаем как есть
    return oldUrl
  } catch (error) {
    console.warn('Ошибка обработки URL:', error)
    return oldUrl
  }
}

/**
 * Проверяет, является ли URL старым форматом
 * @param {string} url - URL для проверки
 * @returns {boolean} True если URL в старом формате
 */
const isOldFormatUrl = (url) => {
  if (!url) return false

  try {
    const urlObj = new URL(url)
    return (
      urlObj.pathname.includes('/photo_3x4/') ||
      urlObj.pathname.includes('/avatar/') ||
      urlObj.pathname.includes('/profile/')
    )
  } catch (error) {
    return false
  }
}

module.exports = {
  FILE_STORAGE_CONFIG,
  generateFileName,
  generateFileNameWithType,
  getFileUrl,
  getFallbackFileUrl,
  getLocalFileUrl,
  getBestAvailableFileUrl,
  checkUrlAvailability,
  uploadFile,
  deleteFile,
  fileExists,
  getFileMetadata,
  getFileStream,
  initializeStorage,
  migrateFileUrl,
  isOldFormatUrl,

  // Алиасы для совместимости с MinIO API
  initializeBucket: initializeStorage,
  getPublicFileUrl: getFileUrl,
  getProxyFileUrl: getFileUrl,
  getFileUrlByMode: getFileUrl,

  // Пустой клиент для совместимости
  minioClient: null,
  BUCKET_NAME: 'external-storage',
}
