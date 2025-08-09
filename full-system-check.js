#!/usr/bin/env node

/**
 * 🔍 ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ "ВИРТУАЛЬНЫЙ ОФИС"
 * Проверяет все компоненты: Backend, База данных, MinIO, Шаблоны
 */

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const { Client: MinioClient } = require('minio')
const Docxtemplater = require('docxtemplater')
const PizZip = require('pizzip')
require('dotenv').config()

// Цвета для консоли
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m',
}

const log = (icon, message, color = colors.white) => {
  console.log(`${color}${icon} ${message}${colors.reset}`)
}

const success = (message) => log('✅', message, colors.green)
const error = (message) => log('❌', message, colors.red)
const warning = (message) => log('⚠️', message, colors.yellow)
const info = (message) => log('ℹ️', message, colors.blue)
const header = (message) => log('🔧', message, colors.cyan + colors.bright)

class SystemDiagnostic {
  constructor() {
    this.results = {
      environment: false,
      database: false,
      minio: false,
      backend: false,
      templates: false,
    }
    this.issues = []
    this.dbPool = null
    this.minioClient = null
  }

  async run() {
    header('ЗАПУСК ПОЛНОЙ ДИАГНОСТИКИ СИСТЕМЫ')
    console.log('')

    try {
      await this.checkEnvironment()
      await this.checkDatabase()
      await this.checkMinio()
      await this.checkBackendCode()
      await this.checkTemplateEngine()

      this.printSummary()
    } catch (err) {
      error(`Критическая ошибка диагностики: ${err.message}`)
    } finally {
      if (this.dbPool) await this.dbPool.end()
    }
  }

  async checkEnvironment() {
    header('1. ПРОВЕРКА ПЕРЕМЕННЫХ ОКРУЖЕНИЯ')

    const required = [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
      'MINIO_ENDPOINT',
      'MINIO_ACCESS_KEY',
      'MINIO_SECRET_KEY',
      'FILE_STORAGE_URL',
      'DOCS_HMAC_SECRET',
    ]

    let missing = []
    for (const key of required) {
      if (!process.env[key]) {
        missing.push(key)
      } else {
        success(`${key}: ✓`)
      }
    }

    if (missing.length > 0) {
      error(`Отсутствуют переменные: ${missing.join(', ')}`)
      this.issues.push(`Отсутствуют env переменные: ${missing.join(', ')}`)
    } else {
      success('Все переменные окружения настроены')
      this.results.environment = true
    }

    console.log('')
  }

  async checkDatabase() {
    header('2. ПРОВЕРКА БАЗЫ ДАННЫХ')

    try {
      this.dbPool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
      })

      // Тест подключения
      const client = await this.dbPool.connect()
      success('Подключение к PostgreSQL: ✓')
      client.release()

      // Проверка таблиц
      const tables = ['templates', 'documents', 'document_verifications']
      for (const table of tables) {
        const result = await this.dbPool.query(
          'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)',
          [table],
        )

        if (result.rows[0].exists) {
          success(`Таблица ${table}: ✓`)
        } else {
          error(`Таблица ${table}: отсутствует`)
          this.issues.push(`Таблица ${table} не создана`)
        }
      }

      // Проверка расширения uuid-ossp
      const uuidResult = await this.dbPool.query(
        "SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'uuid-ossp')",
      )

      if (uuidResult.rows[0].exists) {
        success('Расширение uuid-ossp: ✓')
      } else {
        error('Расширение uuid-ossp: отсутствует')
        this.issues.push('Необходимо установить расширение uuid-ossp')
      }

      this.results.database =
        this.issues.filter((i) => i.includes('Таблица') || i.includes('uuid-ossp')).length === 0
    } catch (err) {
      error(`Ошибка БД: ${err.message}`)
      this.issues.push(`Database: ${err.message}`)
    }

    console.log('')
  }

  async checkMinio() {
    header('3. ПРОВЕРКА MINIO')

    try {
      this.minioClient = new MinioClient({
        endPoint: process.env.MINIO_ENDPOINT,
        port: parseInt(process.env.MINIO_PORT || '9000'),
        useSSL: process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
      })

      // Проверка подключения и bucket
      const bucketExists = await this.minioClient.bucketExists(process.env.MINIO_BUCKET_NAME)
      if (bucketExists) {
        success(`Bucket ${process.env.MINIO_BUCKET_NAME}: ✓`)
        this.results.minio = true
      } else {
        error(`Bucket ${process.env.MINIO_BUCKET_NAME}: не существует`)
        this.issues.push(`MinIO bucket не найден`)
      }

      // Тест загрузки
      const testData = Buffer.from('test')
      const testKey = 'test/diagnostic-test.txt'

      await this.minioClient.putObject(process.env.MINIO_BUCKET_NAME, testKey, testData)
      success('Тест загрузки файла: ✓')

      await this.minioClient.removeObject(process.env.MINIO_BUCKET_NAME, testKey)
      success('Тест удаления файла: ✓')
    } catch (err) {
      error(`Ошибка MinIO: ${err.message}`)
      this.issues.push(`MinIO: ${err.message}`)
    }

    console.log('')
  }

  async checkBackendCode() {
    header('4. ПРОВЕРКА BACKEND КОДА')

    try {
      // Проверка наличия файлов
      const files = ['controllers/officeController.js', 'routes/office.js', 'package.json']

      for (const file of files) {
        if (fs.existsSync(path.join(__dirname, file))) {
          success(`Файл ${file}: ✓`)
        } else {
          error(`Файл ${file}: отсутствует`)
          this.issues.push(`Отсутствует файл: ${file}`)
        }
      }

      // Проверка зависимостей
      const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
      const deps = packageJson.dependencies || {}

      const required = ['docxtemplater', 'pizzip', 'qrcode', 'libreoffice-convert']
      for (const dep of required) {
        if (deps[dep]) {
          success(`Зависимость ${dep}: ✓ (${deps[dep]})`)
        } else {
          error(`Зависимость ${dep}: отсутствует`)
          this.issues.push(`Отсутствует зависимость: ${dep}`)
        }
      }

      // Проверка устаревших зависимостей
      if (deps['docx-templates']) {
        warning('Найдена устаревшая зависимость docx-templates')
        this.issues.push('Требуется удалить docx-templates')
      }

      this.results.backend =
        this.issues.filter((i) => i.includes('файл') || i.includes('зависимость')).length === 0
    } catch (err) {
      error(`Ошибка проверки кода: ${err.message}`)
      this.issues.push(`Backend code: ${err.message}`)
    }

    console.log('')
  }

  async checkTemplateEngine() {
    header('5. ПРОВЕРКА ДВИЖКА ШАБЛОНОВ')

    try {
      // Создаем простой тестовый DOCX
      const testDocx = this.createTestTemplate()

      // Тест рендера
      const zip = new PizZip(testDocx)
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      })

      const testData = {
        name: 'ТЕСТ',
        date: '2025-01-01',
        number: '123',
      }

      await doc.renderAsync(testData)
      const result = doc.getZip().generate({ type: 'nodebuffer' })

      success(`Движок шаблонов работает: ✓ (${result.length} байт)`)
      this.results.templates = true
    } catch (err) {
      error(`Ошибка движка шаблонов: ${err.message}`)
      this.issues.push(`Template engine: ${err.message}`)
    }

    console.log('')
  }

  createTestTemplate() {
    // Минимальный валидный DOCX с плейсхолдерами
    const content = `
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Тест: {name}, Дата: {date}, Номер: {number}</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`

    const zip = new PizZip()
    zip.file('word/document.xml', content)
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    )

    return zip.generate({ type: 'nodebuffer' })
  }

  printSummary() {
    header('📊 СВОДКА ДИАГНОСТИКИ')

    const total = Object.keys(this.results).length
    const passed = Object.values(this.results).filter(Boolean).length

    console.log('')
    log('📈', `Проверено компонентов: ${passed}/${total}`, colors.blue)

    if (this.issues.length === 0) {
      success('🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!')
    } else {
      error(`❌ НАЙДЕНО ПРОБЛЕМ: ${this.issues.length}`)
      console.log('')
      this.issues.forEach((issue, i) => {
        error(`${i + 1}. ${issue}`)
      })
    }

    console.log('')
    header('🔧 РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ:')
    console.log('')

    if (!this.results.environment) {
      warning('1. Проверьте файл .env и добавьте недостающие переменные')
    }

    if (!this.results.database) {
      warning('2. Выполните: psql -d gubkin_dormitory -f migrations/add_office_tables.sql')
      warning('   Включите расширение: CREATE EXTENSION IF NOT EXISTS "uuid-ossp";')
    }

    if (!this.results.minio) {
      warning('3. Проверьте настройки MinIO и создайте bucket')
    }

    if (!this.results.backend) {
      warning(
        '4. Установите зависимости: npm install docxtemplater pizzip qrcode libreoffice-convert',
      )
      warning('   Удалите старые: npm uninstall docx-templates')
    }

    if (!this.results.templates) {
      warning('5. Проверьте движок шаблонов и его зависимости')
    }

    if (passed === total) {
      success('✨ Система готова к работе!')
    } else {
      error('⚠️  Требуется исправление ошибок перед использованием')
    }
  }
}

// Запуск диагностики
if (require.main === module) {
  const diagnostic = new SystemDiagnostic()
  diagnostic.run().catch((err) => {
    console.error('Критическая ошибка:', err)
    process.exit(1)
  })
}

module.exports = SystemDiagnostic
