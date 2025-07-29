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

  // Если есть X-Forwarded-For, берем первый IP (клиентский)
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim())
    return ips[0]
  }

  // Проверяем другие заголовки
  if (realIP) return realIP
  if (forwarded) return forwarded
  if (clientIP) return clientIP
  if (clusterClientIP) return clusterClientIP

  // Если нет специальных заголовков, используем стандартный IP
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
