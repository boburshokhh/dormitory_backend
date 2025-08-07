/**
 * Middleware для получения реального IP адреса клиента
 * Учитывает прокси-серверы и заголовки X-Forwarded-For
 */

const getClientIP = (req) => {
  // Проверяем заголовки в порядке приоритета
  const forwardedFor = req.headers['x-forwarded-for']
  const realIP = req.headers['x-real-ip']
  const forwarded = req.headers['x-forwarded']
  const clientIP = req.headers['x-client-ip']
  const clusterClientIP = req.headers['x-cluster-client-ip']

  // Если есть X-Forwarded-For и мы доверяем прокси
  if (forwardedFor && req.app.get('trust proxy')) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim())
    // Возвращаем первый IP (оригинальный IP клиента)
    return ips[0]
  }

  // Проверяем другие заголовки только если доверяем прокси
  if (req.app.get('trust proxy')) {
    if (realIP) return realIP
    if (forwarded) return forwarded
    if (clientIP) return clientIP
    if (clusterClientIP) return clusterClientIP
  }

  // Если нет специальных заголовков или не доверяем прокси, используем стандартный IP
  return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || '127.0.0.1'
}

const clientIPMiddleware = (req, res, next) => {
  req.clientIP = getClientIP(req)
  next()
}

module.exports = {
  clientIPMiddleware,
  getClientIP,
}
