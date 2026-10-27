# Consultas y Asambleas Digitales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar consultas y asambleas digitales (cartas consulta y asambleas) que las administradoras y juntas puedan crear, publicar y cerrar, con votación de propietarios, resultados verificables y respaldo documental (comprobante + acta), de modo que la consulta sea válida y no genere reclamos.

**Architecture:** Se reutiliza el esquema existente (`consultations`, `consultation_options`, `consultation_votes`) y se añade un **padrón congelado** (`consultation_electors`) y campos de cierre/resultado. Un módulo NestJS `consultations` expone: CRUD administrativo, ciclo de vida `DRAFT → PUBLISHED → CLOSED/CANCELLED`, gestión del padrón, votación transaccional (un voto por unidad, inmutable) y resultados. Reglas acordadas: **sin quórum**, gana la opción más votada **contando por unidades**, empate = no aprobada, votos **públicos y verificables**. El front agrega una vista por rol (admin / propietario) bajo el tab «Consultas y Asambleas». Los PDFs (acta y comprobante) usan el `PdfBuilder` ya existente, sin dependencias nuevas.

**Tech Stack:** NestJS 10 + TypeScript, PostgreSQL (`pg`), `class-validator`, Next.js 14 (client components) + Tailwind + lucide-react, `PdfBuilder` propio (`apps/api/src/common/pdf.ts`), `node:test` (built-in de Node 20) para la lógica pura de recuento.

**Spec:** Decisiones acordadas en conversación (2026-10-16) + `docs/db-design.md` §12 «Cartas Consulta y Asambleas (Votaciones Digitales)». No existe documento de spec formal; este plan fija las decisiones.

## Global Constraints

- Idioma de toda la UI y de los mensajes de error: **español (es-VE)**. Copys exactos donde se indiquen.
- **Sin nuevas dependencias npm.** PDFs con `PdfBuilder` propio; tests de lógica pura con `node:test` (sin instalar nada).
- Prefijo global de API: `/api`. `ValidationPipe({ whitelist: true, transform: true })` ya es global (`main.ts`).
- `req.user` es la fila de `users` (`id`, `email`, `first_name`, `last_name`, `is_superadmin`, …).
- **Voto por unidad:** lo garantiza la restricción existente `uq_consultation_unit (consultation_id, property_unit_id)`. Nunca editable ni borrable.
- **Recuento por unidades.** `aliquot_applied` se congela y se muestra (transparencia) pero **no decide** el resultado.
- **Sin quórum.** Validez = al menos **1 voto**. Aprobación = **opción más votada** (por unidades). **Empate = no aprobada**.
- **Votos públicos:** se expone unidad + votante + opción + fecha/hora. `is_secret_ballot` se fuerza `FALSE` y la variante secreta no se ofrece.
- Sin framework de migraciones: el SQL se aplica con `psql` y se actualiza también `database/schema.sql` (esquema canónico).
- Git local (no hay remoto). Commits atómicos por tarea.
- La API corre desde `dist/main.js` y el web desde `next start`: **`npm run build`** en la app tocada antes de reiniciar con `bash start.sh`.

## Review Focus

Las cinco clases de entrada / modos de fallo que el spec implica y que los tests de cada tarea deben fijar (van primero las más propensas a romperse):

1. **Voto concurrente de la misma unidad** (dos co-propietarios votan a la vez): solo un voto por unidad; el segundo intento recibe `409` con mensaje claro, nunca sobrescribe.
2. **Votación fuera de ventana** (`now < start_date` o `now > end_date`) con estado `PUBLISHED`: `403` con mensaje; el voto nunca se inserta. Igual si el estado no es `PUBLISHED`.
3. **Unidad sin padrón o usuario no habilitado**: `403`; nunca inserta un voto para una unidad que no está en `consultation_electors` para ese usuario.
4. **Empate en el recuento por unidades**: resultado `TIED`, consulta **no aprobada**, `winning_option_id = NULL`.
5. **Consulta sin votos al cerrar**: resultado `NO_VOTES`; porcentajes `0` (nunca `NaN` y nunca división por cero).
6. **Aislamiento multi-tenant:** un propietario nunca ve consultas `DRAFT` ni consultas de una residencia a la que no pertenece.

---

## File Structure

**Backend (crear módulo nuevo, no tocar los demás salvo lo indicado):**
- `apps/api/src/modules/consultations/consultations.module.ts` — registra controller, service y guards.
- `apps/api/src/modules/consultations/consultations.controller.ts` — endpoints y guards por ruta.
- `apps/api/src/modules/consultations/consultations.service.ts` — toda la lógica de negocio y SQL.
- `apps/api/src/modules/consultations/tally.ts` — `computeConsultationTally` (función pura, sin dependencias).
- `apps/api/src/modules/consultations/tally.spec.ts` — tests `node:test` del recuento.
- `apps/api/src/modules/consultations/pdf.ts` — `buildActaPdf`, `buildVoteReceiptPdf`.
- `apps/api/src/modules/consultations/guards/consultation-member.guard.ts` — membresía por consulta.
- `apps/api/src/modules/consultations/dto/create-consultation.dto.ts`
- `apps/api/src/modules/consultations/dto/update-consultation.dto.ts`
- `apps/api/src/modules/consultations/dto/vote.dto.ts`
- `apps/api/src/modules/consultations/dto/add-elector.dto.ts`
- `apps/api/src/common/pdf.ts` — **mover** desde `apps/api/src/modules/community/pdf.ts` (ya existe `common/`).
- Modificar `apps/api/src/modules/community/community.service.ts` — import del PDF movido.
- Modificar `apps/api/src/app.module.ts` — registrar `ConsultationsModule`.
- `database/migrations/2026-10-16-consultations.sql` — migración aplicable con `psql`.
- Modificar `database/schema.sql` — reflejar el esquema nuevo.
- Modificar `packages/shared/src/index.ts` — tipos compartidos.

**Frontend:**
- Modificar `apps/web/src/components/Sidebar.tsx` — entrada «Consultas y Asambleas» (admin y propietario).
- Modificar `apps/web/src/app/page.tsx` — render de las vistas nuevas.
- Crear `apps/web/src/components/ConsultationsAdminView.tsx` — gestión (admin).
- Crear `apps/web/src/components/ConsultationsOwnerView.tsx` — votación y resultados (propietario).

---

## Task 1: Migración de base de datos y tipos compartidos

**Files:**
- Create: `database/migrations/2026-10-16-consultations.sql`
- Modify: `database/schema.sql`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: tablas/enums/columnas usados por todas las tareas siguientes: `consultation_electors`, enum `consultation_result`, enum `consultation_elector_source`, `consultations.closed_at/closed_by_user_id/result/winning_option_id/result_snapshot`, `consultation_votes.ip_address/user_agent/verification_code`.
- Produces (types): `ConsultationType`, `ConsultationStatus`, `ConsultationResult`, `ConsultationElectorSource`, `ConsultationSummary`, `ConsultationDetail`, `ConsultationTally` en `@tucondominio360/shared`.

- [ ] **Step 1: Escribir la migración (falla hoy porque las estructuras no existen)**

Crea `database/migrations/2026-10-16-consultations.sql` con exactamente:

```sql
-- Consultas y Asambleas Digitales · 2026-10-16
CREATE TYPE consultation_result AS ENUM ('APPROVED', 'REJECTED', 'TIED', 'NO_VOTES');
CREATE TYPE consultation_elector_source AS ENUM ('OWNER', 'MANUAL');

-- Padrón congelado al publicar: qué usuario puede emitir el voto de qué unidad.
CREATE TABLE consultation_electors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    property_unit_id UUID NOT NULL REFERENCES property_units(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source consultation_elector_source NOT NULL DEFAULT 'OWNER',
    added_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_consultation_elector UNIQUE (consultation_id, property_unit_id, user_id)
);

-- Cierre y resultado congelado (para acta e inmutabilidad).
ALTER TABLE consultations
    ADD COLUMN closed_at TIMESTAMPTZ,
    ADD COLUMN closed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN result consultation_result,
    ADD COLUMN winning_option_id UUID REFERENCES consultation_options(id) ON DELETE SET NULL,
    ADD COLUMN result_snapshot JSONB;

-- Sin quórum: el umbral queda en 0 y solo es informativo.
ALTER TABLE consultations ALTER COLUMN quorum_required_aliquot SET DEFAULT 0;

-- Trazabilidad del emisor del voto.
ALTER TABLE consultation_votes
    ADD COLUMN ip_address VARCHAR(45),
    ADD COLUMN user_agent TEXT,
    ADD COLUMN verification_code VARCHAR(40);

CREATE INDEX idx_consultation_electors ON consultation_electors(consultation_id);
CREATE INDEX idx_consultation_options ON consultation_options(consultation_id);
CREATE INDEX idx_consultation_votes_consultation ON consultation_votes(consultation_id);
```

- [ ] **Step 2: Aplicar la migración y verificar**

Run:
```bash
docker exec -i tucondominio360_postgres psql -U postgres -d tucondominio360 < database/migrations/2026-10-16-consultations.sql
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "\d consultation_electors"
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT column_name FROM information_schema.columns WHERE table_name='consultations' AND column_name IN ('closed_at','result','winning_option_id','result_snapshot');"
```
Expected: los `\d` listan la tabla y las 4 columnas; sin errores.

- [ ] **Step 3: Reflejar el esquema en `database/schema.sql`**

En `database/schema.sql`: añadir los dos `CREATE TYPE` junto a los otros enums; añadir `CREATE TABLE consultation_electors (...)` inmediatamente después de `consultation_votes`; añadir las columnas nuevas dentro de `CREATE TABLE consultations` (`closed_at`, `closed_by_user_id`, `result consultation_result`, `winning_option_id`, `result_snapshot`) y en `consultation_votes` (`ip_address`, `user_agent`, `verification_code`); cambiar `quorum_required_aliquot` a `DEFAULT 0`. Añadir los tres índices al bloque de índices.

- [ ] **Step 4: Añadir tipos compartidos**

En `packages/shared/src/index.ts`, junto a los otros tipos:

```ts
export type ConsultationType = 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';
export type ConsultationStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
export type ConsultationResult = 'APPROVED' | 'REJECTED' | 'TIED' | 'NO_VOTES';
export type ConsultationElectorSource = 'OWNER' | 'MANUAL';
```

- [ ] **Step 5: Compilar el paquete shared y commitear**

Run: `npm --prefix packages/shared run build` (si no existe script `build`, compilar con `npx tsc -p packages/shared` y verificar que `packages/shared/dist/index.d.ts` contiene los tipos nuevos).
```bash
git add database/migrations/2026-10-16-consultations.sql database/schema.sql packages/shared/src/index.ts packages/shared/dist
git commit -m "feat(consultations): esquema de padrón, cierre y tipos compartidos"
```

---

## Task 2: Módulo base y CRUD administrativo (DRAFT)

**Files:**
- Create: `apps/api/src/modules/consultations/consultations.module.ts`
- Create: `apps/api/src/modules/consultations/consultations.controller.ts`
- Create: `apps/api/src/modules/consultations/consultations.service.ts`
- Create: `apps/api/src/modules/consultations/dto/create-consultation.dto.ts`
- Create: `apps/api/src/modules/consultations/dto/update-consultation.dto.ts`
- Create: `apps/api/src/modules/consultations/guards/consultation-member.guard.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: tablas de Task 1; `SuperAdminGuard` de `apps/api/src/modules/users/guards/super-admin.guard.ts`; `DatabaseService.getClient()` / `db.query`.
- Produces:
  - `ConsultationsService.create(user, dto): Promise<{ id: string }>`
  - `ConsultationsService.listForUser(user, condoId): Promise<ConsultationSummary[]>`
  - `ConsultationsService.getOne(user, id): Promise<ConsultationDetail>`
  - `ConsultationsService.update(user, id, dto): Promise<{ id: string }>`
  - `ConsultationMemberGuard` (clase, sin deps del módulo; usa `DatabaseService`).

- [ ] **Step 1: Escribir la creación y verificar que hoy falla**

Run (con API arriba):
```bash
TOKEN=$(curl -s -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@tucondominio360.com","password":"secret123"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
CONDO=1bbf6824-4a3d-4586-9d43-cba4e9cccd19
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/consultations -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"condoId\":\"$CONDO\",\"title\":\"Prueba\",\"description\":\"x\",\"consultationType\":\"CARTA_CONSULTA\",\"startDate\":\"2026-10-16T00:00:00Z\",\"endDate\":\"2026-10-23T00:00:00Z\",\"options\":[{\"title\":\"A\"},{\"title\":\"B\"}]}"
```
Expected: **404** (la ruta no existe todavía).

- [ ] **Step 2: Crear los DTOs**

`dto/create-consultation.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Length, ValidateNested } from 'class-validator';

export class ConsultationOptionDto {
  @IsString() @Length(1, 150) title: string;
  @IsOptional() @IsString() @Length(0, 1000) description?: string;
}

export class CreateConsultationDto {
  @IsUUID() condoId: string;
  @IsString() @Length(3, 200) title: string;
  @IsString() @Length(3, 5000) description: string;
  @IsEnum(['CARTA_CONSULTA', 'ASAMBLEA_ORDINARIA', 'ASAMBLEA_EXTRAORDINARIA'] as const)
  consultationType: 'CARTA_CONSULTA' | 'ASAMBLEA_ORDINARIA' | 'ASAMBLEA_EXTRAORDINARIA';
  @IsISO8601() startDate: string;
  @IsISO8601() endDate: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ConsultationOptionDto)
  options: ConsultationOptionDto[];
}
```

`dto/update-consultation.dto.ts`: mismos campos pero todos `@IsOptional()` (sin `condoId`), más `@IsOptional() options?`.

- [ ] **Step 3: Implementar el guard de membresía**

`guards/consultation-member.guard.ts` — copia el patrón de `community/guards/condo-member.guard.ts` pero resolviendo el condominio desde la consulta:
```ts
const c = await this.db.query('SELECT condo_id FROM consultations WHERE id = $1', [req.params.id]);
if (c.rows.length === 0) throw new NotFoundException('Consulta no encontrada');
if (user.is_superadmin) return true;
const condoId = c.rows[0].condo_id;
// misma comprobación UNION condo_user_access / unit_occupants que CondoMemberGuard
// si no hay fila → ForbiddenException('No tienes acceso a esta consulta')
```

- [ ] **Step 4: Implementar `ConsultationsService.create` / `listForUser` / `getOne` / `update`**

- `create`: valida que el condominio exista; `startDate < endDate` (si no, `BadRequestException('La fecha de cierre debe ser posterior a la de inicio')`); títulos de opciones únicos (si no, `BadRequestException('Las opciones deben tener títulos distintos')`). En una transacción (`db.getClient()`): `INSERT INTO consultations (condo_id, created_by_user_id, title, description, consultation_type, status, start_date, end_date, is_secret_ballot) VALUES (..., 'DRAFT', ..., FALSE) RETURNING id`, luego inserta opciones con `position = index`. Registra `audit_logs` (`action='CONSULTATION_CREATED'`, `entity_name='consultations'`).
  - Nota: forzar `is_secret_ballot = FALSE` (votos públicos por decisión).
- `listForUser(user, condoId)`: si `user.is_superadmin` devuelve todas; si no, solo `status IN ('PUBLISHED','CLOSED','CANCELLED')`. Orden `created_at DESC`. Incluir `option_count` y `vote_count` (subconsultas).
- `getOne(user, id)`: si no es superadmin y `status='DRAFT'` → `NotFoundException`. Devuelve consulta + opciones + conteo de votos + (si `status IN ('CLOSED','CANCELLED')`) el `result_snapshot`.
- `update`: solo `DRAFT` (si no, `BadRequestException('Solo se puede editar una consulta en borrador')`); reemplaza opciones si vienen.

- [ ] **Step 5: Crear el controller, el módulo y registrarlo**

`consultations.controller.ts`:
```ts
@ApiTags('Consultas y Asambleas')
@Controller('consultations')
@UseGuards(AuthGuard('jwt'))
export class ConsultationsController {
  @Post() @UseGuards(SuperAdminGuard)
  create(@Request() req, @Body() dto: CreateConsultationDto) { return this.service.create(req.user, dto); }

  @Get()
  list(@Request() req, @Query('condoId') condoId: string) { return this.service.listForUser(req.user, condoId); }

  @Get(':id') @UseGuards(ConsultationMemberGuard)
  getOne(@Request() req, @Param('id') id: string) { return this.service.getOne(req.user, id); }

  @Patch(':id') @UseGuards(SuperAdminGuard)
  update(@Request() req, @Param('id') id: string, @Body() dto: UpdateConsultationDto) { return this.service.update(req.user, id, dto); }
}
```
`consultations.module.ts`: `providers: [ConsultationsService, ConsultationMemberGuard, SuperAdminGuard]`. En `app.module.ts`: importar y añadir `ConsultationsModule` a `imports`.

- [ ] **Step 6: Compilar, reiniciar y verificar**

Run:
```bash
npm --prefix apps/api run build && bash start.sh
# repetir el curl del Step 1 → Expected: 201 con {"id":"..."}
# GET detail:
curl -s localhost:3001/api/consultations/$ID -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const c=JSON.parse(d);console.log(c.status,c.options.length)})"
```
Expected: POST `201`; GET muestra `DRAFT 2`. Verifica en BD: `SELECT COUNT(*) FROM consultation_options WHERE consultation_id='$ID';` → `2`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/consultations apps/api/src/app.module.ts
git commit -m "feat(consultations): módulo base y CRUD administrativo en borrador"
```

---

## Task 3: Publicación con padrón congelado y gestión de habilitados

**Files:**
- Modify: `apps/api/src/modules/consultations/consultations.service.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`
- Create: `apps/api/src/modules/consultations/dto/add-elector.dto.ts`

**Interfaces:**
- Consumes: Task 2 (`create`, guard, tabla `consultation_electors`).
- Produces:
  - `ConsultationsService.publish(user, id): Promise<{ electorsCreated: number; unitsWithoutElector: string[] }>`
  - `ConsultationsService.listElectors(user, id): Promise<Array<{ id: string; unitCode: string; userId: string; name: string; source: string }>>`
  - `ConsultationsService.addElector(user, id, dto): Promise<{ id: string }>`
  - `ConsultationsService.removeElector(user, id, electorId): Promise<{ ok: true }>`

- [ ] **Step 1: Escribir la verificación que falla**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/consultations/$ID/publish -H "Authorization: Bearer $TOKEN"` → Expected: **404**.

- [ ] **Step 2: Implementar `publish`**

Reglas: solo `DRAFT` (`BadRequestException('Solo se publican consultas en borrador')`); exige ≥2 opciones; exige `end_date > now()` (`BadRequestException('La fecha de cierre debe ser futura')`). En transacción: cambia `status='PUBLISHED'` y genera el padrón:
```sql
INSERT INTO consultation_electors (consultation_id, property_unit_id, user_id, source, added_by_user_id)
SELECT $1, pu.id, uo.user_id, 'OWNER', $3
FROM property_units pu
JOIN unit_occupants uo ON uo.property_unit_id = pu.id
WHERE pu.condo_id = $2 AND pu.is_active = TRUE
  AND uo.role IN ('OWNER','CO_OWNER')
  AND (uo.valid_to IS NULL OR uo.valid_to >= CURRENT_DATE);
```
Devuelve cuántos electores se crearon y la lista de `unit_code` de unidades activas **sin** ningún elector (para avisar al admin). `audit_logs` `action='CONSULTATION_PUBLISHED'`.
  - Unidad con varios propietarios → varias filas de elector para la misma unidad (cualquiera de ellos puede emitir el voto único de la unidad).

- [ ] **Step 3: Implementar gestión de electores**

- `listElectors`: join con `property_units` (`unit_code`) y `users` (`first_name`,`last_name`).
- `addElector(dto: AddElectorDto { propertyUnitId: string; userId: string })`: valida que la unidad pertenezca al condominio de la consulta y que el usuario exista; `INSERT ... ON CONFLICT DO NOTHING` con `source='MANUAL'`. Permite agregar un habilitado aunque no sea propietario (apoderado, unidad sin usuario propietario). `audit_logs` `action='CONSULTATION_ELECTOR_ADDED'`.
- `removeElector`: borra la fila por `(id, consultation_id)`. `audit_logs` `action='CONSULTATION_ELECTOR_REMOVED'`.

`dto/add-elector.dto.ts`: `@IsUUID() propertyUnitId`; `@IsUUID() userId`.

- [ ] **Step 4: Añadir endpoints**

```ts
@Post(':id/publish') @UseGuards(SuperAdminGuard) publish(@Request() req, @Param('id') id) {...}
@Get(':id/electors') @UseGuards(SuperAdminGuard) electors(@Request() req, @Param('id') id) {...}
@Post(':id/electors') @UseGuards(SuperAdminGuard) addElector(@Request() req, @Param('id') id, @Body() dto) {...}
@Delete(':id/electors/:electorId') @UseGuards(SuperAdminGuard) removeElector(@Request() req, @Param('id') id, @Param('electorId') e) {...}
```

- [ ] **Step 5: Compilar, reiniciar y verificar**

Run:
```bash
npm --prefix apps/api run build && bash start.sh
curl -s -X POST localhost:3001/api/consultations/$ID/publish -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log('electores',r.electorsCreated,'sinElector',r.unitsWithoutElector.length)})"
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT COUNT(*) FROM consultation_electors WHERE consultation_id='$ID';"
```
Expected: `electorsCreated` igual al conteo en BD (>0 para Res Mirador); estado `PUBLISHED`.
  - **Review Focus #6:** confirmar que un propietario no ve `DRAFT` (usar token de `arnaldo.martinez@gmail.com` y el `GET ?condoId=` → no aparece la consulta hasta publicada).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/consultations
git commit -m "feat(consultations): publicación con padrón congelado y gestión de habilitados"
```

---

## Task 4: Votación transaccional y comprobante

**Files:**
- Modify: `apps/api/src/modules/consultations/consultations.service.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`
- Create: `apps/api/src/modules/consultations/dto/vote.dto.ts`

**Interfaces:**
- Consumes: Task 3 (`consultation_electors`).
- Produces:
  - `ConsultationsService.getEligibility(user, id): Promise<{ units: Array<{ propertyUnitId: string; unitCode: string; alreadyVoted: boolean; votedOptionId: string | null }> }>`
  - `ConsultationsService.vote(user, id, dto, meta: { ip?: string; userAgent?: string }): Promise<{ voteId: string; verificationCode: string; optionId: string; unitCode: string; votedAt: string }>`

- [ ] **Step 1: Escribir la verificación que falla**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/consultations/$ID/vote -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' -d '{"optionId":"...","propertyUnitId":"..."}'` → Expected: **404**.

- [ ] **Step 2: Implementar `vote` (transacción + bloqueo)**

Pasos dentro de `db.getClient()` con `BEGIN`/`COMMIT`:
1. `SELECT status, condo_id, start_date, end_date FROM consultations WHERE id=$1 FOR UPDATE`. Si no existe → `404`.
2. Si `status <> 'PUBLISHED'` → `403 'La consulta no está abierta para votación'`.
3. Si `now < start_date` → `403 'La votación aún no ha comenzado'`; si `now > end_date` → `403 'La votación ha finalizado'`.
4. Verificar que la opción pertenece a la consulta: `SELECT 1 FROM consultation_options WHERE id=$1 AND consultation_id=$2` (si no → `400 'Opción inválida'`).
5. Verificar habilitación: `SELECT 1 FROM consultation_electors WHERE consultation_id=$1 AND property_unit_id=$2 AND user_id=$3` (si no → `403 'No estás habilitado para votar por esta unidad'`).
6. Verificar voto previo de la unidad: `SELECT 1 FROM consultation_votes WHERE consultation_id=$1 AND property_unit_id=$2` (si existe → `409 'Esta unidad ya emitió su voto'`).
7. Congelar alícuota: `SELECT aliquot_percentage FROM property_units WHERE id=$1`.
8. Generar `verification_code` (p. ej. `randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()`).
9. `INSERT INTO consultation_votes (consultation_id, consultation_option_id, property_unit_id, user_id, aliquot_applied, verification_code, ip_address, user_agent) VALUES (...) RETURNING id, voted_at`.
10. `audit_logs` `action='CONSULTATION_VOTED'`, `new_values` con `{ consultationId, unitId, optionId }`.
- Capturar violación de unicidad (`code '23505'`) como red de seguridad → `409` con el mismo mensaje (Review Focus #1).

- [ ] **Step 3: Implementar `getEligibility`**

Devuelve las unidades del usuario en el padrón de esa consulta (`JOIN consultation_electors` + `property_units`), con `alreadyVoted` y la opción votada si ya votó (para que la UI muestre «ya votaste»).

- [ ] **Step 4: Añadir endpoints y DTO**

`dto/vote.dto.ts`: `@IsUUID() optionId`; `@IsUUID() propertyUnitId`.
```ts
@Get(':id/my-eligibility') @UseGuards(ConsultationMemberGuard) eligibility(@Request() req, @Param('id') id) {...}
@Post(':id/vote') @UseGuards(ConsultationMemberGuard)
vote(@Request() req, @Param('id') id, @Body() dto: VoteDto) {
  return this.service.vote(req.user, id, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
}
```

- [ ] **Step 5: Compilar, reiniciar y verificar (incluye los Review Focus 1–3)**

Run (token del propietario `arnaldo.martinez@gmail.com` / `secret123`; obtener `propertyUnitId` de una unidad suya en el padrón):
```bash
# voto válido
curl -s -X POST localhost:3001/api/consultations/$ID/vote -H "Authorization: Bearer $OWNER_TOKEN" -H 'Content-Type: application/json' -d "{\"optionId\":\"$OPT\",\"propertyUnitId\":\"$UNIT\"}" -w "\n%{http_code}\n"
# segundo intento misma unidad → 409
# voto de una unidad que no está en el padrón → 403
# voto con consulta DRAFT (crear otra) → 403
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT property_unit_id,consultation_option_id,aliquot_applied FROM consultation_votes WHERE consultation_id='$ID';"
```
Expected: primer voto `201`; segundo `409 'Esta unidad ya emitió su voto'`; no habilitado `403`; en BD **una sola fila** por unidad. Documenta en el PR los códigos obtenidos.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/consultations
git commit -m "feat(consultations): votación transaccional por unidad y elegibilidad"
```

---

## Task 5: Recuento puro (TDD) y cierre con resultado congelado

**Files:**
- Create: `apps/api/src/modules/consultations/tally.ts`
- Create: `apps/api/src/modules/consultations/tally.spec.ts`
- Modify: `apps/api/src/modules/consultations/consultations.service.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`

**Interfaces:**
- Produces:
  - `computeConsultationTally(options: TallyOptionInput[], votes: TallyVoteInput[]): TallyResult`
  - `ConsultationsService.close(user, id): Promise<{ result: ConsultationResult; snapshot: TallyResult }>`
  - `ConsultationsService.getResults(user, id): Promise<{ tally: TallyResult; votes: Array<{ unitCode: string; voter: string; optionId: string; votedAt: string }>; closed: boolean; result: ConsultationResult | null }>`

- [ ] **Step 1: Escribir el test que falla**

`tally.spec.ts` (usa `node:test` + `node:assert/strict`):
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeConsultationTally } from './tally';

const opts = [
  { id: 'a', title: 'A', position: 0 },
  { id: 'b', title: 'B', position: 1 },
  { id: 'c', title: 'C', position: 2 },
];

test('un solo voto → APROBADA con 100%', () => {
  const r = computeConsultationTally(opts, [{ optionId: 'a', aliquot: 1.2 }]);
  assert.equal(r.result, 'APPROVED');
  assert.equal(r.winnerOptionId, 'a');
  assert.equal(r.options.find(o => o.optionId === 'a')!.unitPercentage, 100);
});

test('empate → TIED y sin ganador', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'a', aliquot: 1 }, { optionId: 'b', aliquot: 1 },
  ]);
  assert.equal(r.result, 'TIED');
  assert.equal(r.winnerOptionId, null);
});

test('sin votos → NO_VOTES y 0% (nunca NaN)', () => {
  const r = computeConsultationTally(opts, []);
  assert.equal(r.result, 'NO_VOTES');
  assert.equal(r.winnerOptionId, null);
  assert.ok(r.options.every(o => o.unitPercentage === 0 && Number.isFinite(o.unitPercentage)));
});

test('mayoría simple = opción más votada, aunque no supere 50%', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'b', aliquot: 5 }, { optionId: 'b', aliquot: 5 },
    { optionId: 'a', aliquot: 1 }, { optionId: 'c', aliquot: 1 },
  ]);
  assert.equal(r.result, 'APPROVED');
  assert.equal(r.winnerOptionId, 'b');
});

test('decide por unidades, no por alícuota', () => {
  const r = computeConsultationTally(opts, [
    { optionId: 'a', aliquot: 0.1 }, { optionId: 'a', aliquot: 0.1 },
    { optionId: 'b', aliquot: 50 },
  ]);
  assert.equal(r.winnerOptionId, 'a');                     // 2 unidades vs 1
  assert.ok(r.options.find(o => o.optionId === 'b')!.aliquotPercentage > 90); // alícuota se reporta, no decide
});
```

- [ ] **Step 2: Ejecutar el test y verlo fallar**

Run: `npm --prefix apps/api run build && node --test apps/api/dist/modules/consultations/tally.spec.js`
Expected: FAIL (`Cannot find module './tally'`).

- [ ] **Step 3: Implementar `tally.ts`**

```ts
export interface TallyOptionInput { id: string; title: string; position: number }
export interface TallyVoteInput { optionId: string; aliquot: number }
export interface TallyOptionResult {
  optionId: string; title: string; units: number; unitPercentage: number;
  aliquotSum: number; aliquotPercentage: number;
}
export interface TallyResult {
  totalUnits: number; totalAliquot: number; options: TallyOptionResult[];
  winnerOptionId: string | null; result: 'APPROVED' | 'TIED' | 'NO_VOTES';
}
```
Reglas: `totalUnits = votes.length`; `totalAliquot = round(sum,5)`. Por opción: `units` (conteo), `unitPercentage = totalUnits ? round(units/totalUnits*100,1) : 0`, `aliquotSum`, `aliquotPercentage = totalAliquot ? round(aliquotSum/totalAliquot*100,1) : 0`. Resultado: `0` votos → `NO_VOTES`; si la mayor cuenta de unidades la comparten ≥2 opciones → `TIED` y `winnerOptionId=null`; si no → `APPROVED` con esa opción. Opciones ordenadas por `position`.

- [ ] **Step 4: Ejecutar el test y verlo pasar**

Run: `npm --prefix apps/api run build && node --test apps/api/dist/modules/consultations/tally.spec.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Implementar `close`**

Solo `PUBLISHED` (`BadRequestException('Solo se cierran consultas publicadas')`). En transacción: leer opciones y votos; `const tally = computeConsultationTally(...)`; `UPDATE consultations SET status='CLOSED', closed_at=NOW(), closed_by_user_id=$2, result=$3, winning_option_id=$4, result_snapshot=$5 WHERE id=$1` donde `result = tally.result`, `winning_option_id = tally.winnerOptionId`, `result_snapshot = tally` (JSONB). `audit_logs` `action='CONSULTATION_CLOSED'`. Devuelve `{ result, snapshot }`. Cerrar antes de `end_date` es válido (cierre anticipado por el admin).

- [ ] **Step 6: Implementar `getResults` y endpoints**

`getResults`: `tally` en vivo (mientras `PUBLISHED`) o el `result_snapshot` (si cerrada); `votes` con `unit_code`, nombre del votante, opción y fecha (votos **públicos**); `closed` y `result`.
```ts
@Post(':id/close') @UseGuards(SuperAdminGuard) close(@Request() req, @Param('id') id) {...}
@Get(':id/results') @UseGuards(ConsultationMemberGuard) results(@Request() req, @Param('id') id) {...}
```

- [ ] **Step 7: Compilar, reiniciar y verificar (Review Focus #4 y #5)**

Run:
```bash
npm --prefix apps/api run build && bash start.sh
node --test apps/api/dist/modules/consultations/tally.spec.js
# cerrar con 1 voto
curl -s -X POST localhost:3001/api/consultations/$ID/close -H "Authorization: Bearer $TOKEN"
curl -s localhost:3001/api/consultations/$ID/results -H "Authorization: Bearer $TOKEN"
# crear+publicar+cerrar SIN votos → result NO_VOTES
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c "SELECT status,result,winning_option_id FROM consultations WHERE id='$ID';"
```
Expected: cierre con 1 voto → `APPROVED`; sin votos → `NO_VOTES`; ningún `NaN`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/consultations
git commit -m "feat(consultations): recuento por unidades, cierre y resultado congelado"
```

---

## Task 6: Cancelación y auditoría

**Files:**
- Modify: `apps/api/src/modules/consultations/consultations.service.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`

**Interfaces:**
- Produces: `ConsultationsService.cancel(user, id, reason?): Promise<{ ok: true }>`

- [ ] **Step 1: Verificación que falla**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/consultations/$ID/cancel -H "Authorization: Bearer $TOKEN"` → Expected: **404**.

- [ ] **Step 2: Implementar `cancel`**

Permitida desde `DRAFT` o `PUBLISHED` (si ya `CLOSED`/`CANCELLED` → `BadRequestException('La consulta ya está cerrada o cancelada')`). `UPDATE consultations SET status='CANCELLED', closed_at=NOW(), closed_by_user_id=$2 WHERE id=$1`. `audit_logs` `action='CONSULTATION_CANCELLED'`, `new_values` `{ reason }`. No borra votos (trazabilidad).

- [ ] **Step 3: Endpoint**

```ts
@Post(':id/cancel') @UseGuards(SuperAdminGuard)
cancel(@Request() req, @Param('id') id, @Body() body: { reason?: string }) {...}
```

- [ ] **Step 4: Compilar, reiniciar y verificar**

Run: `npm --prefix apps/api run build && bash start.sh` y el curl del Step 1 → Expected `201`; estado en BD `CANCELLED`; fila en `audit_logs`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/consultations
git commit -m "feat(consultations): cancelación con auditoría"
```

---

## Task 7: PDFs de acta y comprobante

**Files:**
- Move: `apps/api/src/modules/community/pdf.ts` → `apps/api/src/common/pdf.ts`
- Modify: `apps/api/src/modules/community/community.service.ts` (import del PDF movido)
- Create: `apps/api/src/modules/consultations/pdf.ts`
- Modify: `apps/api/src/modules/consultations/consultations.service.ts`
- Modify: `apps/api/src/modules/consultations/consultations.controller.ts`

**Interfaces:**
- Consumes: `PdfBuilder`, `pdfDateTime`, `pdfDate` (desde `common/pdf.ts`); `getResults`.
- Produces:
  - `buildActaPdf(data: ActaData): Buffer`
  - `buildVoteReceiptPdf(data: ReceiptData): Buffer`
  - `ConsultationsService.buildActa(id): Promise<Buffer>`
  - `ConsultationsService.buildReceipt(id, propertyUnitId, user): Promise<Buffer>`

- [ ] **Step 1: Mover el PDF a `common/` y verificar que la comunidad sigue funcionando**

`git mv apps/api/src/modules/community/pdf.ts apps/api/src/common/pdf.ts`; en `community.service.ts` cambiar `from './pdf'` por `from '../../common/pdf'`.
Run: `npm --prefix apps/api run build && bash start.sh` y descargar la conciliación:
```bash
curl -s localhost:3001/api/community/documents/$CONDO/bank-reconciliation -H "Authorization: Bearer $TOKEN" | head -c 5
```
Expected: `%PDF-`.

- [ ] **Step 2: Implementar `buildActaPdf`**

Usa `PdfBuilder` con `{ title: 'Acta de Consulta / Asamblea', subtitle: <nombre del condominio> }`. Contenido: tipo de consulta, título, descripción, fecha de publicación y de cierre, **resultado** (`APROBADA` / `RECHAZADA` / `EMPATADA` / `SIN VOTOS`), tabla de opciones (Opción · Unidades · % Unidades · % Alícuota), línea de participación (`Unidades que votaron: X de Y del padrón`), tabla de votos por unidad (`Unidad · Votante · Opción · Fecha/hora`) para verificabilidad, y una nota legal: *«Consulta sin quórum requerido. Se decide por mayoría simple de los votos emitidos (un voto por inmueble). El empate se declara no aprobado.»* Si existe `minutes_document_url`, añade una línea con el enlace al acta firmada.

- [ ] **Step 3: Implementar `buildVoteReceiptPdf`**

`PdfBuilder` con `{ title: 'Constancia de Votación', subtitle: <nombre del condominio> }`. Contenido: título y tipo de la consulta, unidad (`unit_code`), votante, opción elegida, fecha/hora del voto, `verification_code` y la alícuota aplicada (etiquetada como informativa). Nota: *«Voto público y verificable. Cada inmueble emite un único voto.»*

- [ ] **Step 4: Servir los PDFs**

```ts
@Get(':id/acta.pdf') @UseGuards(ConsultationMemberGuard)
async acta(@Param('id') id, @Res() res) {
  const buffer = await this.service.buildActa(id);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="acta-consulta.pdf"', 'Content-Length': buffer.length });
  res.send(buffer);
}

@Get(':id/receipt.pdf') @UseGuards(ConsultationMemberGuard)
async receipt(@Request() req, @Param('id') id, @Query('propertyUnitId') unitId, @Res() res) {
  const buffer = await this.service.buildReceipt(id, unitId, req.user);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="constancia-voto.pdf"', 'Content-Length': buffer.length });
  res.send(buffer);
}
```
`buildActa` exige estado `CLOSED`/`CANCELLED` (si no → `BadRequestException('El acta estará disponible al cerrar la consulta')`). `buildReceipt` exige que el voto exista y pertenezca al usuario (o superadmin) → si no, `404`.

- [ ] **Step 5: Compilar, reiniciar y verificar**

Run:
```bash
npm --prefix apps/api run build && bash start.sh
curl -s localhost:3001/api/consultations/$ID/acta.pdf -H "Authorization: Bearer $TOKEN" | head -c 5
curl -s "localhost:3001/api/consultations/$ID/receipt.pdf?propertyUnitId=$UNIT" -H "Authorization: Bearer $OWNER_TOKEN" | head -c 5
```
Expected: ambos `%PDF-`. Abre el acta y confirma acentos y resultado.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/pdf.ts apps/api/src/modules/community apps/api/src/modules/consultations
git commit -m "feat(consultations): acta y comprobante PDF (reutilizando PdfBuilder)"
```

---

## Task 8: Frontend — sidebar y cableado en `page.tsx`

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: componentes de Task 9 y Task 10.
- Produces: tab `'consultations'` navegable para admin y propietario.

- [ ] **Step 1: Añadir la entrada al Sidebar**

Importar `Vote` de `lucide-react`. En `menuItems` (admin) añadir tras `users`:
```ts
{ id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
```
En el menú del propietario añadir antes de `my-bills`:
```ts
{ id: 'consultations', label: 'Consultas y Asambleas', icon: Vote },
```

- [ ] **Step 2: Renderizar las vistas en `page.tsx`**

Importar `ConsultationsAdminView` y `ConsultationsOwnerView`. Dentro del `<main>`, junto a los otros bloques:
```tsx
{selectedCondo.id && currentTab === 'consultations' && (
  userProfile.isSuperadmin
    ? <ConsultationsAdminView condoId={selectedCondo.id} />
    : <ConsultationsOwnerView condoId={selectedCondo.id} />
)}
```

- [ ] **Step 3: Compilar y verificar**

Run: `npm --prefix apps/web run build && bash start.sh` y abrir `http://localhost:3000`. Expected: aparece el ítem «Consultas y Asambleas» en ambos roles y no rompe la navegación.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx apps/web/src/app/page.tsx
git commit -m "feat(consultations): tab y cableado de vistas por rol"
```

---

## Task 9: Frontend — vista de administración

**Files:**
- Create: `apps/web/src/components/ConsultationsAdminView.tsx`

**Interfaces:**
- Consumes: `fetchWithAuth`, `downloadWithAuth` de `../lib/api`; endpoints de Tasks 2–7.
- Produces: `<ConsultationsAdminView condoId={string} />`.

- [ ] **Step 1: Estructura y listado**

Componente cliente que al montar hace `GET /consultations?condoId=`. Muestra tarjetas/tabla con: título, tipo, estado (badge de color), fechas, votos emitidos y barras de progreso por opción. Botón **«Nueva consulta»**.

- [ ] **Step 2: Formulario completo y sólido (crear / editar)**

Modal con: título (3–200), tipo (`CARTA_CONSULTA` / `ASAMBLEA_ORDINARIA` / `ASAMBLEA_EXTRAORDINARIA`), descripción (3–5000), fecha/hora de inicio y de cierre, y **opciones dinámicas** (mínimo 2, máximo 10, agregar/quitar, cada una con título y descripción opcional). Validación en cliente **y** confianza en la del servidor: bloquear «Guardar» si falta algo, `end > start`, títulos de opciones no vacíos ni duplicados. Al crear → `POST /consultations`; en `DRAFT` → `PATCH /consultations/:id` con las mismas reglas.

- [ ] **Step 3: Acciones de ciclo de vida**

- **Publicar** → `POST /:id/publish`; si la respuesta trae `unitsWithoutElector` no vacío, avisar: *«N inmueble(s) quedaron sin votante habilitado. Agrégalos en el padrón.»*
- **Cerrar** → `POST /:id/close` (confirmación; avisa que el resultado queda congelado).
- **Cancelar** → `POST /:id/cancel` con motivo opcional (confirmación).
- Mostrar solo las acciones válidas por estado (`DRAFT`: editar/eliminar(no)/publicar/cancelar; `PUBLISHED`: cerrar/cancelar; `CLOSED`/`CANCELLED`: solo ver).

- [ ] **Step 4: Padrón y resultados**

- Modal **Padrón**: `GET /:id/electors` lista (unidad · habilitado · origen). Formulario *agregar habilitado* (select de unidad + select/entrada de usuario) → `POST /:id/electors`; botón quitar → `DELETE /:id/electors/:electorId`.
- Panel **Resultados**: `GET /:id/results` con tabla de opciones (Unidades, % Unidades, % Alícuota) y tabla de votos por unidad (Unidad · Votante · Opción · Fecha). Botón **«Descargar acta (PDF)»** → `downloadWithAuth(`/consultations/${id}/acta.pdf`, 'acta-consulta.pdf')`.

- [ ] **Step 5: Compilar y verificar**

Run: `npm --prefix apps/web run build && bash start.sh`. Como admin: crear → publicar → agregar un habilitado manual → votar (con el propietario) → cerrar → ver resultados → descargar acta. Expected: sin errores en consola; el acta descarga con el resultado correcto.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ConsultationsAdminView.tsx
git commit -m "feat(consultations): vista de administración (CRUD, padrón, resultados, acta)"
```

---

## Task 10: Frontend — vista del propietario (votar y verificar)

**Files:**
- Create: `apps/web/src/components/ConsultationsOwnerView.tsx`

**Interfaces:**
- Consumes: `fetchWithAuth`, `downloadWithAuth`; endpoints `GET /consultations?condoId=`, `GET /:id`, `GET /:id/my-eligibility`, `POST /:id/vote`, `GET /:id/results`, `GET /:id/receipt.pdf`.

- [ ] **Step 1: Listado y estado por consulta**

`GET /consultations?condoId=` (el backend ya oculta `DRAFT`). Por consulta: título, tipo, fechas, estado y un panel de participación. Si está `PUBLISHED` y tengo una unidad habilitada sin votar → botón **«Votar»**; si ya voté esa unidad → «Ya votaste» + botón **«Descargar constancia»**.

- [ ] **Step 2: Modal de votación**

Muestra título, descripción y las opciones como radio (una sola elección). Si el usuario tiene más de una unidad habilitada, selector de unidad (usar `GET /:id/my-eligibility`). Al enviar `POST /:id/vote { optionId, propertyUnitId }`; en éxito, mostrar confirmación con el `verificationCode` y botón **«Descargar constancia»** → `downloadWithAuth(`/consultations/${id}/receipt.pdf?propertyUnitId=${unitId}`, 'constancia-voto.pdf')`.

- [ ] **Step 3: Resultados públicos y cierre**

Sección **Resultados** con `GET /:id/results`: tabla de opciones (Unidades, % Unidades, % Alícuota) y tabla de **votos por unidad** (Unidad · Votante · Opción · Fecha) para verificabilidad. Si `closed`, encabezado con el resultado: `APROBADA` / `RECHAZADA` / `EMPATADA` / `SIN VOTOS` (con el copy del caso).

- [ ] **Step 4: Compilar y verificar**

Run: `npm --prefix apps/web run build && bash start.sh`. Como propietario: ver la consulta publicada, votar, descargar constancia, ver resultados y (tras el cierre por el admin) ver el resultado final. Expected: sin `NaN%`; el voto de otra unidad no aparece como propio; una consulta en borrador no aparece.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ConsultationsOwnerView.tsx
git commit -m "feat(consultations): vista del propietario (votar, constancia, resultados)"
```

---

## Task 11: Verificación integral de extremo a extremo

**Files:**
- (Sin cambios de producción; verificación.)

- [ ] **Step 1: Preparar datos de prueba**

Asegura servicios: `bash start.sh` (Docker arriba, BD, API `:3001`, web `:3000`). Usa Res Mirador (`1bbf6824-4a3d-4586-9d43-cba4e9cccd19`) y el propietario `arnaldo.martinez@gmail.com` / `secret123`.

- [ ] **Step 2: Ejecutar el flujo completo en navegador (admin y propietario)**

1. Admin: crear consulta con 3 opciones → editar → publicar → ver padrón.
2. Propietario: votar (descargar constancia) → intentar votar de nuevo la misma unidad (debe bloquearse en UI).
3. Admin: cerrar → descargar acta → revisar resultado y tabla de votos.
4. Verificar en BD: `SELECT status,result,winning_option_id FROM consultations WHERE id='...';` y `SELECT COUNT(*) FROM consultation_votes WHERE consultation_id='...';`.

- [ ] **Step 3: Verificar los Review Focus en vivo**

- Doble voto concurrente (dos pestañas/co-propietarios) → 409, una sola fila.
- Voto con `end_date` pasada (editar la fecha en BD a ayer y votar) → 403.
- Unidad no habilitada → 403.
- Empate (crear consulta, votar 1 y 1) → `TIED`, no aprobada, sin `winning_option_id`.
- Sin votos → `NO_VOTES`, sin `NaN`.
- Aislamiento: el propietario no ve `DRAFT` ni consultas de otro condo.

- [ ] **Step 4: Actualizar el estado y commit final (si hubo ajustes)**

Anota los resultados en el mensaje del commit o PR. Si algún paso reveló un defecto, corrígelo en su tarea y re-verifica antes de continuar.

```bash
git add -A
git commit -m "test(consultations): verificación integral de extremo a extremo"
```

---

## Self-Review (hecho al escribir el plan)

- **Cobertura del spec:** alcance «ciclo completo» → Tasks 2–7; padrón/permisos manuales → Task 3; votación por unidad → Task 4; sin quórum / por unidades / empate → Task 5; comprobante + acta → Task 7; UI admin y propietario → Tasks 9–10; verificación → Task 11. Votos públicos → Task 1 (`is_secret_ballot=FALSE`) y `getResults` (Task 5).
- **Consistencia de tipos:** `ConsultationResult` (`APPROVED|TIED|NO_VOTES`) coincide entre `tally.ts`, la columna `consultations.result` y los tipos compartidos; `computeConsultationTally` devuelve `TallyResult` usado por `close` y `getResults`.
- **Review Focus cubiertos:** #1 (Task 4, unicidad + 409), #2 (Task 4, ventana/estado), #3 (Task 4, padrón), #4 (Task 5, empate), #5 (Task 5, sin votos), #6 (Tasks 3 y 10, aislamiento). Todos en el estilo de verificación del repo (no hay framework de tests salvo `node:test` para la lógica pura).
- **Proporción:** el detalle se concentra en las decisiones que el implementador no puede tomar solo (SQL del padrón, transacción de voto, regla de recuento). El resto son firmas y endpoints.
