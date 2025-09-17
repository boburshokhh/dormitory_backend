const { Pool } = require('pg');
const { EventEmitter } = require('events');
const { faddUserHikcentral } = require('./index');
const { logInsert, logUpdate } = require('./utils/auditLogger');
const { EVENT_TYPES, DOOR_CONTROL_TYPES, STATUS_VALUES } = require('./hikvisionApiMethods');

// Настройка подключения к PostgreSQL
const pool = new Pool({
    connectionString: 'postgresql://postgres:1234bobur$@192.168.1.253:5432/gubkin_dormitory',
    ssl: false
});

/**
 * Класс для работы с API Hikvision и PostgreSQL
 */
class HikvisionIntegration {
    constructor() {
        this.emitter = new EventEmitter();
        this._pollingIntervalHandle = null;
        this._pollingConfig = null;
        this._lastEventTimeByDoor = new Map();
        this._isPolling = false;
    }
    
    /**
     * Получение списка пользователей из Hikvision
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getUsersFromHikvision(params = {}) {
        const {
            pageNo = 1,
            pageSize = 100,
            personName = null,
            personId = null,
            orgIndexCode = null
        } = params;

        const requestData = {
            pageNo,
            pageSize
        };

        // Добавляем опциональные параметры
        if (personName) requestData.personName = personName;
        if (personId) requestData.personId = personId;
        if (orgIndexCode) requestData.orgIndexCode = orgIndexCode;

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/resource/v1/person/advance/personList',
                method: 'POST',
                data: requestData,
                description: 'Получение списка пользователей'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения пользователей:', error);
            throw error;
        }
    }

    /**
     * Получение событий посещения из Hikvision
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getEventsFromHikvision(params = {}) {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName = null,
            pageNo = 1,
            pageSize = 100,
            temperatureStatus = STATUS_VALUES.TEMPERATURE.UNKNOWN,
            wearMaskStatus = STATUS_VALUES.MASK.UNKNOWN,
            sortField = 'SwipeTime',
            orderType = 1
        } = params;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            throw new Error('startTime и endTime обязательны');
        }
        // По документации допускается хотя бы один из eventType или personName
        if (!eventType && !personName) {
            throw new Error('Должен быть указан хотя бы один из параметров: eventType или personName');
        }
        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            throw new Error('doorIndexCodes обязателен и должен быть массивом');
        }

        const requestData = {
            startTime,
            endTime,
            // По API doorIndexCodes — строка? В HCP встречается массив. Оставим массив, т.к. Artemis принимает JSON массив.
            eventType,
            doorIndexCodes,
            pageNo,
            pageSize,
            temperatureStatus,
            wearMaskStatus,
            sortField,
            orderType
        };

        // Добавляем опциональные параметры
        if (personName) requestData.personName = personName;

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/acs/v1/door/events',
                method: 'POST',
                data: requestData,
                description: 'Получение событий посещения'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения событий:', error);
            throw error;
        }
    }

    /**
     * Получение списка устройств контроля доступа
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getAcsDevicesFromHikvision(params = {}) {
        const {
            pageNo = 1,
            pageSize = 100,
            acsDevIndexCode = null,
            devName = null
        } = params;

        const requestData = {
            pageNo,
            pageSize
        };

        // Добавляем опциональные параметры
        if (acsDevIndexCode) requestData.acsDevIndexCode = acsDevIndexCode;
        if (devName) requestData.devName = devName;

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/resource/v1/acsDevice/acsDeviceList',
                method: 'POST',
                data: requestData,
                description: 'Получение списка устройств контроля доступа'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения устройств контроля доступа:', error);
            throw error;
        }
    }

    /**
     * Получение списка дверей/турникетов
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getDoorsFromHikvision(params = {}) {
        const {
            pageNo = 1,
            pageSize = 100,
            acsDevIndexCode = null,
            doorName = null,
            regionIndexCode = null
        } = params;

        const requestData = {
            pageNo,
            pageSize
        };

        // Добавляем опциональные параметры
        if (acsDevIndexCode) requestData.acsDevIndexCode = acsDevIndexCode;
        if (doorName) requestData.doorName = doorName;
        if (regionIndexCode) requestData.regionIndexCode = regionIndexCode;

        // Выбираем URL в зависимости от наличия regionIndexCode
        const url = regionIndexCode 
            ? '/artemis/api/resource/v1/acsDoor/region/acsDoorList'
            : '/artemis/api/resource/v1/acsDoor/acsDoorList';

        try {
            const result = await faddUserHikcentral({
                url,
                method: 'POST',
                data: requestData,
                description: 'Получение списка дверей/турникетов'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения дверей/турникетов:', error);
            throw error;
        }
    }

    /**
     * Получение информации о двери по коду
     * @param {string} acsDoorIndexCode - Код двери
     * @returns {Promise<Object>} Результат запроса
     */
    async getDoorInfoFromHikvision(acsDoorIndexCode) {
        if (!acsDoorIndexCode) {
            throw new Error('acsDoorIndexCode обязателен');
        }

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/resource/v1/acsDoor/indexCode/acsDoorInfo',
                method: 'POST',
                data: { acsDoorIndexCode },
                description: 'Получение информации о двери'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения информации о двери:', error);
            throw error;
        }
    }

    /**
     * Управление дверью (открытие/закрытие)
     * @param {Object} params - Параметры управления
     * @returns {Promise<Object>} Результат запроса
     */
    async controlDoor(params = {}) {
        const {
            doorIndexCodes,
            controlType
        } = params;

        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            throw new Error('doorIndexCodes обязателен и должен быть массивом');
        }

        if (controlType === undefined || controlType === null) {
            throw new Error('controlType обязателен');
        }

        const requestData = {
            doorIndexCodes,
            controlType
        };

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/acs/v1/door/doControl',
                method: 'POST',
                data: requestData,
                description: 'Управление дверью'
            });

            return result;
        } catch (error) {
            console.error('Ошибка управления дверью:', error);
            throw error;
        }
    }

    /**
     * Получение событий турникета (обновленный метод)
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getTurnstileEventsFromHikvision(params = {}) {
        const {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            personName = null,
            pageNo = 1,
            pageSize = 100,
            temperatureStatus = STATUS_VALUES.TEMPERATURE.UNKNOWN,
            wearMaskStatus = STATUS_VALUES.MASK.UNKNOWN,
            sortField = 'SwipeTime',
            orderType = 1
        } = params;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            throw new Error('startTime и endTime обязательны');
        }
        if (!eventType && !personName) {
            throw new Error('Должен быть указан хотя бы один из параметров: eventType или personName');
        }
        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            throw new Error('doorIndexCodes обязателен и должен быть массивом');
        }

        const requestData = {
            startTime,
            endTime,
            eventType,
            doorIndexCodes,
            pageNo,
            pageSize,
            temperatureStatus,
            wearMaskStatus,
            sortField,
            orderType
        };

        // Добавляем опциональные параметры
        if (personName) requestData.personName = personName;

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/acs/v1/door/events',
                method: 'POST',
                data: requestData,
                description: 'Получение событий турникета'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения событий турникета:', error);
            throw error;
        }
    }

    /**
     * Запускает фоновый поллер событий турникета и транслирует новые события через EventEmitter
     * @param {Object} config
     * @param {Array<string>} config.doorIndexCodes - Обязательный список кодов дверей/турникетов
     * @param {number} [config.intervalMs=10000] - Интервал опроса в мс
     * @param {string|null} [config.personName=null] - Фильтр по имени (опционально)
     * @param {Array<number>} [config.eventTypes=[ACCESS_GRANTED_BY_CARD, ACCESS_DENIED_BY_CARD]] - Типы событий
     */
    startPolling(config = {}) {
        if (!config || !Array.isArray(config.doorIndexCodes) || config.doorIndexCodes.length === 0) {
            throw new Error('doorIndexCodes обязателен и должен быть непустым массивом');
        }

        const intervalMs = typeof config.intervalMs === 'number' && config.intervalMs > 0 ? config.intervalMs : 10000;
        const eventTypes = Array.isArray(config.eventTypes) && config.eventTypes.length > 0
            ? config.eventTypes
            : [EVENT_TYPES.ACCESS_GRANTED_BY_CARD, EVENT_TYPES.ACCESS_DENIED_BY_CARD];

        this._pollingConfig = {
            doorIndexCodes: config.doorIndexCodes,
            intervalMs,
            personName: config.personName || null,
            eventTypes
        };

        if (this._pollingIntervalHandle) {
            clearInterval(this._pollingIntervalHandle);
            this._pollingIntervalHandle = null;
        }

        // Мгновенный запуск перед первым интервалом
        this._isPolling = true;
        this._tickPolling().catch(err => {
            console.error('Ошибка в первом опросе событий турникета:', err);
        });

        this._pollingIntervalHandle = setInterval(() => {
            this._tickPolling().catch(err => {
                console.error('Ошибка опроса событий турникета:', err);
            });
        }, intervalMs);

        return { success: true, message: 'Поллер событий турникета запущен', config: this._pollingConfig };
    }

    /** Останавливает фоновый поллер */
    stopPolling() {
        if (this._pollingIntervalHandle) {
            clearInterval(this._pollingIntervalHandle);
            this._pollingIntervalHandle = null;
        }
        this._isPolling = false;
        return { success: true, message: 'Поллер событий турникета остановлен' };
    }

    /** Возвращает статус поллера */
    getPollingStatus() {
        return {
            success: true,
            running: !!this._pollingIntervalHandle,
            isPolling: this._isPolling,
            config: this._pollingConfig,
            lastEventTimeByDoor: Array.from(this._lastEventTimeByDoor.entries())
        };
    }

    /** Внутренний тик поллера: тянем новые события и транслируем */
    async _tickPolling() {
        if (!this._pollingConfig) return;
        const { doorIndexCodes, personName, eventTypes } = this._pollingConfig;

        const nowIso = new Date().toISOString();
        const pageNo = 1;
        const pageSize = 100;

        // Для каждого типа события опрашиваем диапазон времени по каждому набору дверей одним запросом
        for (const et of eventTypes) {
            // Рассчитываем стартовое время для запроса: минимум по всем дверям для этого типа событий
            // Храним per door, но для батчевого запроса возьмем минимальное «с последнего»
            let minStart = null;
            for (const door of doorIndexCodes) {
                const key = `${door}|${et}`;
                const last = this._lastEventTimeByDoor.get(key);
                if (!minStart || (last && last < minStart)) {
                    minStart = last;
                }
            }
            // Если совсем нет истории — берем последние 5 минут
            const startIso = minStart || new Date(Date.now() - 5 * 60 * 1000).toISOString();

            const params = {
                startTime: startIso,
                endTime: nowIso,
                eventType: et,
                doorIndexCodes,
                pageNo,
                pageSize,
                temperatureStatus: STATUS_VALUES.TEMPERATURE.UNKNOWN,
                wearMaskStatus: STATUS_VALUES.MASK.UNKNOWN,
                sortField: 'SwipeTime',
                orderType: 1
            };
            if (personName) params.personName = personName;

            const res = await this.getTurnstileEventsFromHikvision(params);
            if (!res || !res.success) continue;

            const list = res.data?.data?.list || [];
            if (list.length === 0) continue;

            // Сортируем по времени на всякий случай
            list.sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));

            for (const ev of list) {
                const door = ev.doorIndexCode || ev.door_index_code || (Array.isArray(doorIndexCodes) ? doorIndexCodes[0] : null);
                const key = `${door}|${et}`;
                const last = this._lastEventTimeByDoor.get(key);
                const evTime = ev.eventTime;
                if (last && evTime && evTime <= last) {
                    continue;
                }

                try {
                    // Пишем в БД (ON CONFLICT DO NOTHING уже защищает от дублей)
                    await this.saveEventToDatabase({
                        eventId: ev.eventId,
                        personId: ev.personId,
                        personName: ev.personName,
                        eventTime: ev.eventTime,
                        eventType: ev.eventType,
                        eventTypeName: ev.eventTypeName,
                        doorIndexCode: ev.doorIndexCode,
                        doorName: ev.doorName,
                        deviceIndexCode: ev.deviceIndexCode,
                        deviceName: ev.deviceName
                    });
                } catch (e) {
                    // Не прерываем поток при ошибке записи
                    console.warn('Не удалось сохранить событие в БД:', e?.message || e);
                }

                // Эмитим событие в живой поток
                this.emitter.emit('turnstile_event', {
                    type: 'turnstile_event',
                    data: ev,
                    receivedAt: new Date().toISOString()
                });

                // Обновляем последний момент
                if (evTime) this._lastEventTimeByDoor.set(key, evTime);
            }

            // Резюме батча
            this.emitter.emit('turnstile_summary', {
                type: 'turnstile_summary',
                eventType: et,
                fetched: list.length,
                window: { startTime: startIso, endTime: nowIso },
                doors: doorIndexCodes
            });
        }
    }

    /**
     * Получение общих событий системы
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат запроса
     */
    async getGeneralEventsFromHikvision(params = {}) {
        const {
            eventIndexCode = null,
            eventTypes = null,
            srcType = null,
            srcIndexs = null,
            startTime = null,
            endTime = null,
            pageNo = 1,
            pageSize = 100,
            subSrcType = null,
            subSrcIndexs = null
        } = params;

        const requestData = {
            pageNo,
            pageSize
        };

        // Добавляем опциональные параметры
        if (eventIndexCode) requestData.eventIndexCode = eventIndexCode;
        if (eventTypes) requestData.eventTypes = eventTypes;
        if (srcType) requestData.srcType = srcType;
        if (srcIndexs) requestData.srcIndexs = srcIndexs;
        if (startTime) requestData.startTime = startTime;
        if (endTime) requestData.endTime = endTime;
        if (subSrcType) requestData.subSrcType = subSrcType;
        if (subSrcIndexs) requestData.subSrcIndexs = subSrcIndexs;

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/eventService/v1/eventRecords/page',
                method: 'POST',
                data: requestData,
                description: 'Получение общих событий системы'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения общих событий:', error);
            throw error;
        }
    }

    /**
     * Получение изображений событий
     * @param {string} eventIndexCode - Код события
     * @returns {Promise<Object>} Результат запроса
     */
    async getEventPicturesFromHikvision(eventIndexCode) {
        if (!eventIndexCode) {
            throw new Error('eventIndexCode обязателен');
        }

        try {
            const result = await faddUserHikcentral({
                url: '/artemis/api/acs/v1/event/pictures',
                method: 'POST',
                data: { eventIndexCode },
                description: 'Получение изображений событий'
            });

            return result;
        } catch (error) {
            console.error('Ошибка получения изображений событий:', error);
            throw error;
        }
    }

    /**
     * Получение событий входа и выхода для турникета
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат с событиями входа и выхода
     */
    async getTurnstileEntryExitEvents(params = {}) {
        const {
            startTime,
            endTime,
            doorIndexCodes,
            personName = null,
            pageNo = 1,
            pageSize = 100
        } = params;

        // Валидация обязательных параметров
        if (!startTime || !endTime) {
            throw new Error('startTime и endTime обязательны');
        }
        if (!doorIndexCodes || !Array.isArray(doorIndexCodes) || doorIndexCodes.length === 0) {
            throw new Error('doorIndexCodes обязателен и должен быть массивом');
        }

        try {
            // Получаем события входа (ACCESS_GRANTED_BY_CARD)
            const entryEvents = await this.getTurnstileEventsFromHikvision({
                startTime,
                endTime,
                eventType: EVENT_TYPES.ACCESS_GRANTED_BY_CARD,
                doorIndexCodes,
                personName,
                pageNo,
                pageSize
            });

            // Получаем события выхода (ACCESS_DENIED_BY_CARD - обычно это выход)
            const exitEvents = await this.getTurnstileEventsFromHikvision({
                startTime,
                endTime,
                eventType: EVENT_TYPES.ACCESS_DENIED_BY_CARD,
                doorIndexCodes,
                personName,
                pageNo,
                pageSize
            });

            return {
                success: true,
                data: {
                    entryEvents: entryEvents.success ? entryEvents.data : null,
                    exitEvents: exitEvents.success ? exitEvents.data : null,
                    summary: {
                        totalEntryEvents: entryEvents.success ? (entryEvents.data?.data?.total || 0) : 0,
                        totalExitEvents: exitEvents.success ? (exitEvents.data?.data?.total || 0) : 0
                    }
                }
            };
        } catch (error) {
            console.error('Ошибка получения событий входа/выхода:', error);
            throw error;
        }
    }

    /**
     * Сохранение пользователя в PostgreSQL
     * @param {Object} userData - Данные пользователя
     * @returns {Promise<Object>} Результат сохранения
     */
    async saveUserToDatabase(userData, context = null) {
        const {
            personId,
            personName,
            orgIndexCode,
            gender,
            phoneNo,
            email,
            certificateType,
            certificateNo
        } = userData;

        // Разделяем имя на части
        const nameParts = personName ? personName.split(' ') : ['', ''];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Определяем пол
        let genderValue = null;
        if (gender === 1) genderValue = 'male';
        else if (gender === 2) genderValue = 'female';

        // Определяем серию и номер паспорта
        let passportSeries = null;
        let passportPinfl = null;
        if (certificateType === 1 && certificateNo) {
            // Предполагаем формат: AA1234567 (2 буквы + 7 цифр)
            if (certificateNo.length >= 9) {
                passportSeries = certificateNo.substring(0, 2);
                passportPinfl = certificateNo.substring(2);
            }
        }

        const upsertSql = `
            INSERT INTO users (
                student_id, 
                first_name, 
                last_name, 
                phone, 
                email, 
                gender, 
                passport_series, 
                passport_pinfl,
                is_active,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            ON CONFLICT (student_id) 
            DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                phone = EXCLUDED.phone,
                email = EXCLUDED.email,
                gender = EXCLUDED.gender,
                passport_series = EXCLUDED.passport_series,
                passport_pinfl = EXCLUDED.passport_pinfl,
                updated_at = NOW()
            RETURNING id, student_id, first_name, last_name, phone, email, gender, passport_series, passport_pinfl;
        `;

        try {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const { rows: [existing] } = await client.query('SELECT id, student_id, first_name, last_name, phone, email, gender, passport_series, passport_pinfl FROM users WHERE student_id=$1 FOR UPDATE', [personId]);
                const result = await client.query(upsertSql, [
                    personId,
                    firstName,
                    lastName,
                    phoneNo,
                    email,
                    genderValue,
                    passportSeries,
                    passportPinfl,
                    true
                ]);
                const newRow = result.rows[0];
                await client.query('COMMIT');
                const ctx = context || { userId: null, ipAddress: null, userAgent: null };
                try {
                    if (existing) {
                        await logUpdate('users', String(existing.id), existing, newRow, ctx);
                    } else {
                        await logInsert('users', String(newRow.id), newRow, ctx);
                    }
                } catch (e) { console.warn('Audit log failed', e); }
            } catch (e) {
                try { await pool.query('ROLLBACK'); } catch {}
                throw e;
            } finally {
                client.release();
            }

            return {
                success: true,
                data: newRow,
                message: 'Пользователь сохранен/обновлен'
            };
        } catch (error) {
            console.error('Ошибка сохранения пользователя:', error);
            throw error;
        }
    }

    /**
     * Сохранение события посещения в PostgreSQL
     * @param {Object} eventData - Данные события
     * @returns {Promise<Object>} Результат сохранения
     */
    async saveEventToDatabase(eventData, context = null) {
        const {
            eventId,
            personId,
            personName,
            eventTime,
            eventType,
            eventTypeName,
            doorIndexCode,
            doorName,
            deviceIndexCode,
            deviceName
        } = eventData;

        const query = `
            INSERT INTO attendance_logs (
                event_id,
                person_id,
                person_name,
                event_time,
                event_type,
                event_type_name,
                door_index_code,
                door_name,
                device_index_code,
                device_name,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            ON CONFLICT (event_id) DO NOTHING
            RETURNING id, event_id, person_id, event_time;
        `;

        try {
            const result = await pool.query(query, [
                eventId,
                personId,
                personName,
                eventTime,
                eventType,
                eventTypeName,
                doorIndexCode,
                doorName,
                deviceIndexCode,
                deviceName
            ]);

            const inserted = result.rows[0] || null;

            // Логируем только если действительно вставили новую запись
            if (inserted) {
                const ctx = context || { userId: null, ipAddress: null, userAgent: null };
                try { await logInsert('attendance_logs', String(inserted.id), inserted, ctx); } catch (e) { console.warn('Audit log failed', e); }
            }

            return {
                success: true,
                data: inserted,
                message: result.rows.length > 0 ? 'Событие сохранено' : 'Событие уже существует'
            };
        } catch (error) {
            console.error('Ошибка сохранения события:', error);
            throw error;
        }
    }

    /**
     * Синхронизация пользователей из Hikvision в PostgreSQL
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат синхронизации
     */
    async syncUsers(params = {}, context = null) {
        try {
            console.log('🔄 Начинаем синхронизацию пользователей...');
            
            const hikvisionResult = await this.getUsersFromHikvision(params);
            
            if (!hikvisionResult.success) {
                throw new Error(`Ошибка API Hikvision: ${hikvisionResult.message}`);
            }

            const users = hikvisionResult.data.data.list;
            const results = {
                total: users.length,
                saved: 0,
                updated: 0,
                errors: 0,
                details: []
            };

            for (const user of users) {
                try {
                    const saveResult = await this.saveUserToDatabase(user, context || { userId: null, ipAddress: null, userAgent: null });
                    results.details.push({
                        personId: user.personId,
                        personName: user.personName,
                        status: 'success',
                        data: saveResult.data
                    });
                    results.saved++;
                } catch (error) {
                    results.details.push({
                        personId: user.personId,
                        personName: user.personName,
                        status: 'error',
                        error: error.message
                    });
                    results.errors++;
                }
            }

            console.log(`✅ Синхронизация завершена: ${results.saved} сохранено, ${results.errors} ошибок`);
            return {
                success: true,
                data: results
            };

        } catch (error) {
            console.error('Ошибка синхронизации пользователей:', error);
            throw error;
        }
    }

    /**
     * Синхронизация событий из Hikvision в PostgreSQL
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат синхронизации
     */
    async syncEvents(params = {}, context = null) {
        try {
            console.log('🔄 Начинаем синхронизацию событий...');
            
            const hikvisionResult = await this.getEventsFromHikvision(params);
            
            if (!hikvisionResult.success) {
                throw new Error(`Ошибка API Hikvision: ${hikvisionResult.message}`);
            }

            const events = hikvisionResult.data.data.list;
            const results = {
                total: events.length,
                saved: 0,
                skipped: 0,
                errors: 0,
                details: []
            };

            for (const event of events) {
                try {
                    const saveResult = await this.saveEventToDatabase(event, context || { userId: null, ipAddress: null, userAgent: null });
                    results.details.push({
                        eventId: event.eventId,
                        personId: event.personId,
                        eventTime: event.eventTime,
                        status: saveResult.data ? 'saved' : 'skipped',
                        data: saveResult.data
                    });
                    
                    if (saveResult.data) {
                        results.saved++;
                    } else {
                        results.skipped++;
                    }
                } catch (error) {
                    results.details.push({
                        eventId: event.eventId,
                        personId: event.personId,
                        status: 'error',
                        error: error.message
                    });
                    results.errors++;
                }
            }

            console.log(`✅ Синхронизация событий завершена: ${results.saved} сохранено, ${results.skipped} пропущено, ${results.errors} ошибок`);
            return {
                success: true,
                data: results
            };

        } catch (error) {
            console.error('Ошибка синхронизации событий:', error);
            throw error;
        }
    }

    /**
     * Синхронизация событий турникета в PostgreSQL
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Результат синхронизации
     */
    async syncTurnstileEvents(params = {}, context = null) {
        try {
            console.log('🔄 Начинаем синхронизацию событий турникета...');
            
            const hikvisionResult = await this.getTurnstileEventsFromHikvision(params);
            
            if (!hikvisionResult.success) {
                throw new Error(`Ошибка API Hikvision: ${hikvisionResult.message}`);
            }

            const events = hikvisionResult.data.data.list;
            const results = {
                total: events.length,
                saved: 0,
                skipped: 0,
                errors: 0,
                details: []
            };

            for (const event of events) {
                try {
                    const saveResult = await this.saveEventToDatabase(event, context || { userId: null, ipAddress: null, userAgent: null });
                    results.details.push({
                        eventId: event.eventId,
                        personId: event.personId,
                        eventTime: event.eventTime,
                        status: saveResult.data ? 'saved' : 'skipped',
                        data: saveResult.data
                    });
                    
                    if (saveResult.data) {
                        results.saved++;
                    } else {
                        results.skipped++;
                    }
                } catch (error) {
                    results.details.push({
                        eventId: event.eventId,
                        personId: event.personId,
                        status: 'error',
                        error: error.message
                    });
                    results.errors++;
                }
            }

            console.log(`✅ Синхронизация событий турникета завершена: ${results.saved} сохранено, ${results.skipped} пропущено, ${results.errors} ошибок`);
            return {
                success: true,
                data: results
            };

        } catch (error) {
            console.error('Ошибка синхронизации событий турникета:', error);
            throw error;
        }
    }

    /**
     * Получение статистики посещений
     * @param {Object} params - Параметры запроса
     * @returns {Promise<Object>} Статистика
     */
    async getAttendanceStats(params = {}) {
        const {
            startDate,
            endDate,
            personId = null
        } = params;

        let query = `
            SELECT 
                person_id,
                person_name,
                COUNT(*) as total_events,
                COUNT(CASE WHEN event_type = 1 THEN 1 END) as entries,
                COUNT(CASE WHEN event_type = 2 THEN 1 END) as exits,
                MIN(event_time) as first_event,
                MAX(event_time) as last_event
            FROM attendance_logs
            WHERE event_time >= $1 AND event_time <= $2
        `;
        
        const queryParams = [startDate, endDate];
        
        if (personId) {
            query += ` AND person_id = $3`;
            queryParams.push(personId);
        }
        
        query += `
            GROUP BY person_id, person_name
            ORDER BY total_events DESC
        `;

        try {
            const result = await pool.query(query, queryParams);
            return {
                success: true,
                data: result.rows
            };
        } catch (error) {
            console.error('Ошибка получения статистики:', error);
            throw error;
        }
    }

    /**
     * Закрытие соединения с базой данных
     */
    async close() {
        await pool.end();
    }
}

module.exports = HikvisionIntegration;