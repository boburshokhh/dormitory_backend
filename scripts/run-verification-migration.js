const fs = require('fs').promises
const path = require('path')
const { query } = require('../config/database')

async function runVerificationMigration() {
  try {
    console.log('🔄 Запуск миграции для таблицы document_verifications...')

    // Читаем SQL файл
    const sqlPath = path.join(__dirname, '..', 'migrations', 'create_document_verifications_table.sql')
    const sql = await fs.readFile(sqlPath, 'utf8')

    // Выполняем миграцию
    await query(sql)

    console.log('✅ Таблица document_verifications успешно создана!')
  } catch (error) {
    console.error('❌ Ошибка выполнения миграции:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

runVerificationMigration()
