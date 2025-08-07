// middleware/logger.js
const winston = require('winston')
require('winston-daily-rotate-file')
const path = require('path')

const logDir = path.join(__dirname, '..', 'logs')

const transport = new winston.transports.DailyRotateFile({
  filename: `${logDir}/%DATE%-combined.log`,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
})

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json(),
  ),
  transports: [
    transport,
    new winston.transports.Console(), // опционально
  ],
})

module.exports = logger
