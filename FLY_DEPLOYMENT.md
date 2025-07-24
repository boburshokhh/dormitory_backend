# 🚀 Деплой на Fly.io

Инструкции по развертыванию backend системы управления общежитиями ГУБКИН на платформе Fly.io.

## 📋 Предварительные требования

1. **Аккаунт Fly.io**: Зарегистрируйтесь на [fly.io](https://fly.io)
2. **Fly CLI**: Установите [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
3. **База данных**: PostgreSQL (можно использовать managed PostgreSQL на fly.io)
4. **MinIO**: Объектное хранилище (можно использовать AWS S3 или аналоги)

## 🛠 Пошаговая настройка

### 1. Установка и аутентификация

```bash
# Установка Fly CLI (если еще не установлен)
curl -L https://fly.io/install.sh | sh

# Вход в аккаунт
fly auth login
```

### 2. Инициализация приложения

```bash
# Если у вас уже есть fly.toml, пропустите этот шаг
fly launch --no-deploy

# Или используйте существующее приложение
fly apps list
```

### 3. Настройка секретов

Установите все необходимые переменные окружения как секреты:

```bash
# JWT секреты
fly secrets set JWT_SECRET="your_super_secret_jwt_key_change_this_in_production"
fly secrets set REFRESH_TOKEN_SECRET="your_super_secret_refresh_token_key"

# База данных
fly secrets set DB_HOST="your_postgres_host"
fly secrets set DB_PORT="5432"
fly secrets set DB_NAME="gubkin_dormitory"
fly secrets set DB_USER="your_db_user"
fly secrets set DB_PASSWORD="your_db_password"

# MinIO / S3
fly secrets set MINIO_ENDPOINT="your_minio_host"
fly secrets set MINIO_PORT="9000"
fly secrets set MINIO_ACCESS_KEY="your_access_key"
fly secrets set MINIO_SECRET_KEY="your_secret_key"
fly secrets set MINIO_BUCKET_NAME="gubkin-dormitory"
fly secrets set MINIO_USE_SSL="false"

# Email (SMTP)
fly secrets set SMTP_HOST="smtp.gmail.com"
fly secrets set SMTP_PORT="587"
fly secrets set SMTP_USER="your_email@gmail.com"
fly secrets set SMTP_PASS="your_app_password"
fly secrets set SMTP_FROM="your_email@gmail.com"

# Дополнительные настройки
fly secrets set FRONTEND_URL="https://your-frontend-domain.com"
```

### 4. Создание PostgreSQL базы данных на Fly.io (опционально)

```bash
# Создание PostgreSQL кластера
fly postgres create --name gubkin-db --region hkg

# Подключение к приложению
fly postgres attach gubkin-db

# Это автоматически установит DATABASE_URL секрет
```

### 5. Создание Volume для загрузок

```bash
# Создание постоянного хранилища
fly volumes create gubkin_uploads --region hkg --size 10
```

### 6. Деплой приложения

```bash
# Используйте готовый скрипт
chmod +x deploy-fly.sh
./deploy-fly.sh

# Или запустите деплой напрямую
fly deploy
```

## 📊 Проверка деплоя

После успешного деплоя проверьте:

```bash
# Статус приложения
fly status

# Логи
fly logs

# Открытие в браузере
fly open

# Проверка health check
curl https://your-app.fly.dev/api/health
```

## 🔧 Управление приложением

### Просмотр логов

```bash
# Просмотр логов в реальном времени
fly logs -f

# Логи за последний час
fly logs --since 1h
```

### Масштабирование

```bash
# Увеличение ресурсов
fly scale memory 2048
fly scale cpu 2

# Увеличение количества инстансов
fly scale count 2
```

### Обновление секретов

```bash
# Просмотр текущих секретов
fly secrets list

# Обновление секрета
fly secrets set NEW_SECRET="new_value"

# Удаление секрета
fly secrets unset OLD_SECRET
```

### SSH доступ

```bash
# Подключение к контейнеру
fly ssh console

# Выполнение команды
fly ssh console -C "node -v"
```

## 🗄️ Работа с базой данных

### Подключение к PostgreSQL

```bash
# Подключение к БД
fly postgres connect -a gubkin-db

# Выполнение SQL файла
fly postgres connect -a gubkin-db < migrations.sql
```

### Миграции

```bash
# SSH в приложение и запуск миграций
fly ssh console -C "npm run db:migrate"
```

## 📁 Файловое хранилище

### Настройка Volume

Volume монтируется в `/app/uploads` и сохраняется между деплоями.

### Альтернативы

Для продакшена рекомендуется использовать внешнее хранилище:

- **AWS S3**
- **Google Cloud Storage**
- **DigitalOcean Spaces**
- **Cloudflare R2**

## 🔒 Безопасность

### SSL/TLS

Fly.io автоматически предоставляет SSL сертификаты для ваших доменов.

### Пользовательские домены

```bash
# Добавление домена
fly certs create your-domain.com

# Проверка сертификата
fly certs show your-domain.com
```

### Настройка firewall

```bash
# Просмотр правил
fly ips list

# Добавление IP
fly ips allocate-v4
fly ips allocate-v6
```

## 📈 Мониторинг

### Метрики

```bash
# Просмотр метрик
fly dashboard metrics
```

### Health checks

Приложение настроено с health check на `/api/health`, который проверяется каждые 30 секунд.

### Уведомления

Настройте уведомления в dashboard fly.io для получения алертов о состоянии приложения.

## 🐛 Устранение неполадок

### Частые проблемы

1. **Ошибка подключения к БД**
   ```bash
   fly secrets list | grep DB
   fly logs | grep database
   ```

2. **Проблемы с bcrypt**
   - Мы заменили `bcrypt` на `bcryptjs` для совместимости с Alpine Linux

3. **Нехватка памяти**
   ```bash
   fly scale memory 2048
   ```

4. **Ошибки файловой системы**
   ```bash
   fly volumes list
   fly ssh console -C "ls -la /app/uploads"
   ```

### Отладка

```bash
# Подробные логи
fly logs --since 1h

# Подключение к контейнеру
fly ssh console

# Проверка переменных окружения
fly ssh console -C "printenv | grep DB"

# Проверка файлов
fly ssh console -C "ls -la /app"
```

## 🔄 CI/CD

### GitHub Actions

Создайте `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    name: Deploy app
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
        
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Переменные для CI/CD

Добавьте в GitHub Secrets:
- `FLY_API_TOKEN` - токен API от fly.io

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи: `fly logs`
2. Проверьте статус: `fly status`
3. Документация: [fly.io docs](https://fly.io/docs/)
4. Community: [fly.io community](https://community.fly.io/)

## 🌐 Полезные ссылки

- [Fly.io Documentation](https://fly.io/docs/)
- [Fly.io PostgreSQL](https://fly.io/docs/postgres/)
- [Fly.io Volumes](https://fly.io/docs/volumes/)
- [Fly.io Monitoring](https://fly.io/docs/monitoring/)

---

**Российский государственный университет нефти и газа имени И.М. Губкина**  
🏠 Система управления общежитиями 