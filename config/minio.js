const Minio = require('minio')
require('dotenv').config({ path: './config.env' })

// Создание MinIO клиента
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || '192.168.13.19',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
})

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'gubkin-dormitory'

// Функция для инициализации bucket
const initializeBucket = async () => {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME)

    if (!bucketExists) {
      console.log(`Создание bucket: ${BUCKET_NAME}`)
      await minioClient.makeBucket(BUCKET_NAME, 'us-east-1')

      // Устанавливаем политику доступа для чтения файлов
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/public/*`],
          },
        ],
      }

      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy))
      console.log(`Bucket ${BUCKET_NAME} создан и настроен`)
    } else {
      console.log(`Bucket ${BUCKET_NAME} уже существует`)
    }
  } catch (error) {
    console.error('Ошибка инициализации MinIO bucket:', error)
    throw error
  }
}

// Функция для генерации уникального имени файла
const generateFileName = (originalName, userId, fileType) => {
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 8)

  // Безопасное извлечение расширения файла
  const extension = originalName.split('.').pop() || 'unknown'

  // Создаем безопасное имя файла только из латинских символов
  const safeFileName = `${timestamp}-${randomString}.${extension}`

  return `${fileType}/${userId}/${safeFileName}`
}

// Функция для загрузки файла
const uploadFile = async (fileBuffer, fileName, contentType, metadata = {}) => {
  try {
    // Очищаем и нормализуем метаданные
    const cleanMetadata = {
      'Content-Type': contentType,
    }

    // Добавляем безопасные метаданные
    Object.entries(metadata).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        // Очищаем ключ от недопустимых символов
        const cleanKey = key.replace(/[^a-zA-Z0-9\-_]/g, '-')
        cleanMetadata[cleanKey] = value
      }
    })

    const uploadInfo = await minioClient.putObject(
      BUCKET_NAME,
      fileName,
      fileBuffer,
      fileBuffer.length,
      cleanMetadata,
    )

    console.log(`Файл загружен в MinIO: ${fileName}`)
    return {
      success: true,
      fileName,
      size: fileBuffer.length,
      etag: uploadInfo.etag,
    }
  } catch (error) {
    console.error('Ошибка загрузки файла в MinIO:', error)
    console.error('Детали ошибки:', {
      fileName,
      contentType,
      bufferSize: fileBuffer.length,
      error: error.message,
    })
    throw error
  }
}

// Функция для получения URL файла
const getFileUrl = (fileName, expirySeconds = 24 * 60 * 60) => {
  try {
    return minioClient.presignedGetObject(BUCKET_NAME, fileName, expirySeconds)
  } catch (error) {
    console.error('Ошибка получения URL файла:', error)
    throw error
  }
}

// Функция для получения публичного URL файла
const getPublicFileUrl = (fileName) => {
  const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'
  const port =
    process.env.MINIO_PORT !== '80' && process.env.MINIO_PORT !== '443'
      ? `:${process.env.MINIO_PORT}`
      : ''

  return `${protocol}://${process.env.MINIO_ENDPOINT}${port}/${BUCKET_NAME}/${fileName}`
}

// Функция для удаления файла
const deleteFile = async (fileName) => {
  try {
    await minioClient.removeObject(BUCKET_NAME, fileName)
    console.log(`Файл удален из MinIO: ${fileName}`)
    return true
  } catch (error) {
    console.error('Ошибка удаления файла из MinIO:', error)
    throw error
  }
}

// Функция для проверки существования файла
const fileExists = async (fileName) => {
  try {
    await minioClient.statObject(BUCKET_NAME, fileName)
    return true
  } catch (error) {
    if (error.code === 'NotFound') {
      return false
    }
    throw error
  }
}

// Функция для получения метаданных файла
const getFileMetadata = async (fileName) => {
  try {
    const stat = await minioClient.statObject(BUCKET_NAME, fileName)
    return {
      size: stat.size,
      lastModified: stat.lastModified,
      etag: stat.etag,
      contentType: stat.metaData['content-type'],
    }
  } catch (error) {
    console.error('Ошибка получения метаданных файла:', error)
    throw error
  }
}

module.exports = {
  minioClient,
  BUCKET_NAME,
  initializeBucket,
  generateFileName,
  uploadFile,
  getFileUrl,
  getPublicFileUrl,
  deleteFile,
  fileExists,
  getFileMetadata,
}
