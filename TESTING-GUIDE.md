# 🧪 Руководство по тестированию Hikvision API

Полное руководство по тестированию интеграции с API турникета Hikvision.

## 📋 Содержание

1. [Найденные ошибки и исправления](#найденные-ошибки-и-исправления)
2. [Настройка Postman](#настройка-postman)
3. [Тестирование API](#тестирование-api)
4. [Примеры запросов](#примеры-запросов)
5. [Проверка результатов](#проверка-результатов)

## 🚨 Найденные ошибки и исправления

### ❌ Ошибки в исходном коде:

1. **Неправильный путь для событий:**
   - ❌ Было: `/artemis/api/resource/v1/acs/event/query`
   - ✅ Стало: `/artemis/api/acs/v1/door/events`

2. **Неправильные параметры для событий:**
   - ❌ Было: `personId` (опциональный)
   - ✅ Стало: `doorIndexCodes` (обязательный), `eventType` (обязательный)

3. **Отсутствие валидации обязательных параметров**

### ✅ Исправления:

- Обновлен путь API для событий согласно документации
- Добавлены обязательные параметры `eventType` и `doorIndexCodes`
- Улучшена валидация параметров
- Обновлены примеры использования

## 🔧 Настройка Postman

### 1. Импорт коллекции

1. Откройте Postman
2. Нажмите **Import**
3. Выберите файл `Hikvision-API-Tests.postman_collection.json`
4. Нажмите **Import**

### 2. Импорт окружения

1. Нажмите **Import**
2. Выберите файл `Hikvision-Environment.postman_environment.json`
3. Нажмите **Import**

### 3. Настройка переменных

В окружении `Hikvision Environment` настройте переменные:

| Переменная | Значение | Описание |
|------------|----------|----------|
| `base_url` | `http://localhost:3000` | Базовый URL сервера |
| `test_person_id` | `1149` | ID тестового пользователя |
| `test_person_name` | `Иванов` | Имя тестового пользователя |
| `test_org_code` | `1` | Код организации |
| `test_door_codes` | `["1", "2"]` | Коды точек доступа |
| `test_event_type_granted` | `198914` | Код события "Access Granted by Card" |
| `test_event_type_denied` | `197151` | Код события "Access Denied by Face" |

## 🚀 Тестирование API

### 1. Запуск сервера

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start
```

Сервер должен запуститься на `http://localhost:3000`

### 2. Тестирование пользователей

#### ✅ Успешные тесты:

1. **Все пользователи (базовый запрос)**
   - URL: `GET /api/hikvision/users?pageNo=1&pageSize=10`
   - Ожидаемый результат: `200 OK` с массивом пользователей

2. **Поиск по имени**
   - URL: `GET /api/hikvision/users?pageNo=1&pageSize=10&personName=Иван`
   - Ожидаемый результат: `200 OK` с отфильтрованными пользователями

3. **Поиск по ID**
   - URL: `GET /api/hikvision/users?pageNo=1&pageSize=10&personId=1149`
   - Ожидаемый результат: `200 OK` с конкретным пользователем

### 3. Тестирование событий

#### ✅ Успешные тесты:

1. **События доступа (Access Granted by Card)**
   ```
   GET /api/hikvision/events?
   startTime=2024-01-01T00:00:00+05:00&
   endTime=2024-01-31T23:59:59+05:00&
   eventType=198914&
   doorIndexCodes=["1","2"]&
   pageNo=1&
   pageSize=10
   ```

2. **События отказа (Access Denied by Face)**
   ```
   GET /api/hikvision/events?
   startTime=2024-01-01T00:00:00+05:00&
   endTime=2024-01-31T23:59:59+05:00&
   eventType=197151&
   doorIndexCodes=["1"]&
   pageNo=1&
   pageSize=10
   ```

#### ❌ Тесты ошибок:

1. **Без обязательных параметров**
   - URL: `GET /api/hikvision/events?pageNo=1&pageSize=10`
   - Ожидаемый результат: `400 Bad Request` с описанием ошибки

2. **Без eventType**
   - URL: `GET /api/hikvision/events?startTime=...&endTime=...&doorIndexCodes=...`
   - Ожидаемый результат: `400 Bad Request`

3. **Без doorIndexCodes**
   - URL: `GET /api/hikvision/events?startTime=...&endTime=...&eventType=198914`
   - Ожидаемый результат: `400 Bad Request`

### 4. Тестирование синхронизации

#### ✅ Синхронизация пользователей:

```bash
curl -X POST "http://localhost:3000/api/hikvision/sync/users" \
  -H "Content-Type: application/json" \
  -d '{
    "pageNo": 1,
    "pageSize": 10,
    "personName": "Иван"
  }'
```

#### ✅ Синхронизация событий:

```bash
curl -X POST "http://localhost:3000/api/hikvision/sync/events" \
  -H "Content-Type: application/json" \
  -d '{
    "startTime": "2024-01-01T00:00:00+05:00",
    "endTime": "2024-01-31T23:59:59+05:00",
    "eventType": 198914,
    "doorIndexCodes": ["1", "2"],
    "pageNo": 1,
    "pageSize": 50
  }'
```

## 📝 Примеры запросов

### 1. Получение пользователей

```bash
# Все пользователи
curl "http://localhost:3000/api/hikvision/users?pageNo=1&pageSize=10"

# Поиск по имени
curl "http://localhost:3000/api/hikvision/users?pageNo=1&pageSize=10&personName=Иван"

# Поиск по ID
curl "http://localhost:3000/api/hikvision/users?pageNo=1&pageSize=10&personId=1149"
```

### 2. Получение событий

```bash
# События доступа
curl "http://localhost:3000/api/hikvision/events?startTime=2024-01-01T00:00:00+05:00&endTime=2024-01-31T23:59:59+05:00&eventType=198914&doorIndexCodes=[\"1\",\"2\"]"

# События отказа
curl "http://localhost:3000/api/hikvision/events?startTime=2024-01-01T00:00:00+05:00&endTime=2024-01-31T23:59:59+05:00&eventType=197151&doorIndexCodes=[\"1\"]"
```

### 3. Синхронизация

```bash
# Синхронизация пользователей
curl -X POST "http://localhost:3000/api/hikvision/sync/users" \
  -H "Content-Type: application/json" \
  -d '{"pageNo":1,"pageSize":10}'

# Синхронизация событий
curl -X POST "http://localhost:3000/api/hikvision/sync/events" \
  -H "Content-Type: application/json" \
  -d '{"startTime":"2024-01-01T00:00:00+05:00","endTime":"2024-01-31T23:59:59+05:00","eventType":198914,"doorIndexCodes":["1","2"]}'
```

## ✅ Проверка результатов

### 1. Структура ответа пользователей

```json
{
  "success": true,
  "data": {
    "code": "0",
    "msg": "Success",
    "data": {
      "total": 1,
      "pageNo": 1,
      "pageSize": 100,
      "list": [
        {
          "personId": "1149",
          "personCode": "3536895491",
          "orgIndexCode": "1",
          "personName": "Иванов Иван",
          "gender": 1,
          "phoneNo": "",
          "email": "",
          "cards": [
            {
              "cardNo": "12345678"
            }
          ]
        }
      ]
    }
  }
}
```

### 2. Структура ответа событий

```json
{
  "success": true,
  "data": {
    "code": "0",
    "msg": "Success",
    "data": {
      "pageSize": 100,
      "pageNo": 1,
      "total": 1,
      "list": [
        {
          "eventId": "58689546546576576215475",
          "eventType": "198914",
          "eventTime": "2025-09-15T09:01:15+05:00",
          "personId": "1149",
          "personName": "Иванов Иван",
          "doorName": "Главный вход",
          "doorIndexCode": "1",
          "cardNo": "12345678"
        }
      ]
    }
  }
}
```

### 3. Структура ответа синхронизации

```json
{
  "success": true,
  "data": {
    "total": 5,
    "saved": 4,
    "errors": 1,
    "details": [
      {
        "personId": "1149",
        "personName": "Иванов Иван",
        "status": "success",
        "data": {
          "id": "uuid",
          "student_id": "1149",
          "first_name": "Иван",
          "last_name": "Иванов"
        }
      }
    ]
  }
}
```

## 🔍 Типы событий

| Код | Название | Описание |
|-----|----------|----------|
| 198914 | Access Granted by Card | Доступ разрешен по карте |
| 197151 | Access Denied by Face | Доступ запрещен по лицу |
| 198915 | Access Granted by Face | Доступ разрешен по лицу |
| 197152 | Access Denied by Card | Доступ запрещен по карте |

## 🚨 Частые ошибки

### 1. Неправильный формат времени
```
❌ Неправильно: "2024-01-01 00:00:00"
✅ Правильно: "2024-01-01T00:00:00+05:00"
```

### 2. Неправильный формат doorIndexCodes
```
❌ Неправильно: "1,2" или "1"
✅ Правильно: ["1", "2"] или ["1"]
```

### 3. Отсутствие обязательных параметров
```
❌ Неправильно: только startTime и endTime
✅ Правильно: startTime, endTime, eventType, doorIndexCodes
```

## 📊 Мониторинг

### 1. Логи сервера
Следите за логами сервера для отслеживания запросов и ошибок.

### 2. История запросов
- URL: `GET /api/history`
- Показывает все выполненные запросы к Hikvision API

### 3. Статистика
- URL: `GET /api/statistics`
- Показывает статистику по запросам

## 🎯 Автоматизация тестирования

### Запуск примеров

```bash
# Запуск исправленных примеров
node example-corrected-usage.js

# Запуск примеров с параметрами
node example-parameters.js
```

### Проверка базы данных

```sql
-- Проверка синхронизированных пользователей
SELECT COUNT(*) FROM users WHERE student_id IS NOT NULL;

-- Проверка событий посещения
SELECT COUNT(*) FROM attendance_logs;

-- Статистика по типам событий
SELECT event_type, COUNT(*) 
FROM attendance_logs 
GROUP BY event_type;
```

## ✅ Чек-лист тестирования

- [ ] Сервер запускается без ошибок
- [ ] Получение пользователей работает
- [ ] Получение событий работает с правильными параметрами
- [ ] Валидация параметров работает
- [ ] Синхронизация пользователей работает
- [ ] Синхронизация событий работает
- [ ] Статистика посещений работает
- [ ] Обработка ошибок работает
- [ ] Данные сохраняются в PostgreSQL
- [ ] Postman коллекция работает

## 🆘 Устранение неполадок

### Проблема: 401 Unauthorized
**Решение:** Проверьте настройки `PARTNER_KEY` и `PARTNER_SECRET`

### Проблема: 404 Not Found
**Решение:** Проверьте правильность URL и запущен ли сервер

### Проблема: 400 Bad Request
**Решение:** Проверьте обязательные параметры и их формат

### Проблема: Ошибка подключения к БД
**Решение:** Проверьте строку подключения к PostgreSQL
