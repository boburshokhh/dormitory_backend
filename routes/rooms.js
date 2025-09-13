const express = require('express')
const { query } = require('../config/database')
const { authenticateToken, requireAdmin } = require('../middleware/auth')
const XLSX = require('xlsx')

const router = express.Router()
router.use(authenticateToken)

// GET /api/rooms - Получить комнаты с фильтрацией и пагинацией
router.get('/', async (req, res) => {
  try {
    const { dormitoryId, floor, occupancy, page = 1, limit = 12 } = req.query

    const offset = (page - 1) * limit

    let whereClause = 'WHERE r.is_active = true'
    const params = []
    let paramCount = 0

    // Фильтр по общежитию
    if (dormitoryId) {
      whereClause += ` AND d.id = $${++paramCount}`
      params.push(dormitoryId)
    }

    // Фильтр по этажу
    if (floor) {
      whereClause += ` AND f.floor_number = $${++paramCount}`
      params.push(parseInt(floor))
    }

    // Фильтр по занятости
    if (occupancy === 'available') {
      whereClause += ` AND (r.bed_count - COALESCE(occupied_beds.count, 0)) > 0`
    } else if (occupancy === 'full') {
      whereClause += ` AND (r.bed_count - COALESCE(occupied_beds.count, 0)) = 0`
    }

    // Основной запрос для получения комнат
    const roomsQuery = `
      SELECT 
        r.id,
        r.room_number,
        r.bed_count as total_beds,
        r.description,
        r.amenities,
        r.is_reserved,
        r.is_female,
        d.name as dormitory_name,
        f.floor_number,
        COALESCE(occupied_beds.count, 0) as occupied_beds,
        (r.bed_count - COALESCE(occupied_beds.count, 0)) as available_beds
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
      LEFT JOIN (
        SELECT 
          room_id, 
          COUNT(*) as count 
        FROM beds 
        WHERE is_occupied = true AND is_active = true
        GROUP BY room_id
      ) occupied_beds ON r.id = occupied_beds.room_id
      ${whereClause}
      ORDER BY
        d.name,
        COALESCE(f.floor_number, f2.floor_number),
        COALESCE(NULLIF(regexp_replace(trim(r.room_number), '[^0-9].*$', ''), ''), '0')::int,
        NULLIF(regexp_replace(trim(r.room_number), '^[0-9 ]*', ''), ''),
        trim(r.room_number)
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `

    params.push(parseInt(limit), offset)

    // Запрос для общего количества
    const countQuery = `
      SELECT COUNT(*) as total
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
      LEFT JOIN (
        SELECT 
          room_id, 
          COUNT(*) as count 
        FROM beds 
        WHERE is_occupied = true AND is_active = true
        GROUP BY room_id
      ) occupied_beds ON r.id = occupied_beds.room_id
      ${whereClause}
    `

    const [roomsResult, countResult] = await Promise.all([
      query(roomsQuery, params),
      query(countQuery, params.slice(0, paramCount - 2)), // Убираем limit и offset для подсчета
    ])

    const rooms = roomsResult.rows.map((row) => ({
      id: row.id,
      roomNumber: row.room_number,
      dormitoryName: row.dormitory_name,
      floorNumber: row.floor_number,
      totalBeds: row.total_beds,
      occupiedBeds: row.occupied_beds,
      availableBeds: row.available_beds,
      description: row.description,
      amenities: row.amenities || [],
      isReserved: row.is_reserved === true,
      isFemale: row.is_female === true,
    }))

    const totalItems = parseInt(countResult.rows[0].total)
    const totalPages = Math.ceil(totalItems / limit)

    res.json({
      rooms,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems,
        itemsPerPage: parseInt(limit),
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error('Ошибка получения комнат:', error)
    res.status(500).json({ error: 'Ошибка получения данных о комнатах' })
  }
})

// GET /api/rooms/:id/residents - жильцы конкретной комнаты и сводка по местам
router.get('/:id/residents', async (req, res) => {
  try {
    const { id } = req.params

    // Информация по комнате и местам
    const roomInfoRes = await query(
      `SELECT r.id, r.room_number, r.bed_count AS total_beds,
              COALESCE(occ.count, 0) AS occupied_beds,
              (r.bed_count - COALESCE(occ.count, 0)) AS available_beds
       FROM rooms r
       LEFT JOIN (
         SELECT room_id, COUNT(*) AS count
         FROM beds
         WHERE is_occupied = true AND is_active = true
         GROUP BY room_id
       ) occ ON occ.room_id = r.id
       WHERE r.id = $1`,
      [id],
    )

    if (roomInfoRes.rowCount === 0) {
      return res.status(404).json({ error: 'Комната не найдена' })
    }

    // Список жильцов
    const residentsRes = await query(
      `SELECT b.bed_number,
              u.id AS user_id,
              u.first_name,
              u.last_name,
              u.middle_name,
              u.student_id,
              u.group_name,
              u.course,
              b.assigned_at
       FROM beds b
       LEFT JOIN users u ON u.id = b.student_id
       WHERE b.room_id = $1 AND b.is_active = true AND b.is_occupied = true
       ORDER BY b.bed_number`,
      [id],
    )

    const room = roomInfoRes.rows[0]
    res.json({
      success: true,
      data: {
        room: {
          id: id,
          roomNumber: room.room_number,
          totalBeds: parseInt(room.total_beds),
          occupiedBeds: parseInt(room.occupied_beds),
          availableBeds: parseInt(room.available_beds),
        },
        residents: residentsRes.rows.map((r) => ({
          bedNumber: r.bed_number,
          userId: r.user_id,
          fullName: `${r.last_name || ''} ${r.first_name || ''} ${r.middle_name || ''}`.trim(),
          studentId: r.student_id,
          groupName: r.group_name,
          course: r.course,
          assignedAt: r.assigned_at,
        })),
      },
    })
  } catch (error) {
    console.error('Ошибка получения жильцов комнаты:', error)
    res.status(500).json({ error: 'Ошибка получения жильцов комнаты' })
  }
})

// GET /api/rooms/export - Экспорт списка комнат с информацией о жильцах
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const { dormitoryId, format = 'json' } = req.query

    let whereClause = 'WHERE r.is_active = true'
    const params = []
    let paramCount = 0

    // Фильтр по общежитию
    if (dormitoryId) {
      whereClause += ` AND d.id = $${++paramCount}`
      params.push(dormitoryId)
    }

    // Запрос для получения комнат с информацией о жильцах
    const exportQuery = `
      SELECT 
        d.name as dormitory_name,
        COALESCE(f.floor_number, f2.floor_number) as floor_number,
        r.room_number,
        r.bed_count as total_beds,
        r.is_reserved,
        r.is_female,
        COALESCE(occupied_beds.count, 0) as occupied_beds,
        (r.bed_count - COALESCE(occupied_beds.count, 0)) as available_beds,
        CASE 
          WHEN r.is_reserved = true THEN 'Резерв'
          WHEN COALESCE(occupied_beds.count, 0) = 0 THEN 'Пустая'
          WHEN COALESCE(occupied_beds.count, 0) = r.bed_count THEN 'Полная'
          ELSE 'Частично занята'
        END as room_status,
        CASE 
          WHEN r.is_female = true THEN 'Для девушек'
          ELSE 'Общая'
        END as room_type,
        -- Информация о жильцах
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'bed_number', b.bed_number,
              'student_name', CONCAT(u.last_name, ' ', u.first_name, ' ', COALESCE(u.middle_name, '')),
              'student_id', u.student_id,
              'group_name', g.name,
              'course', g.course,
              'assigned_at', b.assigned_at
            )
          ) FROM beds b
          LEFT JOIN users u ON b.student_id = u.id
          LEFT JOIN groups g ON u.group_id = g.id
          WHERE b.room_id = r.id AND b.is_occupied = true AND b.is_active = true), 
          '[]'::json
        ) as residents
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.id
      LEFT JOIN blocks bl ON r.block_id = bl.id
      LEFT JOIN floors f2 ON bl.floor_id = f2.id
      LEFT JOIN dormitories d ON (f.dormitory_id = d.id OR f2.dormitory_id = d.id)
      LEFT JOIN (
        SELECT 
          room_id, 
          COUNT(*) as count 
        FROM beds 
        WHERE is_occupied = true AND is_active = true
        GROUP BY room_id
      ) occupied_beds ON r.id = occupied_beds.room_id
      ${whereClause}
      ORDER BY
        d.name,
        COALESCE(f.floor_number, f2.floor_number),
        COALESCE(NULLIF(regexp_replace(trim(r.room_number), '[^0-9].*$', ''), ''), '0')::int,
        NULLIF(regexp_replace(trim(r.room_number), '^[0-9 ]*', ''), ''),
        trim(r.room_number)
    `

    const result = await query(exportQuery, params)

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Комнаты не найдены',
        message: 'Для выбранного общежития не найдено ни одной комнаты',
      })
    }

    const rooms = result.rows.map((row) => ({
      dormitoryName: row.dormitory_name,
      floorNumber: row.floor_number,
      roomNumber: row.room_number,
      totalBeds: row.total_beds,
      occupiedBeds: row.occupied_beds,
      availableBeds: row.available_beds,
      isReserved: row.is_reserved === true,
      isFemale: row.is_female === true,
      roomStatus: row.room_status,
      roomType: row.room_type,
      residents: row.residents,
    }))

    if (format === 'csv') {
      // Генерируем CSV с улучшенным форматированием для Excel
      const csvHeaders = [
        '№',
        'Общежитие',
        'Этаж',
        'Комната',
        'Всего мест',
        'Занято',
        'Свободно',
        'Статус',
        'Тип комнаты',
        'Жильцы',
        'Детали жильцов',
      ]

      const csvRows = rooms.map((room, index) => {
        const residentsList = room.residents
          .map(
            (r) =>
              `${r.student_name} (койка ${r.bed_number}, гр. ${r.group_name}, ${r.course} курс)`,
          )
          .join('; ')

        const residentsDetails = room.residents
          .map(
            (r) =>
              `Койка ${r.bed_number}: ${r.student_name}, ${r.student_id}, ${r.group_name}, ${r.course} курс`,
          )
          .join('\n')

        return [
          index + 1,
          room.dormitoryName,
          room.floorNumber,
          room.roomNumber,
          room.totalBeds,
          room.occupiedBeds,
          room.availableBeds,
          room.roomStatus,
          room.roomType,
          residentsList || 'Пустая комната',
          residentsDetails || 'Нет жильцов',
        ]
      })

      // Добавляем пустую строку для разделения
      const csvContent = [
        csvHeaders,
        ...csvRows,
        [], // Пустая строка
        [`Отчет сгенерирован: ${new Date().toLocaleString('ru-RU')}`],
        [`Всего комнат: ${rooms.length}`],
        [`Занятых комнат: ${rooms.filter((r) => r.occupiedBeds > 0).length}`],
        [`Пустых комнат: ${rooms.filter((r) => r.occupiedBeds === 0).length}`],
      ]
        .map((row) => row.map((cell) => `"${cell || ''}"`).join(','))
        .join('\n')

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rooms_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      res.send('\ufeff' + csvContent) // BOM для корректного отображения кириллицы в Excel
    } else if (format === 'xlsx') {
      // Генерируем Excel файл с красивым форматированием
      const workbook = XLSX.utils.book_new()

      // Основная таблица комнат
      const roomsData = rooms.map((room, index) => ({
        '№': index + 1,
        Общежитие: room.dormitoryName,
        Этаж: room.floorNumber,
        Комната: room.roomNumber,
        'Всего мест': room.totalBeds,
        Занято: room.occupiedBeds,
        Свободно: room.availableBeds,
        Статус: room.roomStatus,
        'Тип комнаты': room.roomType,
        Жильцы:
          room.residents
            .map(
              (r) =>
                `${r.student_name} (койка ${r.bed_number}, гр. ${r.group_name}, ${r.course} курс)`,
            )
            .join('; ') || 'Пустая комната',
      }))

      const roomsWorksheet = XLSX.utils.json_to_sheet(roomsData)

      // Устанавливаем ширину колонок
      const columnWidths = [
        { wch: 5 }, // №
        { wch: 20 }, // Общежитие
        { wch: 8 }, // Этаж
        { wch: 12 }, // Комната
        { wch: 12 }, // Всего мест
        { wch: 10 }, // Занято
        { wch: 10 }, // Свободно
        { wch: 15 }, // Статус
        { wch: 15 }, // Тип комнаты
        { wch: 50 }, // Жильцы
      ]
      roomsWorksheet['!cols'] = columnWidths

      XLSX.utils.book_append_sheet(workbook, roomsWorksheet, 'Комнаты')

      // Создаем лист с детальной информацией о жильцах
      const residentsData = []
      rooms.forEach((room, roomIndex) => {
        if (room.residents.length > 0) {
          room.residents.forEach((resident) => {
            residentsData.push({
              '№ комнаты': room.roomNumber,
              Этаж: room.floorNumber,
              Общежитие: room.dormitoryName,
              Койка: resident.bed_number,
              ФИО: resident.student_name,
              'Студенческий №': resident.student_id,
              Группа: resident.group_name,
              Курс: resident.course,
              'Дата назначения': resident.assigned_at
                ? new Date(resident.assigned_at).toLocaleDateString('ru-RU')
                : 'Не указана',
            })
          })
        } else {
          residentsData.push({
            '№ комнаты': room.roomNumber,
            Этаж: room.floorNumber,
            Общежитие: room.dormitoryName,
            Койка: '-',
            ФИО: 'Пустая комната',
            'Студенческий №': '-',
            Группа: '-',
            Курс: '-',
            'Дата назначения': '-',
          })
        }
      })

      const residentsWorksheet = XLSX.utils.json_to_sheet(residentsData)

      // Устанавливаем ширину колонок для листа жильцов
      const residentsColumnWidths = [
        { wch: 12 }, // № комнаты
        { wch: 8 }, // Этаж
        { wch: 20 }, // Общежитие
        { wch: 8 }, // Койка
        { wch: 30 }, // ФИО
        { wch: 15 }, // Студенческий №
        { wch: 15 }, // Группа
        { wch: 8 }, // Курс
        { wch: 15 }, // Дата назначения
      ]
      residentsWorksheet['!cols'] = residentsColumnWidths

      XLSX.utils.book_append_sheet(workbook, residentsWorksheet, 'Жильцы')

      // Создаем лист со статистикой
      const statsData = [
        { Показатель: 'Всего комнат', Значение: rooms.length },
        { Показатель: 'Занятых комнат', Значение: rooms.filter((r) => r.occupiedBeds > 0).length },
        { Показатель: 'Пустых комнат', Значение: rooms.filter((r) => r.occupiedBeds === 0).length },
        { Показатель: 'Комнат в резерве', Значение: rooms.filter((r) => r.isReserved).length },
        { Показатель: 'Женских комнат', Значение: rooms.filter((r) => r.isFemale).length },
        { Показатель: 'Общих комнат', Значение: rooms.filter((r) => !r.isFemale).length },
        { Показатель: 'Всего мест', Значение: rooms.reduce((sum, r) => sum + r.totalBeds, 0) },
        { Показатель: 'Занятых мест', Значение: rooms.reduce((sum, r) => sum + r.occupiedBeds, 0) },
        {
          Показатель: 'Свободных мест',
          Значение: rooms.reduce((sum, r) => sum + r.availableBeds, 0),
        },
        {
          Показатель: 'Процент заполненности',
          Значение: `${Math.round((rooms.reduce((sum, r) => sum + r.occupiedBeds, 0) / rooms.reduce((sum, r) => sum + r.totalBeds, 0)) * 100)}%`,
        },
      ]

      const statsWorksheet = XLSX.utils.json_to_sheet(statsData)
      statsWorksheet['!cols'] = [{ wch: 25 }, { wch: 15 }]
      XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'Статистика')

      // Генерируем буфер Excel файла
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rooms_export_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      )
      res.send(excelBuffer)
    } else {
      // JSON формат
      res.json({
        exportDate: new Date().toISOString(),
        totalRooms: rooms.length,
        rooms,
      })
    }
  } catch (error) {
    console.error('Ошибка экспорта комнат:', error)
    res.status(500).json({ error: 'Ошибка экспорта данных о комнатах' })
  }
})

module.exports = router
