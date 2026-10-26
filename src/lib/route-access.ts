import type { Me } from "./me";
import type { Permiso } from "./constantes";

const permisosPorRuta: Record<string, Permiso[]> = {
  "/reabastecimiento": ["reabastecimiento_gestionar"],
  "/proveedores": ["proveedores_editar"],
  "/carga-masiva": ["cargas_masivas"],
  "/actas/nueva": ["actas_entrega", "actas_devolucion"],
  "/actas": ["repositorio_ver"],
  "/estadisticas": ["estadisticas_ver"],
  "/reportes": ["reportes_exportar"],
  "/catalogos": ["catalogos_editar"],
};

// Control de navegación; RLS y las RPC siguen autorizando los datos y acciones.
export function puedeAccederRuta(me: Me, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (!me.activo || (!me.isStaff && !me.isEmpleado)) return false;
  if (path === "/ajustes") return true;
  if (me.isEmpleado) return path === "/mi-portal";
  if (path === "/mi-portal") return false;
  if (path === "/usuarios" || path === "/auditoria") return me.isAdmin;
  const permisos = permisosPorRuta[path];
  if (permisos) return permisos.some((permiso) => me.can(permiso));
  // El detalle de un acta también se usa al crearla o capturar su firma.
  if (/^\/actas\/[^/]+$/.test(path)) {
    return ["repositorio_ver", "actas_entrega", "actas_devolucion", "firmas_capturar"].some(
      (permiso) => me.can(permiso as Permiso),
    );
  }
  return path === "/panel" || /^\/(equipos|empleados)(\/[^/]+)?$/.test(path);
}
