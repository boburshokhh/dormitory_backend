const axios = require('axios')
const path = require('path')

class TelegramService {
  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN
    this.chatId = process.env.TELEGRAM_CHAT_ID
    this.isEnabled = !!(this.botToken && this.chatId)
    this.baseURL = `https://api.telegram.org/bot${this.botToken}`

    if (!this.isEnabled) {
      console.warn(
        '🤖 Telegram уведомления отключены: не настроены TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID',
      )
    } else {
      console.log('✅ Telegram уведомления активированы')
    }
  }

  /**
   * Форматирует ошибку в стиле терминала с номерами строк
   */
  formatErrorForTelegram(error, context = {}) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)

    // Извлекаем информацию из стека ошибки
    const stackLines = error.stack ? error.stack.split('\n') : []
    const errorLine = stackLines[0] || error.message
    const relevantStackLines = stackLines.slice(1, 6) // Первые 5 строк стека

    // Форматируем основную информацию об ошибке
    let message = `🚨 *ОШИБКА СИСТЕМЫ ОБЩЕЖИТИЯ*\n`
    message += `📅 ${timestamp}\n\n`

    // Основная ошибка
    message += `❌ \`${this.escapeMarkdown(errorLine)}\`\n\n`

    // Контекст запроса
    if (context.route) {
      message += `🌐 *Маршрут:* \`${this.escapeMarkdown(context.route)}\`\n`
    }
    if (context.userId && context.userId !== 'anonymous') {
      message += `👤 *Пользователь:* \`${context.userId}\` (${context.userRole || 'unknown'})\n`
    }
    if (context.ip) {
      message += `🌍 *IP:* \`${context.ip}\`\n`
    }

    // Stack trace в стиле терминала
    if (relevantStackLines.length > 0) {
      message += `\n📋 *Стек вызовов:*\n`
      relevantStackLines.forEach((line, index) => {
        const trimmedLine = line.trim()
        if (trimmedLine) {
          // Извлекаем имя файла и номер строки
          const match =
            trimmedLine.match(/at\s+.*?\s+\(([^)]+)\)/) || trimmedLine.match(/at\s+(.+)/)
          if (match) {
            const location = match[1]
            const lineMatch = location.match(/(.+):(\d+):(\d+)/)
            if (lineMatch) {
              const [, filePath, lineNum, colNum] = lineMatch
              const fileName = path.basename(filePath)
              message += `\`${String(index + 1).padStart(3, ' ')}| ${this.escapeMarkdown(fileName)}:${lineNum}:${colNum}\`\n`
            } else {
              message += `\`${String(index + 1).padStart(3, ' ')}| ${this.escapeMarkdown(location)}\`\n`
            }
          }
        }
      })
    }

    // Дополнительная информация об ошибке
    if (error.code) {
      message += `\n🔍 *Код ошибки:* \`${error.code}\`\n`
    }

    // Ограничиваем длину сообщения (Telegram лимит 4096 символов)
    if (message.length > 4000) {
      message = message.substring(0, 3950) + '\n...\n\n*Сообщение обрезано из-за длины*'
    }

    return message
  }

  /**
   * Экранирует символы Markdown для Telegram
   */
  escapeMarkdown(text) {
    if (!text) return ''
    return text
      .toString()
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!')
  }

  /**
   * Отправляет сообщение в Telegram
   */
  async sendMessage(text, options = {}) {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram не настроен' }
    }

    try {
      const response = await axios.post(`${this.baseURL}/sendMessage`, {
        chat_id: this.chatId,
        text: text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        ...options,
      })

      return { success: true, data: response.data }
    } catch (error) {
      console.error('❌ Ошибка отправки в Telegram:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Отправляет уведомление об ошибке в Telegram
   */
  async sendErrorNotification(error, context = {}) {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram не настроен' }
    }

    try {
      const formattedMessage = this.formatErrorForTelegram(error, context)
      return await this.sendMessage(formattedMessage)
    } catch (err) {
      console.error('❌ Ошибка форматирования сообщения для Telegram:', err.message)

      // Отправляем упрощенное сообщение об ошибке
      const fallbackMessage = `🚨 *КРИТИЧЕСКАЯ ОШИБКА*\n\n❌ \`${this.escapeMarkdown(error.message || 'Неизвестная ошибка')}\`\n\n⚠️ Не удалось отформатировать полное сообщение`
      return await this.sendMessage(fallbackMessage)
    }
  }

  /**
   * Отправляет уведомление о проблемах безопасности
   */
  async sendSecurityAlert(event, details = {}) {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram не настроен' }
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)

    let message = `🔒 *СОБЫТИЕ БЕЗОПАСНОСТИ*\n`
    message += `📅 ${timestamp}\n\n`
    message += `⚠️ \`${this.escapeMarkdown(event)}\`\n\n`

    if (details.ip) {
      message += `🌍 *IP:* \`${details.ip}\`\n`
    }
    if (details.url) {
      message += `🌐 *URL:* \`${this.escapeMarkdown(details.url)}\`\n`
    }
    if (details.method) {
      message += `📝 *Метод:* \`${details.method}\`\n`
    }
    if (details.error) {
      message += `❌ *Детали:* \`${this.escapeMarkdown(details.error)}\`\n`
    }

    return await this.sendMessage(message)
  }

  /**
   * Отправляет уведомление о критических событиях системы
   */
  async sendSystemAlert(event, details = {}) {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram не настроен' }
    }

    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)

    let message = `⚡ *СИСТЕМНОЕ СОБЫТИЕ*\n`
    message += `📅 ${timestamp}\n\n`
    message += `🔔 \`${this.escapeMarkdown(event)}\`\n\n`

    Object.entries(details).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        message += `• *${this.capitalizeFirst(key)}:* \`${this.escapeMarkdown(value.toString())}\`\n`
      }
    })

    return await this.sendMessage(message)
  }

  /**
   * Делает первую букву заглавной
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  /**
   * Проверяет соединение с Telegram
   */
  async testConnection() {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram не настроен' }
    }

    try {
      const response = await axios.get(`${this.baseURL}/getMe`)
      console.log('✅ Подключение к Telegram Bot успешно:', response.data.result.username)

      // Отправляем тестовое сообщение
      await this.sendMessage(
        '🤖 *Система логирования активирована*\n\nСистема уведомлений об ошибках работает корректно\\!',
      )

      return { success: true, data: response.data }
    } catch (error) {
      console.error('❌ Ошибка подключения к Telegram:', error.message)
      return { success: false, error: error.message }
    }
  }
}

// Создаем единственный экземпляр сервиса
const telegramService = new TelegramService()

module.exports = telegramService
