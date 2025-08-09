#!/usr/bin/env node

/**
 * Комплексная диагностика DOCX шаблонов
 * Находит и устраняет проблемы с переменными в шаблонах
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const createReport = require('docx-templates').default || require('docx-templates')
const QRCode = require('qrcode')

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
  bold: '\x1b[1m',
}

const log = (color, message) => console.log(`${colors[color]}${message}${colors.reset}`)
const error = (message) => log('red', `❌ ${message}`)
const success = (message) => log('green', `✅ ${message}`)
const warning = (message) => log('yellow', `⚠️  ${message}`)
const info = (message) => log('blue', `ℹ️  ${message}`)
const debug = (message) => log('cyan', `🔍 ${message}`)

// Тестовые данные для рендера
const TEST_DATA = {
  fullName: 'ТЕСТОВ ТЕСТ ТЕСТОВИЧ',
  docNumber: 'ДПС-2025/12345',
  birthDate: '2000-01-01',
  birthDateStr: '«01» января 2000 г.',
  addressFull: 'г. Москва, ул. Тестовая, д. 1, кв. 1',
  faculty: 'Геологический факультет',
  course: '1',
  groupNumber: 'ГР-101',
  educationForm: 'очная',
  basis: 'бюджет',
  dormNumber: '1',
  floor: '2',
  roomNumber: '201',
  periodFrom: '2024-09-01',
  periodFromStr: '«01» сентября 2024 г.',
  periodTo: '2025-06-30',
  periodToStr: '«30» июня 2025 г.',
  contractNumber: '123/2024',
  contractDate: '2024-08-15',
  contractDateStr: '«15» августа 2024 г.',
  headName: 'ПЕТРОВ ПЕТР ПЕТРОВИЧ',
  registrarName: 'СИДОРОВ СИДОР СИДОРОВИЧ',
}

class TemplateDebugger {
  constructor(templatePath) {
    this.templatePath = templatePath
    this.outputDir = '/tmp/template-debug'
    this.issues = []

    // Создаем директорию для вывода
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true })
    }
  }

  // Основная функция диагностики
  async diagnose() {
    log('bold', '\n🧪 КОМПЛЕКСНАЯ ДИАГНОСТИКА DOCX ШАБЛОНА')
    log('bold', '==========================================\n')

    try {
      // 1. Проверка существования файла
      await this.checkFileExists()

      // 2. Анализ структуры DOCX
      await this.analyzeDocxStructure()

      // 3. Поиск плейсхолдеров
      await this.findPlaceholders()

      // 4. Проверка на разорванные теги
      await this.checkBrokenTags()

      // 5. Поиск полей Word
      await this.checkWordFields()

      // 6. Тест рендера
      await this.testRender()

      // 7. Анализ результата
      await this.analyzeResult()

      // 8. Финальный отчет
      this.generateReport()
    } catch (err) {
      error(`Критическая ошибка: ${err.message}`)
      console.error(err.stack)
    }
  }

  async checkFileExists() {
    info('1. Проверка существования файла шаблона...')

    if (!fs.existsSync(this.templatePath)) {
      throw new Error(`Файл шаблона не найден: ${this.templatePath}`)
    }

    const stats = fs.statSync(this.templatePath)
    success(`Файл найден: ${this.templatePath} (${stats.size} байт)`)
    debug(`Последнее изменение: ${stats.mtime}`)
  }

  async analyzeDocxStructure() {
    info('2. Анализ структуры DOCX файла...')

    try {
      // Распаковываем DOCX во временную директорию
      const extractDir = path.join(this.outputDir, 'extracted')
      execSync(`unzip -q -o "${this.templatePath}" -d "${extractDir}"`)

      // Проверяем основные файлы
      const documentXml = path.join(extractDir, 'word/document.xml')
      if (fs.existsSync(documentXml)) {
        success('Структура DOCX корректна')
        this.documentXml = fs.readFileSync(documentXml, 'utf8')
      } else {
        this.issues.push('Отсутствует word/document.xml - файл поврежден')
        error('Поврежденная структура DOCX')
      }
    } catch (err) {
      this.issues.push(`Ошибка распаковки DOCX: ${err.message}`)
      error(`Не удалось распаковать DOCX: ${err.message}`)
    }
  }

  async findPlaceholders() {
    info('3. Поиск плейсхолдеров в документе...')

    if (!this.documentXml) {
      error('Нет доступа к содержимому документа')
      return
    }

    // Поиск правильных плейсхолдеров {var}
    const correctPlaceholders = this.documentXml.match(/\{[A-Za-z0-9_]+\}/g) || []

    // Поиск неправильных плейсхолдеров
    const wrongPlaceholders = [
      ...(this.documentXml.match(/%[A-Za-z0-9_]+%/g) || []),
      ...(this.documentXml.match(/\{\%[A-Za-z0-9_]+\%\}/g) || []),
      ...(this.documentXml.match(/\{\{[A-Za-z0-9_]+\}\}/g) || []),
      ...(this.documentXml.match(/\$\{[A-Za-z0-9_]+\}/g) || []),
    ]

    if (correctPlaceholders.length > 0) {
      success(`Найдено правильных плейсхолдеров: ${correctPlaceholders.length}`)
      correctPlaceholders.forEach((p) => log('green', `  ✅ ${p}`))

      // Проверяем соответствие с тестовыми данными
      const missingVars = correctPlaceholders
        .map((p) => p.slice(1, -1)) // убираем скобки
        .filter((varName) => !(varName in TEST_DATA) && varName !== 'qr')

      if (missingVars.length > 0) {
        warning(`Переменные без данных: ${missingVars.join(', ')}`)
        this.issues.push(`Нет тестовых данных для: ${missingVars.join(', ')}`)
      }
    } else {
      error('Правильные плейсхолдеры НЕ найдены!')
      this.issues.push('Отсутствуют правильные плейсхолдеры {var}')
    }

    if (wrongPlaceholders.length > 0) {
      error(`Найдены неправильные плейсхолдеры: ${wrongPlaceholders.length}`)
      wrongPlaceholders.forEach((p) => log('red', `  ❌ ${p}`))
      this.issues.push(`Неправильный синтаксис: ${wrongPlaceholders.join(', ')}`)
    }

    // Сохраняем найденные плейсхолдеры
    this.foundPlaceholders = correctPlaceholders
  }

  async checkBrokenTags() {
    info('4. Проверка разорванных тегов...')

    if (!this.documentXml) return

    // Поиск потенциально разорванных тегов
    const brokenPatterns = [
      /\{[^}]*<[^>]*>[^}]*\}/g, // теги внутри плейсхолдеров
      /\{[^}]{1,2}</g, // незакрытые скобки
      />[^<]{1,2}\}/g, // неоткрытые скобки
    ]

    let foundBroken = false
    brokenPatterns.forEach((pattern, index) => {
      const matches = this.documentXml.match(pattern) || []
      if (matches.length > 0) {
        foundBroken = true
        warning(`Найдены разорванные теги (паттерн ${index + 1}): ${matches.length}`)
        matches.slice(0, 3).forEach((m) => log('yellow', `  ⚠️  ${m}`))
        this.issues.push(`Разорванные теги: ${matches.slice(0, 3).join(', ')}`)
      }
    })

    if (!foundBroken) {
      success('Разорванные теги не найдены')
    }
  }

  async checkWordFields() {
    info('5. Проверка полей Word (Ctrl+F9)...')

    if (!this.documentXml) return

    // Поиск полей Word
    const fieldChars = this.documentXml.match(/<w:fldChar[^>]*>/g) || []
    const fieldCodes = this.documentXml.match(/<w:instrText[^>]*>[^<]*<\/w:instrText>/g) || []

    if (fieldChars.length > 0 || fieldCodes.length > 0) {
      error(`Найдены поля Word: ${fieldChars.length} fldChar, ${fieldCodes.length} instrText`)
      this.issues.push('Используются поля Word вместо обычного текста')
      warning('Рекомендация: замените поля Word на обычный текст с плейсхолдерами {var}')
    } else {
      success('Поля Word не найдены')
    }
  }

  async testRender() {
    info('6. Тестирование рендера...')

    try {
      const templateBuffer = fs.readFileSync(this.templatePath)

      // Создаем QR-код для теста
      const qrBuffer = await QRCode.toBuffer('https://test.example.com', { width: 600, margin: 0 })

      debug('Запуск рендера с тестовыми данными...')

      const report = await createReport({
        template: templateBuffer,
        data: TEST_DATA,
        additionalJsContext: {
          qr: () => ({ width: 5.0, height: 5.0, data: qrBuffer, extension: '.png' }),
          formatDate: (dateStr, format = '«DD» MMMM YYYY г.') => {
            if (!dateStr) return ''
            const date = new Date(dateStr)
            const months = [
              'января',
              'февраля',
              'марта',
              'апреля',
              'мая',
              'июня',
              'июля',
              'августа',
              'сентября',
              'октября',
              'ноября',
              'декабря',
            ]
            const DD = String(date.getDate()).padStart(2, '0')
            const MMMM = months[date.getMonth()]
            const YYYY = String(date.getFullYear())
            return format.replace('DD', DD).replace('MMMM', MMMM).replace('YYYY', YYYY)
          },
        },
      })

      const outputPath = path.join(this.outputDir, 'test-output.docx')
      fs.writeFileSync(outputPath, report)

      success(`Рендер успешен! Размер: ${report.length} байт`)
      success(`Результат сохранен: ${outputPath}`)

      this.renderedPath = outputPath
      this.renderSuccess = true
    } catch (err) {
      error(`Ошибка рендера: ${err.message}`)
      this.issues.push(`Рендер провален: ${err.message}`)
      this.renderSuccess = false
    }
  }

  async analyzeResult() {
    info('7. Анализ результата рендера...')

    if (!this.renderSuccess || !this.renderedPath) {
      error('Анализ невозможен - рендер провален')
      return
    }

    try {
      // Распаковываем результат
      const resultDir = path.join(this.outputDir, 'result')
      execSync(`unzip -q -o "${this.renderedPath}" -d "${resultDir}"`)

      const resultXml = fs.readFileSync(path.join(resultDir, 'word/document.xml'), 'utf8')

      // Проверяем, какие переменные подставились
      const substituted = []
      const notSubstituted = []

      Object.keys(TEST_DATA).forEach((key) => {
        const value = TEST_DATA[key]
        if (resultXml.includes(value)) {
          substituted.push(key)
        } else if (resultXml.includes(`{${key}}`)) {
          notSubstituted.push(key)
        }
      })

      // Проверяем QR-код
      const hasQrPlaceholder = resultXml.includes('{qr}')
      const hasImageData = resultXml.includes('w:drawing') || resultXml.includes('pic:pic')

      success(`Подставлено переменных: ${substituted.length}/${Object.keys(TEST_DATA).length}`)
      substituted.forEach((key) => log('green', `  ✅ ${key}: ${TEST_DATA[key]}`))

      if (notSubstituted.length > 0) {
        error(`НЕ подставлено переменных: ${notSubstituted.length}`)
        notSubstituted.forEach((key) => log('red', `  ❌ {${key}} остался как есть`))
        this.issues.push(`Не подставились: ${notSubstituted.join(', ')}`)
      }

      if (hasQrPlaceholder) {
        error('QR-код не вставился - остался плейсхолдер {qr}')
        this.issues.push('QR-код не обработался')
      } else if (hasImageData) {
        success('QR-код успешно вставлен как изображение')
      } else {
        warning('QR-код: неопределенное состояние')
      }

      // Сохраняем отчет
      const reportPath = path.join(this.outputDir, 'analysis-report.txt')
      const reportContent = [
        'ОТЧЕТ АНАЛИЗА ШАБЛОНА',
        '===================',
        '',
        `Файл шаблона: ${this.templatePath}`,
        `Время анализа: ${new Date().toISOString()}`,
        '',
        'НАЙДЕННЫЕ ПЛЕЙСХОЛДЕРЫ:',
        ...(this.foundPlaceholders || []).map((p) => `  ${p}`),
        '',
        'ПОДСТАВЛЕННЫЕ ПЕРЕМЕННЫЕ:',
        ...substituted.map((key) => `  ✅ ${key}: ${TEST_DATA[key]}`),
        '',
        'НЕ ПОДСТАВЛЕННЫЕ ПЕРЕМЕННЫЕ:',
        ...notSubstituted.map((key) => `  ❌ {${key}}`),
        '',
        'ПРОБЛЕМЫ:',
        ...this.issues.map((issue) => `  - ${issue}`),
        '',
      ].join('\n')

      fs.writeFileSync(reportPath, reportContent)
      info(`Детальный отчет сохранен: ${reportPath}`)
    } catch (err) {
      error(`Ошибка анализа результата: ${err.message}`)
    }
  }

  generateReport() {
    log('bold', '\n📊 ФИНАЛЬНЫЙ ОТЧЕТ')
    log('bold', '=================\n')

    if (this.issues.length === 0) {
      success('🎉 ПРОБЛЕМ НЕ НАЙДЕНО! Шаблон работает корректно.')
    } else {
      error(`🚨 НАЙДЕНО ПРОБЛЕМ: ${this.issues.length}`)
      console.log('')
      this.issues.forEach((issue, index) => {
        log('red', `${index + 1}. ${issue}`)
      })
    }

    console.log('')
    log('bold', '📁 ФАЙЛЫ ОТЛАДКИ:')
    info(`Директория: ${this.outputDir}`)
    if (this.renderSuccess) {
      info(`Результат рендера: ${this.renderedPath}`)
    }

    console.log('')
    log('bold', '🔧 РЕКОМЕНДАЦИИ:')

    if (this.issues.some((i) => i.includes('плейсхолдеры'))) {
      warning('1. Исправьте синтаксис плейсхолдеров: используйте {var} вместо %var% или {{var}}')
    }

    if (this.issues.some((i) => i.includes('поля Word'))) {
      warning('2. Замените поля Word (Ctrl+F9) на обычный текст с плейсхолдерами')
    }

    if (this.issues.some((i) => i.includes('разорванные'))) {
      warning('3. Переписать плейсхолдеры заново, не разделяя их форматированием')
    }

    if (this.issues.some((i) => i.includes('QR'))) {
      warning('4. Поместите {qr} в отдельную ячейку таблицы или строку')
    }

    console.log('')
  }
}

// Основная функция запуска
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log('Использование: node debug-template.js <путь-к-шаблону.docx>')
    console.log('')
    console.log('Пример:')
    console.log('  node debug-template.js /tmp/template.docx')
    console.log('  node debug-template.js ./templates/direction.docx')
    process.exit(1)
  }

  const templatePath = args[0]
  const templateDebugger = new TemplateDebugger(templatePath)

  await templateDebugger.diagnose()
}

// Запуск, если файл вызван напрямую
if (require.main === module) {
  main().catch((err) => {
    console.error('💥 Критическая ошибка:', err.message)
    process.exit(1)
  })
}

module.exports = { TemplateDebugger, TEST_DATA }
