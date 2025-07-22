const loggingService = require('../services/loggingService')

// Middleware для логирования всех API запросов
const apiLoggingMiddleware = async (req, res, next) => {
  // Записываем время начала запроса
  const startTime = Date.now()

  // Сохраняем оригинальный метод send для перехвата ответов
  const originalSend = res.send

  // Перехватываем ответ для логирования
  res.send = function (body) {
    const executionTime = Date.now() - startTime

    // Логируем только если есть пользователь или это важные endpoints
    if (req.user || shouldLogRequest(req)) {
      logApiRequest(req, res, body, executionTime)
    }

    // Вызываем оригинальный метод send
    originalSend.call(this, body)
  }

  next()
}

// Проверяем, нужно ли логировать запрос
function shouldLogRequest(req) {
  const importantEndpoints = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/logout',
    '/api/auth/register-request',
    '/api/auth/verify-code',
    '/api/auth/resend-code',
  ]

  return importantEndpoints.some((endpoint) => req.path.includes(endpoint))
}

// Функция для логирования API запроса
async function logApiRequest(req, res, responseBody, executionTime) {
  try {
    // Определяем тип действия на основе URL и метода
    const actionType = getActionType(req)
    if (!actionType) return

    // Определяем успешность запроса
    const success = res.statusCode < 400

    // Формируем описание действия
    const actionDescription = `${req.method} ${req.path} - ${res.statusCode}`

    // Получаем данные для логирования
    let requestData = null
    if (req.body && Object.keys(req.body).length > 0) {
      requestData = req.body
    }

    // Пытаемся парсить responseBody для логирования
    let responseData = null
    try {
      if (responseBody && typeof responseBody === 'string') {
        responseData = JSON.parse(responseBody)
      } else if (responseBody && typeof responseBody === 'object') {
        responseData = responseBody
      }
    } catch (e) {
      // Если не удается парсить, логируем как есть
      responseData = { raw: responseBody }
    }

    // Логируем активность
    await loggingService.logUserActivity({
      userId: req.user?.id || null,
      actionType,
      actionDescription,
      req,
      success,
      errorMessage: success ? null : getErrorMessage(responseData),
      executionTime,
      requestData,
      responseData: success ? null : responseData, // Логируем ответ только при ошибках
      sessionId: req.sessionID || null,
    })
  } catch (error) {
    console.error('Ошибка при логировании API запроса:', error)
  }
}

// Определяем тип действия на основе URL и метода
function getActionType(req) {
  const path = req.path.toLowerCase()
  const method = req.method.toLowerCase()

  // Маппинг URL на типы действий
  const actionMap = {
    '/api/auth/login': 'login_attempt',
    '/api/auth/register-request': 'register_request',
    '/api/auth/verify-code': 'verification_code_used',
    '/api/auth/resend-code': 'verification_code_sent',
    '/api/auth/logout': 'logout',
    '/api/auth/reset-password': 'password_reset_request',
    '/api/profile': method === 'put' ? 'profile_update' : null,
    '/api/applications': method === 'post' ? 'application_submit' : null,
    '/api/users': method === 'post' ? 'user_create' : method === 'put' ? 'user_update' : null,
    '/api/admin': 'admin_action',
  }

  // Проверяем точное совпадение
  for (const [urlPattern, actionType] of Object.entries(actionMap)) {
    if (path.includes(urlPattern)) {
      return actionType
    }
  }

  // Определяем общие типы действий
  if (path.includes('/admin/')) {
    return 'admin_action'
  }

  if (path.includes('/applications/') && method === 'put') {
    return 'application_approve'
  }

  if (path.includes('/rooms/') && method === 'post') {
    return 'room_assign'
  }

  return null
}

// Извлекаем сообщение об ошибке из ответа
function getErrorMessage(responseData) {
  if (!responseData) return null

  if (typeof responseData === 'string') {
    return responseData
  }

  if (responseData.error) {
    return responseData.error
  }

  if (responseData.message) {
    return responseData.message
  }

  return null
}

// Middleware для логирования ошибок
const errorLoggingMiddleware = async (error, req, res, next) => {
  // Логируем ошибку
  if (req.user) {
    await loggingService.logUserActivity({
      userId: req.user.id,
      actionType: 'admin_action',
      actionDescription: `Server error on ${req.method} ${req.path}`,
      req,
      success: false,
      errorMessage: error.message || 'Internal server error',
      requestData: req.body,
    })
  }

  next(error)
}

// Middleware для логирования действий администратора
const adminActionMiddleware = (actionType, actionDescription) => {
  return async (req, res, next) => {
    // Сохраняем оригинальный метод send
    const originalSend = res.send

    res.send = function (body) {
      // Логируем действие администратора
      if (req.user && req.user.role === 'admin') {
        logAdminAction(req, res, body, actionType, actionDescription)
      }

      originalSend.call(this, body)
    }

    next()
  }
}

// Функция для логирования действий администратора
async function logAdminAction(req, res, responseBody, actionType, actionDescription) {
  try {
    const success = res.statusCode < 400

    // Получаем ID затронутого пользователя из параметров URL или тела запроса
    const affectedUserId = req.params.id || req.body.userId || req.body.id || null

    // Определяем тип и ID затронутой сущности
    let affectedEntityType = null
    let affectedEntityId = null

    if (req.path.includes('/users/')) {
      affectedEntityType = 'user'
      affectedEntityId = req.params.id
    } else if (req.path.includes('/applications/')) {
      affectedEntityType = 'application'
      affectedEntityId = req.params.id
    } else if (req.path.includes('/rooms/')) {
      affectedEntityType = 'room'
      affectedEntityId = req.params.id
    }

    await loggingService.logAdminAction({
      adminUserId: req.user.id,
      actionType,
      actionDescription: `${actionDescription} - ${res.statusCode}`,
      affectedUserId,
      affectedEntityType,
      affectedEntityId,
      oldValues: req.oldValues || null, // Может быть установлено в роуте
      newValues: success ? req.body : null,
      req,
      success,
      errorMessage: success ? null : getErrorMessage(responseBody),
    })
  } catch (error) {
    console.error('Ошибка при логировании действий администратора:', error)
  }
}

module.exports = {
  apiLoggingMiddleware,
  errorLoggingMiddleware,
  adminActionMiddleware,
}
