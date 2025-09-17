import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_me';

function requestContext({ requireAuth = false } = {}) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      const proceed = () => {
        attachMeta(req);
        next();
      };

      if (!token) {
        if (!requireAuth) return proceed();
        return res.status(401).json({ success: false, message: 'Требуется аутентификация' });
      }

      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          if (!requireAuth) return proceed();
          return res.status(401).json({ success: false, message: 'Невалидный токен' });
        }
        req.user = {
          id: decoded?.sub,
          sub: decoded?.sub,
          username: decoded?.username,
          role: decoded?.role
        };
        proceed();
      });
    } catch (e) {
      if (!requireAuth) {
        attachMeta(req);
        return next();
      }
      return res.status(401).json({ success: false, message: 'Ошибка проверки токена' });
    }
  };
}

function attachMeta(req) {
  const xfwd = req.headers['x-forwarded-for'];
  const ipFromHeader = typeof xfwd === 'string' ? xfwd.split(',')[0].trim() : null;
  const ipDirect = req.ip || req.connection?.remoteAddress || null;
  req.ipAddress = ipFromHeader || ipDirect || null;
  req.userAgent = req.headers['user-agent'] || null;
}

export default requestContext;


