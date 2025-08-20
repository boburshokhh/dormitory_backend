const { query } = require('../config/database')
const { uploadFile, getFileUrl } = require('../config/minio')

// Импортируем pdfmake для серверной генерации
let pdfMake = null
let QRCode = null

// Инициализация pdfmake
const initPdfMake = async () => {
  if (!pdfMake) {
    try {
      // Используем require для совместимости с CommonJS
      const pdfMakeModule = require('pdfmake/build/pdfmake')
      const pdfFontsModule = require('pdfmake/build/vfs_fonts')
      const qrcodeModule = require('qrcode')

      pdfMake = pdfMakeModule
      QRCode = qrcodeModule

      // Инициализируем шрифты
      pdfMake.vfs = pdfFontsModule.pdfMake ? pdfFontsModule.pdfMake.vfs : pdfFontsModule.vfs || {}

      if (!pdfMake.vfs) pdfMake.vfs = {}
    } catch (error) {
      console.error('Ошибка инициализации pdfmake:', error)
      throw error
    }
  }
  return { pdfMake, QRCode }
}

// Функция генерации QR-кода
const generateQRCode = async (text) => {
  try {
    const { QRCode } = await initPdfMake()
    return await QRCode.toDataURL(text, {
      width: 100,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
  } catch (error) {
    console.error('Ошибка генерации QR-кода:', error)
    return null
  }
}

// Функция форматирования даты рождения
const formatBirthDate = (value) => {
  if (!value) return '«___»________ 20__ г'
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
  const d = new Date(value)
  if (isNaN(d.getTime())) return '«___»________ 20__ г'
  const day = String(d.getDate()).padStart(2, '0')
  const month = months[d.getMonth()]
  const year = d.getFullYear()
  return `«${day}» ${month} ${year} г`
}

// Функция генерации PDF документа
const generateDormitoryDirectionPDF = async (data) => {
  try {
    // Инициализируем pdfmake
    const { pdfMake } = await initPdfMake()

    // Генерируем QR-код для верификации документа
    const verificationUrl = `https://dormitory.gubkin.uz/verify/${data.documentId}`
    const qrCodeDataURL = await generateQRCode(verificationUrl)

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [85, 57, 43, 57], // левое 3см, верх 2см, правое 1.5см, низ 2см

      defaultStyle: {
        fontSize: 14,
        lineHeight: 1.08,
        alignment: 'justify',
      },

      content: [
        // Заголовок документа
        {
          text: `НАПРАВЛЕНИЕ на размещение в ДПС №${data.dormitoryNumber || '____'}`,
          style: 'header',
          alignment: 'center',
          margin: [0, 0, 0, 20],
        },

        // Вводная фраза
        {
          text: 'Прошу предоставить место в ДПС студенту:',
          margin: [0, 0, 0, 15],
        },

        // ФИО студента
        {
          text: `Ф.И.О.: ${data.fullName || '________________________________'}`,
          margin: [0, 0, 0, 8],
        },

        // Дата рождения
        {
          text: `год рождения ${formatBirthDate(data.birthDate)}`,
          margin: [0, 0, 0, 8],
        },

        // Адрес (слово "адрес" 14pt, скобки 10pt, значение 14pt)
        {
          text: [
            { text: 'адрес ', style: 'addressValue' },
            { text: '(место рождения; регион, район, улица, дом, кв): ', style: 'addressLabel' },
            { text: data.address || '____________________________', style: 'addressValue' },
          ],
          margin: [0, 0, 0, 8],
        },

        // Пустая строка
        {
          text: ' ',
          margin: [0, 0, 0, 8],
        },

        // Факультет
        {
          text: `Факультет: ${data.faculty || '________________'}`,
          margin: [0, 0, 0, 8],
        },

        // Курс и номер группы (без подчеркиваний)
        {
          text: `Курс: ${data.course || '____'}   № группы: ${data.groupNumber || '____________'}`,
          margin: [0, 0, 0, 8],
        },

        // Форма обучения
        {
          text: `Форма обучения: ${data.studyForm || 'очная'}`,
          margin: [0, 0, 0, 8],
        },

        // Основание
        {
          text: `Основание: ${data.basis || 'иногородний / первокурсник / нуждается в жилье'}`,
          margin: [0, 0, 0, 8],
        },

        // Блок размещения сразу после Основания
        { text: `ДПС №: ${data.dormitoryNumber || '____'}`, margin: [0, 0, 0, 8] },
        { text: `Этаж: ${data.floor || '____'}`, margin: [0, 0, 0, 8] },
        {
          text: `Комната №: ${data.room || '____'}`,
          margin: [0, 0, 0, 8],
        },

        // Пустая строка
        {
          text: ' ',
          margin: [0, 0, 0, 8],
        },

        // Период проживания
        {
          text: `Период проживания: 2025-2026 учебный год.`,
          margin: [0, 0, 0, 30],
        },

        // Подписи и печать
        {
          columns: [
            {
              width: '70%',
              stack: [
                {
                  text: 'Руководитель офиса регистратора Н. Хусанбаева',
                  margin: [0, 0, 0, 5],
                },
                {
                  text: ' ',
                  margin: [0, 0, 0, 10],
                },
                {
                  text: 'М.П.',
                  margin: [0, 0, 0, 0],
                },
              ],
            },
            {
              width: '30%',
              stack: [
                {
                  text: '_____/подпись/',
                  alignment: 'right',
                  fontSize: 10,
                  margin: [0, 0, 0, 5],
                },
              ],
            },
          ],
          margin: [0, 0, 0, 30],
        },

        // QR-код для верификации
        qrCodeDataURL
          ? {
              columns: [
                {
                  width: '*',
                  text: '',
                },
                {
                  width: 80,
                  stack: [
                    {
                      image: qrCodeDataURL,
                      width: 60,
                      height: 60,
                      alignment: 'center',
                      margin: [0, 0, 0, 5],
                    },
                    {
                      text: 'QR код',
                      fontSize: 8,
                      alignment: 'center',
                      color: '#666666',
                    },
                  ],
                },
              ],
              margin: [0, 10, 0, 0],
            }
          : null,

        // Метаданные документа (скрытые в комментарии)
        {
          text: `Документ сгенерирован: ${data.generatedAt.toLocaleString('ru-RU')}`,
          fontSize: 8,
          color: '#999999',
          alignment: 'right',
          margin: [0, 20, 0, 0],
        },
        {
          text: `ID документа: ${data.documentId}`,
          fontSize: 8,
          color: '#999999',
          alignment: 'right',
          margin: [0, 5, 0, 0],
        },
      ].filter(Boolean), // Убираем null элементы

      styles: {
        header: {
          fontSize: 16,
          bold: true,
          margin: [0, 0, 0, 20],
        },
        addressLabel: {
          fontSize: 10,
        },
        addressValue: {
          fontSize: 14,
        },
      },
    }

    // Возвращаем Buffer
    return new Promise((resolve, reject) => {
      try {
        const pdfDocGenerator = pdfMake.createPdf(docDefinition)
        pdfDocGenerator.getBuffer((pdfData, error) => {
          if (error) {
            console.error('Ошибка в getBuffer callback:', error)
            reject(new Error(`Ошибка генерации PDF: ${error.message}`))
          } else if (!pdfData) {
            console.error('PDF data пустой или undefined')
            reject(new Error('Ошибка генерации PDF: пустые данные'))
          } else {
            console.log('PDF данные получены, размер:', pdfData.length)
            console.log('Тип данных:', typeof pdfData)
            console.log('Является ли Buffer:', Buffer.isBuffer(pdfData))

            // Преобразуем в Buffer если это не Buffer
            let buffer
            if (Buffer.isBuffer(pdfData)) {
              buffer = pdfData
            } else if (pdfData instanceof Uint8Array) {
              buffer = Buffer.from(pdfData)
            } else if (typeof pdfData === 'string') {
              buffer = Buffer.from(pdfData, 'binary')
            } else {
              // Попробуем преобразовать объект в Buffer
              buffer = Buffer.from(pdfData)
            }

            console.log('Итоговый Buffer размер:', buffer.length)
            console.log('Итоговый Buffer тип:', typeof buffer)
            console.log('Итоговый является ли Buffer:', Buffer.isBuffer(buffer))
            resolve(buffer)
          }
        })
      } catch (error) {
        console.error('Ошибка в createPdf:', error)
        reject(error)
      }
    })
  } catch (error) {
    console.error('Критическая ошибка генерации PDF:', error)
    throw new Error('Сервис генерации PDF временно недоступен')
  }
}

class DocumentsController {
  // Генерация и сохранение документа "НАПРАВЛЕНИЕ на размещение в ДПС"
  async generateDormitoryDirection(req, res) {
    try {
      const { studentId } = req.params
      const generatedBy = req.user.id

      // Получаем данные студента с правильной обработкой блоков
      const studentQuery = `
        SELECT 
          u.id, u.first_name, u.last_name, u.middle_name, u.birth_date, u.address,
          u.course, u.region,
          g.name as group_name, g.faculty,
          b.id as bed_id, b.bed_number,
          r.room_number, r.block_room_number,
          bl.block_number,
          f.floor_number,
          d.name as dormitory_name, d.type as dormitory_type,
          -- Для ДПС 2: этаж блока, для ДПС 1: этаж комнаты  
          CASE 
            WHEN d.type = 'type_2' AND bl.id IS NOT NULL THEN bl_f.floor_number
            ELSE f.floor_number
          END as actual_floor_number
        FROM users u
        LEFT JOIN groups g ON u.group_id = g.id AND g.is_active = true
        LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
        LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
        LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
        LEFT JOIN floors f ON r.floor_id = f.id AND f.is_active = true
        LEFT JOIN floors bl_f ON bl.floor_id = bl_f.id AND bl_f.is_active = true
        LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR bl_f.dormitory_id = d.id) AND d.is_active = true
        WHERE u.id = $1 AND u.role = 'student'
      `

      const studentResult = await query(studentQuery, [studentId])
      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Студент не найден' })
      }

      const student = studentResult.rows[0]

      // Валидация данных студента
      if (!student.last_name || !student.first_name) {
        return res
          .status(400)
          .json({ error: 'Недостаточно данных о студенте для генерации документа' })
      }

      // Подготавливаем данные для PDF с правильным форматированием комнат
      console.log('Данные студента из БД:', {
        dormitory_type: student.dormitory_type,
        floor_number: student.floor_number,
        actual_floor_number: student.actual_floor_number,
        room_number: student.room_number,
        block_room_number: student.block_room_number,
        block_number: student.block_number,
      })

      // Определяем номер комнаты в зависимости от типа ДПС
      let roomNumber = '___'

      if (
        student.dormitory_type === 'type_2' &&
        student.block_number &&
        student.block_room_number
      ) {
        // ДПС 2: формат "блок/комната" (например: 301/1)
        roomNumber = `${student.block_number}/${student.block_room_number}`
      } else if (student.dormitory_type === 'type_1' && student.room_number) {
        // ДПС 1: просто номер комнаты (например: 22)
        roomNumber = student.room_number
      }

      const documentData = {
        fullName: `${student.last_name} ${student.first_name} ${student.middle_name || ''}`.trim(),
        birthDate: student.birth_date,
        address: student.address || 'адрес не указан',
        faculty: 'Нефтегазовое дело',
        course: student.course || '___',
        groupNumber: student.group_name || '___',
        studyForm: 'очная',
        basis: 'иногородний / первокурсник',
        dormitoryNumber:
          student.dormitory_type === 'type_1'
            ? '1'
            : student.dormitory_type === 'type_2'
              ? '2'
              : '___',
        floor: student.actual_floor_number || student.floor_number || '___',
        room: roomNumber,
        block: student.block_number || '___',
        period: '2025-2026 учебный год.',
        contractNumber: '___',
        documentId: `DOC-${Date.now()}-${student.id}`,
        generatedAt: new Date(),
      }

      console.log('Данные для PDF:', {
        dormitoryNumber: documentData.dormitoryNumber,
        floor: documentData.floor,
        room: documentData.room,
        block: documentData.block,
      })

      // Генерируем PDF как Buffer
      const pdfBuffer = await generateDormitoryDirectionPDF(documentData)

      // Проверяем, что pdfBuffer действительно является Buffer
      if (!Buffer.isBuffer(pdfBuffer)) {
        console.error('pdfBuffer не является Buffer:', typeof pdfBuffer, pdfBuffer)
        throw new Error('Ошибка генерации PDF: неверный тип данных')
      }

      console.log('PDF Buffer создан успешно, размер:', pdfBuffer.length)

      // Создаем уникальное имя файла
      const fileName = `dormitory-direction-${student.id}-${Date.now()}.pdf`
      const filePath = `documents/${fileName}`

      // Загружаем в MinIO
      try {
        await uploadFile(pdfBuffer, filePath, 'application/pdf')
      } catch (minioError) {
        console.error('Ошибка загрузки в MinIO:', minioError)
        throw new Error('Ошибка сохранения файла в хранилище')
      }

      // Сохраняем информацию в базу данных
      const insertQuery = `
        INSERT INTO documents (
          student_id, document_type, file_name, file_path, file_size, 
          mime_type, generated_by, generated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `

      const documentResult = await query(insertQuery, [
        studentId,
        'dormitory_direction',
        fileName,
        filePath,
        pdfBuffer.length,
        'application/pdf',
        generatedBy,
        new Date(),
      ])

      const document = documentResult.rows[0]

      // Генерируем URL для скачивания с правильным доменом
      const downloadUrl = `https://files.dormitory.gubkin.uz/upload/${filePath}`

      res.json({
        success: true,
        document: {
          id: document.id,
          fileName: document.file_name,
          fileSize: document.file_size,
          downloadUrl,
          generatedAt: document.generated_at,
        },
      })
    } catch (error) {
      console.error('Ошибка генерации документа:', error)

      // Определяем тип ошибки и отправляем соответствующий ответ
      if (error.message.includes('Сервис генерации PDF временно недоступен')) {
        res.status(503).json({ error: 'Сервис генерации PDF временно недоступен' })
      } else if (error.message.includes('Ошибка сохранения файла')) {
        res.status(500).json({ error: 'Ошибка сохранения файла' })
      } else {
        res.status(500).json({ error: 'Ошибка генерации документа' })
      }
    }
  }

  // Получение списка документов студента
  async getStudentDocuments(req, res) {
    try {
      const { studentId } = req.params

      const dbQuery = `
        SELECT 
          d.id, d.document_type, d.file_name, d.file_path, d.file_size, d.mime_type,
          d.generated_at, d.created_at, d.status,
          u.first_name, u.last_name, u.middle_name
        FROM documents d
        LEFT JOIN users u ON d.generated_by = u.id
        WHERE d.student_id = $1 AND d.is_active = true
        ORDER BY d.created_at DESC
      `

      const result = await query(dbQuery, [studentId])

      // Генерируем URL для каждого документа с правильным доменом
      const documents = result.rows.map((doc) => {
        const downloadUrl = `https://files.dormitory.gubkin.uz/upload/${doc.file_path}`
        return {
          ...doc,
          downloadUrl,
        }
      })

      res.json({ documents })
    } catch (error) {
      console.error('Ошибка получения документов:', error)
      res.status(500).json({ error: 'Ошибка получения документов' })
    }
  }

  // Получение документа по ID
  async getDocument(req, res) {
    try {
      const { documentId } = req.params

      const dbQuery = `
        SELECT 
          d.id, d.student_id, d.document_type, d.file_name, d.file_path, d.file_size, 
          d.mime_type, d.generated_by, d.generated_at, d.created_at, d.updated_at, d.status,
          u.first_name, u.last_name, u.middle_name as student_name
        FROM documents d
        LEFT JOIN users u ON d.student_id = u.id
        WHERE d.id = $1 AND d.is_active = true
      `

      const result = await query(dbQuery, [documentId])

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Документ не найден' })
      }

      const document = result.rows[0]
      const downloadUrl = `https://files.dormitory.gubkin.uz/upload/${document.file_path}`

      res.json({
        document: {
          ...document,
          downloadUrl,
        },
      })
    } catch (error) {
      console.error('Ошибка получения документа:', error)
      res.status(500).json({ error: 'Ошибка получения документа' })
    }
  }

  // Публичная верификация документа по QR-коду
  async verifyDocument(req, res) {
    try {
      const { documentId } = req.params

      console.log('Попытка верификации документа:', { documentId })

      // Получаем полную информацию о документе и студенте
      const verifyQuery = `
        SELECT 
          d.id, d.document_type, d.file_name, d.generated_at, d.status, d.is_active,
          u.id as student_id, u.first_name, u.last_name, u.middle_name, u.birth_date, 
          u.address, u.course, u.region, u.student_id as student_number,
          g.name as group_name, g.faculty, g.speciality,
          b.bed_number,
          r.room_number, r.block_room_number,
          bl.block_number,
          f.floor_number,
          dorm.name as dormitory_name, dorm.type as dormitory_type,
          creator.first_name as creator_first_name, creator.last_name as creator_last_name
        FROM documents d
        LEFT JOIN users u ON d.student_id = u.id
        LEFT JOIN groups g ON u.group_id = g.id AND g.is_active = true
        LEFT JOIN beds b ON u.id = b.student_id AND b.is_active = true
        LEFT JOIN rooms r ON b.room_id = r.id AND r.is_active = true
        LEFT JOIN blocks bl ON r.block_id = bl.id AND bl.is_active = true
        LEFT JOIN floors f ON r.floor_id = f.id AND f.is_active = true
        LEFT JOIN dormitories dorm ON f.dormitory_id = dorm.id AND dorm.is_active = true
        LEFT JOIN users creator ON d.generated_by = creator.id
        WHERE d.id = $1 AND d.is_active = true
      `

      const result = await query(verifyQuery, [documentId])

      if (result.rows.length === 0) {
        console.log('Документ не найден или неактивен:', documentId)
        return res.status(404).json({
          error: 'Документ не найден',
          message: 'Документ не существует или был удален',
        })
      }

      const document = result.rows[0]

      // Проверяем статус документа
      if (document.status !== 'active') {
        return res.status(410).json({
          error: 'Документ недействителен',
          message: 'Документ был отозван или деактивирован',
        })
      }

      // Форматируем данные для ответа
      const verificationData = {
        document: {
          id: document.id,
          type: document.document_type,
          fileName: document.file_name,
          generatedAt: document.generated_at,
          verifiedAt: new Date().toISOString(),
        },
        student: {
          fullName:
            `${document.last_name} ${document.first_name} ${document.middle_name || ''}`.trim(),
          birthDate: document.birth_date,
          address: document.address,
          course: document.course,
          group: document.group_name,
          faculty: document.faculty,
          speciality: document.speciality,
          studentNumber: document.student_number,
        },
        accommodation: {
          dormitory: document.dormitory_name,
          dormitoryType: document.dormitory_type,
          floor: document.floor_number,
          room: document.block_room_number || document.room_number,
          block: document.block_number,
          bed: document.bed_number,
        },
        creator: {
          name: `${document.creator_last_name} ${document.creator_first_name}`,
        },
        verification: {
          isValid: true,
          verifiedAt: new Date().toISOString(),
          message: 'Документ подлинный и действительный',
        },
      }

      console.log('Документ успешно верифицирован:', documentId)

      res.json({
        success: true,
        message: 'Документ верифицирован успешно',
        data: verificationData,
      })
    } catch (error) {
      console.error('Ошибка верификации документа:', error)
      res.status(500).json({
        error: 'Ошибка верификации документа',
        message: 'Не удалось проверить подлинность документа',
      })
    }
  }

  // Удаление документа
  async deleteDocument(req, res) {
    try {
      const { documentId } = req.params
      const userId = req.user.id

      console.log('Попытка удаления документа:', { documentId, userId })

      // Проверяем права доступа (только админ или создатель документа)
      const checkQuery = `
        SELECT generated_by FROM documents WHERE id = $1 AND is_active = true
      `
      const checkResult = await query(checkQuery, [documentId])

      if (checkResult.rows.length === 0) {
        console.log('Документ не найден:', documentId)
        return res.status(404).json({ error: 'Документ не найден' })
      }

      const document = checkResult.rows[0]
      console.log('Документ найден:', {
        documentId,
        generatedBy: document.generated_by,
        currentUser: userId,
      })

      // Проверяем права (админ или создатель документа)
      const userQuery = `SELECT role FROM users WHERE id = $1`
      const userResult = await query(userQuery, [userId])

      if (userResult.rows.length === 0) {
        console.log('Пользователь не найден:', userId)
        return res.status(403).json({ error: 'Доступ запрещен' })
      }

      const user = userResult.rows[0]
      console.log('Пользователь найден:', { userId, role: user.role })

      // Упрощенная проверка прав: разрешаем админам и супер-админам удалять любые документы
      if (user.role === 'admin' || user.role === 'super_admin') {
        console.log('Пользователь админ/супер-админ, разрешаем удаление')
      } else if (document.generated_by && document.generated_by === userId) {
        console.log('Пользователь создатель документа, разрешаем удаление')
      } else {
        console.log('Недостаточно прав:', {
          userRole: user.role,
          documentCreator: document.generated_by,
          currentUser: userId,
        })
        return res.status(403).json({ error: 'Недостаточно прав для удаления документа' })
      }

      // Помечаем документ как неактивный
      const updateQuery = `
        UPDATE documents 
        SET is_active = false, updated_at = NOW() 
        WHERE id = $1
      `
      await query(updateQuery, [documentId])

      console.log('Документ успешно удален:', documentId)
      res.json({ success: true, message: 'Документ удален' })
    } catch (error) {
      console.error('Ошибка удаления документа:', error)
      res.status(500).json({ error: 'Ошибка удаления документа' })
    }
  }
}

module.exports = new DocumentsController()
