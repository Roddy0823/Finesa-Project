import { describe, expect, it } from "vitest";
import { puedeAccederRuta } from "@/lib/route-access";
import type { Me } from "@/lib/me";
import type { Permiso } from "@/lib/constantes";

function perfil(rol: "admin" | "auxiliar" | "empleado", permisos: Permiso[] = []): Me {
  return {
    id: "user", email: "test@example.com", nombre: "Test", activo: true,
    roles: [rol], permisos, isAdmin: rol === "admin", isStaff: rol !== "empleado",
    isEmpleado: rol === "empleado", can: (p) => rol === "admin" || permisos.includes(p),
  };
}

describe("rutas protegidas", () => {
  it("limita al empleado al portal y a sus ajustes aunque escriba una URL interna", () => {
    const me = perfil("empleado");
    expect(puedeAccederRuta(me, "/mi-portal/")).toBe(true);
    expect(puedeAccederRuta(me, "/ajustes")).toBe(true);
    for (const path of ["/panel", "/equipos", "/empleados/123", "/actas/123", "/usuarios"]) {
      expect(puedeAccederRuta(me, path)).toBe(false);
    }
  });
  it("exige el permiso de cada módulo al auxiliar", () => {
    const me = perfil("auxiliar", ["reportes_exportar", "actas_devolucion"]);
    expect(puedeAccederRuta(me, "/reportes")).toBe(true);
    expect(puedeAccederRuta(me, "/actas/nueva")).toBe(true);
    expect(puedeAccederRuta(me, "/actas/123")).toBe(true);
    for (const path of ["/actas", "/estadisticas", "/usuarios", "/auditoria", "/carga-masiva"]) {
      expect(puedeAccederRuta(me, path)).toBe(false);
    }
    expect(puedeAccederRuta(me, "/equipos/123")).toBe(true);
  });
  it("bloquea cuentas inactivas y rutas desconocidas incluso para admin", () => {
    const me = perfil("admin");
    expect(puedeAccederRuta(me, "/usuarios")).toBe(true);
    expect(puedeAccederRuta(me, "/modulo-nuevo")).toBe(false);
    expect(puedeAccederRuta({ ...me, activo: false }, "/usuarios")).toBe(false);
  });
});
