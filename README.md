# HikCentral API Client

Универсальный клиент для тестирования HikCentral OpenAPI с веб-интерфейсом.

## 🚀 Возможности

- **Универсальная функция** `faddUserHikcentral` для работы с любыми эндпоинтами HikCentral
- **Веб-интерфейс** для удобного тестирования API запросов
- **Поддержка всех HTTP методов** (GET, POST, PUT, DELETE)
- **Красивое отображение JSON** ответов с подсветкой синтаксиса
- **Обработка ошибок** с детальной информацией

## 📦 Установка

1. Установите зависимости:
```bash
npm install
```

2. Настройте переменные окружения:

**Способ 1: Создайте файл .env**
```bash
# Создайте файл .env
PARTNER_KEY=your_partner_key_here
PARTNER_SECRET=your_partner_secret_here
ARTEMIS_HOST=your_artemis_host_here
PORT=3000
```

**Способ 2: Используйте готовый PowerShell скрипт (рекомендуется)**
```powershell
.\start-with-credentials.ps1
```

**Способ 3: Используйте npm скрипт**
```bash
npm run start:prod
```

**Способ 4: Установите вручную (PowerShell)**
```powershell
$env:PARTNER_KEY="28896788"
$env:PARTNER_SECRET="53KH1HXUrMmIu1lKb9CT"
$env:ARTEMIS_HOST="192.168.1.112"
npm start
```

⚠️ **Важно**: 
- Без настройки переменных окружения вы получите ошибку "The 'key' argument must be of type string"
- Приложение настроено для работы с **реальными данными** от HikCentral API
- Для тестирования используйте `production-guide.md`

## 🏃‍♂️ Запуск

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

## 🔧 Использование

### Универсальная функция faddUserHikcentral

```javascript
import { faddUserHikcentral } from './index.js';

// Пример использования
const result = await faddUserHikcentral({
    url: '/artemis/api/resource/v1/acs/device/list',
    method: 'POST',
    data: {
        "acsDevIndexCode": "46"
    }
});

console.log(result);
```

### API Эндпоинты

#### POST /api/hikcentral
Отправка запроса в HikCentral API

**Тело запроса:**
```json
{
    "url": "/artemis/api/resource/v1/acs/device/list",
    "method": "POST",
    "data": {
        "acsDevIndexCode": "46"
    }
}
```

#### GET /api/hikcentral
GET запрос к HikCentral API

**Параметры:**
- `url` - URL эндпоинта
- `method` - HTTP метод (по умолчанию GET)

## 🌐 Веб-интерфейс

Веб-интерфейс предоставляет:

- **Поле для ввода URL** запроса
- **Выбор HTTP метода** (GET, POST, PUT, DELETE)
- **Редактор JSON** для тела запроса
- **Красивое отображение** результатов
- **Примеры URL** для быстрого тестирования

## 📋 Примеры использования

### Получение списка устройств
```json
{
    "url": "/artemis/api/resource/v1/acs/device/list",
    "method": "POST",
    "data": {
        "acsDevIndexCode": "46"
    }
}
```

### Добавление пользователя
```json
{
    "url": "/artemis/api/resource/v1/person/single/add",
    "method": "POST",
    "data": {
        "personInfo": {
            "personName": "Тестовый пользователь",
            "orgIndexCode": "1"
        }
    }
}
```

### Запрос событий
```json
{
    "url": "/artemis/api/resource/v1/acs/event/query",
    "method": "POST",
    "data": {
        "startTime": "2024-01-01T00:00:00+08:00",
        "endTime": "2024-01-02T00:00:00+08:00"
    }
}
```

## 🛠️ Структура проекта

```
hikcenter/
├── index.js          # Основные функции для работы с HikCentral API
├── server.js         # Express сервер
├── package.json      # Зависимости проекта
├── public/
│   └── index.html    # Веб-интерфейс
└── README.md         # Документация
```

## 🔐 Безопасность

- Все запросы к HikCentral API подписываются с использованием HMAC-SHA256
- Переменные окружения для хранения ключей API
- CORS настроен для безопасной работы

## 📝 Лицензия

MIT License
