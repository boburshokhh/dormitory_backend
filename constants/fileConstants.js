// Константы для файловой системы

const FILE_STATUSES = {
  UPLOADING: 'uploading',
  ACTIVE: 'active',
  DELETED: 'deleted',
  FAILED: 'failed',
}

const FILE_TYPES = {
  DOCUMENT: 'document',
  PASSPORT: 'passport',
  PHOTO_3X4: 'photo_3x4',
  AVATAR: 'avatar',
  CERTIFICATE: 'certificate',
  IMAGE: 'image',
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

const FILE_EXTENSIONS = {
  IMAGE: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  DOCUMENT: ['.pdf', '.doc', '.docx', '.txt'],
  SPREADSHEET: ['.xls', '.xlsx'],
  ARCHIVE: ['.zip', '.rar', '.7z'],
}

const FILE_LIMITS = {
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  MAX_FILES_PER_UPLOAD: 5,
  MAX_TOTAL_SIZE_PER_USER: 100 * 1024 * 1024, // 100MB
  PRESIGNED_URL_EXPIRY: 3600, // 1 час
}

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
}

const RELATED_ENTITY_TYPES = {
  USER: 'user',
  APPLICATION: 'application',
  PROFILE: 'profile',
  DOCUMENT: 'document',
}

const CLEANUP_SETTINGS = {
  DEFAULT_DAYS_OLD: 7,
  MAX_DAYS_OLD: 30,
}

// Массивы для валидации
const VALID_FILE_STATUSES = Object.values(FILE_STATUSES)
const VALID_FILE_TYPES = Object.values(FILE_TYPES)
const VALID_RELATED_ENTITY_TYPES = Object.values(RELATED_ENTITY_TYPES)

// Определение типа файла по расширению
const getFileTypeByExtension = (filename) => {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))

  if (FILE_EXTENSIONS.IMAGE.includes(ext)) {
    return FILE_TYPES.IMAGE
  }

  if (FILE_EXTENSIONS.DOCUMENT.includes(ext)) {
    return FILE_TYPES.DOCUMENT
  }

  if (FILE_EXTENSIONS.SPREADSHEET.includes(ext)) {
    return FILE_TYPES.DOCUMENT
  }

  return FILE_TYPES.DOCUMENT
}

// Определение типа файла по полю формы
const getFileTypeByFieldName = (originalName, fieldName) => {
  if (fieldName === 'passport_file') return FILE_TYPES.PASSPORT
  if (fieldName === 'photo_3x4') return FILE_TYPES.PHOTO_3X4
  if (fieldName === 'avatar') return FILE_TYPES.AVATAR

  return getFileTypeByExtension(originalName)
}

// Проверка разрешенного типа MIME
const isAllowedMimeType = (mimeType) => {
  return ALLOWED_MIME_TYPES.includes(mimeType)
}

// Проверка максимального размера файла
const isValidFileSize = (size) => {
  return size <= FILE_LIMITS.MAX_FILE_SIZE
}

module.exports = {
  FILE_STATUSES,
  FILE_TYPES,
  ALLOWED_MIME_TYPES,
  FILE_EXTENSIONS,
  FILE_LIMITS,
  PAGINATION,
  RELATED_ENTITY_TYPES,
  CLEANUP_SETTINGS,
  VALID_FILE_STATUSES,
  VALID_FILE_TYPES,
  VALID_RELATED_ENTITY_TYPES,
  getFileTypeByExtension,
  getFileTypeByFieldName,
  isAllowedMimeType,
  isValidFileSize,
}
