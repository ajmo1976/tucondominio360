# Dashboard General: contadores de Inmuebles Morosos y al Día — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar en el **Dashboard General** (vista de administración) dos contadores: cuántos inmuebles están **morosos** y cuántos están **al día**, con su porcentaje sobre el total.

**Architecture:** El Dashboard General se alimenta de `GET /api/condos/:id/summary` → `CondosService.getFinancialSummary()`. Añadimos dos agregados al `overview` existente (mismo query, sin endpoint nuevo) y renderizamos dos tarjetas KPI nuevas en `DashboardView.tsx`. No se toca la base de datos (no hay migración): se agrega sobre `property_units.current_balance_usd`.

**Tech Stack:** NestJS + `pg` (backend), Next.js + React + Tailwind (frontend). Monorepo `apps/api`, `apps/web`.

**Spec:** Requerimiento del usuario (2026-10-15) + decisiones confirmadas:
- Dashboard objetivo: **Dashboard General** (administración), `DashboardView.tsx`.
- Definición de **moroso**: inmueble con `property_units.current_balance_usd > 0`.
- Presentación: **dos contadores** ("Inmuebles Morosos" y "Inmuebles al Día") con número y % del total.

## Global Constraints

- **Este proyecto NO tiene framework de tests** (ni Jest ni Vitest; `find` no encuentra `*.spec.ts` ni config de test). Por eso cada task se verifica con **SQL (psql) + API (curl) + navegador**, no con tests unitarios. No instalar un framework de tests para esta feature.
- **Definición de moroso:** `current_balance_usd > 0`. **Al día:** `current_balance_usd <= 0`. Son mutuamente excluyentes y exhaustivos (`morosos + al_dia == total_units`). `current_balance_usd` lo mantiene `syncUnitBalances()` (billing) y la verificación de pagos; está redondeado a 2 decimales y clampado a `>= 0`.
- **Solo unidades activas:** el filtro es `condo_id = $1 AND is_active = TRUE` (igual que hoy). Las inactivas no cuentan como morosas ni al día.
- **Nombres de campo del contrato API (snake_case, dentro de `overview`, junto a `total_units`):**
  - `units_in_arrears` (number, inmuebles morosos)
  - `units_up_to_date` (number, inmuebles al día)
- **Rebuild obligatorio:** la API corre desde `dist/main.js` y la web desde `next start`; tras editar hay que `npm run build` en cada app y reiniciar.
- Arranque/parada oficial: `bash start.sh` / `bash stop.sh` (exige Docker arriba).
- Condominio de verificación (Res Mirador): id `1bbf6824-4a3d-4586-9d43-cba4e9cccd19`.
- Credenciales de verificación: `superadmin@tucondominio360.com` / `secret123`.

## Review Focus

Comportamientos que la spec implica y que un usuario notaría si están mal (cada uno se cubre con un paso de verificación en la task dueña del código):

1. **Residencia con 0 inmuebles activos:** los % deben ser `0.0%`, nunca `NaN%`. (Task 2, guarda `totalUnits > 0`.)
2. **Inmueble con saldo negativo (acreditado/manual):** cuenta como **al día**, no como moroso. (Task 1, filtros `> 0` / `<= 0`.)
3. **Inmuebles inactivos:** no deben sumar a ninguno de los dos contadores. (Task 1, `is_active = TRUE`.)
4. **Backend no recompilado:** si la web pide los campos y la API vieja no los envía, las tarjetas deben mostrar `0` en vez de `NaN` (coerción con `Number(... || 0)` y fallback). (Task 2.)
5. **Consistencia interna:** `units_in_arrears + units_up_to_date == total_units` para la misma residencia. (Task 1, consulta SQL de control.)

---

### Task 1: Backend — exponer `units_in_arrears` y `units_up_to_date` en el summary

**Files:**
- Modify: `apps/api/src/modules/condos/condos.service.ts:344-354` (query del método `getFinancialSummary`).
- Rebuild: `apps/api` (`npm run build`) → reinicio de la API.
- Verify (no test file): psql + curl.

**Interfaces:**
- Consumes: tabla `property_units` (`condo_id`, `is_active`, `current_balance_usd`), ya usada por el query existente.
- Produces: `GET /api/condos/:id/summary` → response `{ overview: { total_units, total_aliquots, total_debt_usd, total_credit_balance_usd, units_in_arrears, units_up_to_date }, latestBillingPeriod }`. **Los dos campos nuevos viajan dentro de `overview`** porque el método retorna `stats.rows[0]` completo; no hay que tocar el `return { overview: ... }` ni el controller.

- [ ] **Step 1: Ampliar el query de `getFinancialSummary`**

En `apps/api/src/modules/condos/condos.service.ts`, dentro de `getFinancialSummary`, añadir dos columnas al `SELECT` que hoy calcula `total_units`, justo después de la línea `COUNT(pu.id)::int as total_units,`. El query queda así:

```sql
SELECT 
  COUNT(pu.id)::int as total_units,
  COUNT(*) FILTER (WHERE pu.current_balance_usd > 0)::int as units_in_arrears,
  COUNT(*) FILTER (WHERE pu.current_balance_usd <= 0)::int as units_up_to_date,
  COALESCE(SUM(pu.aliquot_percentage), 0)::numeric(8,5) as total_aliquots,
  COALESCE(SUM(CASE WHEN pu.current_balance_usd > 0 THEN pu.current_balance_usd ELSE 0 END), 0)::numeric(14,2) as total_debt_usd,
  COALESCE(SUM(CASE WHEN pu.current_balance_usd < 0 THEN ABS(pu.current_balance_usd) ELSE 0 END), 0)::numeric(14,2) as total_credit_balance_usd
 FROM property_units pu
 WHERE pu.condo_id = $1 AND pu.is_active = TRUE
```

(No cambiar la firma del método ni el objeto de retorno.)

- [ ] **Step 2: Verificar la lógica de conteo directamente en la base de datos**

Run:
```bash
docker exec tucondominio360_postgres psql -U postgres -d tucondominio360 -c \
"SELECT COUNT(*) FILTER (WHERE current_balance_usd > 0) AS morosos,
        COUNT(*) FILTER (WHERE current_balance_usd <= 0) AS al_dia,
        COUNT(*) AS total
 FROM property_units
 WHERE condo_id='1bbf6824-4a3d-4586-9d43-cba4e9cccd19' AND is_active = TRUE;"
```
Expected: `morosos + al_dia = total` (consistencia interna). Anota los tres números: serán los esperados en la verificación de la API.

- [ ] **Step 3: Compilar y reiniciar la API**

Run:
```bash
cd "Proyectos/tucondominio360/apps/api" && npm run build
cd "Proyectos/tucondominio360" && bash start.sh
```
Expected: `Backend API (3001): HTTP 200 ✔ OK`. Si `npm run build` falla por TypeScript, corregir y repetir.

- [ ] **Step 4: Verificar el contrato de la API con curl**

Run (obtiene token y consulta el summary):
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@tucondominio360.com","password":"secret123"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).access_token||JSON.parse(d).token))')

curl -s http://localhost:3001/api/condos/1bbf6824-4a3d-4586-9d43-cba4e9cccd19/summary \
  -H "Authorization: Bearer $TOKEN" \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const o=JSON.parse(d).overview;console.log(o);console.log("check:",o.units_in_arrears+o.units_up_to_date===o.total_units)})'
```
Expected: el objeto `overview` incluye `units_in_arrears` y `units_up_to_date` con los mismos números del Step 2, y `check: true`.

- [ ] **Step 5: Commit**

```bash
cd "Proyectos/tucondominio360"
git add apps/api/src/modules/condos/condos.service.ts
git commit -m "feat(condos): exponer inmuebles morosos y al día en el resumen financiero"
```

---

### Task 2: Frontend — dos tarjetas KPI (Morosos / Al Día) en el Dashboard General

**Files:**
- Modify: `apps/web/src/components/DashboardView.tsx` (imports lucide; derivados tras la línea 97; grid de KPIs línea 120; tarjetas nuevas antes de la tarjeta "Fondo de Reserva", que empieza en la línea 170).
- Rebuild: `apps/web` (`npm run build`) → reinicio (o `bash start.sh`).
- Verify (no test file): navegador.

**Interfaces:**
- Consumes: `summary.overview.units_in_arrears`, `summary.overview.units_up_to_date`, `summary.overview.total_units` (Task 1) y `totalUnits` (ya existe en la línea 93).
- Produces: dos tarjetas KPI visibles en el Dashboard General; sin cambios de props (`DashboardViewProps` no cambia).

- [ ] **Step 1: Añadir los iconos a los imports de lucide**

En `apps/web/src/components/DashboardView.tsx`, en el bloque `import { ... } from 'lucide-react';` (líneas 4-15), añadir `AlertTriangle` y `BadgeCheck`. El bloque queda:

```tsx
import {
  TrendingUp,
  CheckCircle2,
  Building,
  PiggyBank,
  Smartphone,
  CreditCard,
  Plus,
  Landmark,
  Edit,
  Trash2,
  AlertTriangle,
  BadgeCheck,
} from 'lucide-react';
```

- [ ] **Step 2: Derivar los contadores y sus porcentajes**

Justo después de la línea `const totalDebtUsd = Number(summary?.overview?.total_debt_usd || 0);` (línea 97), añadir:

```tsx
  // Estado de los inmuebles: moroso = saldo pendiente > 0 (misma convención que
  // el total de deuda y que el Dashboard de la Comunidad). Ambos contadores son
  // mutuamente excluyentes y suman totalUnits.
  const unitsInArrears = Number(summary?.overview?.units_in_arrears ?? 0);
  const unitsUpToDate = Number(summary?.overview?.units_up_to_date ?? Math.max(0, totalUnits - unitsInArrears));
  const arrearsPct = totalUnits > 0 ? (unitsInArrears / totalUnits) * 100 : 0;
  const upToDatePct = totalUnits > 0 ? (unitsUpToDate / totalUnits) * 100 : 0;
```

- [ ] **Step 3: Pasar la grilla de KPIs de 4 a 3 columnas**

En la línea 120, cambiar:
```tsx
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
```
por:
```tsx
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```
Quedan 6 tarjetas (Facturación, Morosidad Total, Catastro, Morosos, Al Día, Fondo de Reserva) en una grilla 3×2 equilibrada.

- [ ] **Step 4: Insertar las dos tarjetas nuevas**

Dentro de la grilla de KPIs, insertar **después** de la tarjeta "Catastro Inmuebles" (que cierra en la línea 168, con `</div>` tras el bloque de `totalAliquots`) y **antes** de la tarjeta "Fondo de Reserva" (que empieza en la línea 170), este bloque:

```tsx
        {/* Inmuebles Morosos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Inmuebles Morosos</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{unitsInArrears}</div>
          <div className="text-xs font-medium text-rose-600 mt-1">
            <span>{arrearsPct.toFixed(1)}% del total de inmuebles</span>
          </div>
        </div>

        {/* Inmuebles al Día */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Inmuebles al Día</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <BadgeCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{unitsUpToDate}</div>
          <div className="text-xs font-medium text-emerald-600 mt-1">
            <span>{upToDatePct.toFixed(1)}% del total de inmuebles</span>
          </div>
        </div>
```

- [ ] **Step 5: Compilar y reiniciar la web**

Run:
```bash
cd "Proyectos/tucondominio360/apps/web" && npm run build
cd "Proyectos/tucondominio360" && bash start.sh
```
Expected: `Frontend Web (3000): HTTP 200 ✔ OK`.

- [ ] **Step 6: Verificar en el navegador**

Abrir `http://localhost:3000`, iniciar sesión con `superadmin@tucondominio360.com` / `secret123`, seleccionar **Res Mirador** y entrar a **Dashboard General**. Expected:
- Aparecen las tarjetas **"Inmuebles Morosos"** y **"Inmuebles al Día"** con sus números.
- Los números coinciden con el Step 2 de la Task 1 y con el `overview` del curl: `morosos` en la tarjeta roja, `al_dia` en la verde.
- Los porcentajes son coherentes y **no** muestran `NaN%`.

- [ ] **Step 7: Commit**

```bash
cd "Proyectos/tucondominio360"
git add apps/web/src/components/DashboardView.tsx
git commit -m "feat(dashboard): contadores de inmuebles morosos y al día"
```

---

## Self-Review

- **Spec coverage:** (a) Dashboard General → Task 2; (b) moroso = saldo > 0 → Task 1 Steps 1-2; (c) dos contadores Morosos/Al Día → Task 2 Step 4; (d) cantidad + % → Task 2 Step 4. Cubierto.
- **Review Focus coverage:** item 1 (0 inmuebles → 0.0%) Task 2 Step 2; item 2 (saldo negativo → al día) Task 1 Step 1/2; item 3 (inactivos) Task 1 Step 1/2; item 4 (API vieja → 0, no NaN) Task 2 Step 2; item 5 (suma == total) Task 1 Step 2/4.
- **Type consistency:** `units_in_arrears` / `units_up_to_date` idénticos en backend (Task 1) y frontend (Task 2). `totalUnits`, `totalDebtUsd` ya existían.
- **Proportion:** 2 tasks, cambios acotados; no incluye migración de BD ni endpoint nuevo.
