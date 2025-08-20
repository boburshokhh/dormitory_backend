const fs = require('fs')
const path = require('path')
const { query } = require('../config/database')

async function runMigration() {
  try {
    console.log('🔄 Запуск миграции для создания таблицы documents...')
    
    // Читаем SQL файл
    const migrationPath = path.join(__dirname, '../migrations/create_documents_table.sql')
    const sqlContent = fs.readFileSync(migrationPath, 'utf8')
    
    // Выполняем SQL запросы
    await query(sqlContent)
    
    console.log('✅ Миграция успешно выполнена!')
    console.log('📋 Таблица documents создана')
    
    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка выполнения миграции:', error)
    process.exit(1)
  }
}

runMigration()
