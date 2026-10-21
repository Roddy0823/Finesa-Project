import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { registrarAuditoria } from "./firmas.server";

const PERMISOS_DB = [
  "equipos_editar",
  "empleados_editar",
  "cargas_masivas",
  "actas_entrega",
  "actas_devolucion",
  "firmas_capturar",
  "repositorio_ver",
  "reportes_exportar",
] as const;

const PERMISOS_EXTRA = [
  "reabastecimiento_gestionar",
  "proveedores_editar",
  "estadisticas_ver",
  "catalogos_editar",
] as const;

const PERMISOS = [...PERMISOS_DB, ...PERMISOS_EXTRA] as const;
type PermisoDB = (typeof PERMISOS_DB)[number];
const SET_PERMISOS_DB = new Set<string>(PERMISOS_DB);

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };

async function esAdmin(ctx: Ctx) {
  const [{ data: admin }, { data: activo }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("is_active", { _user_id: ctx.userId }),
  ]);
  return !!admin && !!activo;
}
const NO_ADMIN = { error: "Solo el Administrador puede realizar esta acción." };


function passwordTemporal() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) + "!9a";
}

export const crearAuxiliar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      nombre: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(200),
      password: z.string().min(8).max(72),
      permisos: z.array(z.enum(PERMISOS)),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await esAdmin(context))) return NO_ADMIN;
    const permisosDb = data.permisos.filter((p): p is PermisoDB => SET_PERMISOS_DB.has(p));
    const permisosExtra = data.permisos.filter((p) => !SET_PERMISOS_DB.has(p));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { nombre: data.nombre },
      app_metadata: { permisos_extra: permisosExtra },
    });
    if (error || !u.user) return { error: error?.message.includes("already") ? "Ya existe un usuario con ese correo." : error?.message ?? "No se pudo crear el usuario." };
    const id = u.user.id;
    await supabaseAdmin.from("profiles").upsert({ id, email: data.email.toLowerCase(), nombre: data.nombre, activo: true });
    await supabaseAdmin.from("user_roles").insert({ user_id: id, role: "auxiliar", owner_id: context.userId });
    if (permisosDb.length) await supabaseAdmin.from("user_permisos").insert(permisosDb.map((p) => ({ user_id: id, permiso: p })));
    await registrarAuditoria(supabaseAdmin, context.userId, "usuarios", "CREAR_AUXILIAR", id, `Auxiliar ${data.email} creado con permisos: ${data.permisos.join(", ") || "ninguno"}`);
    return { id };
  });

export const actualizarPermisos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), permisos: z.array(z.enum(PERMISOS)) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esAdmin(context))) return NO_ADMIN;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: esAux } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.userId).eq("role", "auxiliar").maybeSingle();
    if (!esAux) return { error: "Solo se pueden configurar permisos de auxiliares." };
    const permisosDb = data.permisos.filter((p): p is PermisoDB => SET_PERMISOS_DB.has(p));
    const permisosExtra = data.permisos.filter((p) => !SET_PERMISOS_DB.has(p));
    await supabaseAdmin.from("user_permisos").delete().eq("user_id", data.userId);
    if (permisosDb.length) await supabaseAdmin.from("user_permisos").insert(permisosDb.map((p) => ({ user_id: data.userId, permiso: p })));
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    const prevMeta = (u?.user?.app_metadata ?? {}) as Record<string, unknown>;
    await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      app_metadata: { ...prevMeta, permisos_extra: permisosExtra },
    });
    await registrarAuditoria(supabaseAdmin, context.userId, "usuarios", "PERMISOS", data.userId, `Permisos actualizados: ${data.permisos.join(", ") || "ninguno"}`);
    return { ok: true };
  });

export const obtenerPermisosExtraUsuarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await esAdmin(context))) return { extras: {} as Record<string, string[]> };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "auxiliar")
      .eq("owner_id", context.userId);
    const extras: Record<string, string[]> = {};
    for (const r of roles ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      const arr = (u?.user?.app_metadata as { permisos_extra?: unknown } | undefined)?.permisos_extra;
      if (Array.isArray(arr)) {
        extras[r.user_id] = arr.filter((x): x is string => typeof x === "string");
      }
    }
    return { extras };
  });

export const gestionarCatalogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.discriminatedUnion("accion", [
      z.object({
        accion: z.literal("crear"),
        tipo: z.enum(["marca", "tipo_equipo", "sede", "area", "empresa"]),
        nombre: z.string().trim().min(1).max(100),
      }),
      z.object({
        accion: z.literal("renombrar"),
        id: z.string().uuid(),
        nombre: z.string().trim().min(1).max(100),
      }),
      z.object({
        accion: z.literal("toggle"),
        id: z.string().uuid(),
        activo: z.boolean(),
      }),
      z.object({
        accion: z.literal("eliminar"),
        id: z.string().uuid(),
      }),
    ]).parse(d),
  )
  .handler(async ({ data, context }) => {
    const [{ data: admin }, { data: activo }, { data: ownerId }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("is_active", { _user_id: context.userId }),
      context.supabase.rpc("my_owner_id"),
    ]);
    if (!activo || !ownerId) return { error: "Sin acceso." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!admin) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const extras = (u?.user?.app_metadata as { permisos_extra?: unknown } | undefined)?.permisos_extra;
      const tienePermiso = Array.isArray(extras) && extras.includes("catalogos_editar");
      if (!tienePermiso) return { error: "No tiene permiso para gestionar catálogos." };
    }
    if (data.accion === "crear") {
      const { error } = await supabaseAdmin.from("catalogo_items").insert({
        tipo: data.tipo,
        nombre: data.nombre,
        owner_id: ownerId,
      });
      if (error) return { error: error.code === "23505" ? "Ya existe ese nombre." : error.message };
      await registrarAuditoria(supabaseAdmin, context.userId, "catalogo_items", "CREAR", null, `${data.tipo}: ${data.nombre}`);
      return { ok: true };
    }
    if (data.accion === "renombrar") {
      const { error } = await supabaseAdmin.from("catalogo_items").update({ nombre: data.nombre }).eq("id", data.id).eq("owner_id", ownerId);
      if (error) return { error: error.code === "23505" ? "Ya existe ese nombre." : error.message };
      await registrarAuditoria(supabaseAdmin, context.userId, "catalogo_items", "RENOMBRAR", data.id, `Nuevo nombre: ${data.nombre}`);
      return { ok: true };
    }
    if (data.accion === "toggle") {
      const { error } = await supabaseAdmin.from("catalogo_items").update({ activo: data.activo }).eq("id", data.id).eq("owner_id", ownerId);
      if (error) return { error: error.message };
      await registrarAuditoria(supabaseAdmin, context.userId, "catalogo_items", data.activo ? "ACTIVAR" : "DESACTIVAR", data.id, data.activo ? "Ítem de catálogo activado" : "Ítem de catálogo desactivado");
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("catalogo_items").delete().eq("id", data.id).eq("owner_id", ownerId);
    if (error) return { error: error.code === "23503" ? "Este ítem está en uso. Solo puede desactivarlo." : error.message };
    await registrarAuditoria(supabaseAdmin, context.userId, "catalogo_items", "ELIMINAR", data.id, "Ítem de catálogo eliminado");
    return { ok: true };
  });

export const cambiarEstadoUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esAdmin(context))) return NO_ADMIN;
    if (data.userId === context.userId) return { error: "No puede suspender su propia cuenta." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: esAdm } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.userId).eq("role", "admin").maybeSingle();
    if (esAdm) return { error: "Las cuentas de Administrador solo se gestionan en la base de datos." };
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.activo ? "none" : "876000h" });
    await supabaseAdmin.from("profiles").update({ activo: data.activo }).eq("id", data.userId);
    await registrarAuditoria(supabaseAdmin, context.userId, "usuarios", data.activo ? "REACTIVAR" : "SUSPENDER", data.userId, data.activo ? "Cuenta reactivada" : "Cuenta suspendida");
    return { ok: true };
  });

export const cambiarPasswordAuxiliar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esAdmin(context))) return NO_ADMIN;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (!roles?.some((r) => r.role === "auxiliar") || roles.some((r) => r.role === "admin"))
      return { error: "Solo se puede cambiar la contraseña de auxiliares." };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) return { error: error.message };
    await registrarAuditoria(supabaseAdmin, context.userId, "usuarios", "CAMBIAR_CONTRASEÑA", data.userId, "Contraseña del auxiliar cambiada por el Administrador");
    return { ok: true };
  });

export const eliminarAuxiliar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esAdmin(context))) return NO_ADMIN;
    if (data.userId === context.userId) return { error: "No puede eliminar su propia cuenta." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId);
    if (!roles?.some((r) => r.role === "auxiliar") || roles.some((r) => r.role === "admin"))
      return { error: "Solo se pueden eliminar cuentas de auxiliares." };
    const { data: p } = await supabaseAdmin.from("profiles").select("email, nombre").eq("id", data.userId).maybeSingle();
    await registrarAuditoria(supabaseAdmin, context.userId, "usuarios", "ELIMINAR_AUXILIAR", data.userId, `Cuenta de auxiliar eliminada: ${p?.email ?? data.userId} (${p?.nombre ?? "sin nombre"})`);
    await supabaseAdmin.from("user_permisos").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) return { error: error.message };
    return { ok: true };
  });


export const habilitarAccesoEmpleado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ empleadoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_permiso", { _user_id: context.userId, _p: "empleados_editar" });
    if (!ok) return { error: "No tiene permiso para habilitar accesos." };
    const { data: emp } = await context.supabase.from("empleados").select("*").eq("id", data.empleadoId).maybeSingle();
    if (!emp) return { error: "Empleado no encontrado" };
    if (!emp.activo) return { error: "El empleado está inactivo." };
    const { emailEmpleado, passwordEmpleado, generarPin, normalizarCedula } = await import("./acceso-empleado.server");
    const cedula = normalizarCedula(emp.identificacion);
    if (!cedula) return { error: "El empleado no tiene número de cédula válido." };
    const email = emailEmpleado(cedula);
    const pin = generarPin();
    const password = passwordEmpleado(cedula, pin);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId = emp.user_id;
    if (userId) {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
      if (roles?.some((r) => r.role !== "empleado")) return { error: "Este empleado está vinculado a una cuenta de Administrador o Auxiliar." };
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email, password, email_confirm: true, ban_duration: "none" });
      if (error) return { error: error.message };
    } else {
      const { data: u, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre: emp.nombre } });
      if (u?.user) userId = u.user.id;
      else if (error?.message.toLowerCase().includes("already")) {
        const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
        if (!prof) return { error: "Ya existe una cuenta con esa cédula." };
        const { data: otro } = await supabaseAdmin.from("empleados").select("id").eq("user_id", prof.id).neq("id", emp.id).maybeSingle();
        if (otro) return { error: "Esa cédula ya está vinculada a otro empleado." };
        userId = prof.id;
        await supabaseAdmin.auth.admin.updateUserById(userId, { password, ban_duration: "none" });
      } else return { error: error?.message ?? "No se pudo crear la cuenta." };
      await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "empleado" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    }
    await supabaseAdmin.from("profiles").upsert({ id: userId, email, nombre: emp.nombre, activo: true });
    await supabaseAdmin.from("empleados").update({ user_id: userId, pin_intentos: 0, pin_bloqueo_hasta: null }).eq("id", emp.id);
    await registrarAuditoria(supabaseAdmin, context.userId, "empleados", "HABILITAR_ACCESO", emp.id, `PIN de acceso al portal generado para la cédula ${cedula}`);
    return { cedula, pin };
  });

export const ingresoEmpleado = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ cedula: z.string().trim().min(3).max(30), pin: z.string().regex(/^\d{4}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { leerPortalEmpleadosActivo } = await import("./configuracion.server");
    if (!(await leerPortalEmpleadosActivo())) {
      return { error: "El portal de empleados se encuentra deshabilitado." };
    }
    const generico = { error: "Cédula o PIN incorrectos." };
    const { emailEmpleado, passwordEmpleado, normalizarCedula } = await import("./acceso-empleado.server");
    const cedula = normalizarCedula(data.cedula);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lista } = await supabaseAdmin.from("empleados").select("id, identificacion, activo, user_id, pin_intentos, pin_bloqueo_hasta").not("user_id", "is", null).ilike("identificacion", `%${cedula.slice(-4)}%`);
    const emp = (lista ?? []).find((e) => normalizarCedula(e.identificacion) === cedula);
    if (!emp || !emp.user_id) return generico;
    if (!emp.activo) return { error: "Su acceso está suspendido. Comuníquese con la mesa de ayuda." };
    if (emp.pin_bloqueo_hasta && new Date(emp.pin_bloqueo_hasta) > new Date()) return { error: "Demasiados intentos fallidos. Intente de nuevo en 15 minutos." };
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env["SUPABASE_URL"]!, (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"])!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: s, error } = await anon.auth.signInWithPassword({ email: emailEmpleado(cedula), password: passwordEmpleado(cedula, data.pin) });
    if (error || !s.session) {
      const n = emp.pin_intentos + 1;
      await supabaseAdmin.from("empleados").update(n >= 5 ? { pin_intentos: 0, pin_bloqueo_hasta: new Date(Date.now() + 15 * 60_000).toISOString() } : { pin_intentos: n }).eq("id", emp.id);
      if (n >= 5) await registrarAuditoria(supabaseAdmin, emp.user_id, "sesion", "PIN_BLOQUEADO", emp.id, "Acceso bloqueado 15 min por 5 intentos fallidos");
      return error?.message.includes("banned") ? { error: "Su acceso está suspendido." } : generico;
    }
    if (emp.pin_intentos) await supabaseAdmin.from("empleados").update({ pin_intentos: 0 }).eq("id", emp.id);
    await registrarAuditoria(supabaseAdmin, emp.user_id, "sesion", "LOGIN", emp.id, "Ingreso al portal con cédula y PIN");
    return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });

export const retirarEmpleado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ empleadoId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // La actualización con el cliente del usuario aplica RLS y la regla de paz y salvo
    const { data: emp, error } = await context.supabase.from("empleados").update({ activo: false }).eq("id", data.empleadoId).select("id, user_id").maybeSingle();
    if (error) return { error: error.message };
    if (!emp) return { error: "No tiene permiso para retirar empleados." };
    if (emp.user_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.updateUserById(emp.user_id, { ban_duration: "876000h" });
      await supabaseAdmin.from("profiles").update({ activo: false }).eq("id", emp.user_id);
      await registrarAuditoria(supabaseAdmin, context.userId, "empleados", "SUSPENDER_ACCESO", emp.id, "Acceso al portal suspendido por retiro");
    }
    return { ok: true };
  });
