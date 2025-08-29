const { query } = require('../config/database')
const fs = require('fs')
const path = require('path')

async function runQueueMigration() {
  console.log('🚀 Запуск миграции системы электронной очереди...')

  try {
    // Читаем SQL файл миграции
    const migrationPath = path.join(__dirname, '../migrations/add_queue_system.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    // Разбиваем SQL на отдельные команды
    const commands = migrationSQL
      .split(';')
      .map((cmd) => cmd.trim())
      .filter((cmd) => cmd.length > 0 && !cmd.startsWith('--'))

    console.log(`📋 Найдено ${commands.length} команд для выполнения`)

    // Выполняем каждую команду
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]
      console.log(`\n⏳ Выполнение команды ${i + 1}/${commands.length}...`)

      try {
        await query(command)
        console.log('✅ Команда выполнена успешно')
      } catch (error) {
        // Если поле уже существует, пропускаем ошибку
        if (error.message.includes('already exists') || error.message.includes('duplicate')) {
          console.log('⚠️  Поле уже существует, пропускаем...')
        } else {
          throw error
        }
      }
    }

    console.log('\n🎉 Миграция системы очереди завершена успешно!')

    // Проверяем результат
    console.log('\n📊 Проверка результатов миграции...')

    const checkResult = await query(`
      SELECT 
        COUNT(*) as total_applications,
        COUNT(CASE WHEN is_queue = true THEN 1 END) as in_queue,
        COUNT(CASE WHEN is_queue = false THEN 1 END) as out_of_queue,
        COUNT(CASE WHEN queue_position IS NOT NULL THEN 1 END) as with_position
      FROM applications
    `)

    const stats = checkResult.rows[0]
    console.log(`📈 Статистика после миграции:`)
    console.log(`   - Всего заявок: ${stats.total_applications}`)
    console.log(`   - В очереди: ${stats.in_queue}`)
    console.log(`   - Вне очереди: ${stats.out_of_queue}`)
    console.log(`   - С позицией в очереди: ${stats.with_position}`)
  } catch (error) {
    console.error('❌ Ошибка при выполнении миграции:', error)
    process.exit(1)
  }
}

// Запускаем миграцию
runQueueMigration()
  .then(() => {
    console.log('\n✨ Миграция завершена!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Критическая ошибка:', error)
    process.exit(1)
  })
