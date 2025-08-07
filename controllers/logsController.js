const { logger } = require('../utils/logger')
const fs = require('fs').promises
const path = require('path')

class LogsController {
  // Получение статистики логирования
  async getLogStats(req, res) {
    try {
      // Добавляем информацию о файлах логов
      const logDir = path.join(__dirname, '..', 'logs')
      const logFiles = await this.getLogFiles(logDir)

      const response = {
        success: true,
        data: {
          files: logFiles,
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
          },
        },
      }

      res.json(response)
    } catch (error) {
      logger.error('Error getting log stats:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения статистики логов',
      })
    }
  }

  // Получение содержимого лог файла
  async getLogFile(req, res) {
    try {
      const { filename, lines = 100 } = req.query

      if (!filename) {
        return res.status(400).json({
          success: false,
          error: 'Имя файла не указано',
        })
      }

      const logDir = path.join(__dirname, '..', 'logs')
      const filePath = path.join(logDir, filename)

      // Проверяем безопасность пути
      if (!filePath.startsWith(logDir)) {
        return res.status(403).json({
          success: false,
          error: 'Доступ запрещен',
        })
      }

      const content = await fs.readFile(filePath, 'utf8')
      const linesArray = content.split('\n').filter((line) => line.trim())
      const lastLines = linesArray.slice(-parseInt(lines))

      res.json({
        success: true,
        data: {
          filename,
          totalLines: linesArray.length,
          requestedLines: parseInt(lines),
          content: lastLines,
        },
      })
    } catch (error) {
      logger.error('Error reading log file:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка чтения файла логов',
      })
    }
  }

  // Получение списка файлов логов
  async getLogFiles(logDir) {
    try {
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
            sizeFormatted: this.formatFileSize(stats.size),
          })
        }
      }

      return logFiles.sort((a, b) => b.modified - a.modified)
    } catch (error) {
      logger.error('Error reading log directory:', error)
      return []
    }
  }

  // Форматирование размера файла
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Получение системной информации
  async getSystemInfo(req, res) {
    try {
      const os = require('os')

      const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          process: process.memoryUsage(),
        },
        cpu: {
          cores: os.cpus().length,
          load: os.loadavg(),
        },
        network: Object.values(os.networkInterfaces())
          .flat()
          .filter((iface) => iface && !iface.internal)
          .map((iface) => ({
            name: iface.name,
            address: iface.address,
            family: iface.family,
          })),
      }

      res.json({
        success: true,
        data: systemInfo,
      })
    } catch (error) {
      logger.error('Error getting system info:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения системной информации',
      })
    }
  }

  // Получение статистики производительности
  async getPerformanceStats(req, res) {
    try {
      const stats = {
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
        requests: {
          total: req.app.locals.requestCount || 0,
          errors: req.app.locals.errorCount || 0,
          slow: req.app.locals.slowRequestCount || 0,
        },
      }

      res.json({
        success: true,
        data: stats,
      })
    } catch (error) {
      logger.error('Error getting performance stats:', error)
      res.status(500).json({
        success: false,
        error: 'Ошибка получения статистики производительности',
      })
    }
  }
}

module.exports = new LogsController()
