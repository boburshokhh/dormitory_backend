const express = require('express')
const router = express.Router()
const logsController = require('../controllers/logsController')
const auth = require('../middleware/auth')
const { requireAdmin } = require('../middleware/auth')

// Все маршруты требуют аутентификации и роли администратора
router.use(auth)
router.use(requireAdmin)

// Получение статистики логирования
router.get('/stats', async (req, res) => {
  await logsController.getLogStats(req, res)
})

// Получение содержимого лог файла
router.get('/files/:filename', async (req, res) => {
  req.query.filename = req.params.filename
  await logsController.getLogFile(req, res)
})

// Получение системной информации
router.get('/system/info', async (req, res) => {
  await logsController.getSystemInfo(req, res)
})

// Получение статистики производительности
router.get('/system/performance', async (req, res) => {
  await logsController.getPerformanceStats(req, res)
})

// Получение системной статистики (для dashboard)
router.get('/system-stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    // Простая статистика для dashboard
    const stats = {
      summary: {
        totalUserActivities: Math.floor(Math.random() * 100) + 50, // Заглушка
        suspiciousIPs: Math.floor(Math.random() * 10) + 1,
        totalRequests: Math.floor(Math.random() * 1000) + 500,
      },
      successStats: {
        failed: Math.floor(Math.random() * 20) + 5,
        success: Math.floor(Math.random() * 800) + 400,
      },
      dateRange: {
        start: startDate,
        end: endDate,
      },
    }

    res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Ошибка получения системной статистики',
    })
  }
})

// Тестовый endpoint для проверки доступности
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Logs API работает!',
    user: req.user,
    timestamp: new Date().toISOString(),
  })
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
