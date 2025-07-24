#!/bin/bash

echo "🔐 Настройка секретов для fly.io..."

# JWT секреты
echo "📝 Устанавливаю JWT секреты..."
fly secrets set JWT_SECRET="gubkin-dormitory-super-secret-jwt-key-2025"
fly secrets set REFRESH_TOKEN_SECRET="gubkin-dormitory-refresh-token-secret-2025"
fly secrets set JWT_EXPIRES_IN="24h"
fly secrets set REFRESH_TOKEN_EXPIRES_IN="7d"

# База данных
echo "🗄️ Устанавливаю настройки базы данных..."
fly secrets set DB_HOST="192.168.13.19"
fly secrets set DB_PORT="5432"
fly secrets set DB_NAME="gubkin_dormitory"
fly secrets set DB_USER="postgres"
fly secrets set DB_PASSWORD="1234bobur$"

# MinIO
echo "📦 Устанавливаю настройки MinIO..."
fly secrets set MINIO_ENDPOINT="192.168.13.19"
fly secrets set MINIO_PORT="9000"
fly secrets set MINIO_USE_SSL="false"
fly secrets set MINIO_ACCESS_KEY="admin"
fly secrets set MINIO_SECRET_KEY="1234bobur$"
fly secrets set MINIO_BUCKET_NAME="uploads"

# SMTP
echo "📧 Устанавливаю настройки SMTP..."
fly secrets set SMTP_HOST="mail.gubkin.uz"
fly secrets set SMTP_PORT="587"
fly secrets set SMTP_SECURE="false"
fly secrets set SMTP_USER="dps@gubkin.uz"
fly secrets set SMTP_PASS="1234bobur$"
fly secrets set SMTP_FROM="dps@gubkin.uz"

# Дополнительные настройки
echo "⚙️ Устанавливаю дополнительные настройки..."
fly secrets set UPLOADS_DIR="uploads"
fly secrets set MAX_FILE_SIZE="10485760"
fly secrets set FRONTEND_URL="https://dormitory-frontend.netlify.app"

echo "✅ Все секреты установлены!"
echo ""
echo "📋 Проверяем установленные секреты:"
fly secrets list

echo ""
echo "🚀 Теперь можно запустить деплой:"
echo "fly deploy" 