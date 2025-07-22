# Руководство по предпросмотру изображений

## Обзор

Система поддерживает предпросмотр изображений для форматов JPG, PNG и JPEG. Предпросмотр доступен как в студенческой части (при загрузке), так и в админ панели.

## Поддерживаемые форматы

### ✅ Полная поддержка

- **JPG/JPEG** - основной формат для фотографий
- **PNG** - формат с поддержкой прозрачности
- **GIF** - поддерживается, но рекомендуется использовать статичные изображения
- **WEBP** - современный формат, поддерживается в новых браузерах

### 📋 Типы файлов

- `passport` - скан паспорта
- `photo_3x4` - фотография 3x4 см
- `avatar` - аватар пользователя
- `document` - общий документ

## Возможности предпросмотра

### 🖼️ Компонент SimpleFileUpload

#### Функции:

- **Drag & Drop** - перетаскивание файлов
- **Предпросмотр** - мгновенный просмотр загруженного изображения
- **Информация о разрешении** - показывает размеры изображения (например, 800x600)
- **Полноэкранный просмотр** - модальное окно с увеличенным изображением
- **Валидация** - проверка типа файла и размера

#### Интерфейс:

```vue
<SimpleFileUpload
  v-model="fileUrl"
  accept="image/*"
  :max-size="5 * 1024 * 1024"
  file-type="photo_3x4"
  @upload="handleUpload"
  @delete="handleDelete"
/>
```

#### Новые возможности:

- **Показ разрешения** - отображается при наведении (например, "800x600")
- **Улучшенная валидация** - проверка поддерживаемых форматов
- **Информация о файле** - размер, тип, соотношение сторон

### 🔧 Админ панель

#### Страница управления файлами (`/admin/files`)

**Функции:**

- **Таблица файлов** - список всех загруженных файлов
- **Предпросмотр** - миниатюры изображений 16x16
- **Фильтрация** - по типу файла, статусу, подтверждению
- **Статистика** - общая информация о файлах
- **Модальный просмотр** - полноэкранный просмотр изображений

**Возможности:**

- Скачивание файлов
- Подтверждение/отклонение файлов
- Удаление файлов
- Очистка дубликатов
- Очистка старых файлов

## Техническая реализация

### Frontend (Vue.js)

```javascript
// Определение поддерживаемых изображений
const isImage = computed(() => {
  return (
    fileType.value && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileType.value.toLowerCase())
  )
})

// Получение информации об изображении
const getImageInfo = (file) => {
  const img = new Image()
  img.onload = () => {
    imageInfo.value = {
      width: img.width,
      height: img.height,
      aspectRatio: (img.width / img.height).toFixed(2),
    }
  }
  img.src = URL.createObjectURL(file)
}
```

### Backend (Node.js)

```javascript
// Определение типа файла
const determineFileType = (originalName, fieldName) => {
  const extension = path.extname(originalName).toLowerCase()

  if (fieldName === 'passport_file') return 'passport'
  if (fieldName === 'photo_3x4') return 'photo_3x4'

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
    return fieldName === 'photo_3x4' ? 'photo_3x4' : 'document'
  }

  return 'document'
}
```

### MinIO хранилище

```javascript
// Загрузка с метаданными
const uploadResult = await uploadFile(file.buffer, minioFileName, file.mimetype, {
  'uploaded-by': req.user.id,
  'original-name': Buffer.from(file.originalname, 'utf8').toString('base64'),
  'file-type': fileType,
  'image-width': imageInfo.width,
  'image-height': imageInfo.height,
})
```

## Использование

### 1. Загрузка изображения

```vue
<template>
  <SimpleFileUpload
    v-model="passportFile"
    accept="image/*"
    :max-size="5 * 1024 * 1024"
    file-type="passport"
    upload-title="Загрузить скан паспорта"
    accept-text="JPG, PNG до 5МБ"
    @upload="handlePassportUpload"
    @delete="handlePassportDelete"
  />
</template>

<script setup>
const handlePassportUpload = (file, uploadedFile) => {
  console.log('Файл загружен:', uploadedFile)
  // uploadedFile содержит:
  // - id: ID файла в БД
  // - url: URL для предпросмотра
  // - originalName: оригинальное имя файла
  // - size: размер файла
}
</script>
```

### 2. Просмотр в админ панели

```vue
<template>
  <div class="admin-files">
    <!-- Фильтры -->
    <div class="filters">
      <select v-model="filters.fileType">
        <option value="">Все типы</option>
        <option value="passport">Паспорт</option>
        <option value="photo_3x4">Фото 3x4</option>
      </select>
    </div>

    <!-- Таблица файлов -->
    <table>
      <tr v-for="file in files" :key="file.id">
        <td>
          <!-- Предпросмотр -->
          <img
            v-if="isImage(file)"
            :src="file.url"
            class="preview-thumb"
            @click="showFullImage(file)"
          />
        </td>
        <td>{{ file.original_name }}</td>
        <td>{{ file.file_type }}</td>
      </tr>
    </table>
  </div>
</template>
```

## Настройка

### Конфигурация размеров

```javascript
// В компоненте SimpleFileUpload
const props = defineProps({
  maxSize: {
    type: Number,
    default: 5 * 1024 * 1024, // 5MB
  },
  accept: {
    type: String,
    default: 'image/*,.pdf',
  },
})
```

### Конфигурация MinIO

```javascript
// В backend/config/minio.js
const minioConfig = {
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
}
```

## Тестирование

### Запуск тестов

```bash
# Тест предпросмотра изображений
npm run test:preview

# Полный набор тестов
npm run test:all
```

### Что тестируется

1. **Загрузка различных форматов** (JPG, PNG, JPEG, GIF)
2. **Доступность URL** - проверка что изображения доступны
3. **API интеграция** - работа с админ панелью
4. **Типы файлов** - корректное определение типов

### Пример теста

```javascript
// Тест загрузки изображения
const testImage = createTestImage('test-photo.jpg')
const uploadResult = await uploadImage(token, testImage, 'photo_3x4')

// Проверка предпросмотра
const accessResult = await checkImageAccess(uploadResult.uploaded[0].url)
assert(accessResult.accessible, 'Изображение должно быть доступно')
```

## Устранение неисправностей

### Проблемы с предпросмотром

1. **Изображение не отображается**

   - Проверьте URL файла
   - Убедитесь что MinIO доступен
   - Проверьте права доступа к файлу

2. **Неподдерживаемый формат**

   - Используйте JPG, PNG, JPEG
   - Проверьте размер файла (не больше 5MB)
   - Убедитесь что файл не поврежден

3. **Ошибки в админ панели**
   - Проверьте права администратора
   - Убедитесь что API файлов работает
   - Проверьте подключение к базе данных

### Логи

```javascript
// В браузере
console.log('Файл загружен:', uploadedFile)
console.log('URL для предпросмотра:', uploadedFile.url)

// В сервере
console.log('Файл обработан:', minioFileName)
console.log('Метаданные:', imageInfo)
```

## Безопасность

### Валидация файлов

```javascript
// Проверка MIME типа
const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Проверка расширения
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
```

### Защита от загрузки вредоносных файлов

- Проверка MIME типа
- Ограничение размера файла
- Сканирование на вирусы (опционально)
- Изоляция файлов в MinIO

## Заключение

Система предпросмотра изображений обеспечивает:

- ✅ Удобный интерфейс для студентов
- ✅ Мощные инструменты для администраторов
- ✅ Безопасное хранение файлов
- ✅ Быстрый предпросмотр изображений
- ✅ Поддержку всех основных форматов

Для получения дополнительной помощи обратитесь к документации API или свяжитесь с разработчиками.
