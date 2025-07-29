/**
 * Константы для временных ссылок на скачивание файлов
 */

const TEMP_LINK_LIMITS = {
  // Максимальное время жизни ссылки (в часах)
  MAX_EXPIRY_HOURS: 168, // 7 дней

  // Минимальное время жизни ссылки (в часах)
  MIN_EXPIRY_HOURS: 1, // 1 час

  // Время жизни ссылки по умолчанию (в часах)
  DEFAULT_EXPIRY_HOURS: 24, // 1 день

  // Максимальное количество активных ссылок на пользователя
  MAX_ACTIVE_LINKS_PER_USER: 50,

  // Максимальное количество ссылок на файл
  MAX_LINKS_PER_FILE: 10,
}

const TEMP_LINK_STATUSES = {
  ACTIVE: 'active',
  USED: 'used',
  EXPIRED: 'expired',
}

const TEMP_LINK_ERRORS = {
  LINK_EXPIRED: 'LINK_EXPIRED',
  LINK_ALREADY_USED: 'LINK_ALREADY_USED',
  LINK_NOT_FOUND: 'LINK_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  ACCESS_DENIED: 'ACCESS_DENIED',
  TOO_MANY_LINKS: 'TOO_MANY_LINKS',
  INVALID_EXPIRY: 'INVALID_EXPIRY',
}

module.exports = {
  TEMP_LINK_LIMITS,
  TEMP_LINK_STATUSES,
  TEMP_LINK_ERRORS,
}
