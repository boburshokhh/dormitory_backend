#!/bin/bash

# Скрипт для деплоя бэкенда на Ubuntu сервер
# Использование: ./deploy.sh

echo "🚀 Начинаем деплой бэкенда..."

# Остановка текущих процессов
echo "📋 Останавливаем текущие процессы PM2..."
pm2 stop gubkin-backend 2>/dev/null || echo "Процесс не найден"
pm2 delete gubkin-backend 2>/dev/null || echo "Процесс не найден"

# Установка зависимостей
echo "📦 Устанавливаем зависимости..."
npm install --production

# Проверка переменных окружения
echo "🔧 Проверяем переменные окружения..."
if [ -f ".env" ]; then
    echo "✅ Файл .env найден"
    
    # Удаляем переменные Telegram из .env если они есть
    sed -i '/TELEGRAM_/d' .env 2>/dev/null || echo "Переменные Telegram не найдены"
else
    echo "⚠️ Файл .env не найден, создайте его вручную"
fi

# Тестовый запуск
echo "🧪 Тестируем запуск сервера..."
timeout 10s node server.js &
SERVER_PID=$!

sleep 5

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Сервер запустился успешно"
    kill $SERVER_PID
else
    echo "❌ Ошибка запуска сервера"
    exit 1
fi

# Запуск через PM2
echo "🚀 Запускаем через PM2..."
pm2 start ecosystem.config.js --env production

# Проверка статуса
echo "📊 Проверяем статус..."
pm2 status

# Сохранение конфигурации
echo "💾 Сохраняем конфигурацию PM2..."
pm2 save

echo "✅ Деплой завершен успешно!"
echo ""
echo "📋 Полезные команды:"
echo "  pm2 logs gubkin-backend -f    # Логи в реальном времени"
echo "  pm2 restart gubkin-backend    # Перезапуск"
echo "  pm2 monit                     # Мониторинг"
echo "  curl http://localhost:3000/api/health  # Проверка health check"

