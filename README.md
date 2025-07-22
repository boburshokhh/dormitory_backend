# 🏠 Backend API - Система управления общежитиями ГУБКИН

Backend API для системы управления общежитиями Российского государственного университета нефти и газа имени И.М. Губкина.

## 📋 Содержание

- [Описание](#описание)
- [Технологии](#технологии)
- [Установка и запуск](#установка-и-запуск)
- [Конфигурация](#конфигурация)
- [API Документация](#api-документация)
- [Структура проекта](#структура-проекта)
- [Разработка](#разработка)

## 🎯 Описание

Система управления общежитиями предоставляет полный функционал для:
- Регистрации и аутентификации пользователей
- Управления общежитиями, этажами, блоками, комнатами и кроватями
- Подачи и обработки заявок на заселение
- Управления профилями пользователей
- Загрузки и управления файлами
- Логирования действий пользователей

## 🛠 Технологии

- **Node.js** - среда выполнения
- **Express.js** - веб-фреймворк
- **PostgreSQL** - основная база данных
- **MinIO** - объектное хранилище для файлов
- **JWT** - аутентификация
- **bcrypt** - хеширование паролей
- **nodemailer** - отправка email
- **multer** - обработка файлов
- **helmet** - безопасность
- **morgan** - логирование

## 🚀 Установка и запуск

### Предварительные требования

- Node.js >= 16.0.0
- PostgreSQL >= 12
- MinIO Server
- npm >= 8.0.0

### Установка

1. Клонируйте репозиторий:
```bash
git clone https://github.com/gubkin-university/dormitory-management.git
cd dormitory-management/backend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл конфигурации:
```bash
cp services/config.env.example services/config.env
```

4. Настройте переменные окружения в `services/config.env`

5. Запустите миграции базы данных:
```bash
npm run db:migrate
```

6. Запустите сервер:
```bash
# Разработка
npm run dev

# Продакшн
npm start
```

## ⚙️ Конфигурация

### Переменные окружения

Создайте файл `services/config.env` со следующими переменными:

```env
# Сервер
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# База данных
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gubkin_dormitory
DB_USER=your_username
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRES_IN=7d

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=your_access_key
MINIO_SECRET_KEY=your_secret_key
MINIO_BUCKET_NAME=gubkin-dormitory
MINIO_USE_SSL=false

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com

# SMS (если используется)
SMS_API_KEY=your_sms_api_key
SMS_SENDER=GUBKIN
```

## 📚 API Документация

### Базовый URL
```
http://localhost:3000/api
```

### Аутентификация

Все защищенные маршруты требуют JWT токен в заголовке:
```
Authorization: Bearer <your_jwt_token>
```

### 🔐 Аутентификация (`/api/auth`)

#### Регистрация

**POST** `/api/auth/register-request`
- Запрос кода подтверждения для регистрации
- **Body:** `{ "contact": "email@example.com" }`

**POST** `/api/auth/register`
- Регистрация с кодом подтверждения
- **Body:** `{ "contact": "email@example.com", "code": "123456", "username": "student", "password": "password123" }`

#### Вход в систему

**POST** `/api/auth/login`
- Вход в систему
- **Body:** `{ "contact": "email@example.com", "password": "password123" }`

**POST** `/api/auth/refresh`
- Обновление токена
- **Body:** `{ "refreshToken": "your_refresh_token" }`

**POST** `/api/auth/logout`
- Выход из системы
- **Headers:** `Authorization: Bearer <token>`

#### Восстановление пароля

**POST** `/api/auth/forgot-password`
- Запрос кода для сброса пароля
- **Body:** `{ "contact": "email@example.com" }`

**POST** `/api/auth/reset-password`
- Сброс пароля с кодом
- **Body:** `{ "contact": "email@example.com", "code": "123456", "newPassword": "newpassword123" }`

### 🏢 Общежития (`/api/dormitories`)

**GET** `/api/dormitories`
- Получить все общежития с статистикой
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/dormitories/available`
- Получить доступные общежития для студента
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/dormitories/:id`
- Получить информацию об общежитии
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/dormitories`
- Создать новое общежитие (только админ)
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `{ "name": "ДПС-1", "type": "type_1", "address": "ул. Ленинская, 65", "maxFloors": 9, "description": "Описание" }`

**PUT** `/api/dormitories/:id`
- Обновить общежитие (только админ)
- **Headers:** `Authorization: Bearer <token>`

**DELETE** `/api/dormitories/:id`
- Удалить общежитие (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 🏠 Этажи (`/api/floors`)

**GET** `/api/floors`
- Получить все этажи
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/floors/dormitory/:dormitoryId`
- Получить этажи конкретного общежития
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/floors`
- Создать новый этаж (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 🏘️ Блоки (`/api/blocks`)

**GET** `/api/blocks`
- Получить все блоки
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/blocks/floor/:floorId`
- Получить блоки конкретного этажа
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/blocks`
- Создать новый блок (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 🛏️ Комнаты (`/api/rooms`)

**GET** `/api/rooms`
- Получить все комнаты
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/rooms/floor/:floorId`
- Получить комнаты конкретного этажа
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/rooms/block/:blockId`
- Получить комнаты конкретного блока
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/rooms`
- Создать новую комнату (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 🛌 Кровати (`/api/beds`)

**GET** `/api/beds`
- Получить все кровати
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/beds/room/:roomId`
- Получить кровати конкретной комнаты
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/beds/available`
- Получить доступные кровати
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/beds`
- Создать новую кровать (только админ)
- **Headers:** `Authorization: Bearer <token>`

**PUT** `/api/beds/:id/occupy`
- Занять кровать
- **Headers:** `Authorization: Bearer <token>`

**PUT** `/api/beds/:id/free`
- Освободить кровать
- **Headers:** `Authorization: Bearer <token>`

### 📝 Заявки (`/api/applications`)

**GET** `/api/applications`
- Получить все заявки (студент видит свои, админ - все)
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/applications`
- Создать новую заявку
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `{ "dormitoryId": 1, "floorId": 2, "roomId": 5, "bedId": 10, "reason": "Заселение" }`

**PUT** `/api/applications/:id/approve`
- Одобрить заявку (только админ)
- **Headers:** `Authorization: Bearer <token>`

**PUT** `/api/applications/:id/reject`
- Отклонить заявку (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 👤 Пользователи (`/api/users`)

**GET** `/api/users`
- Получить всех пользователей (только админ)
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/users/:id`
- Получить пользователя по ID
- **Headers:** `Authorization: Bearer <token>`

**PUT** `/api/users/:id`
- Обновить пользователя
- **Headers:** `Authorization: Bearer <token>`

**DELETE** `/api/users/:id`
- Удалить пользователя (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 👤 Профиль (`/api/profile`)

**GET** `/api/profile`
- Получить профиль текущего пользователя
- **Headers:** `Authorization: Bearer <token>`

**PUT** `/api/profile`
- Обновить профиль
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/profile/change-password`
- Изменить пароль
- **Headers:** `Authorization: Bearer <token>`

### 📁 Файлы (`/api/files`)

**POST** `/api/files/upload`
- Загрузить файл
- **Headers:** `Authorization: Bearer <token>`
- **Body:** `FormData` с файлом

**GET** `/api/files/:filename`
- Получить файл
- **Headers:** `Authorization: Bearer <token>`

**DELETE** `/api/files/:filename`
- Удалить файл
- **Headers:** `Authorization: Bearer <token>`

### 📊 Структура (`/api/structure`)

**GET** `/api/structure`
- Получить полную структуру общежитий
- **Headers:** `Authorization: Bearer <token>`

**GET** `/api/structure/dormitory/:id`
- Получить структуру конкретного общежития
- **Headers:** `Authorization: Bearer <token>`

### 👥 Группы (`/api/groups`)

**GET** `/api/groups`
- Получить все группы
- **Headers:** `Authorization: Bearer <token>`

**POST** `/api/groups`
- Создать новую группу (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 📋 Логи (`/api/logs`)

**GET** `/api/logs`
- Получить логи (только админ)
- **Headers:** `Authorization: Bearer <token>`

### 🏥 Health Check

**GET** `/api/health`
- Проверка состояния сервера
- **Ответ:** `{ "status": "OK", "timestamp": "...", "environment": "..." }`

## 📁 Структура проекта

```
backend/
├── config/                 # Конфигурация
│   ├── database.js        # Настройки БД
│   └── minio.js           # Настройки MinIO
├── middleware/            # Middleware
│   ├── auth.js           # Аутентификация
│   └── logging.js        # Логирование
├── routes/               # Маршруты API
│   ├── auth.js          # Аутентификация
│   ├── dormitories.js   # Общежития
│   ├── floors.js        # Этажи
│   ├── blocks.js        # Блоки
│   ├── rooms.js         # Комнаты
│   ├── beds.js          # Кровати
│   ├── applications.js  # Заявки
│   ├── users.js         # Пользователи
│   ├── profile.js       # Профиль
│   ├── files.js         # Файлы
│   ├── structure.js     # Структура
│   ├── groups.js        # Группы
│   └── logs.js          # Логи
├── services/            # Сервисы
│   ├── notificationService.js  # Уведомления
│   └── loggingService.js       # Логирование
├── uploads/             # Загруженные файлы
├── server.js           # Основной файл сервера
└── package.json        # Зависимости
```

## 🛠 Разработка

### Скрипты

```bash
# Запуск в режиме разработки
npm run dev

# Запуск в продакшн режиме
npm start

# Тесты
npm test

# Миграции БД
npm run db:migrate
npm run db:seed
npm run db:reset

# PM2 управление
npm run pm2:start
npm run pm2:restart
npm run pm2:stop
npm run pm2:logs

# Тестирование различных компонентов
npm run test:smtp
npm run test:minio
npm run test:upload
npm run test:api
npm run test:duplicates
npm run test:preview
npm run test:all
```

### Тестирование API

Для тестирования API можно использовать:
- Postman
- Insomnia
- curl
- Встроенные тестовые скрипты

### Логирование

Система использует структурированное логирование:
- API запросы логируются автоматически
- Ошибки записываются в базу данных
- Поддерживается ротация логов

### Безопасность

- JWT токены для аутентификации
- bcrypt для хеширования паролей
- Rate limiting для защиты от DDoS
- Helmet для безопасности заголовков
- CORS настройки
- Валидация входных данных

## 📞 Поддержка

Для получения поддержки обращайтесь:
- Email: support@gubkin.ru
- GitHub Issues: [Создать issue](https://github.com/gubkin-university/dormitory-management/issues)

## 📄 Лицензия

MIT License - см. файл [LICENSE](LICENSE) для деталей.

---

**Российский государственный университет нефти и газа имени И.М. Губкина**  
🏠 Система управления общежитиями 