const express = require('express');
const HikvisionIntegration = require('./hikvision-integration');
const { authenticateToken } = require('./middleware/auth');
const { EVENT_TYPES, DOOR_CONTROL_TYPES, STATUS_VALUES } = require('./hikvisionApiMethods');

const router = express.Router();
const hikvisionIntegration = new HikvisionIntegration();

// Нормализация ФИО из разных возможных полей ответа Hikvision
function normalizePersonNameFields(ev) {
    const rawFirst = ev.firstName || ev.first_name || ev.givenName || ev.given_name || null;
    const rawLast = ev.lastName || ev.last_name || ev.surname || ev.family_name || null;
    const rawMiddle = ev.middleName || ev.middle_name || ev.patronymic || null;
    const direct = ev.personName || ev.person_name || ev.name || null;

    // Если есть прямое поле personName — используем его как базовое отображение
    let display = direct || '';

    // Если прямого нет — собираем из компонент
    if (!display) {
        const parts = [];
        if (rawLast) parts.push(String(rawLast).trim());
        if (rawFirst) parts.push(String(rawFirst).trim());
        if (rawMiddle) parts.push(String(rawMiddle).trim());
        display = parts.filter(Boolean).join(' ').trim();
    }

    // Если всё ещё пусто — попробуем из door event специфичных полей
    if (!display && ev.extendInfo && typeof ev.extendInfo === 'object') {
        const e = ev.extendInfo;
        const candidates = [e.personName, e.lastName && e.firstName ? `${e.lastName} ${e.firstName}` : null];
        display = candidates.find(Boolean) || '';
    }

    // Вернём дополненные поля, не ломая оригинальную структуру
    ev.firstNameNormalized = rawFirst || '';
    ev.lastNameNormalized = rawLast || '';
    ev.middleNameNormalized = rawMiddle || '';
    ev.personNameNormalized = display || '';
    ev.fullName = ev.personNameNormalized; // алиас для удобства фронта

    return ev;
}

/**
 * Получение списка пользователей из Hikvision
 * GET /api/hikvision/users
 */
router.get('/users', async (req, res) => {
    try {
        const {
            pageNo = 1,
            pageSize = 100,
            personName,
            personId,
            orgIndexCode
        } = req.query;

        const result = await hikvisionIntegration.getUsersFromHikvision({
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            personName,
            personId,
            orgIndexCode
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения пользователей',
            message: error.message
        });
    }
});

/**
 * Получение событий посещения из Hikvision
 * GET /api/hikvision/events
 */
router.get('/events', async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100
        } = req.query;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if (!eventType) {
            return res.status(400).json({
                success: false,
                error: 'Параметр eventType обязателен',
                example: {
                    eventType: '198914'
                }
            });
        }

        if (!doorIndexCodes) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        // Парсим doorIndexCodes из строки в массив
        let doorIndexCodesArray;
        try {
            doorIndexCodesArray = JSON.parse(doorIndexCodes);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'doorIndexCodes должен быть валидным JSON массивом',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        const result = await hikvisionIntegration.getEventsFromHikvision({
            startTime,
            endTime,
            eventType: parseInt(eventType),
            doorIndexCodes: doorIndexCodesArray,
            personName,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize)
        });
        console.log("result", result);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения событий',
            message: error.message
        });
    }
});

/**
 * Получение списка пользователей по турникету (doorIndexCode)
 * GET /api/hikvision/turnstiles/:doorId/users
 * Query: startTime, endTime, eventType(optional), pageNo(optional), pageSize(optional)
 */
router.get('/turnstiles/:doorId/users', async (req, res) => {
    try {
        const { doorId } = req.params;
        const {
            startTime,
            endTime,
            eventType, // optional
            pageNo = 1,
            pageSize = 100
        } = req.query;

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        // По умолчанию используем распространенный код события прохода, если не указан явно
        const effectiveEventType = eventType ? parseInt(eventType) : 196893;

        const result = await hikvisionIntegration.getEventsFromHikvision({
            startTime,
            endTime,
            eventType: effectiveEventType,
            doorIndexCodes: [doorId],
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize)
        });

        if (!result?.success) {
            // Доп. логирование для диагностики
            try { console.error('Hikvision events error:', {
                message: result?.message,
                dataCode: result?.data?.code,
                dataMsg: result?.data?.msg
            }); } catch {}
            return res.status(502).json({
                success: false,
                error: 'Ошибка получения событий от Hikvision',
                message: result?.message || result?.data?.msg || 'Unknown error',
                hikvision: {
                    code: result?.data?.code,
                    msg: result?.data?.msg
                }
            });
        }

        const events = result?.data?.data?.list || [];

        // Группируем по пользователю
        const userMap = new Map();
        for (const ev of events) {
            const pid = ev.personId || ev.person_id;
            const pname = ev.personName || ev.person_name || '—';
            if (!pid) continue;
            if (!userMap.has(pid)) {
                userMap.set(pid, {
                    personId: pid,
                    personName: pname,
                    totalEvents: 0,
                    firstEventTime: ev.eventTime || null,
                    lastEventTime: ev.eventTime || null
                });
            }
            const u = userMap.get(pid);
            u.totalEvents += 1;
            if (ev.eventTime) {
                if (!u.firstEventTime || ev.eventTime < u.firstEventTime) u.firstEventTime = ev.eventTime;
                if (!u.lastEventTime || ev.eventTime > u.lastEventTime) u.lastEventTime = ev.eventTime;
            }
        }

        const users = Array.from(userMap.values());

        res.json({
            success: true,
            data: {
                doorId,
                startTime,
                endTime,
                eventType: effectiveEventType,
                users,
                totalUsers: users.length,
                totalEvents: events.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения пользователей по турникету',
            message: error.message
        });
    }
});

/**
 * Синхронизация пользователей из Hikvision в PostgreSQL
 * POST /api/hikvision/sync/users
 */
router.post('/sync/users', authenticateToken, async (req, res) => {
    try {
        const {
            pageNo = 1,
            pageSize = 100,
            personName,
            personId,
            orgIndexCode
        } = req.body;

        const result = await hikvisionIntegration.syncUsers({
            pageNo,
            pageSize,
            personName,
            personId,
            orgIndexCode
        }, {
            userId: req.user?.sub || req.user?.id || null,
            ipAddress: req.ipAddress || null,
            userAgent: req.userAgent || null
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка синхронизации пользователей',
            message: error.message
        });
    }
});

/**
 * Синхронизация событий из Hikvision в PostgreSQL
 * POST /api/hikvision/sync/events
 */
router.post('/sync/events', authenticateToken, async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100
        } = req.body;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if (!eventType) {
            return res.status(400).json({
                success: false,
                error: 'Параметр eventType обязателен',
                example: {
                    eventType: 198914
                }
            });
        }

        if (!doorIndexCodes || !Array.isArray(doorIndexCodes)) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен и должен быть массивом',
                example: {
                    doorIndexCodes: ["1", "2"]
                }
            });
        }

        const result = await hikvisionIntegration.syncEvents({
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo,
            pageSize
        }, {
            userId: req.user?.sub || req.user?.id || null,
            ipAddress: req.ipAddress || null,
            userAgent: req.userAgent || null
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка синхронизации событий',
            message: error.message
        });
    }
});

/**
 * Получение статистики посещений
 * GET /api/hikvision/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            personId
        } = req.query;

        // Валидация обязательных параметров
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startDate и endDate обязательны',
                example: {
                    startDate: '2024-01-01',
                    endDate: '2024-01-31'
                }
            });
        }

        const result = await hikvisionIntegration.getAttendanceStats({
            startDate,
            endDate,
            personId
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статистики',
            message: error.message
        });
    }
});

/**
 * Получение событий посещения из PostgreSQL
 * GET /api/hikvision/attendance
 */
router.get('/attendance', async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            personId,
            eventType,
            limit = 100,
            offset = 0
        } = req.query;

        let query = `
            SELECT 
                id,
                event_id,
                person_id,
                person_name,
                event_time,
                event_type,
                event_type_name,
                door_name,
                device_name,
                created_at
            FROM attendance_logs
            WHERE 1=1
        `;
        
        const queryParams = [];
        let paramIndex = 1;

        if (startDate) {
            query += ` AND event_time >= $${paramIndex}`;
            queryParams.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            query += ` AND event_time <= $${paramIndex}`;
            queryParams.push(endDate);
            paramIndex++;
        }

        if (personId) {
            query += ` AND person_id = $${paramIndex}`;
            queryParams.push(personId);
            paramIndex++;
        }

        if (eventType) {
            query += ` AND event_type = $${paramIndex}`;
            queryParams.push(parseInt(eventType));
            paramIndex++;
        }

        query += ` ORDER BY event_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        queryParams.push(parseInt(limit), parseInt(offset));

        const { Pool } = await import('pg');
        const pool = new Pool({
            connectionString: 'postgresql://postgres:1234bobur$@192.168.1.253:5432/gubkin_dormitory',
            ssl: false
        });

        const result = await pool.query(query, queryParams);
        await pool.end();

        res.json({
            success: true,
            data: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения данных посещения',
            message: error.message
        });
    }
});

/**
 * Получение списка устройств контроля доступа
 * GET /api/hikvision/devices
 */
router.get('/devices', async (req, res) => {
    try {
        const {
            pageNo = 1,
            pageSize = 100,
            acsDevIndexCode,
            devName
        } = req.query;

        const result = await hikvisionIntegration.getAcsDevicesFromHikvision({
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            acsDevIndexCode,
            devName
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения устройств контроля доступа',
            message: error.message
        });
    }
});

/**
 * Получение списка дверей/турникетов
 * GET /api/hikvision/doors
 */
router.get('/doors', async (req, res) => {
    try {
        const {
            pageNo = 1,
            pageSize = 100,
            acsDevIndexCode,
            doorName,
            regionIndexCode
        } = req.query;

        const result = await hikvisionIntegration.getDoorsFromHikvision({
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            acsDevIndexCode,
            doorName,
            regionIndexCode
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения дверей/турникетов',
            message: error.message
        });
    }
});

/**
 * Получение информации о двери по коду
 * GET /api/hikvision/doors/:doorId
 */
router.get('/doors/:doorId', async (req, res) => {
    try {
        const { doorId } = req.params;

        const result = await hikvisionIntegration.getDoorInfoFromHikvision(doorId);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения информации о двери',
            message: error.message
        });
    }
});

/**
 * Управление дверью (открытие/закрытие)
 * POST /api/hikvision/doors/control
 */
router.post('/doors/control', authenticateToken, async (req, res) => {
    try {
        const {
            doorIndexCodes,
            controlType
        } = req.body;

        // Валидация обязательных параметров
        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'doorIndexCodes обязателен и должен быть массивом',
                example: {
                    doorIndexCodes: ["1", "2"],
                    controlType: 0
                }
            });
        }

        if (controlType === undefined || controlType === null) {
            return res.status(400).json({
                success: false,
                error: 'controlType обязателен',
                example: {
                    doorIndexCodes: ["1"],
                    controlType: 0
                }
            });
        }

        const result = await hikvisionIntegration.controlDoor({
            doorIndexCodes,
            controlType
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка управления дверью',
            message: error.message
        });
    }
});

/**
 * Получение событий турникета (обновленный метод)
 * GET /api/hikvision/turnstile/events
 */
router.get('/turnstile/events', async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100,
            temperatureStatus = STATUS_VALUES.TEMPERATURE.UNKNOWN,
            maskStatus = STATUS_VALUES.MASK.UNKNOWN,
            personNameExact = 'false', // Новое: точное совпадение ФИО
            uniqueByPerson = 'false'   // Новое: вернуть по одному (последнему) событию на пользователя
        } = req.query;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if (!eventType) {
            return res.status(400).json({
                success: false,
                error: 'Параметр eventType обязателен',
                example: {
                    eventType: '198914'
                }
            });
        }

        if (!doorIndexCodes) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        // Парсим doorIndexCodes из строки в массив
        let doorIndexCodesArray;
        try {
            doorIndexCodesArray = JSON.parse(doorIndexCodes);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'doorIndexCodes должен быть валидным JSON массивом',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        const result = await hikvisionIntegration.getTurnstileEventsFromHikvision({
            startTime,
            endTime,
            eventType: parseInt(eventType),
            doorIndexCodes: doorIndexCodesArray,
            personName,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            temperatureStatus: parseInt(temperatureStatus),
            wearMaskStatus: parseInt(maskStatus)
        });
        // Нормализуем ФИО во всех событиях
        try {
            const list = result?.data?.data?.list;
            if (Array.isArray(list)) {
                for (let i = 0; i < list.length; i++) list[i] = normalizePersonNameFields(list[i]);

                // Фильтр: точное совпадение ФИО (без учета регистра)
                if (String(personNameExact).toLowerCase() === 'true' && personName) {
                    const q = String(personName).trim().toLowerCase();
                    result.data.data.list = list.filter(ev => String(ev.personName || '').toLowerCase() === q || String(ev.personNameNormalized || '').toLowerCase() === q);
                }

                // Агрегация: только по одному (последнему) событию на пользователя
                if (String(uniqueByPerson).toLowerCase() === 'true') {
                    const byPerson = new Map();
                    for (const ev of result.data.data.list) {
                        const pid = ev.personId;
                        if (!pid) continue;
                        const prev = byPerson.get(pid);
                        if (!prev || new Date(ev.eventTime) > new Date(prev.eventTime)) byPerson.set(pid, ev);
                    }
                    result.data.data.list = Array.from(byPerson.values());
                    result.data.data.total = result.data.data.list.length;
                }
            }
        } catch {}

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения событий турникета',
            message: error.message
        });
    }
});

/**
 * Получение событий турникета (POST, параметры в body)
 * POST /api/hikvision/turnstile/events
 */
router.post('/turnstile/events', async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100,
            temperatureStatus = STATUS_VALUES.TEMPERATURE.UNKNOWN,
            wearMaskStatus = STATUS_VALUES.MASK.UNKNOWN,
            sortField = 'SwipeTime',
            orderType = 1,
            personNameExact = false, // Новое
            uniqueByPerson = false   // Новое
        } = req.body || {};

        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if ((!eventType || isNaN(parseInt(eventType))) && !personName) {
            return res.status(400).json({
                success: false,
                error: 'Укажите eventType или personName'
            });
        }

        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен и должен быть массивом',
                example: {
                    doorIndexCodes: ['1', '2']
                }
            });
        }

        const result = await hikvisionIntegration.getTurnstileEventsFromHikvision({
            startTime,
            endTime,
            eventType: eventType !== undefined ? parseInt(eventType) : undefined,
            doorIndexCodes,
            personName,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            temperatureStatus: parseInt(temperatureStatus),
            wearMaskStatus: parseInt(wearMaskStatus),
            sortField,
            orderType: parseInt(orderType)
        });
        // Нормализуем ФИО во всех событиях + новые фильтры
        try {
            const list = result?.data?.data?.list;
            if (Array.isArray(list)) {
                for (let i = 0; i < list.length; i++) list[i] = normalizePersonNameFields(list[i]);

                // Удалено: фильтрация по personNameExact (точное совпадение ФИО)

                if (Boolean(uniqueByPerson)) {
                    const byPerson = new Map();
                    for (const ev of result.data.data.list) {
                        const pid = ev.personId;
                        if (!pid) continue;
                        const prev = byPerson.get(pid);
                        if (!prev || new Date(ev.eventTime) > new Date(prev.eventTime)) byPerson.set(pid, ev);
                    }
                    result.data.data.list = Array.from(byPerson.values());
                    result.data.data.total = result.data.data.list.length;
                }
            }
        } catch {}

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения событий турникета (POST)',
            message: error.message
        });
    }
});

/**
 * Получение событий входа и выхода для турникета
 * GET /api/hikvision/turnstile/entry-exit
 */
router.get('/turnstile/entry-exit', async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100,
            eventTypeEntry,
            eventTypeExit
        } = req.query;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if (!doorIndexCodes) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        // Парсим doorIndexCodes из строки в массив
        let doorIndexCodesArray;
        try {
            doorIndexCodesArray = JSON.parse(doorIndexCodes);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'doorIndexCodes должен быть валидным JSON массивом',
                example: {
                    doorIndexCodes: '["1", "2"]'
                }
            });
        }

        const result = await hikvisionIntegration.getTurnstileEntryExitEvents({
            startTime,
            endTime,
            doorIndexCodes: doorIndexCodesArray,
            personName,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            eventTypeEntry: eventTypeEntry ? parseInt(eventTypeEntry) : undefined,
            eventTypeExit: eventTypeExit ? parseInt(eventTypeExit) : undefined
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения событий входа/выхода',
            message: error.message
        });
    }
});

/**
 * Получение общих событий системы
 * GET /api/hikvision/general/events
 */
router.get('/general/events', async (req, res) => {
    try {
        const {
            eventIndexCode,
            eventTypes,
            srcType,
            srcIndexs,
            startTime,
            endTime,
            pageNo = 1,
            pageSize = 100,
            subSrcType,
            subSrcIndexs
        } = req.query;

        const result = await hikvisionIntegration.getGeneralEventsFromHikvision({
            eventIndexCode,
            eventTypes,
            srcType,
            srcIndexs,
            startTime,
            endTime,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize),
            subSrcType,
            subSrcIndexs
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения общих событий',
            message: error.message
        });
    }
});

/**
 * Получение изображений событий
 * GET /api/hikvision/events/:eventId/pictures
 */
router.get('/events/:eventId/pictures', async (req, res) => {
    try {
        const { eventId } = req.params;

        const result = await hikvisionIntegration.getEventPicturesFromHikvision(eventId);

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения изображений событий',
            message: error.message
            });
    }
});

/**
 * Синхронизация событий турникета из Hikvision в PostgreSQL
 * POST /api/hikvision/sync/turnstile-events
 */
router.post('/sync/turnstile-events', authenticateToken, async (req, res) => {
    try {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo = 1,
            pageSize = 100,
            temperatureStatus = STATUS_VALUES.TEMPERATURE.UNKNOWN,
            maskStatus = STATUS_VALUES.MASK.UNKNOWN
        } = req.body;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        if (!eventType) {
            return res.status(400).json({
                success: false,
                error: 'Параметр eventType обязателен',
                example: {
                    eventType: 198914
                }
            });
        }

        if (!doorIndexCodes || !Array.isArray(doorIndexCodes)) {
            return res.status(400).json({
                success: false,
                error: 'Параметр doorIndexCodes обязателен и должен быть массивом',
                example: {
                    doorIndexCodes: ["1", "2"]
                }
            });
        }

        const result = await hikvisionIntegration.syncTurnstileEvents({
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName,
            pageNo,
            pageSize,
            temperatureStatus,
            wearMaskStatus: maskStatus
        }, {
            userId: req.user?.sub || req.user?.id || null,
            ipAddress: req.ipAddress || null,
            userAgent: req.userAgent || null
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка синхронизации событий турникета',
            message: error.message
        });
    }
});

/**
 * Получение констант API
 * GET /api/hikvision/constants
 */
router.get('/constants', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                eventTypes: EVENT_TYPES,
                doorControlTypes: DOOR_CONTROL_TYPES,
                statusValues: STATUS_VALUES
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Ошибка получения констант',
            message: error.message
        });
    }
});

/**
 * Живой поток событий (Server-Sent Events)
 * GET /api/hikvision/turnstile/stream
 */
router.get('/turnstile/stream', async (req, res) => {
    try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const send = (event, data) => {
            res.write(`event: ${event}\n`);
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const onEvent = (payload) => send('turnstile_event', payload);
        const onSummary = (payload) => send('turnstile_summary', payload);

        hikvisionIntegration.emitter.on('turnstile_event', onEvent);
        hikvisionIntegration.emitter.on('turnstile_summary', onSummary);

        // Пинги для удержания соединения
        const pingTimer = setInterval(() => send('ping', { t: Date.now() }), 15000);

        req.on('close', () => {
            clearInterval(pingTimer);
            hikvisionIntegration.emitter.off('turnstile_event', onEvent);
            hikvisionIntegration.emitter.off('turnstile_summary', onSummary);
            res.end();
        });

        // Немедленный приветственный пинг
        send('ready', { message: 'SSE connected' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ошибка SSE', message: error.message });
    }
});

/**
 * Старт поллера событий турникета
 * POST /api/hikvision/turnstile/poll/start
 * Body: { doorIndexCodes: string[], personName?: string, intervalMs?: number, eventTypes?: number[] }
 */
router.post('/turnstile/poll/start', authenticateToken, async (req, res) => {
    try {
        const { doorIndexCodes, personName, intervalMs, eventTypes } = req.body || {};
        const result = hikvisionIntegration.startPolling({ doorIndexCodes, personName, intervalMs, eventTypes });
        res.json(result);
    } catch (error) {
        res.status(400).json({ success: false, error: 'Ошибка старта поллера', message: error.message });
    }
});

/**
 * Остановка поллера
 * POST /api/hikvision/turnstile/poll/stop
 */
router.post('/turnstile/poll/stop', authenticateToken, async (req, res) => {
    try {
        const result = hikvisionIntegration.stopPolling();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ошибка остановки поллера', message: error.message });
    }
});

/**
 * Статус поллера
 * GET /api/hikvision/turnstile/poll/status
 */
router.get('/turnstile/poll/status', async (req, res) => {
    try {
        const result = hikvisionIntegration.getPollingStatus();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ошибка статуса поллера', message: error.message });
    }
});

/**
 * История событий конкретного человека (по personId)
 * GET /api/hikvision/turnstile/person/:personId/events
 */
router.get('/turnstile/person/:personId/events', async (req, res) => {
    try {
        const { personId } = req.params;
        const {
            startTime,
            endTime,
            doorIndexCodes, // JSON строка массива или отсутствует
            pageNo = 1,
            pageSize = 50,
            eventType = 196893 // по умолчанию проход
        } = req.query;

        if (!personId) {
            return res.status(400).json({ success: false, error: 'personId обязателен' });
        }
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Параметры startTime и endTime обязательны',
                example: {
                    startTime: '2024-01-01T00:00:00+05:00',
                    endTime: '2024-01-31T23:59:59+05:00'
                }
            });
        }

        let doorCodes = undefined;
        if (doorIndexCodes) {
            try { doorCodes = JSON.parse(doorIndexCodes); } catch (e) {
                return res.status(400).json({ success: false, error: 'doorIndexCodes должен быть валидным JSON массивом' });
            }
        }

        const params = {
            startTime,
            endTime,
            eventType: parseInt(eventType),
            doorIndexCodes: Array.isArray(doorCodes) && doorCodes.length > 0 ? doorCodes : undefined,
            pageNo: parseInt(pageNo),
            pageSize: parseInt(pageSize)
        };

        // Если не передали двери, попробуем получить первые 500 дверей и подставить
        if (!params.doorIndexCodes) {
            try {
                const doorsRes = await hikvisionIntegration.getDoorsFromHikvision({ pageNo: 1, pageSize: 500 });
                const list = doorsRes?.data?.data?.list || doorsRes?.data?.list || [];
                params.doorIndexCodes = list.map(d => String(d.doorIndexCode || d.indexCode)).filter(Boolean).slice(0, 10);
            } catch { /* игнорируем, оставим undefined и дадим API решить */ }
        }

        const hk = await hikvisionIntegration.getTurnstileEventsFromHikvision(params);
        if (!hk?.success) {
            return res.status(502).json({ success: false, error: 'Ошибка получения событий от Hikvision', message: hk?.message, hikvision: { code: hk?.data?.code, msg: hk?.data?.msg } });
        }

        let list = hk?.data?.data?.list || [];
        // Серверная фильтрация по personId
        list = list.filter(ev => String(ev.personId) === String(personId));

        // Возвращаем как есть, с сохранением total/page из Hikvision (total для всех, front может считать сам)
        return res.json({
            success: true,
            data: {
                total: list.length,
                pageNo: parseInt(pageNo),
                pageSize: parseInt(pageSize),
                list
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Ошибка получения истории человека', message: error.message });
    }
});

module.exports = router;
