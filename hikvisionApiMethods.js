/**
 * Документация API методов Hikvision HikCentral
 * Основано на анализе HCP OpenAPI.postman_collection.json
 */

const HIKVISION_API_METHODS = {
    // ===== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ =====
    PERSON_MANAGEMENT: {
        // Получение информации о пользователях
        GET_PERSON_LIST: {
            url: '/artemis/api/resource/v1/person/advance/personList',
            method: 'POST',
            description: 'Получение списка пользователей с фильтрацией',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' },
                personName: { type: 'string', required: false, description: 'Имя пользователя для поиска' },
                personId: { type: 'string', required: false, description: 'ID пользователя' },
                orgIndexCode: { type: 'string', required: false, description: 'Код организации' }
            },
            example: {
                pageNo: 1,
                pageSize: 10,
                personName: "test"
            }
        },
        
        GET_PERSON_DETAIL: {
            url: '/artemis/api/resource/v1/person/single/query',
            method: 'POST',
            description: 'Получение детальной информации о пользователе',
            parameters: {
                personId: { type: 'string', required: true, description: 'ID пользователя' }
            }
        },

        // Добавление пользователей
        ADD_PERSON: {
            url: '/artemis/api/resource/v1/person/single/add',
            method: 'POST',
            description: 'Добавление нового пользователя',
            parameters: {
                personName: { type: 'string', required: true, description: 'Имя пользователя' },
                personId: { type: 'string', required: true, description: 'ID пользователя' },
                orgIndexCode: { type: 'string', required: false, description: 'Код организации' },
                gender: { type: 'number', required: false, description: 'Пол (0-неизвестно, 1-мужской, 2-женский)' },
                phoneNo: { type: 'string', required: false, description: 'Номер телефона' },
                email: { type: 'string', required: false, description: 'Email' },
                certificateType: { type: 'number', required: false, description: 'Тип документа' },
                certificateNo: { type: 'string', required: false, description: 'Номер документа' }
            }
        },

        // Обновление пользователей
        UPDATE_PERSON: {
            url: '/artemis/api/resource/v1/person/single/update',
            method: 'PUT',
            description: 'Обновление информации о пользователе',
            parameters: {
                personId: { type: 'string', required: true, description: 'ID пользователя' },
                personName: { type: 'string', required: false, description: 'Имя пользователя' },
                orgIndexCode: { type: 'string', required: false, description: 'Код организации' },
                gender: { type: 'number', required: false, description: 'Пол' },
                phoneNo: { type: 'string', required: false, description: 'Номер телефона' },
                email: { type: 'string', required: false, description: 'Email' }
            }
        },

        // Удаление пользователей
        DELETE_PERSON: {
            url: '/artemis/api/resource/v1/person/batch/delete',
            method: 'POST',
            description: 'Удаление пользователей',
            parameters: {
                personIds: { type: 'array', required: true, description: 'Массив ID пользователей для удаления' }
            }
        }
    },

    // ===== УПРАВЛЕНИЕ УСТРОЙСТВАМИ КОНТРОЛЯ ДОСТУПА =====
    ACS_DEVICE_MANAGEMENT: {
        GET_ACS_DEVICE_LIST: {
            url: '/artemis/api/resource/v1/acsDevice/acsDeviceList',
            method: 'POST',
            description: 'Получение списка устройств контроля доступа',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' }
            },
            example: {
                pageNo: 1,
                pageSize: 2
            }
        },

        SEARCH_ACS_DEVICES: {
            url: '/artemis/api/resource/v1/acsDevice/advance/acsDeviceList',
            method: 'POST',
            description: 'Поиск устройств контроля доступа с фильтрацией',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' },
                acsDevIndexCode: { type: 'string', required: false, description: 'Код устройства' },
                devName: { type: 'string', required: false, description: 'Название устройства' }
            }
        },

        GET_ACS_DEVICE_INFO: {
            url: '/artemis/api/resource/v1/acsDevice/indexCode/acsDeviceInfo',
            method: 'POST',
            description: 'Получение информации об устройстве по коду',
            parameters: {
                acsDevIndexCode: { type: 'string', required: true, description: 'Код устройства' }
            }
        }
    },

    // ===== УПРАВЛЕНИЕ ДВЕРЯМИ/ТУРНИКЕТАМИ =====
    DOOR_MANAGEMENT: {
        GET_DOOR_LIST: {
            url: '/artemis/api/resource/v1/acsDoor/acsDoorList',
            method: 'POST',
            description: 'Получение списка дверей/турникетов',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' }
            },
            example: {
                pageNo: 1,
                pageSize: 2
            }
        },

        GET_DOOR_LIST_BY_REGION: {
            url: '/artemis/api/resource/v1/acsDoor/region/acsDoorList',
            method: 'POST',
            description: 'Получение списка дверей по региону',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' },
                regionIndexCode: { type: 'string', required: true, description: 'Код региона' }
            }
        },

        SEARCH_DOORS: {
            url: '/artemis/api/resource/v1/acsDoor/advance/acsDoorList',
            method: 'POST',
            description: 'Поиск дверей с фильтрацией',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' },
                acsDevIndexCode: { type: 'string', required: false, description: 'Код устройства' },
                doorName: { type: 'string', required: false, description: 'Название двери' }
            }
        },

        GET_DOOR_INFO: {
            url: '/artemis/api/resource/v1/acsDoor/indexCode/acsDoorInfo',
            method: 'POST',
            description: 'Получение информации о двери по коду',
            parameters: {
                acsDoorIndexCode: { type: 'string', required: true, description: 'Код двери' }
            }
        },

        CONTROL_DOOR: {
            url: '/artemis/api/acs/v1/door/doControl',
            method: 'POST',
            description: 'Управление дверью (открытие/закрытие)',
            parameters: {
                doorIndexCodes: { type: 'array', required: true, description: 'Массив кодов дверей' },
                controlType: { type: 'number', required: true, description: 'Тип управления (0-открыть, 1-закрыть)' }
            },
            example: {
                doorIndexCodes: ["11"],
                controlType: 0
            }
        }
    },

    // ===== УПРАВЛЕНИЕ СОБЫТИЯМИ ТУРНИКЕТА =====
    TURNSTILE_EVENTS: {
        GET_DOOR_EVENTS: {
            url: '/artemis/api/acs/v1/door/events',
            method: 'POST',
            description: 'Получение событий турникета/двери (основной метод)',
            parameters: {
                startTime: { type: 'string', required: true, description: 'Время начала (ISO 8601)' },
                endTime: { type: 'string', required: true, description: 'Время окончания (ISO 8601)' },
                eventType: { type: 'number', required: true, description: 'Тип события' },
                doorIndexCodes: { type: 'array', required: true, description: 'Массив кодов дверей' },
                personName: { type: 'string', required: false, description: 'Имя пользователя' },
                pageNo: { type: 'number', required: false, description: 'Номер страницы' },
                pageSize: { type: 'number', required: false, description: 'Размер страницы' },
                temperatureStatus: { type: 'number', required: false, description: 'Статус температуры (0-неизв.,1-норма,2-аномалия)' },
                wearMaskStatus: { type: 'number', required: false, description: 'Наличие маски (0-неизв.,1-да,2-нет)' },
                sortField: { type: 'string', required: false, description: 'Поле сортировки, поддерживается SwipeTime' },
                orderType: { type: 'number', required: false, description: 'Тип сортировки: 0-ASC, 1-DESC' }
            },
            example: {
                startTime: "2019-08-26T15:00:00+08:00",
                endTime: "2019-09-16T15:00:00+08:00",
                eventType: 197151,
                personName: "a",
                doorIndexCodes: ["482"],
                pageNo: 1,
                pageSize: 10,
                temperatureStatus: 0,
                wearMaskStatus: 0,
                sortField: 'SwipeTime',
                orderType: 1
            }
        },

        GET_EVENT_PICTURES: {
            url: '/artemis/api/acs/v1/event/pictures',
            method: 'POST',
            description: 'Получение изображений событий',
            parameters: {
                eventIndexCode: { type: 'string', required: true, description: 'Код события' }
            }
        }
    },

    // ===== УПРАВЛЕНИЕ ОБЩИМИ СОБЫТИЯМИ =====
    EVENT_MANAGEMENT: {
        GET_EVENT_RECORDS: {
            url: '/artemis/api/eventService/v1/eventRecords/page',
            method: 'POST',
            description: 'Получение общих событий системы',
            parameters: {
                eventIndexCode: { type: 'string', required: false, description: 'Код события' },
                eventTypes: { type: 'string', required: false, description: 'Типы событий (через запятую)' },
                srcType: { type: 'string', required: false, description: 'Тип источника' },
                srcIndexs: { type: 'string', required: false, description: 'Индексы источников' },
                startTime: { type: 'string', required: false, description: 'Время начала' },
                endTime: { type: 'string', required: false, description: 'Время окончания' },
                pageNo: { type: 'number', required: false, description: 'Номер страницы' },
                pageSize: { type: 'number', required: false, description: 'Размер страницы' },
                subSrcType: { type: 'string', required: false, description: 'Подтип источника' },
                subSrcIndexs: { type: 'string', required: false, description: 'Индексы подисточников' }
            },
            example: {
                eventIndexCode: "1",
                eventTypes: "131329,131330,131331",
                srcType: "camera",
                srcIndexs: "1,2",
                startTime: "2019-08-26T15:00:00+08:00",
                endTime: "2019-09-26T16:00:00+08:00",
                pageNo: 1,
                pageSize: 100,
                subSrcType: "LPRVehicleList",
                subSrcIndexs: "1,2,3,4"
            }
        },

        ACKNOWLEDGE_ALARM: {
            url: '/artemis/api/eventService/v1/eventRecords/controlling',
            method: 'POST',
            description: 'Подтверждение тревоги',
            parameters: {
                eventIndexCodes: { type: 'string', required: true, description: 'Коды событий' },
                controlType: { type: 'number', required: true, description: 'Тип управления' }
            }
        },

        GET_ALARM_PICTURE: {
            url: '/artemis/api/eventService/v1/image_data',
            method: 'POST',
            description: 'Получение изображения тревоги',
            parameters: {
                eventIndexCode: { type: 'string', required: true, description: 'Код события' }
            }
        }
    },

    // ===== УПРАВЛЕНИЕ КАРТАМИ ДОСТУПА =====
    CARD_MANAGEMENT: {
        GET_CARD_LIST: {
            url: '/artemis/api/resource/v1/acs/card/query',
            method: 'POST',
            description: 'Получение списка карт доступа',
            parameters: {
                personId: { type: 'string', required: false, description: 'ID пользователя' },
                pageNo: { type: 'number', required: false, description: 'Номер страницы' },
                pageSize: { type: 'number', required: false, description: 'Размер страницы' }
            }
        },

        ADD_CARD: {
            url: '/artemis/api/resource/v1/acs/card/single/add',
            method: 'POST',
            description: 'Добавление карты доступа',
            parameters: {
                personId: { type: 'string', required: true, description: 'ID пользователя' },
                cardNo: { type: 'string', required: true, description: 'Номер карты' },
                cardType: { type: 'number', required: false, description: 'Тип карты' }
            }
        },

        DELETE_CARD: {
            url: '/artemis/api/resource/v1/acs/card/batch/delete',
            method: 'POST',
            description: 'Удаление карт доступа',
            parameters: {
                cardIds: { type: 'array', required: true, description: 'Массив ID карт для удаления' }
            }
        }
    },

    // ===== УПРАВЛЕНИЕ ОРГАНИЗАЦИЯМИ =====
    ORGANIZATION_MANAGEMENT: {
        GET_ORG_LIST: {
            url: '/artemis/api/resource/v1/org/advance/orgList',
            method: 'POST',
            description: 'Получение списка организаций',
            parameters: {
                pageNo: { type: 'number', required: true, description: 'Номер страницы' },
                pageSize: { type: 'number', required: true, description: 'Размер страницы' },
                orgName: { type: 'string', required: false, description: 'Название организации' }
            }
        },

        ADD_ORG: {
            url: '/artemis/api/resource/v1/org/single/add',
            method: 'POST',
            description: 'Добавление новой организации',
            parameters: {
                orgName: { type: 'string', required: true, description: 'Название организации' },
                parentOrgIndexCode: { type: 'string', required: false, description: 'Код родительской организации' }
            }
        }
    },

    // ===== СИСТЕМНАЯ ИНФОРМАЦИЯ =====
    SYSTEM_INFO: {
        GET_SYSTEM_INFO: {
            url: '/artemis/api/common/v1/systemInfo',
            method: 'GET',
            description: 'Получение системной информации',
            parameters: {}
        },

        GET_VERSION_INFO: {
            url: '/artemis/api/common/v1/version',
            method: 'GET',
            description: 'Получение информации о версии',
            parameters: {}
        }
    }
};

// ===== КОНСТАНТЫ ТИПОВ СОБЫТИЙ =====
const EVENT_TYPES = {
    // События доступа
    ACCESS_GRANTED_BY_CARD: 198914,        // Доступ разрешен по карте
    ACCESS_DENIED_BY_FACE: 197151,         // Доступ запрещен по лицу
    ACCESS_GRANTED_BY_FACE: 197150,        // Доступ разрешен по лицу
    ACCESS_DENIED_BY_CARD: 198915,         // Доступ запрещен по карте
    
    // Другие типы событий
    CAMERA_EVENT_1: 131329,                // Событие камеры 1
    CAMERA_EVENT_2: 131330,                // Событие камеры 2
    CAMERA_EVENT_3: 131331,                // Событие камеры 3
    
    // События мобильных устройств
    MOBILE_VEHICLE_EVENT_1: 330203,        // Событие мобильного устройства 1
    MOBILE_VEHICLE_EVENT_2: 330003         // Событие мобильного устройства 2
};

// ===== КОНСТАНТЫ УПРАВЛЕНИЯ ДВЕРЯМИ =====
const DOOR_CONTROL_TYPES = {
    OPEN: 0,      // Открыть дверь
    CLOSE: 1      // Закрыть дверь
};

// ===== КОНСТАНТЫ СТАТУСОВ =====
const STATUS_VALUES = {
    TEMPERATURE: {
        UNKNOWN: 0,
        NORMAL: 1,
        ABNORMAL: 2
    },
    MASK: {
        UNKNOWN: 0,
        YES: 1,
        NO: 2
    }
};

/**
 * Получает все доступные методы API
 * @returns {Object} Объект со всеми методами API
 */
function getAllApiMethods() {
    return HIKVISION_API_METHODS;
}

/**
 * Получает методы по категории
 * @param {string} category - Категория методов
 * @returns {Object|null}
 */
function getMethodsByCategory(category) {
    return HIKVISION_API_METHODS[category] || null;
}

/**
 * Получает информацию о конкретном методе
 * @param {string} category - Категория
 * @param {string} method - Название метода
 * @returns {Object|null}
 */
function getMethodInfo(category, method) {
    const categoryMethods = getMethodsByCategory(category);
    return categoryMethods ? categoryMethods[method] || null : null;
}

/**
 * Получает список всех URL методов
 * @returns {Array} Массив объектов с информацией о методах
 */
function getAllMethodUrls() {
    const methods = [];
    
    Object.keys(HIKVISION_API_METHODS).forEach(category => {
        Object.keys(HIKVISION_API_METHODS[category]).forEach(methodName => {
            const method = HIKVISION_API_METHODS[category][methodName];
            methods.push({
                category,
                method: methodName,
                url: method.url,
                method: method.method,
                description: method.description,
                example: method.example
            });
        });
    });
    
    return methods;
}

/**
 * Поиск методов по ключевому слову
 * @param {string} keyword - Ключевое слово для поиска
 * @returns {Array} Массив найденных методов
 */
function searchMethods(keyword) {
    const allMethods = getAllMethodUrls();
    const lowerKeyword = keyword.toLowerCase();
    
    return allMethods.filter(method => 
        method.url.toLowerCase().includes(lowerKeyword) ||
        method.description.toLowerCase().includes(lowerKeyword) ||
        method.category.toLowerCase().includes(lowerKeyword) ||
        method.method.toLowerCase().includes(lowerKeyword)
    );
}

/**
 * Получает константы типов событий
 * @returns {Object} Объект с константами типов событий
 */
function getEventTypes() {
    return EVENT_TYPES;
}

/**
 * Получает константы управления дверями
 * @returns {Object} Объект с константами управления дверями
 */
function getDoorControlTypes() {
    return DOOR_CONTROL_TYPES;
}

/**
 * Получает константы статусов
 * @returns {Object} Объект с константами статусов
 */
function getStatusValues() {
    return STATUS_VALUES;
}

module.exports = {
    HIKVISION_API_METHODS,
    EVENT_TYPES,
    DOOR_CONTROL_TYPES,
    STATUS_VALUES,
    getAllApiMethods,
    getMethodsByCategory,
    getMethodInfo,
    getAllMethodUrls,
    searchMethods,
    getEventTypes,
    getDoorControlTypes,
    getStatusValues
};
