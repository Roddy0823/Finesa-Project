import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { registrarAuditoria } from "./firmas.server";

let cachePortalActivo: { valor: boolean; exp: number } | null = null;

/**
 * Obtiene si el portal de empleados está habilitado en el login.
 * Se persiste en `app_metadata.portal_empleados_activo` de la cuenta administradora
 * para no requerir migraciones adicionales y mantener la seguridad en servidor.
 */
export async function leerPortalEmpleadosActivo(): Promise<boolean> {
  if (cachePortalActivo && cachePortalActivo.exp > Date.now()) {
    return cachePortalActivo.valor;
  }
  try {
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (!adminRole?.user_id) {
      return true;
    }

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(adminRole.user_id);
    const meta = (u?.user?.app_metadata ?? {}) as Record<string, unknown>;
    const valor = meta["portal_empleados_activo"] !== false;
    cachePortalActivo = { valor, exp: Date.now() + 15_000 };
    return valor;
  } catch {
    return cachePortalActivo?.valor ?? true;
  }
}

export async function guardarPortalEmpleadosActivo(adminUserId: string, activo: boolean) {
  const { data: u, error: getErr } = await supabaseAdmin.auth.admin.getUserById(adminUserId);
  if (getErr || !u?.user) {
    return { error: getErr?.message ?? "No se encontró el usuario administrador." };
  }

  const prevMeta = (u.user.app_metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(adminUserId, {
    app_metadata: { ...prevMeta, portal_empleados_activo: activo },
  });

  if (error) {
    return { error: error.message };
  }

  cachePortalActivo = { valor: activo, exp: Date.now() + 15_000 };

  await registrarAuditoria(
    supabaseAdmin,
    adminUserId,
    "configuracion",
    activo ? "HABILITAR_PORTAL_EMPLEADOS" : "DESHABILITAR_PORTAL_EMPLEADOS",
    adminUserId,
    activo
      ? "Portal de empleados habilitado en la pantalla de inicio de sesión"
      : "Portal de empleados oculto y deshabilitado en el inicio de sesión (solo Mesa de servicios)",
  );

  return { ok: true as const, portalEmpleadosActivo: activo };
}
