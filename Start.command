#!/bin/bash

# Navigate to script directory
cd "$(dirname "$0")"

# Port to run on
PORT=5173

echo "🔍 Checking dependencies..."

# Check if node_modules and package-lock.json exist
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error installing dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo "🧹 Cleaning port $PORT..."
# Find and kill processes on the specified port
lsof -ti:$PORT | xargs kill -9 2>/dev/null

# Kill old vite processes for this project
pkill -f "textflow/node_modules/.bin/vite" 2>/dev/null

echo "✅ Port cleaned"

# Small pause to free up the port
sleep 1

echo "🚀 Starting server on port $PORT..."
# Start server in background
npm run dev &

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Check if server started
if lsof -i:$PORT >/dev/null 2>&1; then
    echo "✅ Server started successfully!"
    
    # Open in Safari
    echo "🌐 Opening Safari..."
    open -a Safari "http://localhost:$PORT"
    
    echo ""
    echo "================================"
    echo "✨ TextFlow is running!"
    echo "📍 URL: http://localhost:$PORT"
    echo "🌐 Browser: Safari"
    echo "================================"
    echo ""
    echo "To stop the server, close this window or press Ctrl+C"
    
    # Wait for vite process to finish
    wait
else
    echo "❌ Error: server did not start"
    exit 1
fi
