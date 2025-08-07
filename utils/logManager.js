const fs = require('fs').promises
const path = require('path')
const { logger } = require('./logger')

class LogManager {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs')
  }

  // Получить статистику логов
  async getLogStats() {
    try {
      const files = await fs.readdir(this.logDir)
      const stats = {
        totalFiles: files.length,
        totalSize: 0,
        files: []
      }

      for (const file of files) {
        const filePath = path.join(this.logDir, file)
        const stat = await fs.stat(filePath)
        stats.totalSize += stat.size
        stats.files.push({
          name: file,
          size: stat.size,
          modified: stat.mtime,
          sizeFormatted: this.formatBytes(stat.size)
        })
      }

      stats.totalSizeFormatted = this.formatBytes(stats.totalSize)
      return stats
    } catch (error) {
      logger.error('Error getting log stats:', error)
      throw error
    }
  }

  // Очистить старые логи
  async cleanupOldLogs(daysToKeep = 30) {
    try {
      const files = await fs.readdir(this.logDir)
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      let deletedCount = 0
      let deletedSize = 0

      for (const file of files) {
        const filePath = path.join(this.logDir, file)
        const stat = await fs.stat(filePath)

        if (stat.mtime < cutoffDate) {
          await fs.unlink(filePath)
          deletedCount++
          deletedSize += stat.size
          logger.info(`Deleted old log file: ${file}`)
        }
      }

      return {
        deletedCount,
        deletedSize: this.formatBytes(deletedSize),
        message: `Deleted ${deletedCount} old log files`
      }
    } catch (error) {
      logger.error('Error cleaning up old logs:', error)
      throw error
    }
  }

  // Получить содержимое лога
  async getLogContent(filename, lines = 100) {
    try {
      const filePath = path.join(this.logDir, filename)
      const content = await fs.readFile(filePath, 'utf8')
      const linesArray = content.split('\n').filter(line => line.trim())
      
      return linesArray.slice(-lines)
    } catch (error) {
      logger.error(`Error reading log file ${filename}:`, error)
      throw error
    }
  }

  // Поиск в логах
  async searchLogs(searchTerm, filePattern = '*') {
    try {
      const files = await fs.readdir(this.logDir)
      const results = []

      for (const file of files) {
        if (filePattern === '*' || file.includes(filePattern)) {
          const filePath = path.join(this.logDir, file)
          const content = await fs.readFile(filePath, 'utf8')
          const lines = content.split('\n')

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
              results.push({
                file,
                line: index + 1,
                content: line.trim(),
                timestamp: this.extractTimestamp(line)
              })
            }
          })
        }
      }

      return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    } catch (error) {
      logger.error('Error searching logs:', error)
      throw error
    }
  }

  // Получить ошибки за последние N часов
  async getRecentErrors(hours = 24) {
    try {
      const cutoffTime = new Date()
      cutoffTime.setHours(cutoffTime.getHours() - hours)

      const errorFiles = ['error', 'exceptions', 'rejections']
      const errors = []

      for (const fileType of errorFiles) {
        const files = await fs.readdir(this.logDir)
        const errorFiles = files.filter(f => f.includes(fileType))

        for (const file of errorFiles) {
          const filePath = path.join(this.logDir, file)
          const content = await fs.readFile(filePath, 'utf8')
          const lines = content.split('\n')

          lines.forEach(line => {
            if (line.trim()) {
              const timestamp = this.extractTimestamp(line)
              if (timestamp && new Date(timestamp) > cutoffTime) {
                errors.push({
                  file,
                  timestamp,
                  content: line.trim()
                })
              }
            }
          })
        }
      }

      return errors.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    } catch (error) {
      logger.error('Error getting recent errors:', error)
      throw error
    }
  }

  // Форматирование размера файла
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Извлечение временной метки из строки лога
  extractTimestamp(line) {
    const timestampRegex = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/
    const match = line.match(timestampRegex)
    return match ? match[1] : null
  }

  // Получить статистику производительности
  async getPerformanceStats(hours = 24) {
    try {
      const cutoffTime = new Date()
      cutoffTime.setHours(cutoffTime.getHours() - hours)

      const files = await fs.readdir(this.logDir)
      const httpFiles = files.filter(f => f.includes('http'))
      const performanceData = []

      for (const file of httpFiles) {
        const filePath = path.join(this.logDir, file)
        const content = await fs.readFile(filePath, 'utf8')
        const lines = content.split('\n')

        lines.forEach(line => {
          if (line.includes('Performance')) {
            const timestamp = this.extractTimestamp(line)
            if (timestamp && new Date(timestamp) > cutoffTime) {
              const durationMatch = line.match(/(\d+)ms/)
              if (durationMatch) {
                performanceData.push({
                  timestamp,
                  duration: parseInt(durationMatch[1])
                })
              }
            }
          }
        })
      }

      if (performanceData.length === 0) {
        return { message: 'No performance data found' }
      }

      const durations = performanceData.map(d => d.duration)
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
      const maxDuration = Math.max(...durations)
      const minDuration = Math.min(...durations)

      return {
        totalRequests: performanceData.length,
        averageDuration: Math.round(avgDuration),
        maxDuration,
        minDuration,
        slowRequests: durations.filter(d => d > 1000).length
      }
    } catch (error) {
      logger.error('Error getting performance stats:', error)
      throw error
    }
  }
}

module.exports = new LogManager() 