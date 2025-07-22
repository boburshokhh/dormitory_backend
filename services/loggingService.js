const { query } = require('../config/database')

class LoggingService {
  constructor() {
    this.initializeLogging()
  }

  // Инициализация сервиса логирования
  initializeLogging() {
    console.log('📊 Сервис логирования активности инициализирован')
  }

  // Получение IP адреса из запроса
  getClientIP(req) {
    return (
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.headers['x-real-ip'] ||
      'unknown'
    )
  }

  // Получение User-Agent из запроса
  getUserAgent(req) {
    return req.headers['user-agent'] || 'unknown'
  }

  // Очистка данных от паролей и конфиденциальной информации
  sanitizeData(data) {
    if (!data || typeof data !== 'object') return data

    const sanitized = { ...data }
    const sensitiveFields = ['password', 'newPassword', 'currentPassword', 'token', 'secret']

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = '[FILTERED]'
      }
    })

    return sanitized
  }

  // Логирование активности пользователя
  async logUserActivity(params) {
    try {
      const {
        userId,
        actionType,
        actionDescription,
        targetUserId = null,
        targetEntityType = null,
        targetEntityId = null,
        req = null,
        success = true,
        errorMessage = null,
        executionTime = null,
        requestData = null,
        responseData = null,
        sessionId = null,
      } = params

      // Получаем IP и User-Agent если передан req
      const ipAddress = req ? this.getClientIP(req) : null
      const userAgent = req ? this.getUserAgent(req) : null

      // Очищаем данные от паролей
      const sanitizedRequestData = requestData ? this.sanitizeData(requestData) : null
      const sanitizedResponseData = responseData ? this.sanitizeData(responseData) : null

      const result = await query(
        `
        SELECT log_user_activity(
          $1::UUID,
          $2::audit_action_type,
          $3,
          $4::UUID,
          $5,
          $6::UUID,
          $7,
          $8,
          $9::JSONB,
          $10::JSONB,
          $11,
          $12,
          $13,
          $14
        )
      `,
        [
          userId,
          actionType,
          actionDescription,
          targetUserId,
          targetEntityType,
          targetEntityId,
          ipAddress,
          userAgent,
          sanitizedRequestData ? JSON.stringify(sanitizedRequestData) : null,
          sanitizedResponseData ? JSON.stringify(sanitizedResponseData) : null,
          sessionId,
          success,
          errorMessage,
          executionTime,
        ],
      )

      return result.rows[0]
    } catch (error) {
      console.error('Ошибка при логировании активности пользователя:', error)
      // Не прерываем выполнение основного процесса из-за ошибки логирования
      return null
    }
  }

  // Логирование действий администратора
  async logAdminAction(params) {
    try {
      const {
        adminUserId,
        actionType,
        actionDescription,
        affectedUserId = null,
        affectedEntityType = null,
        affectedEntityId = null,
        oldValues = null,
        newValues = null,
        req = null,
        success = true,
        errorMessage = null,
      } = params

      const ipAddress = req ? this.getClientIP(req) : null
      const userAgent = req ? this.getUserAgent(req) : null

      const result = await query(
        `
        SELECT log_admin_action(
          $1::UUID,
          $2,
          $3,
          $4::UUID,
          $5,
          $6::UUID,
          $7::JSONB,
          $8::JSONB,
          $9,
          $10,
          $11,
          $12
        )
      `,
        [
          adminUserId,
          actionType,
          actionDescription,
          affectedUserId,
          affectedEntityType,
          affectedEntityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress,
          userAgent,
          success,
          errorMessage,
        ],
      )

      return result.rows[0]
    } catch (error) {
      console.error('Ошибка при логировании действий администратора:', error)
      return null
    }
  }

  // Логирование кодов подтверждения
  async logVerificationCode(params) {
    try {
      const {
        contact,
        contactType,
        actionType,
        success = false,
        errorMessage = null,
        req = null,
        attemptsCount = 0,
      } = params

      const ipAddress = req ? this.getClientIP(req) : null
      const userAgent = req ? this.getUserAgent(req) : null

      const result = await query(
        `
        SELECT log_verification_code_action(
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
      `,
        [
          contact,
          contactType,
          actionType,
          success,
          errorMessage,
          ipAddress,
          userAgent,
          attemptsCount,
        ],
      )

      return result.rows[0]
    } catch (error) {
      console.error('Ошибка при логировании кодов подтверждения:', error)
      return null
    }
  }

  // Получение статистики по IP адресам
  async getIPStatistics(startDate = null, endDate = null) {
    try {
      const result = await query(
        `
        SELECT * FROM get_ip_statistics($1::DATE, $2::DATE)
      `,
        [startDate, endDate],
      )

      return result.rows
    } catch (error) {
      console.error('Ошибка при получении статистики IP:', error)
      return []
    }
  }

  // Получение подозрительной активности
  async getSuspiciousActivity() {
    try {
      const result = await query(`
        SELECT * FROM v_suspicious_activity
      `)

      return result.rows
    } catch (error) {
      console.error('Ошибка при получении подозрительной активности:', error)
      return []
    }
  }

  // Получение активности по IP
  async getActivityByIP(limit = 100) {
    try {
      const result = await query(
        `
        SELECT * FROM v_activity_by_ip
        ORDER BY total_activities DESC
        LIMIT $1
      `,
        [limit],
      )

      return result.rows
    } catch (error) {
      console.error('Ошибка при получении активности по IP:', error)
      return []
    }
  }

  // Получение логов активности пользователей
  async getUserActivityLogs(params = {}) {
    try {
      const {
        userId = null,
        actionType = null,
        startDate = null,
        endDate = null,
        limit = 100,
        offset = 0,
        ipAddress = null,
        success = null,
      } = params

      let whereConditions = []
      let queryParams = []
      let paramIndex = 1

      if (userId) {
        whereConditions.push(`user_id = $${paramIndex}`)
        queryParams.push(userId)
        paramIndex++
      }

      if (actionType) {
        whereConditions.push(`action_type = $${paramIndex}`)
        queryParams.push(actionType)
        paramIndex++
      }

      if (startDate) {
        whereConditions.push(`ual.created_at >= $${paramIndex}`)
        queryParams.push(startDate)
        paramIndex++
      }

      if (endDate) {
        whereConditions.push(`ual.created_at < ($${paramIndex}::DATE + INTERVAL '1 day')`)
        queryParams.push(endDate)
        paramIndex++
      }

      if (ipAddress) {
        whereConditions.push(`ual.ip_address = $${paramIndex}`)
        queryParams.push(ipAddress)
        paramIndex++
      }

      if (success !== null) {
        whereConditions.push(`ual.success = $${paramIndex}`)
        queryParams.push(success)
        paramIndex++
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      const sql = `
        SELECT ual.*, u.username, u.contact
        FROM user_activity_logs ual
        LEFT JOIN users u ON ual.user_id = u.id
        ${whereClause}
        ORDER BY ual.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `

      queryParams.push(limit, offset)

      const result = await query(sql, queryParams)
      return result.rows
    } catch (error) {
      console.error('Ошибка при получении логов активности:', error)
      return []
    }
  }

  // Получение логов администраторов
  async getAdminActionLogs(params = {}) {
    try {
      const {
        adminUserId = null,
        actionType = null,
        startDate = null,
        endDate = null,
        limit = 100,
        offset = 0,
      } = params

      let whereConditions = []
      let queryParams = []
      let paramIndex = 1

      if (adminUserId) {
        whereConditions.push(`admin_user_id = $${paramIndex}`)
        queryParams.push(adminUserId)
        paramIndex++
      }

      if (actionType) {
        whereConditions.push(`action_type = $${paramIndex}`)
        queryParams.push(actionType)
        paramIndex++
      }

      if (startDate) {
        whereConditions.push(`aal.created_at >= $${paramIndex}`)
        queryParams.push(startDate)
        paramIndex++
      }

      if (endDate) {
        whereConditions.push(`aal.created_at < ($${paramIndex}::DATE + INTERVAL '1 day')`)
        queryParams.push(endDate)
        paramIndex++
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

      const sql = `
        SELECT aal.*, u.username as admin_username, u.contact as admin_contact,
               au.username as affected_username, au.contact as affected_contact
        FROM admin_action_logs aal
        LEFT JOIN users u ON aal.admin_user_id = u.id
        LEFT JOIN users au ON aal.affected_user_id = au.id
        ${whereClause}
        ORDER BY aal.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `

      queryParams.push(limit, offset)

      const result = await query(sql, queryParams)
      return result.rows
    } catch (error) {
      console.error('Ошибка при получении логов администраторов:', error)
      return []
    }
  }

  // Очистка старых логов
  async cleanupOldLogs(daysToKeep = 90) {
    try {
      const result = await query(
        `
        SELECT * FROM cleanup_old_logs($1)
      `,
        [daysToKeep],
      )

      return result.rows
    } catch (error) {
      console.error('Ошибка при очистке старых логов:', error)
      return []
    }
  }

  // Хелпер для логирования входа пользователя
  async logLogin(userId, req, success = true, errorMessage = null) {
    return await this.logUserActivity({
      userId,
      actionType: success ? 'login_success' : 'login_failed',
      actionDescription: success ? 'User logged in successfully' : 'Login attempt failed',
      req,
      success,
      errorMessage,
    })
  }

  // Хелпер для логирования выхода пользователя
  async logLogout(userId, req) {
    return await this.logUserActivity({
      userId,
      actionType: 'logout',
      actionDescription: 'User logged out',
      req,
      success: true,
    })
  }

  // Хелпер для логирования регистрации
  async logRegistration(userId, req, success = true, errorMessage = null) {
    return await this.logUserActivity({
      userId,
      actionType: success ? 'register_success' : 'register_failed',
      actionDescription: success ? 'User registered successfully' : 'Registration failed',
      req,
      success,
      errorMessage,
    })
  }
}

module.exports = new LoggingService()
