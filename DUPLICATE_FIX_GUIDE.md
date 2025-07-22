# Исправление дублирования файлов в MinIO

## Проблема

Ранее в системе файлов была проблема с дублированием - один и тот же файл мог быть загружен несколько раз, создавая дубликаты в MinIO и базе данных.

### Причина проблемы

В файле `backend/routes/files.js` логика проверки дубликатов была некорректной:

```javascript
// НЕПРАВИЛЬНО - проверка только среди файлов со статусом 'active'
const existingFile = await query(
  `SELECT id, file_name FROM files 
   WHERE user_id = $1 AND file_hash = $2 AND file_type = $3 AND status = 'active'`,
  [req.user.id, fileHash, fileType],
)
```

Это означало, что файлы со статусом `'uploading'` (временные файлы) не учитывались при проверке дубликатов.

## Исправление

### 1. Улучшенная проверка дубликатов

```javascript
// ПРАВИЛЬНО - проверка среди файлов со статусами 'active' и 'uploading'
const existingFile = await query(
  `SELECT id, file_name, status FROM files 
   WHERE user_id = $1 AND file_hash = $2 AND file_type = $3 AND status IN ('active', 'uploading') AND deleted_at IS NULL`,
  [req.user.id, fileHash, fileType],
)
```

### 2. Улучшенная обработка существующих файлов

```javascript
if (existingFile.rows.length > 0) {
  const existingFileData = existingFile.rows[0]
  const fileUrl = await getFileUrl(existingFileData.file_name)

  uploadResults.push({
    id: existingFileData.id,
    originalName: file.originalname,
    url: fileUrl,
    status: existingFileData.status,
    message: existingFileData.status === 'active'
      ? 'Файл уже существует'
      : 'Файл уже загружен и ожидает активации',
  })

  console.log(`📋 Найден существующий файл: ${existingFileData.file_name} (статус: ${existingFileData.status})`)
  continue
}
```

### 3. Новый endpoint для очистки дубликатов

Добавлен новый endpoint `POST /api/files/cleanup-duplicates` для очистки существующих дубликатов:

```javascript
router.post('/cleanup-duplicates', async (req, res) => {
  // Поиск дубликатов с использованием оконных функций SQL
  const duplicates = await query(
    `WITH ranked_files AS (
      SELECT 
        id, file_name, original_name, user_id, file_hash, file_type, created_at, status,
        ROW_NUMBER() OVER (PARTITION BY user_id, file_hash, file_type ORDER BY created_at ASC) as rn
      FROM files 
      WHERE status IN ('active', 'uploading') AND deleted_at IS NULL
    )
    SELECT * FROM ranked_files WHERE rn > 1`,
  )

  // Удаление дубликатов (оставляем только самый первый файл)
  // ...
})
```

## Тестирование

### Запуск тестов

```bash
# Тест исправления дублирования
npm run test:duplicates

# Полный набор тестов
npm run test:all
```

### Что проверяется

1. **Предотвращение дублирования**: Загрузка одного и того же файла дважды не должна создавать дубликат
2. **Проверка БД**: В базе данных должен быть только один файл с одинаковым хешем
3. **Разные типы файлов**: Один и тот же файл может существовать с разными типами

### Пример теста

```javascript
// Загружаем файл первый раз
const firstUpload = await uploadFile(token, testFile, 'document')

// Загружаем тот же файл второй раз
const secondUpload = await uploadFile(token, testFile, 'document')

// Проверяем, что ID файлов одинаковые (дубликат не создан)
const isDuplicated = firstUpload.uploaded[0].id !== secondUpload.uploaded[0].id
```

## Очистка существующих дубликатов

Для очистки дубликатов, созданных до исправления:

```bash
# Через API (требуются права администратора)
curl -X POST http://localhost:3000/api/files/cleanup-duplicates \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Статусы файлов

- `'uploading'` - файл загружен, но еще не активирован (временный)
- `'active'` - файл активирован при сохранении профиля
- `'deleted'` - файл удален (мягкое удаление)

## Логика работы

1. **Загрузка файла**: Вычисляется хеш файла
2. **Проверка дубликатов**: Ищется файл с таким же хешем, типом и пользователем
3. **Если дубликат найден**: Возвращается существующий файл
4. **Если дубликат не найден**: Создается новый файл со статусом `'uploading'`
5. **Активация**: При сохранении профиля файлы переводятся в статус `'active'`

## Мониторинг

```sql
-- Поиск дубликатов в БД
WITH ranked_files AS (
  SELECT
    id, file_name, original_name, user_id, file_hash, file_type, created_at, status,
    ROW_NUMBER() OVER (PARTITION BY user_id, file_hash, file_type ORDER BY created_at ASC) as rn
  FROM files
  WHERE status IN ('active', 'uploading') AND deleted_at IS NULL
)
SELECT * FROM ranked_files WHERE rn > 1;

-- Статистика по файлам
SELECT
  status,
  COUNT(*) as count,
  SUM(file_size) as total_size
FROM files
WHERE deleted_at IS NULL
GROUP BY status;
```

## Заключение

Исправление устраняет дублирование файлов на уровне загрузки и предоставляет инструменты для очистки существующих дубликатов. Система теперь эффективно использует пространство в MinIO и базе данных.
