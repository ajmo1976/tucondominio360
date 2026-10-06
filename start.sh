#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# 1. Asegurar que Docker esté corriendo
docker compose up -d

# 2. Matar procesos anteriores si existen
kill -9 $(lsof -t -i :3000) 2>/dev/null || true
kill -9 $(lsof -t -i :3001) 2>/dev/null || true

# 3. Iniciar Backend NestJS (Puerto 3001)
cd "$DIR/apps/api"
nohup node dist/main.js > "$DIR/api.log" 2>&1 &
echo "Iniciando Backend API (PID: $!)..."

# 4. Iniciar Frontend Web Next.js (Puerto 3000)
cd "$DIR/apps/web"
nohup npm run start > "$DIR/web.log" 2>&1 &
echo "Iniciando Frontend Web (PID: $!)..."

sleep 3
echo "=== Estado de Servicios ==="
lsof -i :3000
lsof -i :3001
