#!/bin/bash
# Verificación E2E de la Fase A (identidad y autenticación).
#
# Cubre: invitación por correo (contraseña opcional), aceptación del token,
# login, reseteo de contraseña, token consumido y token expirado.
#
# Requiere la API en :3001 con MAIL_MODE=log (dev) para poder leer los tokens
# del api.log: en la BD solo se guarda el sha256, nunca el token en claro.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="http://localhost:3001/api"
LOG="$ROOT/api.log"
EMAIL="e2e.invitado@example.com"
PASS_COUNT=0
FAIL_COUNT=0

ok()   { echo "  PASS  $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad()  { echo "  FAIL  $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1 (esperado $3, obtuvo $2)"; fi; }

# Extrae un campo de un JSON leído por stdin.
field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a==null?a:a[k],j);console.log(v==null?"":v)}catch(e){console.log("")}})' "$1"; }

# POST y deja el cuerpo en /tmp/e2e_body.json; imprime el status code.
post() { curl -s -o /tmp/e2e_body.json -w "%{http_code}" -X POST "$@"; }

token_from_log() { grep -oE "$1[?]token=[A-Za-z0-9_-]+" "$LOG" | tail -1 | cut -d= -f2; }

echo "== Fase A E2E =="

# 1) Login superadmin
CODE=$(post "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@tucondominio360.com","password":"secret123"}')
check "login superadmin" "$CODE" "200"
TOKEN=$(field accessToken </tmp/e2e_body.json)
if [ -z "$TOKEN" ]; then echo "No hay token de superadmin; se aborta."; exit 1; fi
AUTH="Authorization: Bearer $TOKEN"

# 2) Crear usuario sin contraseña (invitación)
CODE=$(post "$API/users" -H "$AUTH" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"firstName\":\"E2E\",\"lastName\":\"Invitado\"}")
if [ "$CODE" = "201" ] || [ "$CODE" = "200" ]; then ok "crear usuario invitado ($CODE)"; else bad "crear usuario invitado ($CODE)"; fi
USER_ID=$(field id </tmp/e2e_body.json)
INVITATION_SENT=$(field invitationSent </tmp/e2e_body.json)
check "create devuelve invitationSent" "$INVITATION_SENT" "true"

sleep 1
INV_TOKEN=$(token_from_log "accept-invite")
if [ -n "$INV_TOKEN" ]; then ok "token de invitación emitido y logueado"; else bad "token de invitación no encontrado en api.log"; fi

# La BD debe tener la fila con propósito INVITATION y sin consumir.
ROW=$(docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -tA -c \
  "SELECT purpose || '|' || (consumed_at IS NULL) FROM auth_tokens WHERE purpose='INVITATION' ORDER BY created_at DESC LIMIT 1")
check "auth_tokens guarda INVITATION sin consumir" "$ROW" "INVITATION|true"

# 3) Aceptar la invitación (define contraseña)
CODE=$(post "$API/auth/invitation/accept" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$INV_TOKEN\",\"newPassword\":\"claveE2E123\"}")
check "aceptar invitación" "$CODE" "201"

ROW=$(docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -tA -c \
  "SELECT (consumed_at IS NOT NULL) FROM auth_tokens WHERE purpose='INVITATION' ORDER BY created_at DESC LIMIT 1")
check "token de invitación queda consumido" "$ROW" "t"

# 4) Login con la contraseña definida
CODE=$(post "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"claveE2E123\"}")
check "login del invitado" "$CODE" "200"

# 5) Reseteo de contraseña
CODE=$(post "$API/auth/password/forgot" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
check "password/forgot responde 202" "$CODE" "202"

sleep 1
RESET_TOKEN=$(token_from_log "reset-password")
if [ -n "$RESET_TOKEN" ]; then ok "token de reseteo emitido y logueado"; else bad "token de reseteo no encontrado"; fi

CODE=$(post "$API/auth/password/reset" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"claveE2E456\"}")
check "password/reset con token válido" "$CODE" "201"

# 5b) Reusar el mismo token → 400
CODE=$(post "$API/auth/password/reset" -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"otraClave789\"}")
check "password/reset reusando token consumido" "$CODE" "400"

# 5c) Token expirado → 400
post "$API/auth/password/forgot" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}" >/dev/null
sleep 1
RESET_TOKEN2=$(token_from_log "reset-password")
if [ -n "$RESET_TOKEN2" ]; then
  HASH=$(printf '%s' "$RESET_TOKEN2" | shasum -a 256 | cut -d' ' -f1)
  docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c \
    "UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = '$HASH'" >/dev/null
  CODE=$(post "$API/auth/password/reset" -H 'Content-Type: application/json' \
    -d "{\"token\":\"$RESET_TOKEN2\",\"newPassword\":\"claveCaducada1\"}")
  check "password/reset con token expirado" "$CODE" "400"
else
  bad "no se pudo emitir el segundo token para la prueba de expiración"
fi

# 6) Login con la clave nueva del reseteo
CODE=$(post "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"claveE2E456\"}")
check "login con la clave reseteada" "$CODE" "200"

# 7) Limpieza del usuario de prueba
if [ -n "$USER_ID" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/users/$USER_ID" -H "$AUTH")
  check "eliminar usuario de prueba" "$CODE" "200"
fi

echo ""
echo "== Resultado: $PASS_COUNT OK, $FAIL_COUNT FAIL =="
[ "$FAIL_COUNT" = "0" ]
