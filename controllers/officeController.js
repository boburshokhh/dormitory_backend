const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid')
const createReport = require('docx-templates').default || require('docx-templates')
const QRCode = require('qrcode')
const libre = require('libreoffice-convert')
const { uploadFile, generateFileName, getFileUrlByMode, getFileStream } = require('../config/minio')
const db = require('../config/database')

const VERIFY_BASE_URL =
  process.env.DOCS_VERIFY_BASE_URL || 'https://api.dormitory.gubkin.uz/api/office/verify'
const HMAC_SECRET = process.env.DOCS_HMAC_SECRET || 'change-me-to-secure-secret'

// === УТИЛИТЫ ===
function hmacSign(value) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(value).digest('base64url')
}

// Функция для проверки и конвертации плейсхолдеров в шаблоне
function validateTemplateFormat(templateName) {
  console.log(`🔍 Проверка формата шаблона: ${templateName}`)
  console.log('⚠️  ВАЖНО: Убедитесь что в шаблоне используется правильный синтаксис:')
  console.log('✅ Правильно: {docNumber}, {fullName}, {birthDateStr}')
  console.log('❌ Неправильно: %docNumber%, {%docNumber%}, ${docNumber}')
  console.log('📝 QR-код: используйте {qr} в отдельной ячейке или строке')
}

function formatDate(dateStr, format = '«DD» MMMM YYYY г.') {
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
}

async function convertDocxToPdf(buffer) {
  return new Promise((resolve, reject) => {
    libre.convert(buffer, '.pdf', undefined, (err, done) => {
      if (err) return reject(err)
      resolve(done)
    })
  })
}

function generateDocNumber() {
  const year = new Date().getFullYear()
  const random = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0')
  return `ДПС-${year}/${random}`
}

// === ШАБЛОНЫ ===
exports.getTemplates = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, version, is_active, created_at, updated_at
       FROM templates
       WHERE is_active = true
       ORDER BY created_at DESC`,
    )

    res.json({
      success: true,
      data: result.rows,
    })
  } catch (error) {
    console.error('getTemplates error:', error)
    res.status(500).json({ error: 'Ошибка получения списка шаблонов' })
  }
}

exports.getTemplate = async (req, res) => {
  try {
    const { id } = req.params
    const result = await db.query(`SELECT * FROM templates WHERE id = $1 AND is_active = true`, [
      id,
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }

    res.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('getTemplate error:', error)
    res.status(500).json({ error: 'Ошибка получения шаблона' })
  }
}

exports.createTemplate = async (req, res) => {
  try {
    const { name, description, fields_schema } = req.body
    const file = req.file

    if (!file || !name) {
      return res.status(400).json({ error: 'Файл и название обязательны' })
    }

    // Загружаем файл в MinIO
    const minioKey = generateFileName(file.originalname, req.user.id, 'templates')
    // Проверяем тип файла
    const mime =
      file.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (!mime.includes('officedocument') && !file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({ error: 'Поддерживаются только DOCX-шаблоны' })
    }

    await uploadFile(file.buffer, minioKey, mime)

    // Подготовка JSON полей
    const fieldsJson =
      typeof fields_schema === 'string' && fields_schema.trim().length > 0 ? fields_schema : '{}'

    // Сохраняем в БД (с явным приведением к jsonb)
    const result = await db.query(
      `INSERT INTO templates (name, description, minio_key, fields_schema, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING *`,
      [name, description, minioKey, fieldsJson, req.user.id],
    )

    res.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('createTemplate error:', error)
    res.status(500).json({ error: 'Ошибка создания шаблона' })
  }
}

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, fields_schema, is_active } = req.body

    const result = await db.query(
      `UPDATE templates 
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           fields_schema = COALESCE($4::jsonb, fields_schema),
           is_active = COALESCE($5, is_active)
       WHERE id = $1
       RETURNING *`,
      [id, name, description, fields_schema || null, is_active],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }

    res.json({
      success: true,
      data: result.rows[0],
    })
  } catch (error) {
    console.error('updateTemplate error:', error)
    res.status(500).json({ error: 'Ошибка обновления шаблона' })
  }
}

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params

    // Мягкое удаление
    const result = await db.query(
      `UPDATE templates SET is_active = false WHERE id = $1 RETURNING id, name`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }

    res.json({
      success: true,
      message: `Шаблон "${result.rows[0].name}" удален`,
    })
  } catch (error) {
    console.error('deleteTemplate error:', error)
    res.status(500).json({ error: 'Ошибка удаления шаблона' })
  }
}

// === ДОКУМЕНТЫ ===
exports.generateDocument = async (req, res) => {
  const client = await db.pool.connect()

  try {
    await client.query('BEGIN')

    const { templateId, data, userId, docNumber: customDocNumber } = req.body
    if (!templateId || !data) {
      return res.status(400).json({ error: 'templateId и data обязательны' })
    }

    // Получаем шаблон
    const templateResult = await client.query(
      `SELECT * FROM templates WHERE id = $1 AND is_active = true`,
      [templateId],
    )

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Шаблон не найден' })
    }

    const template = templateResult.rows[0]

    // Проверяем формат шаблона
    validateTemplateFormat(template.name)

    // Получаем шаблон из MinIO
    const stream = await getFileStream(template.minio_key)
    const chunks = []
    await new Promise((resolve, reject) => {
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const templateBuffer = Buffer.concat(chunks)

    // Генерация номера документа
    const docNumber = customDocNumber || generateDocNumber()

    // Подпись и QR
    const verificationCode = uuidv4()
    const signature = hmacSign(verificationCode)
    const verificationUrl = `${VERIFY_BASE_URL}?c=${encodeURIComponent(verificationCode)}&s=${encodeURIComponent(signature)}`
    const qrPng = await QRCode.toBuffer(verificationUrl, { width: 600, margin: 0 })

    // Подготовка данных для рендера DOCX
    const templateData = {
      ...data,
      docNumber,
      birthDateStr: data.birthDate ? formatDate(data.birthDate) : '',
      periodFromStr: data.periodFrom ? formatDate(data.periodFrom) : '',
      periodToStr: data.periodTo ? formatDate(data.periodTo) : '',
      contractDateStr: data.contractDate ? formatDate(data.contractDate) : '',
      // Дополнительные поля для совместимости
      fullName: data.fullName || '',
      addressFull: data.addressFull || '',
      faculty: data.faculty || '',
      course: data.course || '',
      groupNumber: data.groupNumber || '',
      educationForm: data.educationForm || 'очная',
      basis: data.basis || '',
      dormNumber: data.dormNumber || '',
      floor: data.floor || '',
      roomNumber: data.roomNumber || '',
      contractNumber: data.contractNumber || '',
      headName: data.headName || '',
      registrarName: data.registrarName || '',
    }

    // Логирование данных для отладки
    console.log('📋 Данные для шаблона DOCX:', JSON.stringify(templateData, null, 2))

    // Рендер DOCX
    const report = await createReport({
      template: templateBuffer,
      data: templateData,
      additionalJsContext: {
        qr: () => ({ width: 5.0, height: 5.0, data: qrPng, extension: '.png' }),
        formatDate: (d, f) => formatDate(d, f),
      },
    })

    console.log('📄 DOCX документ успешно сгенерирован, размер:', report.byteLength)

    // Загрузка DOCX в MinIO
    const docxKey = generateFileName(`${Date.now()}.docx`, userId || 'system', 'documents')
    await uploadFile(
      Buffer.from(report),
      docxKey,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    // Конвертация в PDF
    const pdfBuffer = await convertDocxToPdf(Buffer.from(report))
    const pdfKey = docxKey.replace(/\.docx$/, '.pdf')
    await uploadFile(pdfBuffer, pdfKey, 'application/pdf')

    // Сохраняем документ в БД
    const docResult = await client.query(
      `INSERT INTO documents (
        template_id, user_id, created_by, doc_number, doc_type, data,
        docx_key, pdf_key, verification_code, verification_signature, verification_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        templateId,
        userId || req.user.id,
        req.user.id,
        docNumber,
        'direction',
        JSON.stringify(data),
        docxKey,
        pdfKey,
        verificationCode,
        signature,
        verificationUrl,
      ],
    )

    await client.query('COMMIT')

    // Генерируем URL-адреса для файлового хранилища
    const FILE_BASE_URL = process.env.FILE_STORAGE_URL || 'https://files.dormitory.gubkin.uz'
    const docxUrl = `${FILE_BASE_URL}/upload/${docxKey}`
    const pdfUrl = `${FILE_BASE_URL}/upload/${pdfKey}`

    res.json({
      success: true,
      data: {
        id: docResult.rows[0].id,
        docNumber,
        docxKey,
        pdfKey,
        docxUrl,
        pdfUrl,
        verificationUrl,
        verificationCode,
        signature,
      },
    })
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('generateDocument error:', error)
    res.status(500).json({ error: 'Ошибка генерации документа' })
  } finally {
    client.release()
  }
}

exports.getDocuments = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      doc_type,
      user_id,
      start_date,
      end_date,
    } = req.query
    const offset = (page - 1) * limit

    let whereConditions = []
    let params = []
    let paramCount = 0

    if (search) {
      paramCount++
      whereConditions.push(
        `(d.doc_number ILIKE $${paramCount} OR u.first_name ILIKE $${paramCount} OR u.last_name ILIKE $${paramCount})`,
      )
      params.push(`%${search}%`)
    }

    if (status) {
      paramCount++
      whereConditions.push(`d.status = $${paramCount}`)
      params.push(status)
    }

    if (doc_type) {
      paramCount++
      whereConditions.push(`d.doc_type = $${paramCount}`)
      params.push(doc_type)
    }

    if (user_id) {
      paramCount++
      whereConditions.push(`d.user_id = $${paramCount}`)
      params.push(user_id)
    }

    if (start_date) {
      paramCount++
      whereConditions.push(`d.created_at >= $${paramCount}`)
      params.push(start_date)
    }

    if (end_date) {
      paramCount++
      whereConditions.push(`d.created_at <= $${paramCount}`)
      params.push(end_date)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    // Получаем документы с информацией о пользователе и шаблоне
    const result = await db.query(
      `SELECT 
        d.*,
        u.first_name, u.last_name, u.email,
        t.name as template_name,
        cb.first_name as created_by_first_name,
        cb.last_name as created_by_last_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       LEFT JOIN templates t ON d.template_id = t.id
       LEFT JOIN users cb ON d.created_by = cb.id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
      [...params, limit, offset],
    )

    // Получаем общее количество
    const countResult = await db.query(
      `SELECT COUNT(*) FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       ${whereClause}`,
      params,
    )

    res.json({
      success: true,
      data: {
        documents: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(countResult.rows[0].count / limit),
        },
      },
    })
  } catch (error) {
    console.error('getDocuments error:', error)
    res.status(500).json({ error: 'Ошибка получения документов' })
  }
}

exports.getDocument = async (req, res) => {
  try {
    const { id } = req.params

    const result = await db.query(
      `SELECT 
        d.*,
        u.first_name, u.last_name, u.email,
        t.name as template_name,
        cb.first_name as created_by_first_name,
        cb.last_name as created_by_last_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       LEFT JOIN templates t ON d.template_id = t.id
       LEFT JOIN users cb ON d.created_by = cb.id
       WHERE d.id = $1`,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' })
    }

    const doc = result.rows[0]

    // Генерируем URL-адреса
    try {
      doc.docxUrl = await getFileUrlByMode(doc.docx_key)
      doc.pdfUrl = await getFileUrlByMode(doc.pdf_key)
    } catch (e) {
      console.error('URL generation error:', e)
    }

    res.json({
      success: true,
      data: doc,
    })
  } catch (error) {
    console.error('getDocument error:', error)
    res.status(500).json({ error: 'Ошибка получения документа' })
  }
}

exports.cancelDocument = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body

    const result = await db.query(
      `UPDATE documents 
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancelled_by = $2,
           cancel_reason = $3
       WHERE id = $1 AND status = 'issued'
       RETURNING id, doc_number`,
      [id, req.user.id, reason],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден или уже отменен' })
    }

    res.json({
      success: true,
      message: `Документ ${result.rows[0].doc_number} отменен`,
    })
  } catch (error) {
    console.error('cancelDocument error:', error)
    res.status(500).json({ error: 'Ошибка отмены документа' })
  }
}

// === ПРОВЕРКА ПОДЛИННОСТИ ===
exports.verifyDocument = async (req, res) => {
  try {
    const { c: code, s: sig } = req.query
    if (!code || !sig) {
      return res.status(400).json({ error: 'Параметры c и s обязательны' })
    }

    // Проверяем подпись
    const expected = hmacSign(code)
    const valid = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))

    if (!valid) {
      // Логируем неудачную попытку
      await db.query(
        `INSERT INTO document_verifications (verification_code, is_valid, ip_address, user_agent, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [code, false, req.ip, req.get('user-agent'), 'Неверная подпись'],
      )

      return res.status(400).json({
        valid: false,
        error: 'Неверная подпись документа',
      })
    }

    // Ищем документ
    const result = await db.query(
      `SELECT d.*, u.first_name, u.last_name, t.name as template_name
       FROM documents d
       LEFT JOIN users u ON d.user_id = u.id
       LEFT JOIN templates t ON d.template_id = t.id
       WHERE d.verification_code = $1`,
      [code],
    )

    if (result.rows.length === 0) {
      // Логируем неудачную попытку
      await db.query(
        `INSERT INTO document_verifications (verification_code, is_valid, ip_address, user_agent, error_message)
         VALUES ($1, $2, $3, $4, $5)`,
        [code, false, req.ip, req.get('user-agent'), 'Документ не найден'],
      )

      return res.status(404).json({
        valid: false,
        error: 'Документ не найден',
      })
    }

    const doc = result.rows[0]

    // Логируем успешную проверку
    await db.query(
      `INSERT INTO document_verifications (document_id, verification_code, is_valid, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [doc.id, code, true, req.ip, req.get('user-agent')],
    )

    // Возвращаем информацию о документе
    res.json({
      valid: true,
      document: {
        docNumber: doc.doc_number,
        docType: doc.doc_type,
        status: doc.status,
        issuedAt: doc.issued_at,
        expiresAt: doc.expires_at,
        templateName: doc.template_name,
        user: {
          firstName: doc.first_name,
          lastName: doc.last_name,
        },
        data: doc.data,
      },
    })
  } catch (error) {
    console.error('verifyDocument error:', error)
    res.status(500).json({ error: 'Ошибка проверки документа' })
  }
}

// === СТАТИСТИКА ===
exports.getStats = async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM templates WHERE is_active = true) as total_templates,
        (SELECT COUNT(*) FROM documents) as total_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'issued') as issued_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'cancelled') as cancelled_documents,
        (SELECT COUNT(*) FROM documents WHERE created_at >= NOW() - INTERVAL '7 days') as documents_last_week,
        (SELECT COUNT(*) FROM document_verifications WHERE created_at >= NOW() - INTERVAL '24 hours') as verifications_today
    `)

    res.json({
      success: true,
      data: stats.rows[0],
    })
  } catch (error) {
    console.error('getStats error:', error)
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
}
