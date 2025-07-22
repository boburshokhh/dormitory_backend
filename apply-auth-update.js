const fs = require('fs')
const path = require('path')
const { query } = require('./config/database')

async function applyAuthUpdate() {
  try {
    console.log('🔄 Применение обновления схемы аутентификации...')

    // Читаем SQL файл
    const sqlFile = path.join(__dirname, '..', 'database', 'update_auth_schema.sql')
    const sql = fs.readFileSync(sqlFile, 'utf8')

    // Выполняем SQL
    await query(sql)

    console.log('✅ Обновление схемы аутентификации применено успешно')
    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка применения обновления:', error)
    process.exit(1)
  }
}

applyAuthUpdate()
