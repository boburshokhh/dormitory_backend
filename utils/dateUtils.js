/**
 * Утилиты для работы с датами
 */

/**
 * Получает диапазон дат для текущего месяца
 * @returns {Object} Объект с полями from и to в формате YYYY-MM-DD
 */
const getCurrentMonthRange = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Первый день текущего месяца
  const firstDay = new Date(year, month, 1)
  // Последний день текущего месяца
  const lastDay = new Date(year, month + 1, 0)

  // Форматируем в YYYY-MM-DD
  const formatDate = (date) => {
    return date.toLocaleDateString('en-CA')
  }

  return {
    from: formatDate(firstDay),
    to: formatDate(lastDay),
  }
}

/**
 * Получает диапазон дат для указанного месяца
 * @param {number} year - Год
 * @param {number} month - Месяц (0-11)
 * @returns {Object} Объект с полями from и to в формате YYYY-MM-DD
 */
const getMonthRange = (year, month) => {
  // Первый день указанного месяца
  const firstDay = new Date(year, month, 1)
  // Последний день указанного месяца
  const lastDay = new Date(year, month + 1, 0)

  // Форматируем в YYYY-MM-DD
  const formatDate = (date) => {
    return date.toLocaleDateString('en-CA')
  }

  return {
    from: formatDate(firstDay),
    to: formatDate(lastDay),
  }
}

/**
 * Форматирует дату в формат YYYY-MM-DD
 * @param {Date} date - Объект Date
 * @returns {string} Дата в формате YYYY-MM-DD
 */
const formatDateToISO = (date) => {
  return date.toLocaleDateString('en-CA')
}

/**
 * Форматирует дату из PostgreSQL в формат YYYY-MM-DD
 * Учитывает часовые пояса и предотвращает сдвиг даты
 * @param {Date} date - Объект Date из PostgreSQL
 * @returns {string} Дата в формате YYYY-MM-DD
 */
const formatDateFromDB = (date) => {
  if (!date) return null

  // Создаем новую дату, используя локальные компоненты
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()

  // Создаем дату в локальном времени
  const localDate = new Date(year, month, day)
  return localDate.toLocaleDateString('en-CA')
}

/**
 * Проверяет, является ли строка валидной датой в формате YYYY-MM-DD
 * @param {string} dateString - Строка даты
 * @returns {boolean} true, если дата валидна
 */
const isValidDateString = (dateString) => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateString)) {
    return false
  }

  const date = new Date(dateString)
  return !isNaN(date.getTime()) && date.toLocaleDateString('en-CA') === dateString
}

/**
 * Получает начало дня для указанной даты
 * @param {Date|string} date - Дата или строка даты
 * @returns {Date} Дата с временем 00:00:00
 */
const getStartOfDay = (date) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Получает конец дня для указанной даты
 * @param {Date|string} date - Дата или строка даты
 * @returns {Date} Дата с временем 23:59:59.999
 */
const getEndOfDay = (date) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/**
 * Применяет значения дат по умолчанию, если они не переданы
 * @param {Object} filters - Объект фильтров
 * @param {Object} defaults - Объект значений по умолчанию
 * @returns {Object} Объект фильтров с примененными значениями по умолчанию
 */
const applyDefaultDateFilters = (filters, defaults = null) => {
  const defaultRange = defaults || getCurrentMonthRange()

  return {
    ...filters,
    date_from: filters.date_from || defaultRange.from,
    date_to: filters.date_to || defaultRange.to,
  }
}

module.exports = {
  getCurrentMonthRange,
  getMonthRange,
  formatDateToISO,
  formatDateFromDB,
  isValidDateString,
  getStartOfDay,
  getEndOfDay,
  applyDefaultDateFilters,
}
