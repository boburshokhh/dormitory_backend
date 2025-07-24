# 🔧 Исправление ошибки деплоя на Fly.io

## ❌ Проблема
Ошибка при деплое на fly.io:
```
Error: /app/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node: invalid ELF header
```

## ✅ Решение

### 1. Заменили bcrypt на bcryptjs
- **Причина**: bcrypt требует нативной компиляции, что вызывает проблемы в Docker контейнерах
- **Решение**: bcryptjs написан на чистом JavaScript и не требует компиляции

**Изменения в package.json:**
```json
"dependencies": {
  "bcryptjs": "^2.4.3", // вместо "bcrypt": "^6.0.0"
}
```

**Обновленные файлы:**
- `routes/auth.js`: `const bcrypt = require('bcryptjs')`
- `routes/users.js`: `const bcrypt = require('bcryptjs')`

### 2. Оптимизировали Dockerfile
- Переключились с `node:slim` на `node:alpine` (меньше размер)
- Добавили правильные зависимости для сборки
- Улучшили многоэтапную сборку
- Добавили пользователя для безопасности

### 3. Создали .dockerignore
- Исключили ненужные файлы из контекста сборки
- Уменьшили размер образа и время сборки

### 4. Обновили fly.toml
- Добавили переменные окружения
- Настроили health check на `/api/health`
- Добавили volume для файлов

## 🚀 Как задеплоить

### Быстрый способ:
```bash
npm run deploy:fly
```

### Пошаговый способ:

1. **Установка зависимостей:**
```bash
npm install
```

2. **Настройка секретов:**
```bash
fly secrets set JWT_SECRET="your_secret_here"
fly secrets set REFRESH_TOKEN_SECRET="your_refresh_secret"
fly secrets set DB_HOST="your_db_host"
fly secrets set DB_USER="your_db_user"
fly secrets set DB_PASSWORD="your_db_password"
fly secrets set DB_NAME="gubkin_dormitory"
# ... остальные секреты (см. FLY_DEPLOYMENT.md)
```

3. **Создание volume (для файлов):**
```bash
fly volumes create gubkin_uploads --region hkg --size 10
```

4. **Деплой:**
```bash
fly deploy
```

## 📊 Проверка
После деплоя проверьте:
```bash
# Статус
fly status

# Логи
fly logs

# Health check
curl https://your-app.fly.dev/api/health

# Страница приветствия
curl https://your-app.fly.dev/
```

## 🛠 Полезные команды

```bash
# Просмотр логов в реальном времени
npm run fly:logs

# Статус приложения
npm run fly:status

# SSH в контейнер
npm run fly:ssh

# Просмотр секретов
fly secrets list

# Масштабирование
fly scale memory 2048
```

## 📁 Созданные файлы

1. **FLY_DEPLOYMENT.md** - Подробные инструкции по деплою
2. **deploy-fly.sh** - Скрипт для автоматического деплоя
3. **.dockerignore** - Исключения для Docker сборки
4. **Обновленный Dockerfile** - Оптимизированная конфигурация
5. **Обновленный fly.toml** - Конфигурация fly.io

## 🔍 Дополнительная отладка

Если проблемы остались:

1. **Проверьте логи:**
```bash
fly logs --since 1h
```

2. **SSH в контейнер:**
```bash
fly ssh console
```

3. **Проверьте переменные окружения:**
```bash
fly ssh console -C "printenv"
```

4. **Проверьте файлы:**
```bash
fly ssh console -C "ls -la /app"
```

## ✨ Результат
После этих изменений приложение должно успешно деплоиться на fly.io без ошибок с bcrypt! 