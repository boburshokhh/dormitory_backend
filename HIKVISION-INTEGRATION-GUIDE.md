# 🔧 Руководство по интеграции с Hikvision API

Полное руководство по работе с API турникета Hikvision и интеграции с PostgreSQL.

## 📋 Содержание

1. [Обзор системы](#обзор-системы)
2. [API запросы](#api-запросы)
3. [Структура базы данных](#структура-базы-данных)
4. [Примеры использования](#примеры-использования)
5. [HTTP API эндпоинты](#http-api-эндпоинты)
6. [Особенности и ограничения](#особенности-и-ограничения)

## 🎯 Обзор системы

Система состоит из следующих компонентов:

- **Hikvision API** - получение данных пользователей и событий
- **PostgreSQL** - хранение синхронизированных данных
- **Express сервер** - HTTP API для работы с данными
- **Node.js интеграция** - классы для автоматизации процессов

## 🔌 API запросы

### 1. Получение списка пользователей

**Endpoint:** `POST /artemis/api/resource/v1/person/advance/personList`

**Параметры:**
```json
{
  "pageNo": 1,           // Номер страницы (обязательно)
  "pageSize": 100,       // Размер страницы (обязательно)
  "personName": "Иван",  // Поиск по имени (опционально)
  "personId": "123456",  // ID пользователя (опционально)
  "orgIndexCode": "org1" // Код организации (опционально)
}
```

**Пример ответа:**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "personId": "123456789",
        "personName": "Иван Иванов",
        "orgIndexCode": "org001",
        "gender": 1,
        "phoneNo": "+998901234567",
        "email": "ivan@example.com",
        "certificateType": 1,
        "certificateNo": "AA1234567"
      }
    ],
    "total": 1,
    "pageNo": 1,
    "pageSize": 100
  }
}
```

### 2. Получение событий посещения

**Endpoint:** `POST /artemis/api/resource/v1/acs/event/query`

**Параметры:**
```json
{
  "startTime": "2024-01-01T00:00:00+05:00",  // Время начала (обязательно)
  "endTime": "2024-01-31T23:59:59+05:00",    // Время окончания (обязательно)
  "pageNo": 1,                               // Номер страницы
  "pageSize": 100,                           // Размер страницы
  "eventType": 1,                            // Тип события (1-вход, 2-выход)
  "personId": "123456789"                    // ID пользователя (опционально)
}
```

**Пример ответа:**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [
      {
        "eventId": "evt_001",
        "personId": "123456789",
        "personName": "Иван Иванов",
        "eventTime": "2024-01-15T08:30:00+05:00",
        "eventType": 1,
        "eventTypeName": "Вход",
        "doorIndexCode": "door001",
        "doorName": "Главный вход",
        "deviceIndexCode": "dev001",
        "deviceName": "Турникет 1"
      }
    ],
    "total": 1,
    "pageNo": 1,
    "pageSize": 100
  }
}
```

## 🗄️ Структура базы данных

### Таблица `users` (уже существует)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id VARCHAR UNIQUE,           -- personId из Hikvision
    first_name VARCHAR,                  -- Имя
    last_name VARCHAR,                   -- Фамилия
    phone VARCHAR,                       -- Телефон
    email VARCHAR,                       -- Email
    gender user_gender,                  -- Пол (male/female)
    passport_series VARCHAR,             -- Серия паспорта
    passport_pinfl VARCHAR,              -- ПИНФЛ
    is_active BOOLEAN DEFAULT true,      -- Активность
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Таблица `attendance_logs` (создана)
```sql
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR UNIQUE,             -- ID события из Hikvision
    person_id VARCHAR NOT NULL,          -- ID пользователя
    person_name VARCHAR,                 -- Имя пользователя
    event_time TIMESTAMP WITH TIME ZONE NOT NULL, -- Время события
    event_type INTEGER NOT NULL,         -- Тип события (1-вход, 2-выход)
    event_type_name VARCHAR,             -- Название типа события
    door_index_code VARCHAR,             -- Код двери
    door_name VARCHAR,                   -- Название двери
    device_index_code VARCHAR,           -- Код устройства
    device_name VARCHAR,                 -- Название устройства
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 💻 Примеры использования

### 1. Программное использование

```javascript
import HikvisionIntegration from './hikvision-integration.js';

const hikvision = new HikvisionIntegration();

// Получение пользователей
const users = await hikvision.getUsersFromHikvision({
    pageNo: 1,
    pageSize: 100
});

// Получение событий
const events = await hikvision.getEventsFromHikvision({
    startTime: '2024-01-01T00:00:00+05:00',
    endTime: '2024-01-31T23:59:59+05:00'
});

// Синхронизация пользователей
const syncResult = await hikvision.syncUsers({
    pageNo: 1,
    pageSize: 100
});

// Синхронизация событий
const eventsResult = await hikvision.syncEvents({
    startTime: '2024-01-01T00:00:00+05:00',
    endTime: '2024-01-31T23:59:59+05:00'
});

// Получение статистики
const stats = await hikvision.getAttendanceStats({
    startDate: '2024-01-01',
    endDate: '2024-01-31'
});
```

### 2. HTTP API запросы

#### Получение пользователей
```bash
curl "http://localhost:3000/api/hikvision/users?pageNo=1&pageSize=10&personName=Иван"
```

#### Получение событий
```bash
curl "http://localhost:3000/api/hikvision/events?startTime=2024-01-01T00:00:00+05:00&endTime=2024-01-31T23:59:59+05:00"
```

#### Синхронизация пользователей
```bash
curl -X POST "http://localhost:3000/api/hikvision/sync/users" \
  -H "Content-Type: application/json" \
  -d '{"pageNo":1,"pageSize":10}'
```

#### Синхронизация событий
```bash
curl -X POST "http://localhost:3000/api/hikvision/sync/events" \
  -H "Content-Type: application/json" \
  -d '{"startTime":"2024-01-01T00:00:00+05:00","endTime":"2024-01-31T23:59:59+05:00"}'
```

#### Получение статистики
```bash
curl "http://localhost:3000/api/hikvision/stats?startDate=2024-01-01&endDate=2024-01-31"
```

## 🌐 HTTP API эндпоинты

### GET `/api/hikvision/users`
Получение списка пользователей из Hikvision

**Параметры запроса:**
- `pageNo` (number) - Номер страницы
- `pageSize` (number) - Размер страницы
- `personName` (string) - Поиск по имени
- `personId` (string) - ID пользователя
- `orgIndexCode` (string) - Код организации

### GET `/api/hikvision/events`
Получение событий посещения из Hikvision

**Параметры запроса:**
- `startTime` (string) - Время начала (ISO 8601) **обязательно**
- `endTime` (string) - Время окончания (ISO 8601) **обязательно**
- `pageNo` (number) - Номер страницы
- `pageSize` (number) - Размер страницы
- `eventType` (number) - Тип события
- `personId` (string) - ID пользователя

### POST `/api/hikvision/sync/users`
Синхронизация пользователей из Hikvision в PostgreSQL

**Тело запроса:**
```json
{
  "pageNo": 1,
  "pageSize": 100,
  "personName": "Иван",
  "personId": "123456",
  "orgIndexCode": "org1"
}
```

### POST `/api/hikvision/sync/events`
Синхронизация событий из Hikvision в PostgreSQL

**Тело запроса:**
```json
{
  "startTime": "2024-01-01T00:00:00+05:00",
  "endTime": "2024-01-31T23:59:59+05:00",
  "pageNo": 1,
  "pageSize": 100,
  "eventType": 1,
  "personId": "123456789"
}
```

### GET `/api/hikvision/stats`
Получение статистики посещений из PostgreSQL

**Параметры запроса:**
- `startDate` (string) - Дата начала (YYYY-MM-DD) **обязательно**
- `endDate` (string) - Дата окончания (YYYY-MM-DD) **обязательно**
- `personId` (string) - ID пользователя (опционально)

### GET `/api/hikvision/attendance`
Получение данных посещения из PostgreSQL

**Параметры запроса:**
- `startDate` (string) - Дата начала
- `endDate` (string) - Дата окончания
- `personId` (string) - ID пользователя
- `eventType` (number) - Тип события
- `limit` (number) - Лимит записей
- `offset` (number) - Смещение

## ⚠️ Особенности и ограничения

### Авторизация
- Используется HMAC подпись с ключами `PARTNER_KEY` и `PARTNER_SECRET`
- Подпись генерируется автоматически в функции `makeArtemisRequest`

### Пагинация
- Все запросы поддерживают пагинацию через `pageNo` и `pageSize`
- Рекомендуемый размер страницы: 100-1000 записей

### Форматы времени
- **Hikvision API**: ISO 8601 с часовым поясом (`2024-01-01T00:00:00+05:00`)
- **PostgreSQL**: TIMESTAMP WITH TIME ZONE
- **HTTP API**: ISO 8601 для событий, YYYY-MM-DD для статистики

### Типы событий
- `1` - Вход
- `2` - Выход
- Другие типы зависят от конфигурации Hikvision

### Обработка ошибок
- Все функции возвращают объект с полем `success`
- При ошибках возвращается `success: false` с описанием ошибки
- HTTP API возвращает соответствующие HTTP коды статуса

### Производительность
- Используйте индексы для быстрого поиска по `person_id`, `event_time`, `event_type`
- Для больших объемов данных используйте пагинацию
- Рекомендуется синхронизировать данные по частям

## 🚀 Запуск и тестирование

1. **Установка зависимостей:**
```bash
npm install
```

2. **Запуск сервера:**
```bash
npm start
```

3. **Запуск примеров:**
```bash
node example-hikvision-usage.js
```

4. **Тестирование HTTP API:**
```bash
# Получение пользователей
curl "http://localhost:3000/api/hikvision/users?pageNo=1&pageSize=5"

# Получение событий
curl "http://localhost:3000/api/hikvision/events?startTime=2024-01-01T00:00:00+05:00&endTime=2024-01-31T23:59:59+05:00"
```

## 📝 Логирование

Система автоматически сохраняет историю всех запросов к Hikvision API:
- Успешные запросы сохраняются в историю
- Доступ к истории через `/api/history`
- Статистика запросов через `/api/statistics`

## 🔧 Настройка

Переменные окружения:
- `PARTNER_KEY` - Ключ партнера Hikvision
- `PARTNER_SECRET` - Секрет партнера Hikvision  
- `ARTEMIS_HOST` - Хост Hikvision сервера
- `PORT` - Порт Express сервера (по умолчанию 3000)

Строка подключения к PostgreSQL:
```javascript
postgresql://postgres:1234bobur$@192.168.1.253:5432/gubkin_dormitory
```
