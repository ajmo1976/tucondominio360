#!/usr/bin/env bash
# =============================================================================
# servicios.sh — gestiona los servicios de TuCondominio360 (modo producción)
#
#   API: node dist/main.js  -> http://localhost:3001/api
#   Web: next start         -> http://localhost:3000
#
# Uso:
#   scripts/servicios.sh start   [api|web|db|all]   # levanta (default: all)
#   scripts/servicios.sh stop    [api|web|db|all]   # detiene (TERM, luego KILL)
#   scripts/servicios.sh restart [api|web|db|all]
#   scripts/servicios.sh status                    # pid/uptime/puerto/salud + DB
#   scripts/servicios.sh logs    [api|web]         # tail -f de los logs
#   scripts/servicios.sh build                     # compila dist/ (api) y .next (web)
#
# db = contenedores Docker (postgres + redis); requiere el daemon corriendo
# (en macOS: 'open -a Docker'). all = db + api + web (en ese orden).
#
# PID y logs viven en .run/ (ignorado por git). No compila automáticamente:
# si falta el build lo indica y sale con error.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
API_DIR="$ROOT/apps/api"
WEB_DIR="$ROOT/apps/web"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"
API_LOG="$RUN/api.log"
WEB_LOG="$RUN/web.log"
API_PID="$RUN/api.pid"
WEB_PID="$RUN/web.pid"
DB_CONTAINERS="${DB_CONTAINERS:-tucondominio360_postgres tucondominio360_redis}"

mkdir -p "$RUN"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'
else
  G=""; R=""; Y=""; B=""; N=""
fi

log()  { echo "${B}[servicios]${N} $*"; }
ok()   { echo "  ${G}ok${N}  $*"; }
warn() { echo "  ${Y}!${N}   $*"; }
err()  { echo "  ${R}error${N} $*" >&2; }

pid_file_for() { [ "$1" = api ] && echo "$API_PID" || echo "$WEB_PID"; }
port_for()     { [ "$1" = api ] && echo "$API_PORT" || echo "$WEB_PORT"; }
log_file_for() { [ "$1" = api ] && echo "$API_LOG" || echo "$WEB_LOG"; }

is_alive() { [ -n "${1:-}" ] && ps -p "$1" >/dev/null 2>&1; }

# ¿El pid del archivo sigue siendo nuestro servicio? (evita matar un proceso
# ajeno si el PID fue reciclado)
ours() { # $1=pid $2=nombre
  is_alive "$1" || return 1
  case "$2" in
    api) ps -p "$1" -o command= | grep -q "node dist/main.js" ;;
    web) ps -p "$1" -o command= | grep -q "next" ;;
    *)   return 1 ;;
  esac
}

port_pid() { lsof -ti tcp:"$1" 2>/dev/null | head -1; }

# Devuelve el pid real si el servicio está corriendo (pidfile o, en su
# defecto, el proceso que tenga el puerto).
running_pid() { # $1=nombre
  local name="$1" pf pid
  pf="$(pid_file_for "$name")"
  pid=""
  [ -f "$pf" ] && pid="$(cat "$pf" 2>/dev/null || true)"
  if ours "$pid" "$name"; then echo "$pid"; return 0; fi
  pid="$(port_pid "$(port_for "$name")")"
  if ours "$pid" "$name"; then echo "$pid"; return 0; fi
  return 1
}

wait_http() { # $1=url $2=intentos
  local url="$1" tries="${2:-30}" i=0
  while [ "$i" -lt "$tries" ]; do
    curl -s -o /dev/null --max-time 2 "$url" 2>/dev/null && return 0
    sleep 1; i=$((i + 1))
  done
  return 1
}

start_one() {
  local name="$1" pid port lfile
  port="$(port_for "$name")"; lfile="$(log_file_for "$name")"
  if pid="$(running_pid "$name")"; then
    warn "$name ya está corriendo (pid $pid, puerto :$port)"
    return 0
  fi
  if [ "$name" = api ] && [ ! -f "$API_DIR/dist/main.js" ]; then
    err "api: falta apps/api/dist/main.js — ejecuta 'scripts/servicios.sh build'"
    return 1
  fi
  if [ "$name" = web ] && [ ! -f "$WEB_DIR/.next/BUILD_ID" ]; then
    err "web: falta apps/web/.next — ejecuta 'scripts/servicios.sh build'"
    return 1
  fi
  if [ -n "$(port_pid "$port")" ]; then
    err "$name: el puerto :$port lo ocupa otro proceso (pid $(port_pid "$port"))"
    return 1
  fi
  log "levantando $name (:$port)…"
  if [ "$name" = api ]; then
    ( cd "$API_DIR" && exec nohup node dist/main.js >>"$lfile" 2>&1 </dev/null ) &
  else
    ( cd "$WEB_DIR" && exec nohup npx next start -p "$port" >>"$lfile" 2>&1 </dev/null ) &
  fi
  pid=$!
  echo "$pid" > "$(pid_file_for "$name")"
  if wait_http "http://localhost:$port" 45; then
    ok "$name arriba (pid $pid, puerto :$port, log: .run/$name.log)"
  else
    err "$name no respondió en 45s — últimas líneas de .run/$name.log:"
    tail -8 "$lfile" >&2 || true
    rm -f "$(pid_file_for "$name")"
    return 1
  fi
}

stop_one() {
  local name="$1" pid tries=0
  if ! pid="$(running_pid "$name")"; then
    warn "$name no está corriendo"
    rm -f "$(pid_file_for "$name")"
    return 0
  fi
  log "deteniendo $name (pid $pid)…"
  kill "$pid" 2>/dev/null || true
  while [ "$tries" -lt 10 ] && is_alive "$pid"; do sleep 1; tries=$((tries + 1)); done
  if is_alive "$pid"; then
    warn "ignoró SIGTERM — enviando SIGKILL"
    kill -9 "$pid" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$(pid_file_for "$name")"
  if [ -z "$(port_pid "$(port_for "$name")")" ]; then
    ok "$name detenido (puerto :$(port_for "$name") libre)"
  else
    err "el puerto :$(port_for "$name") sigue ocupado"
    return 1
  fi
}

status_one() {
  local name="$1" pid port uptime
  port="$(port_for "$name")"
  if pid="$(running_pid "$name")"; then
    uptime="$(ps -p "$pid" -o etime= 2>/dev/null | tr -d ' ')"
    if curl -s -o /dev/null --max-time 2 "http://localhost:$port" 2>/dev/null; then
      ok "$name: ${G}ACTIVO${N}  pid=$pid  uptime=$uptime  puerto=:$port"
    else
      warn "$name: proceso vivo (pid $pid) pero :$port no responde HTTP"
    fi
  else
    echo "  ${R}--${N}  $name: CAÍDO  (puerto :$port libre)"
  fi
}

# --- contenedores de base de datos (Docker) ---------------------------------
start_db() {
  if ! docker info >/dev/null 2>&1; then
    err "db: el daemon de Docker no está corriendo (en macOS: 'open -a Docker')"
    return 1
  fi
  log "levantando contenedores de base de datos…"
  docker start $DB_CONTAINERS >/dev/null 2>&1 || {
    err "db: no se pudieron iniciar: $DB_CONTAINERS"
    return 1
  }
  local c h tries
  for c in $DB_CONTAINERS; do
    tries=0; h=""
    while [ "$tries" -lt 45 ]; do
      h="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)"
      [ "$h" = healthy ] && break
      sleep 2; tries=$((tries + 1))
    done
    if [ "$h" = healthy ]; then
      ok "$c healthy"
    else
      warn "$c: estado=$h (revisa 'docker logs $c')"
    fi
  done
}

stop_db() {
  if ! docker info >/dev/null 2>&1; then
    warn "db: el daemon de Docker no está corriendo (nada que detener)"
    return 0
  fi
  log "deteniendo contenedores de base de datos…"
  docker stop $DB_CONTAINERS >/dev/null 2>&1 || warn "db: algunos contenedores no respondieron"
  ok "contenedores detenidos: $DB_CONTAINERS"
}

status_db() {
  if ! docker info >/dev/null 2>&1; then
    echo "  ${R}--${N}  db: Docker daemon CAÍDO (¿'open -a Docker'?)"
    return 0
  fi
  local c st
  for c in $DB_CONTAINERS; do
    st="$(docker inspect -f '{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}' "$c" 2>/dev/null || echo no-existe)"
    case "$st" in
      running/healthy) ok "db: $c  ${G}$st${N}" ;;
      running*)        warn "db: $c  $st" ;;
      *)               echo "  ${R}--${N}  db: $c  $st" ;;
    esac
  done
}

cmd="${1:-status}"
arg="${2:-all}"

case "$cmd" in
  start|stop|restart)
    case "$arg" in api|web|db|all) ;; *) err "destino inválido: $arg (api|web|db|all)"; exit 1 ;; esac
    if [ "$arg" = all ]; then services="db api web"; else services="$arg"; fi
    rc=0
    for s in $services; do
      if [ "$cmd" = stop ] || [ "$cmd" = restart ]; then
        case "$s" in db) stop_db || true ;; *) stop_one "$s" || true ;; esac
      fi
      if [ "$cmd" = start ] || [ "$cmd" = restart ]; then
        case "$s" in db) start_db || rc=1 ;; *) start_one "$s" || rc=1 ;; esac
      fi
    done
    exit $rc
    ;;
  status)
    log "estado de servicios"
    status_db
    status_one api
    status_one web
    ;;
  logs)
    case "$arg" in api) exec tail -f "$API_LOG" ;;
                   web) exec tail -f "$WEB_LOG" ;;
                   all) exec tail -f "$API_LOG" "$WEB_LOG" ;;
                   *) err "destino inválido: $arg (api|web|all)"; exit 1 ;; esac
    ;;
  build)
    log "compilando api (nest build)…"
    ( cd "$API_DIR" && npm run build ) && ok "api: apps/api/dist/ listo"
    log "compilando web (next build)…"
    ( cd "$WEB_DIR" && npx next build ) && ok "web: apps/web/.next listo"
    ;;
  *)
    grep '^#   scripts/servicios.sh' "$0" | sed 's/^#   /  /'
    exit 1
    ;;
esac
