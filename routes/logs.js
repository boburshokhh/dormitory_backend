const express = require('express')
const { authenticateToken, requireRoles } = require('../middleware/auth')
const loggingService = require('../services/loggingService')

const router = express.Router()

// Все роуты логов требуют аутентификации и роли супер-администратора
router.use(authenticateToken)
router.use(requireRoles('super_admin'))

// Получение логов активности пользователей
router.get('/activity', async (req, res) => {
  try {
    const {
      userId,
      actionType,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
      ipAddress,
      success,
    } = req.query

    const logs = await loggingService.getUserActivityLogs({
      userId,
      actionType,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset),
      ipAddress,
      success: success !== undefined ? success === 'true' : null,
    })

    res.json({
      logs,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: logs.length,
      },
    })
  } catch (error) {
    console.error('Ошибка получения логов активности:', error)
    res.status(500).json({ error: 'Ошибка получения логов активности' })
  }
})

// Получение логов действий администраторов
router.get('/admin-actions', async (req, res) => {
  try {
    const { adminUserId, actionType, startDate, endDate, limit = 100, offset = 0 } = req.query

    const logs = await loggingService.getAdminActionLogs({
      adminUserId,
      actionType,
      startDate,
      endDate,
      limit: parseInt(limit),
      offset: parseInt(offset),
    })

    res.json({
      logs,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: logs.length,
      },
    })
  } catch (error) {
    console.error('Ошибка получения логов администраторов:', error)
    res.status(500).json({ error: 'Ошибка получения логов администраторов' })
  }
})

// Получение статистики по IP адресам
router.get('/ip-statistics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const statistics = await loggingService.getIPStatistics(startDate, endDate)

    res.json({
      statistics,
      summary: {
        totalIPs: statistics.length,
        highThreatIPs: statistics.filter((stat) => stat.threat_level === 'HIGH').length,
        mediumThreatIPs: statistics.filter((stat) => stat.threat_level === 'MEDIUM').length,
        lowThreatIPs: statistics.filter((stat) => stat.threat_level === 'LOW').length,
      },
    })
  } catch (error) {
    console.error('Ошибка получения статистики IP:', error)
    res.status(500).json({ error: 'Ошибка получения статистики IP' })
  }
})

// Получение подозрительной активности
router.get('/suspicious-activity', async (req, res) => {
  try {
    const suspiciousActivity = await loggingService.getSuspiciousActivity()

    res.json({
      suspiciousActivity,
      summary: {
        totalSuspiciousIPs: suspiciousActivity.length,
        highThreatCount: suspiciousActivity.filter((activity) => activity.threat_level === 'HIGH')
          .length,
        mediumThreatCount: suspiciousActivity.filter(
          (activity) => activity.threat_level === 'MEDIUM',
        ).length,
        totalFailedAttempts: suspiciousActivity.reduce(
          (sum, activity) => sum + parseInt(activity.failed_actions),
          0,
        ),
      },
    })
  } catch (error) {
    console.error('Ошибка получения подозрительной активности:', error)
    res.status(500).json({ error: 'Ошибка получения подозрительной активности' })
  }
})

// Получение активности по IP адресам
router.get('/activity-by-ip', async (req, res) => {
  try {
    const { limit = 100 } = req.query

    const activity = await loggingService.getActivityByIP(parseInt(limit))

    res.json({
      activity,
      summary: {
        totalEntries: activity.length,
        totalActivities: activity.reduce((sum, entry) => sum + parseInt(entry.total_activities), 0),
        uniqueUsers: activity.reduce((sum, entry) => sum + parseInt(entry.unique_users), 0),
      },
    })
  } catch (error) {
    console.error('Ошибка получения активности по IP:', error)
    res.status(500).json({ error: 'Ошибка получения активности по IP' })
  }
})

// Получение общей статистики системы
router.get('/system-stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    // Получаем различные типы статистики
    const [activityLogs, adminLogs] = await Promise.all([
      loggingService.getUserActivityLogs({
        startDate,
        endDate,
        limit: 1000,
      }),
      loggingService.getAdminActionLogs({
        startDate,
        endDate,
        limit: 1000,
      }),
    ])

    // Временно отключаем проблемные методы
    const ipStatistics = []
    const suspiciousActivity = []

    // Подсчитываем статистику по типам действий
    const actionTypes = {}
    activityLogs.forEach((log) => {
      actionTypes[log.action_type] = (actionTypes[log.action_type] || 0) + 1
    })

    // Статистика по успешности
    const successStats = {
      successful: activityLogs.filter((log) => log.success).length,
      failed: activityLogs.filter((log) => !log.success).length,
    }

    // Статистика по времени (по дням)
    const dailyStats = {}
    activityLogs.forEach((log) => {
      const date = new Date(log.created_at).toISOString().split('T')[0]
      dailyStats[date] = (dailyStats[date] || 0) + 1
    })

    res.json({
      period: {
        startDate,
        endDate,
        generatedAt: new Date().toISOString(),
      },
      summary: {
        totalUserActivities: activityLogs.length,
        totalAdminActions: adminLogs.length,
        totalUniqueIPs: ipStatistics.length,
        suspiciousIPs: suspiciousActivity.length,
      },
      actionTypes,
      successStats,
      dailyStats: Object.entries(dailyStats).map(([date, count]) => ({
        date,
        count,
      })),
      topIPs: ipStatistics.slice(0, 10).map((stat) => ({
        ip: stat.ip_address,
        activities: stat.total_activities,
        threatLevel: stat.threat_level,
      })),
    })
  } catch (error) {
    console.error('Ошибка получения системной статистики:', error)
    res.status(500).json({ error: 'Ошибка получения системной статистики' })
  }
})

// Очистка старых логов
router.delete('/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 90 } = req.body

    if (daysToKeep < 1 || daysToKeep > 365) {
      return res.status(400).json({ error: 'Количество дней должно быть от 1 до 365' })
    }

    // Логируем действие администратора
    await loggingService.logAdminAction({
      adminUserId: req.user.id,
      actionType: 'logs_cleanup',
      actionDescription: `Logs cleanup requested - keeping ${daysToKeep} days`,
      req,
      success: true,
    })

    const cleanupResult = await loggingService.cleanupOldLogs(daysToKeep)

    res.json({
      message: 'Очистка логов завершена',
      cleanupResult,
      daysKept: daysToKeep,
      cleanedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Ошибка очистки логов:', error)
    res.status(500).json({ error: 'Ошибка очистки логов' })
  }
})

// Экспорт логов в CSV формат
router.get('/export', async (req, res) => {
  try {
    const { type = 'activity', startDate, endDate, format = 'json' } = req.query

    let logs = []
    let filename = ''

    switch (type) {
      case 'activity':
        logs = await loggingService.getUserActivityLogs({
          startDate,
          endDate,
          limit: 10000,
        })
        filename = 'user_activity_logs'
        break
      case 'admin':
        logs = await loggingService.getAdminActionLogs({
          startDate,
          endDate,
          limit: 10000,
        })
        filename = 'admin_action_logs'
        break
      case 'ip-stats':
        logs = await loggingService.getIPStatistics(startDate, endDate)
        filename = 'ip_statistics'
        break
      case 'suspicious':
        logs = await loggingService.getSuspiciousActivity()
        filename = 'suspicious_activity'
        break
      default:
        return res.status(400).json({ error: 'Неверный тип логов' })
    }

    // Логируем экспорт данных
    await loggingService.logAdminAction({
      adminUserId: req.user.id,
      actionType: 'data_export',
      actionDescription: `Exported ${type} logs (${logs.length} records)`,
      req,
      success: true,
    })

    if (format === 'csv') {
      // Конвертируем в CSV
      if (logs.length === 0) {
        return res.status(404).json({ error: 'Нет данных для экспорта' })
      }

      const keys = Object.keys(logs[0])
      const csvContent = [
        keys.join(','),
        ...logs.map((row) =>
          keys
            .map((key) => {
              const value = row[key]
              if (value === null || value === undefined) return ''
              if (typeof value === 'object') return JSON.stringify(value)
              return String(value).replace(/"/g, '""')
            })
            .join(','),
        ),
      ].join('\n')

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}_${new Date().toISOString().split('T')[0]}.csv"`,
      )
      res.send(csvContent)
    } else {
      // JSON формат
      res.json({
        type,
        period: { startDate, endDate },
        exportedAt: new Date().toISOString(),
        totalRecords: logs.length,
        logs,
      })
    }
  } catch (error) {
    console.error('Ошибка экспорта логов:', error)
    res.status(500).json({ error: 'Ошибка экспорта логов' })
  }
})

module.exports = router
