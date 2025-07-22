const { Pool } = require('pg')
require('dotenv').config({ path: './config.env' })

// Создание пула подключений
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '192.168.13.19',
  database: process.env.DB_NAME || 'gubkin_dormitory',
  password: process.env.DB_PASSWORD || '1234bobur$',
  port: process.env.DB_PORT || 5432,
  max: 20, // максимум соединений в пуле
  idleTimeoutMillis: 30000, // время ожидания закрытия неактивного соединения
  connectionTimeoutMillis: 2000, // время ожидания подключения
  ssl: false,
})

// Обработка событий пула
pool.on('connect', () => {
  console.log('✅ Подключение к PostgreSQL установлено')
})

pool.on('error', (err) => {
  console.error('❌ Ошибка PostgreSQL:', err)
  process.exit(-1)
})

// Функция для выполнения запросов
const query = async (text, params) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log(`🔍 SQL: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''} | ${duration}ms`)
    return res
  } catch (error) {
    console.error('❌ SQL Error:', error.message)
    console.error('📄 Query:', text)
    console.error('📋 Params:', params)
    throw error
  }
}

// Функция для выполнения транзакций
const transaction = async (callback) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    console.log('🔄 Транзакция начата')

    const result = await callback(client)

    await client.query('COMMIT')
    console.log('✅ Транзакция завершена успешно')

    return result
  } catch (error) {
    await client.query('ROLLBACK')
    console.log('🔄 Транзакция отменена')
    console.error('❌ Ошибка транзакции:', error.message)
    throw error
  } finally {
    client.release()
  }
}

// Проверка подключения к базе данных
const checkConnection = async () => {
  try {
    const res = await pool.query('SELECT NOW() as current_time, version() as postgres_version')
    console.log('✅ Подключение к PostgreSQL успешно')
    console.log(`📅 Время сервера: ${res.rows[0].current_time}`)
    console.log(`📦 Версия PostgreSQL: ${res.rows[0].postgres_version.split(' ')[0]}`)
    return true
  } catch (error) {
    console.error('❌ Ошибка подключения к PostgreSQL:', error.message)
    console.error('🔧 Проверьте настройки в config.env')
    return false
  }
}

// Обработка выключения приложения
process.on('SIGINT', () => {
  console.log('🔄 Закрытие пула подключений к базе данных...')
  pool.end(() => {
    console.log('✅ Пул подключений закрыт')
    process.exit(0)
  })
})

// Функция для получения статистики пула подключений
const getPoolStats = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  }
}

module.exports = {
  pool,
  query,
  transaction,
  checkConnection,
  getPoolStats,
}
