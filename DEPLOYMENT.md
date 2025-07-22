# 🚀 Инструкции по развертыванию

Руководство по развертыванию системы управления общежитиями ГУБКИН в различных средах.

## 📋 Содержание

- [Локальная разработка](#локальная-разработка)
- [Продакшн развертывание](#продакшн-развертывание)
- [Docker развертывание](#docker-развертывание)
- [PM2 развертывание](#pm2-развертывание)
- [Миграции базы данных](#миграции-базы-данных)
- [Настройка SSL](#настройка-ssl)
- [Мониторинг](#мониторинг)

## 💻 Локальная разработка

### Предварительные требования

1. **Node.js** >= 16.0.0
2. **PostgreSQL** >= 12
3. **MinIO Server**
4. **Git**

### Пошаговая установка

1. **Клонирование репозитория:**
```bash
git clone https://github.com/gubkin-university/dormitory-management.git
cd dormitory-management/backend
```

2. **Установка зависимостей:**
```bash
npm install
```

3. **Настройка конфигурации:**
```bash
cp services/config.env.example services/config.env
# Отредактируйте services/config.env
```

4. **Настройка базы данных:**
```bash
# Создайте базу данных PostgreSQL
createdb gubkin_dormitory

# Запустите миграции
npm run db:migrate

# Опционально: заполните тестовыми данными
npm run db:seed
```

5. **Настройка MinIO:**
```bash
# Установите MinIO (macOS)
brew install minio/stable/minio

# Запустите MinIO сервер
minio server /path/to/minio-data --console-address :9001
```

6. **Запуск сервера:**
```bash
npm run dev
```

Сервер будет доступен по адресу: `http://localhost:3000`

## 🌐 Продакшн развертывание

### Подготовка сервера

1. **Обновление системы:**
```bash
sudo apt update && sudo apt upgrade -y
```

2. **Установка Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Установка PostgreSQL:**
```bash
sudo apt install postgresql postgresql-contrib -y
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

4. **Установка Nginx:**
```bash
sudo apt install nginx -y
sudo systemctl start nginx
sudo systemctl enable nginx
```

5. **Установка PM2:**
```bash
sudo npm install -g pm2
```

### Развертывание приложения

1. **Клонирование и настройка:**
```bash
cd /var/www
sudo git clone https://github.com/gubkin-university/dormitory-management.git
sudo chown -R $USER:$USER dormitory-management
cd dormitory-management/backend
npm install --production
```

2. **Настройка конфигурации:**
```bash
cp services/config.env.example services/config.env
# Отредактируйте для продакшена
nano services/config.env
```

3. **Настройка базы данных:**
```bash
sudo -u postgres createdb gubkin_dormitory
sudo -u postgres createuser gubkin_user
sudo -u postgres psql -c "ALTER USER gubkin_user WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE gubkin_dormitory TO gubkin_user;"

npm run db:migrate
```

4. **Настройка MinIO:**
```bash
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/

# Создайте директорию для данных
sudo mkdir -p /var/minio-data
sudo chown $USER:$USER /var/minio-data

# Запустите MinIO как сервис
pm2 start "minio server /var/minio-data --console-address :9001" --name minio
pm2 save
pm2 startup
```

### Настройка Nginx

Создайте конфигурацию Nginx:

```bash
sudo nano /etc/nginx/sites-available/gubkin-dormitory
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        alias /var/www/dormitory-management/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Активируйте конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/gubkin-dormitory /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Запуск с PM2

```bash
# Запуск приложения
pm2 start server.js --name gubkin-backend --env production

# Сохранение конфигурации
pm2 save

# Настройка автозапуска
pm2 startup
```

## 🐳 Docker развертывание

### Docker Compose

Создайте `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - MINIO_ENDPOINT=minio
    depends_on:
      - postgres
      - minio
    volumes:
      - ./uploads:/app/uploads
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: gubkin_dormitory
      POSTGRES_USER: gubkin_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  minio:
    image: minio/minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin123
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  minio_data:
```

### Dockerfile

Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads logs

EXPOSE 3000

CMD ["npm", "start"]
```

### Запуск

```bash
# Сборка и запуск
docker-compose up -d

# Просмотр логов
docker-compose logs -f app

# Остановка
docker-compose down
```

## 📊 PM2 развертывание

### Конфигурация PM2

Создайте `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'gubkin-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
}
```

### Команды PM2

```bash
# Запуск в продакшн режиме
pm2 start ecosystem.config.js --env production

# Мониторинг
pm2 monit

# Перезапуск
pm2 restart gubkin-backend

# Остановка
pm2 stop gubkin-backend

# Удаление из PM2
pm2 delete gubkin-backend

# Сохранение конфигурации
pm2 save

# Настройка автозапуска
pm2 startup
```

## 🗄️ Миграции базы данных

### Создание миграции

```bash
# Создайте новый файл миграции
touch migrations/$(date +%Y%m%d_%H%M%S)_migration_name.sql
```

### Пример миграции

```sql
-- migrations/20241201_120000_add_user_groups.sql

-- Создание таблицы групп
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Добавление индексов
CREATE INDEX idx_groups_name ON groups(name);

-- Обновление существующих данных
INSERT INTO groups (name, description) VALUES 
    ('ИНБ-21-01', 'Информационная безопасность 2021'),
    ('ИНБ-21-02', 'Информационная безопасность 2021');
```

### Запуск миграций

```bash
# Запуск всех миграций
npm run db:migrate

# Откат последней миграции
npm run db:rollback

# Сброс базы данных
npm run db:reset
```

## 🔒 Настройка SSL

### Let's Encrypt (Certbot)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификата
sudo certbot --nginx -d your-domain.com

# Автоматическое обновление
sudo crontab -e
# Добавьте строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

### Обновление Nginx конфигурации

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Редирект с HTTP на HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

## 📈 Мониторинг

### Настройка логирования

```bash
# Создание директории для логов
mkdir -p logs

# Ротация логов с logrotate
sudo nano /etc/logrotate.d/gubkin-backend
```

```text
/var/www/dormitory-management/backend/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Мониторинг с PM2

```bash
# Установка PM2 Plus (опционально)
pm2 install pm2-server-monit

# Настройка уведомлений
pm2 install pm2-slack
```

### Системный мониторинг

```bash
# Установка htop для мониторинга ресурсов
sudo apt install htop -y

# Мониторинг диска
df -h

# Мониторинг памяти
free -h

# Мониторинг процессов
ps aux | grep node
```

## 🔧 Устранение неполадок

### Проверка статуса сервисов

```bash
# Проверка статуса приложения
pm2 status

# Проверка логов
pm2 logs gubkin-backend

# Проверка статуса PostgreSQL
sudo systemctl status postgresql

# Проверка статуса Nginx
sudo systemctl status nginx
```

### Частые проблемы

1. **Ошибка подключения к БД:**
   - Проверьте настройки в `config.env`
   - Убедитесь, что PostgreSQL запущен
   - Проверьте права доступа пользователя

2. **Ошибка MinIO:**
   - Проверьте, что MinIO сервер запущен
   - Убедитесь в правильности настроек доступа
   - Проверьте создание bucket

3. **Ошибки SSL:**
   - Проверьте срок действия сертификата
   - Убедитесь в правильности конфигурации Nginx
   - Проверьте права доступа к файлам сертификатов

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи приложения: `pm2 logs gubkin-backend`
2. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/error.log`
3. Проверьте логи PostgreSQL: `sudo tail -f /var/log/postgresql/postgresql-*.log`
4. Создайте issue на GitHub с подробным описанием проблемы

---

**Российский государственный университет нефти и газа имени И.М. Губкина**  
🏠 Система управления общежитиями 