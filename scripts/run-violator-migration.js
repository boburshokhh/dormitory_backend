const { query } = require('../config/database')
const fs = require('fs')
const path = require('path')

async function runViolatorMigration() {
  try {
    console.log('🚀 Запуск миграции для добавления поля is_violator...')

    // Читаем файл миграции
    const migrationPath = path.join(__dirname, '../migrations/add_violator_status_to_users.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('📄 Выполнение SQL миграции...')

    // Выполняем миграцию
    await query(migrationSQL)

    console.log('✅ Миграция успешно выполнена!')
    console.log('📊 Поле is_violator добавлено в таблицу users')
    console.log('🔍 Индекс idx_users_is_violator создан')

    // Проверяем, что поле добавлено
    const checkResult = await query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'is_violator'
    `)

    if (checkResult.rows.length > 0) {
      const column = checkResult.rows[0]
      console.log('✅ Проверка: поле is_violator найдено в таблице users')
      console.log(`   Тип данных: ${column.data_type}`)
      console.log(`   Значение по умолчанию: ${column.column_default}`)
      console.log(`   Может быть NULL: ${column.is_nullable}`)
    } else {
      console.log('❌ Ошибка: поле is_violator не найдено в таблице users')
    }

    // Проверяем индекс
    const indexResult = await query(`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'users' AND indexname = 'idx_users_is_violator'
    `)

    if (indexResult.rows.length > 0) {
      console.log('✅ Проверка: индекс idx_users_is_violator создан')
    } else {
      console.log('❌ Ошибка: индекс idx_users_is_violator не найден')
    }
    // Запускаем миграцию аудита нарушителей
    console.log('🧾 Запуск миграции аудита нарушителей...')
    const auditPath = path.join(__dirname, '../migrations/create_user_violation_audit.sql')
    const auditSQL = fs.readFileSync(auditPath, 'utf8')
    await query(auditSQL)
    console.log('✅ Таблица user_violation_audit создана (если отсутствовала)')
  } catch (error) {
    console.error('❌ Ошибка выполнения миграции:', error)
    process.exit(1)
  }
}

// Запускаем миграцию
runViolatorMigration()
  .then(() => {
    console.log('🎉 Миграция завершена успешно!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Критическая ошибка:', error)
    process.exit(1)
  })
