# Настройка Backend для системы электронной очереди

## Описание

Данный документ описывает настройку backend для системы электронной очереди на заселение в общежитие.

## Шаги настройки

### 1. Выполнение миграции базы данных

Запустите скрипт миграции для добавления полей очереди:

```bash
cd dormitory-backend
node scripts/run-queue-migration.js
```

Этот скрипт выполнит:

- Добавление полей `is_queue`, `queue_position`, `settlement_date` в таблицу `applications`
- Создание индексов для оптимизации запросов
- Обновление существующих заявок (все заявки со статусом "submitted" будут помечены как в очереди)
- Установку позиций в очереди на основе даты подачи

### 2. Новые API endpoints

#### Публичный endpoint для очереди

**GET** `/api/applications/public/queue`

Получение публичных данных очереди без авторизации.

**Параметры:**

- `limit` - количество записей (по умолчанию 'ALL')
- `sort_by` - поле для сортировки (по умолчанию 'submission_date')
- `sort_order` - порядок сортировки (по умолчанию 'asc')

**Пример запроса:**

```bash
curl -X GET "https://api.dormitory.gubkin.uz/api/applications/public/queue?limit=ALL&sort_by=submission_date&sort_order=asc"
```

**Ответ:**

```json
{
  "success": true,
  "applications": [
    {
      "id": "uuid",
      "status": "submitted",
      "submissionDate": "2024-01-15T10:30:00Z",
      "is_queue": true,
      "queue_position": 1,
      "settlement_date": null,
      "roomAssigned": false,
      "floorNumber": null,
      "roomNumber": null,
      "bedNumber": null,
      "student": {
        "firstName": "Иван",
        "lastName": "Иванов",
        "email": "ivan@example.com",
        "groupName": "ИН-21-01",
        "course": 2
      },
      "dormitory": {
        "name": "Общежитие №1"
      }
    }
  ],
  "total": 1,
  "message": "Данные очереди успешно загружены"
}
```

#### Обновленный endpoint для получения заявок

**GET** `/api/applications`

Теперь поддерживает фильтрацию по `is_queue`:

**Параметры:**

- `is_queue` - фильтр по типу очереди (true/false)

**Пример запроса:**

```bash
curl -X GET "https://api.dormitory.gubkin.uz/api/applications?is_queue=true" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Обновленные поля в базе данных

#### Таблица `applications`

| Поле              | Тип                      | Описание                                            |
| ----------------- | ------------------------ | --------------------------------------------------- |
| `is_queue`        | BOOLEAN                  | Флаг очереди: true - в очереди, false - вне очереди |
| `queue_position`  | INTEGER                  | Позиция в очереди (только для заявок в очереди)     |
| `settlement_date` | TIMESTAMP WITH TIME ZONE | Дата заселения в общежитие                          |

#### Индексы

- `idx_applications_queue` - для оптимизации запросов по очереди
- `idx_applications_status_queue` - для оптимизации запросов по статусу и очереди

### 4. Логика работы очереди

1. **Автоматическое добавление в очередь**: При создании заявки студент автоматически попадает в очередь (`is_queue = true`)
2. **Автоматическое назначение позиции**: Система автоматически назначает следующую позицию в очереди (`queue_position`)
3. **Принцип FIFO**: Позиция определяется по порядку подачи заявки (First In, First Out)
4. **Внеочередное заселение**: Администратор может убрать студента из очереди для внеочередного заселения
5. **Заселение**: При одобрении заявки и назначении комнаты студент считается заселенным

### 5. Тестирование

#### Проверка миграции

После выполнения миграции проверьте статистику:

```sql
SELECT
  COUNT(*) as total_applications,
  COUNT(CASE WHEN is_queue = true THEN 1 END) as in_queue,
  COUNT(CASE WHEN is_queue = false THEN 1 END) as out_of_queue,
  COUNT(CASE WHEN queue_position IS NOT NULL THEN 1 END) as with_position
FROM applications;
```

#### Тестирование автоматического добавления в очередь

Запустите тестовый скрипт:

```bash
cd dormitory-backend
node scripts/test-queue-creation.js
```

Этот скрипт покажет:

- Текущее состояние очереди
- Последние 5 заявок в очереди
- Подтверждение, что система работает корректно

#### Тестирование публичного endpoint

```bash
# Тест публичного endpoint
curl -X GET "https://api.dormitory.gubkin.uz/api/applications/public/queue" \
  -H "Content-Type: application/json"

# Ожидаемый ответ: JSON с данными очереди
```

#### Тестирование фильтрации

```bash
# Тест фильтрации по очереди (требует авторизации)
curl -X GET "https://api.dormitory.gubkin.uz/api/applications?is_queue=true" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

### 6. Безопасность

- Публичный endpoint `/api/applications/public/queue` не требует авторизации
- Все остальные endpoints требуют авторизации
- Административные функции доступны только администраторам
- Валидация входных данных для всех endpoints

### 7. Мониторинг

#### Логирование

Все действия с очередью логируются:

- Просмотр публичной очереди
- Изменение статуса очереди
- Обновление позиций в очереди

#### Метрики

Отслеживайте следующие метрики:

- Количество запросов к публичному endpoint
- Время ответа API
- Количество заявок в очереди
- Количество заселенных студентов

### 8. Развертывание

1. Выполните миграцию базы данных
2. Перезапустите backend сервер
3. Проверьте работу публичного endpoint
4. Протестируйте фильтрацию в админ панели

### 9. Поддержка

При возникновении проблем:

1. Проверьте логи сервера
2. Убедитесь в корректности миграции
3. Проверьте права доступа к новым полям
4. Обратитесь к документации API

## Заключение

После выполнения всех шагов система электронной очереди будет полностью функциональна на backend. Frontend сможет получать реальные данные очереди через публичный endpoint.
