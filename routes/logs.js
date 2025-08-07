const express = require('express')
const router = express.Router()
const logsController = require('../controllers/logsController')
const auth = require('../middleware/auth')

// Безопасное подключение Telegram middleware
let adminActionLogger = (req, res, next) => next() // По умолчанию пустой middleware

try {
  const { telegramUserActionLogger } = require('../middleware/telegramLogging')
  adminActionLogger = telegramUserActionLogger('admin_logs_action')
} catch (error) {
  console.log('⚠️ Telegram middleware not available for logs routes')
}

// Все маршруты требуют аутентификации и роли администратора
router.use(auth)
router.use(adminActionLogger)

// Получение статистики логирования
router.get('/stats', async (req, res) => {
  await logsController.getLogStats(req, res)
})

// Получение содержимого лог файла
router.get('/files/:filename', async (req, res) => {
  req.query.filename = req.params.filename
  await logsController.getLogFile(req, res)
})

// Очистка буфера Telegram логов
router.post('/telegram/flush', async (req, res) => {
  await logsController.flushTelegramBuffer(req, res)
})

// Изменение уровня логирования
router.put('/telegram/level', async (req, res) => {
  await logsController.updateLogLevel(req, res)
})

// Включение/выключение Telegram логирования
router.put('/telegram/toggle', async (req, res) => {
  await logsController.toggleTelegramLogging(req, res)
})

// Отправка тестового сообщения в Telegram
router.post('/telegram/test', async (req, res) => {
  await logsController.sendTestMessage(req, res)
})

// Получение системной информации
router.get('/system/info', async (req, res) => {
  await logsController.getSystemInfo(req, res)
})

// Получение статистики производительности
router.get('/system/performance', async (req, res) => {
  await logsController.getPerformanceStats(req, res)
})

// Получение списка всех лог файлов
router.get('/files', async (req, res) => {
  try {
    const fs = require('fs').promises
    const path = require('path')

    const logDir = path.join(__dirname, '..', 'logs')
    const files = await fs.readdir(logDir)
    const logFiles = []

    for (const file of files) {
      if (file.endsWith('.log') || file.endsWith('.json')) {
        const filePath = path.join(logDir, file)
        const stats = await fs.stat(filePath)

        logFiles.push({
          name: file,
          size: stats.size,
          modified: stats.mtime,
          sizeFormatted: logsController.formatFileSize(stats.size),
        })
      }
    }

    res.json({
      success: true,
      data: logFiles.sort((a, b) => b.modified - a.modified),
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка получения списка файлов логов',
    })
  }
})

// Удаление лог файла
router.delete('/files/:filename', async (req, res) => {
  try {
    const { filename } = req.params

    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Имя файла не указано',
      })
    }

    const fs = require('fs').promises
    const path = require('path')

    const logDir = path.join(__dirname, '..', 'logs')
    const filePath = path.join(logDir, filename)

    // Проверяем безопасность пути
    if (!filePath.startsWith(logDir)) {
      return res.status(403).json({
        success: false,
        error: 'Доступ запрещен',
      })
    }

    await fs.unlink(filePath)

    res.json({
      success: true,
      message: `Файл ${filename} успешно удален`,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка удаления файла логов',
    })
  }
})

// Получение реального времени логов (SSE)
router.get('/realtime', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  // Отправляем начальное сообщение
  res.write('data: {"type": "connected", "message": "Подключение к логам установлено"}\n\n')

  // Функция для отправки логов в реальном времени
  const sendLog = (logData) => {
    res.write(`data: ${JSON.stringify(logData)}\n\n`)
  }

  // Добавляем обработчик в глобальный объект
  if (!req.app.locals.logListeners) {
    req.app.locals.logListeners = []
  }
  req.app.locals.logListeners.push(sendLog)

  // Обработчик отключения клиента
  req.on('close', () => {
    const index = req.app.locals.logListeners.indexOf(sendLog)
    if (index > -1) {
      req.app.locals.logListeners.splice(index, 1)
    }
  })
})

// Получение статистики в реальном времени
router.get('/realtime/stats', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  // Отправляем статистику каждые 5 секунд
  const interval = setInterval(() => {
    const stats = {
      type: 'stats',
      data: {
        telegram: require('../services/telegramLoggerService').getStats(),
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
      },
    }

    res.write(`data: ${JSON.stringify(stats)}\n\n`)
  }, 5000)

  // Обработчик отключения клиента
  req.on('close', () => {
    clearInterval(interval)
  })
})

module.exports = router
