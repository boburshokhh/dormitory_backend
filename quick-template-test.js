#!/usr/bin/env node

/**
 * Быстрый тест DOCX шаблона
 * Минимальная диагностика для выявления основных проблем
 */

const fs = require('fs')
const { execSync } = require('child_process')
const Docxtemplater = require('docxtemplater')
const PizZip = require('pizzip')
const QRCode = require('qrcode')

// Простое логирование
const log = (emoji, message) => console.log(`${emoji} ${message}`)

// Тестовые данные
const TEST_DATA = {
  fullName: 'ТЕСТОВ ТЕСТ ТЕСТОВИЧ',
  docNumber: 'ДПС-2025/12345',
  birthDateStr: '«01» января 2000 г.',
  addressFull: 'г. Москва, ул. Тестовая, д. 1',
  faculty: 'Геологический',
  course: '1',
  groupNumber: 'ГР-101',
  educationForm: 'очная',
  basis: 'бюджет',
  dormNumber: '1',
  floor: '2',
  roomNumber: '201',
  periodFromStr: '«01» сентября 2024 г.',
  periodToStr: '«30» июня 2025 г.',
  contractNumber: '123/2024',
  contractDateStr: '«15» августа 2024 г.',
  headName: 'ПЕТРОВ П.П.',
  registrarName: 'СИДОРОВ С.С.',
}

async function quickTest(templatePath) {
  log('🧪', 'БЫСТРЫЙ ТЕСТ ШАБЛОНА')
  log('📁', `Файл: ${templatePath}`)

  try {
    // 1. Проверка файла
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Файл не найден: ${templatePath}`)
    }

    const stats = fs.statSync(templatePath)
    log('✅', `Файл найден (${stats.size} байт)`)

    // 2. Быстрый анализ плейсхолдеров
    log('🔍', 'Анализ плейсхолдеров...')

    try {
      execSync(`unzip -p "${templatePath}" word/document.xml > /tmp/doc.xml 2>/dev/null`)
      const xml = fs.readFileSync('/tmp/doc.xml', 'utf8')

      // Поиск правильных и неправильных плейсхолдеров
      const correct = xml.match(/\{[A-Za-z0-9_]+\}/g) || []
      const wrong = [
        ...(xml.match(/%[A-Za-z0-9_]+%/g) || []),
        ...(xml.match(/\{\%[^}]+\%\}/g) || []),
      ]

      if (correct.length > 0) {
        log('✅', `Правильные плейсхолдеры: ${correct.join(', ')}`)
      } else {
        log('❌', 'Правильные плейсхолдеры НЕ найдены!')
      }

      if (wrong.length > 0) {
        log('❌', `Неправильные плейсхолдеры: ${wrong.join(', ')}`)
      }

      // Проверка полей Word
      if (xml.includes('w:fldChar')) {
        log('⚠️', 'Найдены поля Word (Ctrl+F9) - замените на обычный текст')
      }
    } catch (e) {
      log('⚠️', `Не удалось проанализировать XML: ${e.message}`)
    }

    // 3. Тест рендера
    log('🎯', 'Тестирование рендера...')

    const templateBuffer = fs.readFileSync(templatePath)
    const qrBuffer = await QRCode.toBuffer('https://test.example.com', { width: 600 })

    const zip = new PizZip(templateBuffer)
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    })

    const qrBase64 = qrBuffer.toString('base64')
    const dataWithQR = { ...TEST_DATA, qr: qrBase64 }

    doc.setData(dataWithQR)
    doc.render()

    const report = doc.getZip().generate({ type: 'nodebuffer' })

    const outputPath = '/tmp/test-result.docx'
    fs.writeFileSync(outputPath, report)

    log('✅', `Рендер успешен! Размер: ${report.length} байт`)
    log('💾', `Результат: ${outputPath}`)

    // 4. Быстрая проверка результата
    try {
      execSync(`unzip -p "${outputPath}" word/document.xml > /tmp/result.xml 2>/dev/null`)
      const resultXml = fs.readFileSync('/tmp/result.xml', 'utf8')

      const substituted = []
      const notSubstituted = []

      Object.keys(TEST_DATA).forEach((key) => {
        if (resultXml.includes(TEST_DATA[key])) {
          substituted.push(key)
        } else if (resultXml.includes(`{${key}}`)) {
          notSubstituted.push(key)
        }
      })

      log('📊', `Подставлено: ${substituted.length}/${Object.keys(TEST_DATA).length}`)

      if (substituted.length > 0) {
        log(
          '✅',
          `Работают: ${substituted.slice(0, 5).join(', ')}${substituted.length > 5 ? '...' : ''}`,
        )
      }

      if (notSubstituted.length > 0) {
        log('❌', `НЕ работают: ${notSubstituted.join(', ')}`)
      }

      // Проверка QR
      if (resultXml.includes('{qr}')) {
        log('❌', 'QR-код не вставился')
      } else if (resultXml.includes('w:drawing')) {
        log('✅', 'QR-код вставлен')
      }
    } catch (e) {
      log('⚠️', 'Не удалось проанализировать результат')
    }

    log('🏁', 'Тест завершен')
  } catch (error) {
    log('💥', `ОШИБКА: ${error.message}`)
    process.exit(1)
  }
}

// Запуск
const templatePath = process.argv[2]
if (!templatePath) {
  console.log('Использование: node quick-template-test.js <путь-к-файлу.docx>')
  console.log('Пример: node quick-template-test.js /tmp/template.docx')
  process.exit(1)
}

quickTest(templatePath)
