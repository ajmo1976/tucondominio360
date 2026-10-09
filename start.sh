#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# 0. Docker DEBE estar corriendo: PostgreSQL y Redis viven en contenedores y
#    el backend no funciona sin la BD. Antes esto fallaba en silencio y el
#    script seguía lanzando API + web contra una base inexistente.
if ! docker info >/dev/null 2>&1; then
  echo "Error: el daemon de Docker no está corriendo."
  echo "Abre Docker Desktop y vuelve a intentar:  (comando: open -a Docker)"
  exit 1
fi

# 1. Asegurar que la BD y Redis estén arriba
docker compose up -d

# 2. Esperar a que PostgreSQL acepte conexiones (máx ~30 s)
echo "Esperando a que PostgreSQL esté listo..."
DB_READY=0
for i in $(seq 1 30); do
  if docker exec tucondominio360_postgres pg_isready -U postgres -d tucondominio360 >/dev/null 2>&1; then
    echo "PostgreSQL listo."
    DB_READY=1
    break
  fi
  sleep 1
done
if [ "$DB_READY" != "1" ]; then
  echo "Error: PostgreSQL no respondió a tiempo. Revisa: docker logs tucondominio360_postgres"
  exit 1
fi

# 3. Matar procesos anteriores si existen
kill -9 $(lsof -t -i :3000) 2>/dev/null || true
kill -9 $(lsof -t -i :3001) 2>/dev/null || true

# 4. Iniciar Backend NestJS (Puerto 3001)
cd "$DIR/apps/api"
nohup node dist/main.js > "$DIR/api.log" 2>&1 &
echo "Iniciando Backend API (PID: $!)..."

# 5. Iniciar Frontend Web Next.js (Puerto 3000)
cd "$DIR/apps/web"
nohup npm run start > "$DIR/web.log" 2>&1 &
echo "Iniciando Frontend Web (PID: $!)..."

# 6. Verificar respuesta real de ambos servicios
sleep 5
echo ""
echo "=== Estado de Servicios ==="
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api)
WEB_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
echo "Backend API  (3001): HTTP $API_CODE   $([ "$API_CODE" = "200" ] && echo '✔ OK' || echo '⚠ Revisa api.log')"
echo "Frontend Web (3000): HTTP $WEB_CODE   $([ "$WEB_CODE" = "200" ] && echo '✔ OK' || echo '⚠ Revisa web.log')"