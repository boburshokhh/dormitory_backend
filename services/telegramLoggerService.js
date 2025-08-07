const axios = require('axios')
const { logger } = require('../utils/logger')

class TelegramLoggerService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN
    this.chatId = process.env.TELEGRAM_CHAT_ID
    this.enabled = process.env.TELEGRAM_LOGGING_ENABLED === 'true'
    this.logLevel = process.env.TELEGRAM_LOG_LEVEL || 'info' // Изменено на info для показа всех запросов
    this.terminalMode = process.env.TELEGRAM_TERMINAL_MODE === 'true' // Новый режим терминала

    // Уровни логирования
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    }

    // Эмодзи для разных типов сообщений
    this.emoji = {
      error: '🔴',
      warn: '🟡',
      info: '🔵',
      debug: '⚪',
      success: '🟢',
      security: '🔒',
      performance: '⚡',
      user: '👤',
      system: '🖥️',
      database: '💾',
      file: '📁',
      auth: '🔐',
      api: '🌐',
      request: '📥',
      response: '📤',
      sql: '🗃️',
    }

    // В режиме терминала отключаем буферизацию
    if (this.terminalMode) {
      this.messageBuffer = []
      this.bufferTimer = null
      this.bufferTimeout = 0 // Мгновенная отправка
    } else {
      // Счетчики для группировки сообщений
      this.messageCounters = {
        error: 0,
        warn: 0,
        info: 0,
      }

      // Буфер для группировки сообщений
      this.messageBuffer = []
      this.bufferTimer = null
      this.bufferTimeout = 5000 // 5 секунд
    }

    this.init()
  }

  init() {
    try {
      if (!this.enabled) {
        logger.info('Telegram logging is disabled')
        return
      }

      if (!this.botToken || !this.chatId) {
        logger.warn('Telegram bot token or chat ID not configured')
        return
      }

      logger.info('Telegram logging service initialized')

      // Отправляем сообщение о запуске сервиса только если есть токен и chat ID
      if (this.botToken && this.chatId) {
        this.sendStartupMessage().catch((error) => {
          logger.error('Failed to send startup message:', error.message)
        })
      }
    } catch (error) {
      logger.error('Error initializing Telegram logging service:', error.message)
    }
  }

  // Отправка сообщения о запуске сервиса
  async sendStartupMessage() {
    const message = this.formatStartupMessage()
    await this.sendTelegramMessage(message)
  }

  // Форматирование сообщения о запуске
  formatStartupMessage() {
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    return `${this.emoji.system} <b>Система логирования запущена</b>

📅 <b>Дата:</b> ${timestamp}
🌍 <b>Окружение:</b> ${process.env.NODE_ENV || 'development'}
🔧 <b>Версия:</b> ${process.env.npm_package_version || '1.0.0'}
📊 <b>Уровень логирования:</b> ${this.logLevel.toUpperCase()}

Система готова к работе! 🚀`
  }

  // Основной метод логирования
  async log(level, message, data = {}) {
    if (!this.enabled || !this.shouldLog(level)) {
      return
    }

    try {
      if (this.terminalMode) {
        // В режиме терминала отправляем сразу
        const formattedMessage = this.formatTerminalMessage(level, message, data)
        await this.sendTelegramMessage(formattedMessage)
      } else {
        // Обычный режим с буферизацией
        const formattedMessage = this.formatMessage(level, message, data)
        this.addToBuffer(level, formattedMessage)
      }
    } catch (error) {
      logger.error('Error in Telegram logging:', error)
    }
  }

  // Новый метод для форматирования сообщений в стиле терминала
  formatTerminalMessage(level, message, data = {}) {
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })

    const emoji = this.getEmojiForTerminal(level, data)

    // Формат как в терминале: время [уровень] сообщение
    let terminalMessage = `<code>${timestamp} ${emoji} ${message}</code>`

    // Добавляем дополнительную информацию на новых строках
    if (data.method && data.url) {
      terminalMessage += `\n<b>${data.method}</b> <code>${data.url}</code>`
    }

    if (data.statusCode) {
      const statusEmoji = data.statusCode >= 400 ? '❌' : '✅'
      terminalMessage += ` ${statusEmoji} <code>${data.statusCode}</code>`
    }

    if (data.duration) {
      terminalMessage += ` ⏱️ <code>${data.duration}</code>`
    }

    if (data.ip) {
      terminalMessage += `\n🌐 <code>${data.ip}</code>`
    }

    if (data.userId && data.userId !== 'anonymous') {
      terminalMessage += ` 👤 <code>user:${data.userId}</code>`
    }

    if (data.error) {
      terminalMessage += `\n❌ <code>${data.error}</code>`
    }

    if (data.sql) {
      terminalMessage += `\n💾 <code>${data.sql}</code>`
    }

    return terminalMessage
  }

  // Получение эмодзи для терминального режима
  getEmojiForTerminal(level, data = {}) {
    // Специальные эмодзи для определенных типов событий
    if (data.type === 'request') return this.emoji.request
    if (data.type === 'response') return this.emoji.response
    if (data.type === 'sql') return this.emoji.sql
    if (data.type === 'security') return this.emoji.security
    if (data.type === 'performance') return this.emoji.performance
    if (data.type === 'database') return this.emoji.database
    if (data.type === 'file') return this.emoji.file
    if (data.type === 'auth') return this.emoji.auth
    if (data.type === 'api') return this.emoji.api

    // Стандартные эмодзи для уровней
    return this.emoji[level] || this.emoji.info
  }

  // Проверка, нужно ли логировать на данном уровне
  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel]
  }

  // Добавление сообщения в буфер
  addToBuffer(level, message) {
    this.messageBuffer.push({ level, message, timestamp: Date.now() })
    this.messageCounters[level]++

    // Запускаем таймер для отправки буфера
    if (!this.bufferTimer) {
      this.bufferTimer = setTimeout(() => {
        this.flushBuffer()
      }, this.bufferTimeout)
    }
  }

  // Отправка буфера сообщений
  async flushBuffer() {
    if (this.messageBuffer.length === 0) {
      return
    }

    try {
      const groupedMessage = this.groupMessages()
      await this.sendTelegramMessage(groupedMessage)

      // Очищаем буфер
      this.messageBuffer = []
      this.messageCounters = { error: 0, warn: 0, info: 0 }
      this.bufferTimer = null
    } catch (error) {
      logger.error('Error flushing Telegram message buffer:', error)
    }
  }

  // Группировка сообщений по типам
  groupMessages() {
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    let message = `📊 <b>Логи системы (${timestamp})</b>\n\n`

    // Группируем по уровням
    const grouped = {}
    this.messageBuffer.forEach((item) => {
      if (!grouped[item.level]) {
        grouped[item.level] = []
      }
      grouped[item.level].push(item.message)
    })

    // Добавляем счетчики
    if (this.messageCounters.error > 0) {
      message += `${this.emoji.error} <b>Ошибки:</b> ${this.messageCounters.error}\n`
    }
    if (this.messageCounters.warn > 0) {
      message += `${this.emoji.warn} <b>Предупреждения:</b> ${this.messageCounters.warn}\n`
    }
    if (this.messageCounters.info > 0) {
      message += `${this.emoji.info} <b>Информация:</b> ${this.messageCounters.info}\n`
    }

    message += '\n'

    // Добавляем сообщения (максимум 3 каждого типа)
    Object.keys(grouped).forEach((level) => {
      const messages = grouped[level].slice(0, 3)
      messages.forEach((msg) => {
        message += msg + '\n'
      })

      if (grouped[level].length > 3) {
        message += `... и еще ${grouped[level].length - 3} сообщений\n`
      }
    })

    return message
  }

  // Форматирование сообщения
  formatMessage(level, message, data = {}) {
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    let formattedMessage = `${this.getEmoji(level, data)} <b>${this.getLevelName(level)}</b> (${timestamp})\n`
    formattedMessage += `${message}\n`

    // Добавляем дополнительные данные
    if (data.userId) {
      formattedMessage += `${this.emoji.user} <b>Пользователь:</b> ${data.userId}\n`
    }

    if (data.ip) {
      formattedMessage += `🌐 <b>IP:</b> ${data.ip}\n`
    }

    if (data.url) {
      formattedMessage += `🔗 <b>URL:</b> ${data.url}\n`
    }

    if (data.method) {
      formattedMessage += `📡 <b>Метод:</b> ${data.method}\n`
    }

    if (data.duration) {
      formattedMessage += `${this.emoji.performance} <b>Время:</b> ${data.duration}\n`
    }

    if (data.error) {
      formattedMessage += `❌ <b>Ошибка:</b> ${data.error}\n`
    }

    return formattedMessage
  }

  // Получение эмодзи для уровня и типа данных
  getEmoji(level, data = {}) {
    // Специальные эмодзи для определенных типов событий
    if (data.type === 'security') return this.emoji.security
    if (data.type === 'performance') return this.emoji.performance
    if (data.type === 'database') return this.emoji.database
    if (data.type === 'file') return this.emoji.file
    if (data.type === 'auth') return this.emoji.auth
    if (data.type === 'api') return this.emoji.api

    // Стандартные эмодзи для уровней
    return this.emoji[level] || this.emoji.info
  }

  // Получение названия уровня на русском
  getLevelName(level) {
    const names = {
      error: 'ОШИБКА',
      warn: 'ПРЕДУПРЕЖДЕНИЕ',
      info: 'ИНФОРМАЦИЯ',
      debug: 'ОТЛАДКА',
    }
    return names[level] || level.toUpperCase()
  }

  // Отправка сообщения в Telegram
  async sendTelegramMessage(message) {
    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`

      const response = await axios.post(url, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      })

      if (response.data.ok) {
        logger.debug('Telegram message sent successfully')
      } else {
        logger.error('Failed to send Telegram message:', response.data)
      }
    } catch (error) {
      logger.error('Error sending Telegram message:', error.message)
    }
  }

  // Специальные методы для разных типов логирования

  // Логирование ошибок
  async logError(message, data = {}) {
    await this.log('error', message, { ...data, type: 'error' })
  }

  // Логирование предупреждений
  async logWarning(message, data = {}) {
    await this.log('warn', message, { ...data, type: 'warning' })
  }

  // Логирование информации
  async logInfo(message, data = {}) {
    await this.log('info', message, { ...data, type: 'info' })
  }

  // Логирование отладки
  async logDebug(message, data = {}) {
    await this.log('debug', message, { ...data, type: 'debug' })
  }

  // Логирование безопасности
  async logSecurity(event, data = {}) {
    await this.log('warn', `Событие безопасности: ${event}`, { ...data, type: 'security' })
  }

  // Логирование производительности
  async logPerformance(operation, duration, data = {}) {
    await this.log('info', `Операция: ${operation}`, {
      ...data,
      type: 'performance',
      duration: `${duration}ms`,
    })
  }

  // Логирование пользовательских действий
  async logUserAction(action, userId, data = {}) {
    await this.log('info', `Действие пользователя: ${action}`, {
      ...data,
      type: 'user',
      userId,
    })
  }

  // Логирование API запросов (улучшенное для терминального режима)
  async logApiRequest(method, url, statusCode, duration, data = {}) {
    if (this.terminalMode) {
      // В терминальном режиме показываем как в логах сервера
      const level = statusCode >= 400 ? 'warn' : 'info'
      await this.log(level, `HTTP Request`, {
        ...data,
        type: 'request',
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
      })
    } else {
      // Обычный режим
      const level = statusCode >= 400 ? 'warn' : 'info'
      await this.log(level, `API ${method} ${url}`, {
        ...data,
        type: 'api',
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
      })
    }
  }

  // Логирование SQL запросов (новый метод для терминального режима)
  async logSqlQuery(query, duration, data = {}) {
    if (this.terminalMode) {
      await this.log('info', 'SQL Query', {
        ...data,
        type: 'sql',
        sql: query.length > 100 ? query.substring(0, 100) + '...' : query,
        duration: `${duration}ms`,
      })
    }
  }

  // Логирование запуска запроса (начало)
  async logRequestStart(method, url, data = {}) {
    if (this.terminalMode) {
      await this.log('info', 'Request Started', {
        ...data,
        type: 'request',
        method,
        url,
      })
    }
  }

  // Логирование завершения запроса
  async logRequestEnd(method, url, statusCode, duration, data = {}) {
    if (this.terminalMode) {
      await this.log('info', 'Request Completed', {
        ...data,
        type: 'response',
        method,
        url,
        statusCode,
        duration: `${duration}ms`,
      })
    }
  }

  // Логирование базы данных
  async logDatabase(operation, table, duration, data = {}) {
    await this.log('info', `База данных: ${operation} в таблице ${table}`, {
      ...data,
      type: 'database',
      operation,
      table,
      duration: `${duration}ms`,
    })
  }

  // Логирование файловых операций
  async logFileOperation(operation, filename, data = {}) {
    await this.log('info', `Файл: ${operation} ${filename}`, {
      ...data,
      type: 'file',
      operation,
      filename,
    })
  }

  // Логирование аутентификации
  async logAuth(action, userId, success, data = {}) {
    const message = `Аутентификация: ${action} ${success ? 'успешно' : 'неудачно'}`
    const level = success ? 'info' : 'warn'

    await this.log(level, message, {
      ...data,
      type: 'auth',
      userId,
      success,
    })
  }

  // Принудительная отправка буфера
  async forceFlush() {
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer)
      this.bufferTimer = null
    }
    await this.flushBuffer()
  }

  // Получение статистики
  getStats() {
    return {
      enabled: this.enabled,
      logLevel: this.logLevel,
      messageCounters: { ...this.messageCounters },
      bufferSize: this.messageBuffer.length,
    }
  }
}

// Создаем единственный экземпляр сервиса
const telegramLogger = new TelegramLoggerService()

module.exports = telegramLogger
