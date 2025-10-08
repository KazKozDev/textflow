#!/bin/bash

# Переходим в директорию скрипта
cd "$(dirname "$0")"

# Порт для запуска
PORT=5173

echo "🔍 Проверка зависимостей..."

# Проверяем наличие node_modules и package-lock.json
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📦 Установка зависимостей..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Ошибка установки зависимостей"
        exit 1
    fi
    echo "✅ Зависимости установлены"
else
    echo "✅ Зависимости уже установлены"
fi

echo "🧹 Очистка порта $PORT..."
# Находим и убиваем процессы на указанном порту
lsof -ti:$PORT | xargs kill -9 2>/dev/null

# Убиваем старые процессы vite для этого проекта
pkill -f "textflow/node_modules/.bin/vite" 2>/dev/null

echo "✅ Порт очищен"

# Небольшая пауза для освобождения порта
sleep 1

echo "🚀 Запуск сервера на порту $PORT..."
# Запускаем сервер в фоне
npm run dev &

# Ждем пока сервер запустится
echo "⏳ Ожидание запуска сервера..."
sleep 3

# Проверяем, что сервер запустился
if lsof -i:$PORT >/dev/null 2>&1; then
    echo "✅ Сервер запущен успешно!"
    
    # Открываем в Safari
    echo "🌐 Открытие Safari..."
    open -a Safari "http://localhost:$PORT"
    
    echo ""
    echo "================================"
    echo "✨ TextFlow запущен!"
    echo "📍 URL: http://localhost:$PORT"
    echo "🌐 Браузер: Safari"
    echo "================================"
    echo ""
    echo "Для остановки сервера закройте это окно или нажмите Ctrl+C"
    
    # Ждем завершения процесса vite
    wait
else
    echo "❌ Ошибка: сервер не запустился"
    exit 1
fi
