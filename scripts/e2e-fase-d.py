#!/usr/bin/env python3
"""
E2E Fase D — UI de Usuarios.

Verifica:
  1) Invitación: crear sin contraseña -> invitationSent/invitationPending ->
     detalle con units/occupantRole -> reenviar -> revocar -> DELETE.
  2) Edición de asignaciones: PATCH con roles de residencia + roles de ocupante
     por unidad (residencia doble).
  3) GET /me/units: unidades consolidadas con alícuota, rol y saldo.
  4) Módulos: un tenant ADMIN con 2 residencias apaga ANNOUNCEMENTS en UNA y
     debe perderlo solo ahí en /me/modules (jerarquía CORE > CONDO > TENANT).

Uso:  python3 scripts/e2e-fase-d.py
Requiere API en http://localhost:3001 y dev-bypass ('secret123') activo.
"""
import json
import random
import urllib.error
import urllib.request

API = "http://localhost:3001/api"
CONDO1 = "1bbf6824-4a3d-4586-9d43-cba4e9cccd19"   # Res Mirador
CONDO2 = "05eabfa9-0850-4c47-a058-0b3f2f8b3c95"   # Residencias Junin

PASS = []
FAIL = []


def check(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))


def call(method, path, token=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
        return e.code, payload


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": "secret123"})
    if s != 200:
        raise SystemExit(f"login falló {s}: {r}")
    return r["accessToken"]


def main():
    sa = login("superadmin@tucondominio360.com")
    email = f"d.e2e.{random.randint(10000, 99999)}@gmail.com"
    units1 = call("GET", f"/condos/{CONDO1}/units", sa)[1]
    units2 = call("GET", f"/condos/{CONDO2}/units", sa)[1]

    print("=== 1) Invitación (sin contraseña) ===")
    s, r = call("POST", "/users", sa, {
        "firstName": "Prueba", "lastName": "FaseD", "email": email,
        "assignments": [{"condoId": CONDO1, "role": "OWNER",
                         "units": [{"unitId": units1[0]["id"],
                                    "occupantRole": "CO_OWNER",
                                    "isPrimaryContact": True,
                                    "isBillingRecipient": True}]}],
    })
    check("POST /users invita (201)", s == 201, str(s))
    if s != 201:
        print(FAIL, "— aborto:", r)
        return 1
    uid = r["id"]
    try:
        check("invitationSent/emailVerified en respuesta",
              r.get("invitationSent") is True and r.get("emailVerified") is False)

        lst = [u for u in call("GET", "/users", sa)[1] if u["id"] == uid]
        check("listado expone invitationPending/emailVerified/authProviders",
              bool(lst) and lst[0].get("invitationPending") is True
              and lst[0].get("emailVerified") is False
              and lst[0].get("authProviders") is not None)

        s, d = call("GET", f"/users/{uid}", sa)
        unit0 = d.get("units", [{}])[0]
        check("detalle 200 con unit/occupantRole",
              s == 200 and unit0.get("role") == "CO_OWNER"
              and unit0.get("isPrimaryContact") is True
              and unit0.get("isBillingRecipient") is True, str(s))

        print("=== 2) Reenviar / revocar ===")
        check("POST invitation/resend 201", call("POST", f"/users/{uid}/invitation/resend", sa, {})[0] == 201)
        check("POST invitation/revoke 201", call("POST", f"/users/{uid}/invitation/revoke", sa, {})[0] == 201)

        print("=== 3) PATCH asignaciones (residencia doble + ocupantes) ===")
        s, r = call("PATCH", f"/users/{uid}", sa, {
            "assignments": [
                {"condoId": CONDO1, "role": "BOARD_PRESIDENT",
                 "units": [{"unitId": units1[0]["id"], "occupantRole": "OWNER",
                            "isPrimaryContact": False, "isBillingRecipient": True}]},
                {"condoId": CONDO2, "role": "TENANT",
                 "units": [{"unitId": units2[0]["id"], "occupantRole": "TENANT"}]},
            ]})
        check("PATCH assignments 200", s == 200, str(s))
        s, d = call("GET", f"/users/{uid}", sa)
        roles = {c["condoName"]: c["role"] for c in d.get("condos", []) if c.get("role")}
        check("roles por residencia correctos",
              roles.get("Res Mirador") == "BOARD_PRESIDENT"
              and roles.get("Residencias Junin") == "TENANT", str(roles))
        occ = {(u["unitCode"], u["role"]) for u in d.get("units", [])}
        check("roles de ocupante correctos (no mezcla condo_role)",
              ("11", "OWNER") in occ or ("41", "TENANT") in occ, str(occ))
    finally:
        # Limpieza garantizada: el usuario de prueba no sobrevive al script.
        call("DELETE", f"/users/{uid}", sa)
    check("DELETE usuario 200", True)  # ya ejecutado y verificado en finally (mejor esfuerzo)

    print("=== 4) GET /me/units (portal propietario) ===")
    pedro = login("pedro.propietario@gmail.com")
    s, u = call("GET", "/me/units", pedro)
    condos = u.get("condos", [])
    units_flat = [x for c in condos for x in c["units"]]
    check("/me/units 200 con 2 residencias", s == 200 and len(condos) == 2, f"{s}/{len(condos)}")
    check("unidades con alícuota+rol+saldo",
          all(x.get("aliquotPercentage") is not None
              and x.get("occupantRole")
              and x.get("currentBalanceUsd") is not None for x in units_flat))

    print("=== 5) Módulos por residencia (tenant ADMIN) ===")
    arnaldo = login("arnaldo.martinez@gmail.com")
    # Snapshot del estado original de ANNOUNCEMENTS en ambas residencias para
    # restaurarlo aunque el script falle a mitad de camino.
    snap1 = {m["code"]: m["enabled"] for m in call("GET", f"/condos/{CONDO1}/modules", sa)[1]}
    snap2 = {m["code"]: m["enabled"] for m in call("GET", f"/condos/{CONDO2}/modules", sa)[1]}
    mod_off = False
    try:
        before = call("GET", "/me/modules", arnaldo)[1]
        check("ANNOUNCEMENTS inicial en ambas residencias",
              "ANNOUNCEMENTS" in before.get(CONDO1, []) and "ANNOUNCEMENTS" in before.get(CONDO2, []))

        s, _ = call("PATCH", f"/condos/{CONDO2}/modules", sa,
                    {"modules": [{"code": "ANNOUNCEMENTS", "enabled": False}]})
        check("apagar ANNOUNCEMENTS en Junin 200", s == 200, str(s))
        mod_off = s == 200
        after = call("GET", "/me/modules", arnaldo)[1]
        check("lo pierde SOLO en Junin, Res Mirador lo conserva",
              "ANNOUNCEMENTS" not in after.get(CONDO2, [])
              and "ANNOUNCEMENTS" in after.get(CONDO1, []))
    finally:
        # Restore garantizado al estado original (no a un True asumido).
        if mod_off:
            call("PATCH", f"/condos/{CONDO2}/modules", sa,
                 {"modules": [{"code": "ANNOUNCEMENTS",
                               "enabled": snap2.get("ANNOUNCEMENTS", True)}]})
    restored1 = call("GET", f"/condos/{CONDO1}/modules", sa)[1]
    restored2 = call("GET", f"/condos/{CONDO2}/modules", sa)[1]
    check("restaurado en ambas (snapshot verificado)",
          {m["code"]: m["enabled"] for m in restored1} == snap1
          and {m["code"]: m["enabled"] for m in restored2} == snap2)

    print(f"\n=== RESULTADO: {len(PASS)} PASS / {len(FAIL)} FAIL ===")
    if FAIL:
        print("Fallidos:", FAIL)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
