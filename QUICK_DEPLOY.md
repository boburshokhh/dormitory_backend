# Быстрый деплой - Telegram логгер удален

## 🚀 Быстрый старт

```bash
# 1. Подключитесь к серверу
ssh root@192.168.1.253

# 2. Перейдите в директорию
cd /home/revenge/apps/gubkin-backend/gubkin-obshaga/backend

# 3. Остановите старые процессы
pm2 stop gubkin-backend
pm2 delete gubkin-backend

# 4. Установите зависимости
npm install --production

# 5. Удалите переменные Telegram из .env (если есть)
sed -i '/TELEGRAM_/d' .env

# 6. Запустите через PM2
pm2 start ecosystem.config.js --env production

# 7. Проверьте статус
pm2 status
pm2 logs gubkin-backend
```

## ✅ Ожидаемый результат

При успешном запуске вы увидите:
```
✅ Database connection established
📦 Файловое хранилище инициализировано успешно
🚀 Server started on port 3000
```

## 🔧 Проверка работоспособности

```bash
# Health check
curl http://localhost:3000/api/health

# Логи в реальном времени
pm2 logs gubkin-backend -f

# Мониторинг
pm2 monit
```

## 🆘 Если что-то пошло не так

1. **Проверьте .env файл** - убедитесь, что настройки БД и MinIO корректны
2. **Проверьте логи** - `pm2 logs gubkin-backend --lines 100`
3. **Перезапустите** - `pm2 restart gubkin-backend --update-env`

## 📝 Что изменилось

- ❌ Удален Telegram логгер (ошибка с axios решена)
- ✅ Все основные функции работают
- ✅ Логирование через Winston остается
- ✅ Мониторинг и health check работают

