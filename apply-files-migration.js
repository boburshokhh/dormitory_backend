const fs = require('fs')
const path = require('path')
const { query } = require('./config/database')

async function applyFilesMigration() {
  try {
    console.log('🔄 Применяем миграцию для таблицы files...')

    // Читаем SQL файл
    const sqlPath = path.join(__dirname, '..', 'database', 'create_files_table.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf8')

    // Выполняем SQL
    await query(sqlContent)

    console.log('✅ Миграция для таблицы files успешно применена')

    // Проверяем создание таблицы
    const result = await query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'files' 
      ORDER BY ordinal_position
    `)

    console.log('📋 Структура таблицы files:')
    result.rows.forEach((row) => {
      console.log(`  - ${row.column_name}: ${row.data_type}`)
    })
  } catch (error) {
    console.error('❌ Ошибка применения миграции:', error)
    throw error
  }
}

// Запускаем миграцию если скрипт вызван напрямую
if (require.main === module) {
  applyFilesMigration()
    .then(() => {
      console.log('🎉 Миграция завершена успешно')
      process.exit(0)
    })
    .catch((error) => {
      console.error('💥 Миграция завершилась с ошибкой:', error)
      process.exit(1)
    })
}

module.exports = { applyFilesMigration }
