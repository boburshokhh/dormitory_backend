# Система временных ссылок для скачивания файлов

## Обзор

Система временных ссылок позволяет пользователям скачивать файлы из MinIO через бэкенд-прокси, даже когда они не находятся в локальной сети. Это обеспечивает безопасный доступ к файлам с поддержкой авторизации и контроля доступа.

## Возможности

- ✅ Генерация временных ссылок с настраиваемым временем жизни
- ✅ Прямое скачивание файлов через бэкенд (прокси)
- ✅ Скачивание по временным ссылкам без аутентификации
- ✅ Контроль доступа и авторизация
- ✅ Отслеживание использования ссылок
- ✅ Автоматическая очистка истекших ссылок
- ✅ Статистика и мониторинг

## API Endpoints

### 1. Генерация временной ссылки

**POST** `/api/files/:id/temp-link`

Создает временную ссылку для скачивания файла.

**Параметры:**

- `id` (UUID) - ID файла

**Тело запроса:**

```json
{
  "expiryHours": 24 // Время жизни ссылки в часах (1-168, по умолчанию 24)
}
```

**Ответ:**

```json
{
  "success": true,
  "message": "Временная ссылка создана",
  "data": {
    "tempLink": "http://localhost:3000/api/files/download/temp/abc123...",
    "expiresAt": "2024-01-15T10:30:00.000Z",
    "fileName": "document.pdf"
  }
}
```

### 2. Прямое скачивание через бэкенд

**GET** `/api/files/:id/download`

Скачивает файл напрямую через бэкенд (требует аутентификации).

**Параметры:**

- `id` (UUID) - ID файла

**Заголовки ответа:**

- `Content-Type` - MIME тип файла
- `Content-Disposition` - Имя файла для скачивания
- `Content-Length` - Размер файла

### 3. Скачивание по временной ссылке

**GET** `/api/files/download/temp/:token`

Скачивает файл по временной ссылке (без аутентификации).

**Параметры:**

- `token` (string) - Токен временной ссылки (64 символа hex)

### 4. Статистика временных ссылок

**GET** `/api/files/temp-links/stats`

Получает статистику временных ссылок пользователя.

**Ответ:**

```json
{
  "success": true,
  "data": {
    "links": [
      {
        "id": "uuid",
        "token": "abc123...",
        "expiresAt": "2024-01-15T10:30:00.000Z",
        "isUsed": false,
        "usedAt": null,
        "createdAt": "2024-01-14T10:30:00.000Z",
        "fileName": "document.pdf",
        "fileType": "document",
        "isExpired": false
      }
    ],
    "summary": {
      "total": 5,
      "active": 3,
      "used": 1,
      "expired": 1
    }
  }
}
```

### 5. Очистка истекших ссылок

**POST** `/api/files/temp-links/cleanup`

Очищает истекшие временные ссылки (только для админов).

**Ответ:**

```json
{
  "success": true,
  "message": "Очистка истекших временных ссылок завершена",
  "data": {
    "deletedCount": 15
  }
}
```

## Ограничения

### Временные ссылки

- **Максимальное время жизни**: 168 часов (7 дней)
- **Минимальное время жизни**: 1 час
- **Время жизни по умолчанию**: 24 часа
- **Максимум активных ссылок на пользователя**: 50
- **Максимум ссылок на файл**: 10

### Безопасность

- Каждая ссылка может быть использована только один раз
- Ссылки автоматически истекают по времени
- Отслеживается IP адрес использования
- Токены генерируются криптографически безопасно

## База данных

### Таблица `temp_download_links`

```sql
CREATE TABLE temp_download_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE,
    used_ip INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Настройка

### Переменные окружения

Добавьте в `.env` файл:

```env
# Базовый URL API для генерации ссылок
API_BASE_URL=http://localhost:3000

# Настройки MinIO (уже должны быть настроены)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET_NAME=gubkin-dormitory
```

### Миграция базы данных

Выполните SQL скрипт для создания таблицы:

```bash
psql -d your_database -f database/create_temp_links_table.sql
```

## Использование

### Пример создания временной ссылки

```javascript
// Создание временной ссылки
const response = await fetch('/api/files/123e4567-e89b-12d3-a456-426614174000/temp-link', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    expiryHours: 48,
  }),
})

const result = await response.json()
console.log('Временная ссылка:', result.data.tempLink)
```

### Пример скачивания по временной ссылке

```javascript
// Скачивание по временной ссылке
const tempLink = 'http://localhost:3000/api/files/download/temp/abc123...'
window.open(tempLink, '_blank')
```

### Пример прямого скачивания

```javascript
// Прямое скачивание через бэкенд
const downloadUrl = '/api/files/123e4567-e89b-12d3-a456-426614174000/download'
window.open(downloadUrl, '_blank')
```

## Мониторинг и обслуживание

### Автоматическая очистка

Рекомендуется настроить cron-задачу для автоматической очистки истекших ссылок:

```bash
# Каждый день в 2:00
0 2 * * * curl -X POST http://localhost:3000/api/files/temp-links/cleanup -H "Authorization: Bearer admin_token"
```

### Логирование

Система ведет подробные логи:

- Создание временных ссылок
- Использование ссылок
- Ошибки доступа
- Очистка истекших ссылок

## Безопасность

1. **Токены**: 64-символьные hex-строки, криптографически безопасные
2. **Одноразовое использование**: Каждая ссылка может быть использована только один раз
3. **Временные ограничения**: Автоматическое истечение по времени
4. **Контроль доступа**: Проверка прав пользователя на файл
5. **IP отслеживание**: Запись IP адреса использования
6. **Валидация**: Проверка формата и корректности токенов

## Обработка ошибок

### Коды ошибок

- `LINK_EXPIRED` - Ссылка истекла
- `LINK_ALREADY_USED` - Ссылка уже была использована
- `LINK_NOT_FOUND` - Ссылка не найдена
- `FILE_NOT_FOUND` - Файл не найден
- `ACCESS_DENIED` - Отказано в доступе
- `TOO_MANY_LINKS` - Превышено количество ссылок
- `INVALID_EXPIRY` - Неверное время жизни ссылки

### Примеры ответов с ошибками

```json
{
  "success": false,
  "error": "Ссылка истекла",
  "error_code": "LINK_EXPIRED"
}
```

```json
{
  "success": false,
  "error": "Превышено максимальное количество активных ссылок (50)",
  "error_code": "TOO_MANY_ACTIVE_LINKS"
}
```
