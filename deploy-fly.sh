#!/bin/bash

# Скрипт для деплоя на fly.io
echo "🚀 Начинаем деплой на fly.io..."

# Проверяем, что fly CLI установлен
if ! command -v fly &> /dev/null; then
    echo "❌ Fly CLI не установлен. Установите его с https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Проверяем, что мы залогинены
if ! fly auth whoami &> /dev/null; then
    echo "❌ Вы не залогинены в fly.io. Запустите 'fly auth login'"
    exit 1
fi

echo "✅ Fly CLI готов"

# Проверяем package.json
if [ ! -f "package.json" ]; then
    echo "❌ package.json не найден"
    exit 1
fi

echo "✅ package.json найден"

# Проверяем наличие секретов
echo "📋 Проверяем секреты приложения..."
fly secrets list

echo ""
echo "⚠️  Убедитесь, что все необходимые секреты установлены:"
echo "   - JWT_SECRET"
echo "   - REFRESH_TOKEN_SECRET"
echo "   - DB_HOST"
echo "   - DB_USER"
echo "   - DB_PASSWORD"
echo "   - DB_NAME"
echo "   - MINIO_ACCESS_KEY"
echo "   - MINIO_SECRET_KEY"
echo ""

read -p "Все секреты настроены? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Настройте секреты и попробуйте снова"
    echo "Пример: fly secrets set JWT_SECRET=your_secret_here"
    exit 1
fi

echo "🔨 Запускаем деплой..."
fly deploy

if [ $? -eq 0 ]; then
    echo "✅ Деплой успешно завершен!"
    echo "🌐 Приложение доступно по адресу: https://dormitory-backend.fly.dev"
    echo "📊 Страница приветствия: https://dormitory-backend.fly.dev/"
    echo "🏥 Health check: https://dormitory-backend.fly.dev/api/health"
else
    echo "❌ Деплой завершился с ошибкой"
    exit 1
fi 