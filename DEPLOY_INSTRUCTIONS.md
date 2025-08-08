# Инструкции по деплою бэкенда на Ubuntu сервер

## Проблема была решена

Основная проблема была связана с отсутствующим модулем `axios`, который требовался для Telegram логгера. Мы полностью удалили Telegram логгер из проекта, так как он не критичен для работы системы.

## Что было удалено

1. **Файлы Telegram логгера:**
   - `services/telegramLoggerService.js`
   - `middleware/telegramLogging.js`
   - `middleware/terminalTelegramLogging.js`

2. **Код из server.js:**
   - Все импорты и инициализация Telegram middleware
   - Middleware для Telegram логирования
   - Обработчики для Telegram в graceful shutdown

3. **Код из контроллеров:**
   - Все вызовы `telegramLogger.logUserAction()` в `applicationsController.js`
   - Все методы, связанные с Telegram в `logsController.js`

4. **Маршруты:**
   - Все Telegram маршруты в `routes/logs.js`

## Инструкции по деплою

### 1. Подключитесь к серверу
```bash
ssh root@192.168.1.253
```

### 2. Перейдите в директорию проекта
```bash
cd /home/revenge/apps/gubkin-backend/gubkin-obshaga/backend
```

### 3. Остановите текущие процессы PM2
```bash
pm2 stop gubkin-backend
pm2 delete gubkin-backend
```

### 4. Обновите код (если используете git)
```bash
git pull origin main
```

### 5. Установите зависимости
```bash
npm install --production
```

### 6. Проверьте переменные окружения
```bash
nano .env
```

Убедитесь, что в файле `.env` НЕТ переменных, связанных с Telegram:
- Удалите `TELEGRAM_BOT_TOKEN`
- Удалите `TELEGRAM_CHAT_ID`
- Удалите `TELEGRAM_LOGGING_ENABLED`
- Удалите `TELEGRAM_LOG_LEVEL`
- Удалите `TELEGRAM_TERMINAL_MODE`

### 7. Протестируйте запуск
```bash
node server.js
```

Должны увидеть:
```
✅ Database connection established
📦 Файловое хранилище инициализировано успешно
🚀 Server started on port 3000
```

### 8. Запустите через PM2
```bash
pm2 start ecosystem.config.js --env production
```

### 9. Проверьте статус
```bash
pm2 status
pm2 logs gubkin-backend
```

### 10. Сохраните конфигурацию PM2
```bash
pm2 save
pm2 startup
```

## Проверка работоспособности

### 1. Проверьте health check
```bash
curl http://localhost:3000/api/health
```

### 2. Проверьте логи
```bash
pm2 logs gubkin-backend --lines 50
```

### 3. Проверьте мониторинг
```bash
pm2 monit
```

## Возможные проблемы и решения

### Проблема: "Cannot find module 'axios'"
**Решение:** Telegram логгер полностью удален, эта ошибка больше не должна появляться.

### Проблема: "Database connection failed"
**Решение:** Проверьте настройки базы данных в `.env` файле.

### Проблема: "MinIO initialization failed"
**Решение:** Проверьте настройки MinIO в `.env` файле.

### Проблема: "SSL certificates not found"
**Решение:** В development режиме это нормально. В production проверьте пути к SSL сертификатам.

## Мониторинг

### Просмотр логов в реальном времени
```bash
pm2 logs gubkin-backend -f
```

### Перезапуск приложения
```bash
pm2 restart gubkin-backend
```

### Обновление переменных окружения
```bash
pm2 restart gubkin-backend --update-env
```

## Структура проекта после изменений

```
dormitory-backend/
├── config/
│   ├── database.js
│   ├── fileStorage.js
│   └── minio.js
├── controllers/
│   ├── applicationsController.js (без Telegram логгера)
│   ├── filesController.js
│   └── logsController.js (без Telegram логгера)
├── middleware/
│   ├── auth.js
│   ├── clientIP.js
│   ├── logger.js
│   └── logging.js
├── routes/
│   ├── applications.js
│   ├── auth.js
│   ├── logs.js (без Telegram маршрутов)
│   └── ...
├── services/
│   ├── applicationsService.js
│   ├── filesService.js
│   └── notificationService.js
├── server.js (без Telegram middleware)
└── ecosystem.config.js
```

## Заключение

После выполнения этих инструкций бэкенд должен работать стабильно без ошибок, связанных с Telegram логгером. Все основные функции системы остаются работоспособными, включая:

- Аутентификация и авторизация
- Управление заявками
- Управление файлами
- Логирование (стандартное, без Telegram)
- Мониторинг системы

