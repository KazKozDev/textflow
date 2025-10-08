#!/bin/bash

# Порт для запуска
PORT=5175

echo "🧹 Очистка порта $PORT..."
# Находим и убиваем процессы на указанном порту
lsof -ti:$PORT | xargs kill -9 2>/dev/null

# Убиваем старые процессы vite для этого проекта
pkill -f "manuscript-editor/node_modules/.bin/vite" 2>/dev/null

echo "✅ Порт очищен"

# Небольшая пауза для освобождения порта
sleep 1

echo "🚀 Запуск сервера на порту $PORT..."
# Запускаем сервер в фоне
npx vite --port $PORT &

# Ждем пока сервер запустится
echo "⏳ Ожидание запуска сервера..."
sleep 3

# Проверяем, что сервер запустился
if lsof -i:$PORT >/dev/null 2>&1; then
    echo "✅ Сервер запущен успешно!"
    
    # Открываем браузер
    echo "🌐 Открытие браузера..."
    open "http://localhost:$PORT"
    
    echo ""
    echo "================================"
    echo "✨ Проект запущен!"
    echo "📍 URL: http://localhost:$PORT"
    echo "================================"
    echo ""
    echo "Для остановки сервера нажмите Ctrl+C или выполните:"
    echo "  pkill -f 'manuscript-editor/node_modules/.bin/vite'"
else
    echo "❌ Ошибка: сервер не запустился"
    exit 1
fi
