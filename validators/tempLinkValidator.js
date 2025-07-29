const { TEMP_LINK_LIMITS } = require('../constants/tempLinkConstants')

/**
 * Валидация параметров для создания временной ссылки
 */
const validateTempLinkCreation = (data) => {
  const { expiryHours } = data
  const errors = []

  // Валидация времени жизни ссылки
  if (expiryHours !== undefined) {
    const hours = parseInt(expiryHours)

    if (isNaN(hours)) {
      errors.push('Время жизни ссылки должно быть числом')
    } else if (hours < TEMP_LINK_LIMITS.MIN_EXPIRY_HOURS) {
      errors.push(
        `Время жизни ссылки не может быть меньше ${TEMP_LINK_LIMITS.MIN_EXPIRY_HOURS} часов`,
      )
    } else if (hours > TEMP_LINK_LIMITS.MAX_EXPIRY_HOURS) {
      errors.push(
        `Время жизни ссылки не может быть больше ${TEMP_LINK_LIMITS.MAX_EXPIRY_HOURS} часов`,
      )
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '))
  }

  return {
    expiryHours: expiryHours ? parseInt(expiryHours) : TEMP_LINK_LIMITS.DEFAULT_EXPIRY_HOURS,
  }
}

/**
 * Валидация токена временной ссылки
 */
const validateTempLinkToken = (token) => {
  if (!token || typeof token !== 'string') {
    throw new Error('Токен временной ссылки обязателен')
  }

  if (token.length !== 64) {
    throw new Error('Неверный формат токена')
  }

  // Проверяем, что токен содержит только шестнадцатеричные символы
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error('Неверный формат токена')
  }

  return token
}

/**
 * Валидация параметров для получения статистики
 */
const validateTempLinksStatsParams = (query) => {
  const { page = 1, limit = 20 } = query
  const errors = []

  // Валидация пагинации
  const pageNum = parseInt(page)
  const limitNum = parseInt(limit)

  if (isNaN(pageNum) || pageNum < 1) {
    errors.push('Номер страницы должен быть положительным числом')
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    errors.push('Лимит должен быть от 1 до 100')
  }

  if (errors.length > 0) {
    throw new Error(errors.join(', '))
  }

  return {
    pageNum,
    limitNum,
  }
}

module.exports = {
  validateTempLinkCreation,
  validateTempLinkToken,
  validateTempLinksStatsParams,
}
