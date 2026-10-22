import { beforeEach, describe, expect, it, vi } from "vitest";
import { passwordEmpleado } from "@/lib/acceso-empleado.server";
import { setRequestHeaders } from "../helpers/request";
import { crearSupabaseMock, filtro, type SupabaseMock } from "../helpers/supabase-mock";

// --- Dependencias de servidor simuladas -------------------------------------
const h = vi.hoisted(() => ({
  admin: null as unknown as { client: Record<string, unknown> },
  anon: null as unknown as { client: Record<string, unknown> },
  portalActivo: true,
  createClientArgs: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy({}, { get: (_t, p) => h.admin.client[p as string] }),
}));
vi.mock("@/lib/configuracion.server", () => ({
  leerPortalEmpleadosActivo: async () => h.portalActivo,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    h.createClientArgs.push(args);
    return h.anon.client;
  },
}));

import * as usuarios from "@/lib/usuarios.functions";

// --- Utilidades ---------------------------------------------------------------
const ADMIN = "a0000000-0000-4000-8000-000000000001";
const AUX = "b0000000-0000-4000-8000-000000000002";
const OTRO_ADMIN = "c0000000-0000-4000-8000-000000000003";
const EMP_ID = "d0000000-0000-4000-8000-000000000004";
const EMP_USER = "e0000000-0000-4000-8000-000000000005";
const CAT_ID = "f0000000-0000-4000-8000-000000000006";

type Fn = (opts: { data?: unknown; context?: unknown }) => Promise<Record<string, unknown>>;
const call = (fn: unknown, data: unknown, context?: unknown) => (fn as Fn)({ data, context });

type Rol = { admin?: boolean; activo?: boolean; ownerId?: string | null; permisos?: string[] };

/** Contexto autenticado (cliente con RLS del usuario) con las RPC de autorización. */
function contexto(userId: string, rol: Rol = {}) {
  const { admin = false, activo = true, ownerId = admin ? userId : null, permisos = [] } = rol;
  const sb = crearSupabaseMock({
    onRpc: (name, args) => {
      const a = args as Record<string, unknown>;
      if (name === "has_role") return { data: a["_role"] === "admin" ? admin : false };
      if (name === "is_active") return { data: activo };
      if (name === "my_owner_id") return { data: ownerId };
      if (name === "has_permiso") return { data: activo && (admin || permisos.includes(a["_p"] as string)) };
      return undefined;
    },
  });
  return { sb, context: { supabase: sb.client, userId } };
}

const adminCtx = () => contexto(ADMIN, { admin: true });

let admin: SupabaseMock;
let anon: SupabaseMock;

beforeEach(() => {
  admin = crearSupabaseMock();
  anon = crearSupabaseMock();
  h.admin = admin as unknown as typeof h.admin;
  h.anon = anon as unknown as typeof h.anon;
  h.portalActivo = true;
  h.createClientArgs = [];
  setRequestHeaders({ "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
});

/** Respuesta de user_roles para un usuario objetivo. */
function rolesObjetivo(roles: { role: string; owner_id: string | null }[]) {
  admin.setOnQuery((q) => {
    if (q.table === "user_roles" && q.op === "select") {
      if (q.single) {
        const r = roles.find((x) => x.role === filtro(q, "role") && x.owner_id === filtro(q, "owner_id"));
        return { data: r ? { id: "rol-1" } : null };
      }
      return { data: roles };
    }
    return undefined;
  });
}

// =============================================================================
describe("usuarios.functions", () => {
  it("todas las funciones protegidas exigen el middleware de autenticación", () => {
    const protegidas = [
      usuarios.crearAuxiliar,
      usuarios.actualizarDatosAuxiliar,
      usuarios.actualizarPermisos,
      usuarios.obtenerPermisosExtraUsuarios,
      usuarios.gestionarCatalogo,
      usuarios.cambiarEstadoUsuario,
      usuarios.cambiarPasswordAuxiliar,
      usuarios.eliminarAuxiliar,
      usuarios.habilitarAccesoEmpleado,
      usuarios.retirarEmpleado,
    ];
    for (const fn of protegidas) {
      expect((fn as unknown as { middlewareList: unknown[] }).middlewareList).toEqual([{ __mock: "requireSupabaseAuth" }]);
    }
    // El ingreso de empleados es público (aún no hay sesión), protegido por rate limit + PIN.
    expect((usuarios.ingresoEmpleado as unknown as { middlewareList: unknown[] }).middlewareList).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  describe("crearAuxiliar", () => {
    const datos = { nombre: "Luis Soporte", email: "Luis@Finesa.com.co", password: "Soporte2026", permisos: ["equipos_editar", "catalogos_editar"] };

    it("rechaza a usuarios que no son Administrador", async () => {
      const { context } = contexto(AUX, { ownerId: ADMIN, permisos: ["empleados_editar"] });
      await expect(call(usuarios.crearAuxiliar, datos, context)).resolves.toEqual({ error: "Solo el Administrador puede realizar esta acción." });
      expect(admin.client.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it("rechaza a un Administrador suspendido", async () => {
      const { context } = contexto(ADMIN, { admin: true, activo: false });
      await expect(call(usuarios.crearAuxiliar, datos, context)).resolves.toHaveProperty("error");
    });

    it("aplica la política de contraseñas", async () => {
      const r = await call(usuarios.crearAuxiliar, { ...datos, password: "soloLetras" }, adminCtx().context);
      expect(r["error"]).toContain("letra y un número");
      expect(admin.client.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it("valida la entrada con zod (permisos desconocidos)", () => {
      expect(() => call(usuarios.crearAuxiliar, { ...datos, permisos: ["admin_total"] }, adminCtx().context)).toThrow();
    });

    it("crea el auxiliar en el ecosistema del admin, nunca con rol admin", async () => {
      const r = await call(usuarios.crearAuxiliar, datos, adminCtx().context);
      const nuevoId = "11111111-1111-4111-8111-111111111111";
      expect(r).toEqual({ id: nuevoId });

      expect(admin.client.auth.admin.createUser).toHaveBeenCalledWith({
        email: "luis@finesa.com.co",
        password: "Soporte2026",
        email_confirm: true,
        user_metadata: { nombre: "Luis Soporte" },
        app_metadata: { permisos_extra: ["catalogos_editar"] },
      });
      expect(admin.find("user_roles", "insert")[0]!.payload).toEqual({ user_id: nuevoId, role: "auxiliar", owner_id: ADMIN });
      expect(admin.find("user_permisos", "insert")[0]!.payload).toEqual([{ user_id: nuevoId, permiso: "equipos_editar" }]);
      expect(admin.auditorias()).toEqual([expect.objectContaining({ user_id: ADMIN, accion: "CREAR_AUXILIAR", registro_id: nuevoId })]);
    });

    it("no inserta user_permisos si solo hay permisos extra", async () => {
      await call(usuarios.crearAuxiliar, { ...datos, permisos: ["estadisticas_ver"] }, adminCtx().context);
      expect(admin.find("user_permisos", "insert")).toHaveLength(0);
    });

    it("traduce el error de correo duplicado", async () => {
      admin.client.auth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "A user with this email address has already been registered" } });
      await expect(call(usuarios.crearAuxiliar, datos, adminCtx().context)).resolves.toEqual({ error: "Ya existe un usuario con ese correo." });
      expect(admin.find("user_roles")).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe("actualizarDatosAuxiliar", () => {
    it("solo edita auxiliares del propio ecosistema", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: OTRO_ADMIN }]);
      const r = await call(usuarios.actualizarDatosAuxiliar, { userId: AUX, nombre: "Nuevo" }, adminCtx().context);
      expect(r).toEqual({ error: "Solo se pueden editar auxiliares de su ecosistema." });
      expect(admin.find("profiles", "update")).toHaveLength(0);
    });

    it("actualiza perfil, metadatos y audita el cambio", async () => {
      admin.setOnQuery((q) => {
        if (q.table === "user_roles") return { data: { id: "rol-1" } };
        if (q.table === "profiles" && q.op === "select") return { data: { nombre: "Viejo" } };
        return undefined;
      });
      await expect(call(usuarios.actualizarDatosAuxiliar, { userId: AUX, nombre: "Nuevo" }, adminCtx().context)).resolves.toEqual({ ok: true });
      expect(admin.find("profiles", "update")[0]!.payload).toEqual({ nombre: "Nuevo" });
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(AUX, { user_metadata: { nombre: "Nuevo" } });
      expect(admin.auditorias()[0]!.detalle).toBe("Nombre de auxiliar actualizado: Viejo → Nuevo");
    });
  });

  // ---------------------------------------------------------------------------
  describe("actualizarPermisos", () => {
    it("rechaza auxiliares de otro ecosistema", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: OTRO_ADMIN }]);
      const r = await call(usuarios.actualizarPermisos, { userId: AUX, permisos: ["equipos_editar"] }, adminCtx().context);
      expect(r).toEqual({ error: "Solo se pueden configurar permisos de auxiliares de su ecosistema." });
      expect(admin.find("user_permisos")).toHaveLength(0);
    });

    it("reemplaza permisos de BD y conserva el resto de app_metadata", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: ADMIN }]);
      admin.client.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { id: AUX, app_metadata: { provider: "email", permisos_extra: ["proveedores_editar"] } } }, error: null });

      const r = await call(usuarios.actualizarPermisos, { userId: AUX, permisos: ["actas_entrega", "firmas_capturar", "catalogos_editar"] }, adminCtx().context);
      expect(r).toEqual({ ok: true });

      const [del] = admin.find("user_permisos", "delete");
      expect(filtro(del!, "user_id")).toBe(AUX);
      expect(admin.find("user_permisos", "insert")[0]!.payload).toEqual([
        { user_id: AUX, permiso: "actas_entrega" },
        { user_id: AUX, permiso: "firmas_capturar" },
      ]);
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(AUX, { app_metadata: { provider: "email", permisos_extra: ["catalogos_editar"] } });
      expect(admin.auditorias()[0]).toMatchObject({ accion: "PERMISOS", registro_id: AUX });
    });

    it("permite dejar al auxiliar sin permisos", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: ADMIN }]);
      await call(usuarios.actualizarPermisos, { userId: AUX, permisos: [] }, adminCtx().context);
      expect(admin.find("user_permisos", "delete")).toHaveLength(1);
      expect(admin.find("user_permisos", "insert")).toHaveLength(0);
      expect(admin.auditorias()[0]!.detalle).toContain("ninguno");
    });
  });

  // ---------------------------------------------------------------------------
  describe("obtenerPermisosExtraUsuarios", () => {
    it("devuelve vacío para no administradores sin consultar auth", async () => {
      const r = await call(usuarios.obtenerPermisosExtraUsuarios, undefined, contexto(AUX, { ownerId: ADMIN }).context);
      expect(r).toEqual({ extras: {} });
      expect(admin.client.auth.admin.getUserById).not.toHaveBeenCalled();
    });

    it("filtra valores no textuales de permisos_extra", async () => {
      admin.setOnQuery((q) => (q.table === "user_roles" ? { data: [{ user_id: AUX }] } : undefined));
      admin.client.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { id: AUX, app_metadata: { permisos_extra: ["catalogos_editar", 42, null] } } }, error: null });
      const r = await call(usuarios.obtenerPermisosExtraUsuarios, undefined, adminCtx().context);
      expect(r).toEqual({ extras: { [AUX]: ["catalogos_editar"] } });
      const [q] = admin.find("user_roles", "select");
      expect(filtro(q!, "owner_id")).toBe(ADMIN);
    });
  });

  // ---------------------------------------------------------------------------
  describe("gestionarCatalogo", () => {
    const crear = { accion: "crear", tipo: "marca", nombre: "Lenovo" };

    it("niega el acceso a cuentas inactivas o sin ecosistema", async () => {
      expect(await call(usuarios.gestionarCatalogo, crear, contexto(ADMIN, { admin: true, activo: false }).context)).toEqual({ error: "Sin acceso." });
      expect(await call(usuarios.gestionarCatalogo, crear, contexto(AUX, { ownerId: null }).context)).toEqual({ error: "Sin acceso." });
    });

    it("niega a auxiliares sin el permiso extra catalogos_editar", async () => {
      const r = await call(usuarios.gestionarCatalogo, crear, contexto(AUX, { ownerId: ADMIN }).context);
      expect(r).toEqual({ error: "No tiene permiso para gestionar catálogos." });
      expect(admin.find("catalogo_items")).toHaveLength(0);
    });

    it("auxiliar con catalogos_editar crea en el ecosistema de su admin", async () => {
      admin.client.auth.admin.getUserById.mockResolvedValueOnce({ data: { user: { id: AUX, app_metadata: { permisos_extra: ["catalogos_editar"] } } }, error: null });
      await expect(call(usuarios.gestionarCatalogo, crear, contexto(AUX, { ownerId: ADMIN }).context)).resolves.toEqual({ ok: true });
      expect(admin.find("catalogo_items", "insert")[0]!.payload).toEqual({ tipo: "marca", nombre: "Lenovo", owner_id: ADMIN });
      expect(admin.auditorias()[0]).toMatchObject({ user_id: AUX, tabla: "catalogo_items", accion: "CREAR" });
    });

    it("limita renombrar/activar/eliminar al ecosistema propio", async () => {
      const ctx = adminCtx().context;
      await call(usuarios.gestionarCatalogo, { accion: "renombrar", id: CAT_ID, nombre: "HP" }, ctx);
      await call(usuarios.gestionarCatalogo, { accion: "toggle", id: CAT_ID, activo: false }, ctx);
      await call(usuarios.gestionarCatalogo, { accion: "eliminar", id: CAT_ID }, ctx);
      const qs = admin.find("catalogo_items");
      expect(qs.map((q) => q.op)).toEqual(["update", "update", "delete"]);
      for (const q of qs) {
        expect(filtro(q, "id")).toBe(CAT_ID);
        expect(filtro(q, "owner_id")).toBe(ADMIN);
      }
      expect(admin.auditorias().map((a) => a.accion)).toEqual(["RENOMBRAR", "DESACTIVAR", "ELIMINAR"]);
    });

    it("traduce duplicados (23505) y elementos en uso (23503)", async () => {
      admin.setOnQuery((q) => (q.op === "insert" && q.table === "catalogo_items" ? { error: { message: "dup", code: "23505" } } : q.op === "delete" ? { error: { message: "fk", code: "23503" } } : undefined));
      const ctx = adminCtx().context;
      expect(await call(usuarios.gestionarCatalogo, crear, ctx)).toEqual({ error: "Ya existe ese nombre." });
      expect(await call(usuarios.gestionarCatalogo, { accion: "eliminar", id: CAT_ID }, ctx)).toEqual({ error: "Este ítem está en uso. Solo puede desactivarlo." });
      expect(admin.auditorias()).toHaveLength(0);
    });

    it("rechaza tipos de catálogo no permitidos", () => {
      expect(() => call(usuarios.gestionarCatalogo, { accion: "crear", tipo: "rol", nombre: "x" }, adminCtx().context)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  describe("cambiarEstadoUsuario", () => {
    it("impide suspender la propia cuenta", async () => {
      expect(await call(usuarios.cambiarEstadoUsuario, { userId: ADMIN, activo: false }, adminCtx().context)).toEqual({ error: "No puede suspender su propia cuenta." });
    });

    it("impide gestionar cuentas de Administrador desde la app", async () => {
      rolesObjetivo([{ role: "admin", owner_id: null }]);
      const r = await call(usuarios.cambiarEstadoUsuario, { userId: OTRO_ADMIN, activo: false }, adminCtx().context);
      expect(r).toEqual({ error: "Las cuentas de Administrador solo se gestionan en la base de datos." });
      expect(admin.client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("impide gestionar auxiliares de otro ecosistema", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: OTRO_ADMIN }]);
      expect(await call(usuarios.cambiarEstadoUsuario, { userId: AUX, activo: false }, adminCtx().context)).toEqual({ error: "No tiene autorización sobre este usuario." });
    });

    it.each([
      [false, "876000h", "SUSPENDER"],
      [true, "none", "REACTIVAR"],
    ])("activo=%s aplica ban_duration=%s y audita %s", async (activo, ban, accion) => {
      rolesObjetivo([{ role: "auxiliar", owner_id: ADMIN }]);
      expect(await call(usuarios.cambiarEstadoUsuario, { userId: AUX, activo }, adminCtx().context)).toEqual({ ok: true });
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(AUX, { ban_duration: ban });
      expect(admin.find("profiles", "update")[0]!.payload).toEqual({ activo });
      expect(admin.auditorias()[0]!.accion).toBe(accion);
    });
  });

  // ---------------------------------------------------------------------------
  describe("cambiarPasswordAuxiliar", () => {
    it("rechaza objetivos que también son admin", async () => {
      rolesObjetivo([
        { role: "auxiliar", owner_id: ADMIN },
        { role: "admin", owner_id: null },
      ]);
      const r = await call(usuarios.cambiarPasswordAuxiliar, { userId: AUX, password: "Nueva2026!" }, adminCtx().context);
      expect(r).toEqual({ error: "Solo se puede cambiar la contraseña de auxiliares de su ecosistema." });
      expect(admin.client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("cambia la contraseña de un auxiliar propio y audita sin registrar la clave", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: ADMIN }]);
      expect(await call(usuarios.cambiarPasswordAuxiliar, { userId: AUX, password: "Nueva2026!" }, adminCtx().context)).toEqual({ ok: true });
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(AUX, { password: "Nueva2026!" });
      expect(JSON.stringify(admin.auditorias())).not.toContain("Nueva2026!");
    });
  });

  // ---------------------------------------------------------------------------
  describe("eliminarAuxiliar", () => {
    it("impide eliminar la propia cuenta", async () => {
      expect(await call(usuarios.eliminarAuxiliar, { userId: ADMIN }, adminCtx().context)).toEqual({ error: "No puede eliminar su propia cuenta." });
    });

    it("impide eliminar auxiliares ajenos", async () => {
      rolesObjetivo([{ role: "auxiliar", owner_id: OTRO_ADMIN }]);
      expect(await call(usuarios.eliminarAuxiliar, { userId: AUX }, adminCtx().context)).toHaveProperty("error");
      expect(admin.client.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("audita ANTES de borrar y limpia permisos, roles, perfil y usuario", async () => {
      admin.setOnQuery((q) => {
        if (q.table === "user_roles" && q.op === "select") return { data: [{ role: "auxiliar", owner_id: ADMIN }] };
        if (q.table === "profiles" && q.op === "select") return { data: { email: "aux@finesa.com.co", nombre: "Aux" } };
        return undefined;
      });
      expect(await call(usuarios.eliminarAuxiliar, { userId: AUX }, adminCtx().context)).toEqual({ ok: true });
      const orden = admin.queries.filter((q) => q.op !== "select").map((q) => `${q.op}:${q.table}`);
      expect(orden).toEqual(["insert:auditoria", "delete:user_permisos", "delete:user_roles", "delete:profiles"]);
      expect(admin.client.auth.admin.deleteUser).toHaveBeenCalledWith(AUX);
    });
  });

  // ---------------------------------------------------------------------------
  describe("habilitarAccesoEmpleado", () => {
    const empleado = { id: EMP_ID, nombre: "Ana Pérez", identificacion: "1.234.567", activo: true, user_id: null as string | null };

    function conEmpleado(emp: typeof empleado | null, permisos = ["empleados_editar"]) {
      const c = contexto(AUX, { ownerId: ADMIN, permisos });
      c.sb.setOnQuery((q) => (q.table === "empleados" ? { data: emp } : undefined));
      return c.context;
    }

    it("exige el permiso empleados_editar", async () => {
      expect(await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado(empleado, []))).toEqual({ error: "No tiene permiso para habilitar accesos." });
    });

    it("rechaza empleados inexistentes (o fuera del ecosistema por RLS) e inactivos", async () => {
      expect(await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado(null))).toEqual({ error: "Empleado no encontrado" });
      expect(await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado({ ...empleado, activo: false }))).toEqual({ error: "El empleado está inactivo." });
    });

    it("crea la cuenta con correo interno + HMAC del PIN y devuelve un PIN de 4 dígitos", async () => {
      const r = await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado(empleado));
      expect(r["cedula"]).toBe("1234567");
      expect(r["pin"]).toMatch(/^\d{4}$/);

      const [args] = admin.client.auth.admin.createUser.mock.calls[0]!;
      expect(args).toMatchObject({ email: "1234567@empleados.finesa.local", email_confirm: true, password: passwordEmpleado("1234567", r["pin"] as string) });

      const nuevo = "11111111-1111-4111-8111-111111111111";
      expect(admin.find("user_roles", "upsert")[0]!.payload).toEqual({ user_id: nuevo, role: "empleado" });
      expect(admin.find("empleados", "update")[0]!.payload).toEqual({ user_id: nuevo, pin_intentos: 0, pin_bloqueo_hasta: null });
      // El PIN nunca se escribe en la auditoría.
      expect(admin.auditorias()[0]!.detalle).not.toContain(r["pin"] as string);
    });

    it("no reutiliza cuentas de Administrador o Auxiliar", async () => {
      admin.setOnQuery((q) => (q.table === "user_roles" ? { data: [{ role: "auxiliar" }] } : undefined));
      const r = await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado({ ...empleado, user_id: EMP_USER }));
      expect(r).toEqual({ error: "Este empleado está vinculado a una cuenta de Administrador o Auxiliar." });
      expect(admin.client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("regenera el PIN de una cuenta de empleado existente y levanta el baneo", async () => {
      admin.setOnQuery((q) => (q.table === "user_roles" ? { data: [{ role: "empleado" }] } : undefined));
      const r = await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado({ ...empleado, user_id: EMP_USER }));
      expect(admin.client.auth.admin.createUser).not.toHaveBeenCalled();
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(EMP_USER, expect.objectContaining({ ban_duration: "none", password: passwordEmpleado("1234567", r["pin"] as string) }));
    });

    it("impide vincular una cédula que ya pertenece a otro empleado", async () => {
      admin.client.auth.admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "User already registered" } });
      admin.setOnQuery((q) => {
        if (q.table === "profiles" && q.op === "select") return { data: { id: EMP_USER } };
        if (q.table === "empleados" && q.op === "select") return { data: { id: "otro-empleado" } };
        return undefined;
      });
      expect(await call(usuarios.habilitarAccesoEmpleado, { empleadoId: EMP_ID }, conEmpleado(empleado))).toEqual({ error: "Esa cédula ya está vinculada a otro empleado." });
    });
  });

  // ---------------------------------------------------------------------------
  describe("ingresoEmpleado", () => {
    const empRow = { id: EMP_ID, identificacion: "1.234.567", activo: true, user_id: EMP_USER, pin_intentos: 0, pin_bloqueo_hasta: null as string | null };

    function conEmpleados(lista: (typeof empRow)[]) {
      admin.setOnQuery((q) => (q.table === "empleados" && q.op === "select" ? { data: lista } : undefined));
    }

    function loginOk() {
      anon.client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: { access_token: "at", refresh_token: "rt" } }, error: null });
    }

    it("valida formato: PIN de exactamente 4 dígitos", () => {
      expect(() => call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "12a4" })).toThrow();
      expect(() => call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "12345" })).toThrow();
    });

    it("se bloquea si el portal de empleados está deshabilitado", async () => {
      h.portalActivo = false;
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" })).toEqual({ error: "El portal de empleados se encuentra deshabilitado." });
      expect(admin.find("empleados")).toHaveLength(0);
    });

    it("responde con un mensaje genérico si la cédula no existe (evita enumeración)", async () => {
      conEmpleados([{ ...empRow, identificacion: "9991234567" }]);
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" })).toEqual({ error: "Cédula o PIN incorrectos." });
      const [q] = admin.find("empleados", "select");
      expect(filtro(q!, "identificacion", "ilike")).toBe("%4567%");
      expect(anon.client.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("rechaza empleados inactivos y bloqueados", async () => {
      conEmpleados([{ ...empRow, activo: false }]);
      expect((await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" }))["error"]).toContain("suspendido");

      conEmpleados([{ ...empRow, pin_bloqueo_hasta: new Date(Date.now() + 60_000).toISOString() }]);
      expect((await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" }))["error"]).toContain("15 minutos");
      expect(anon.client.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    it("autentica con el correo interno y el HMAC del PIN, y reinicia intentos", async () => {
      conEmpleados([{ ...empRow, pin_intentos: 2 }]);
      loginOk();
      const r = await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "4321" });
      expect(r).toEqual({ access_token: "at", refresh_token: "rt" });
      expect(anon.client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "1234567@empleados.finesa.local", password: passwordEmpleado("1234567", "4321") });
      expect(h.createClientArgs[0]!.slice(0, 2)).toEqual(["http://supabase.test", "anon-test-key"]);
      expect(admin.find("empleados", "update")[0]!.payload).toEqual({ pin_intentos: 0 });
      expect(admin.auditorias()[0]).toMatchObject({ user_id: EMP_USER, accion: "LOGIN" });
    });

    it("un bloqueo vencido no impide el ingreso", async () => {
      conEmpleados([{ ...empRow, pin_bloqueo_hasta: new Date(Date.now() - 1_000).toISOString() }]);
      loginOk();
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "4321" })).toHaveProperty("access_token");
    });

    it("incrementa el contador de intentos en cada PIN fallido", async () => {
      conEmpleados([{ ...empRow, pin_intentos: 3 }]);
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "0000" })).toEqual({ error: "Cédula o PIN incorrectos." });
      expect(admin.find("empleados", "update")[0]!.payload).toEqual({ pin_intentos: 4 });
      expect(admin.auditorias()).toHaveLength(0);
    });

    it("al 5.º fallo bloquea 15 minutos y lo audita", async () => {
      conEmpleados([{ ...empRow, pin_intentos: 4 }]);
      const antes = Date.now();
      await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "0000" });
      const upd = admin.find("empleados", "update")[0]!.payload as { pin_intentos: number; pin_bloqueo_hasta: string };
      expect(upd.pin_intentos).toBe(0);
      const hasta = new Date(upd.pin_bloqueo_hasta).getTime();
      expect(hasta - antes).toBeGreaterThanOrEqual(15 * 60_000 - 1_000);
      expect(hasta - antes).toBeLessThanOrEqual(15 * 60_000 + 5_000);
      expect(admin.auditorias()[0]).toMatchObject({ accion: "PIN_BLOQUEADO", registro_id: EMP_ID });
    });

    it("informa cuenta suspendida si Supabase Auth la tiene baneada", async () => {
      conEmpleados([empRow]);
      anon.client.auth.signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: "User is banned" } });
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" })).toEqual({ error: "Su acceso está suspendido." });
    });

    it("limita a 10 intentos por IP cada 5 minutos", async () => {
      setRequestHeaders({ "cf-connecting-ip": "203.0.113.77" });
      conEmpleados([]);
      for (let i = 0; i < 10; i++) {
        expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" })).toEqual({ error: "Cédula o PIN incorrectos." });
      }
      const r = await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" });
      expect(r["error"]).toContain("Demasiados intentos desde esta dirección");
      // Otra IP no se ve afectada.
      setRequestHeaders({ "cf-connecting-ip": "203.0.113.78" });
      expect(await call(usuarios.ingresoEmpleado, { cedula: "1234567", pin: "1234" })).toEqual({ error: "Cédula o PIN incorrectos." });
    });
  });

  // ---------------------------------------------------------------------------
  describe("retirarEmpleado", () => {
    function ctxRetiro(res: { data?: unknown; error?: { message: string } | null }) {
      const c = contexto(AUX, { ownerId: ADMIN, permisos: ["empleados_editar"] });
      c.sb.setOnQuery((q) => (q.table === "empleados" && q.op === "update" ? res : undefined));
      return c;
    }

    it("usa el cliente del usuario (RLS + trigger de paz y salvo)", async () => {
      const c = ctxRetiro({ data: { id: EMP_ID, user_id: null } });
      expect(await call(usuarios.retirarEmpleado, { empleadoId: EMP_ID }, c.context)).toEqual({ ok: true });
      expect(c.sb.find("empleados", "update")[0]!.payload).toEqual({ activo: false });
      expect(admin.find("empleados")).toHaveLength(0);
    });

    it("propaga el bloqueo de paz y salvo de la base de datos", async () => {
      const c = ctxRetiro({ error: { message: "PAZ_Y_SALVO: El empleado tiene equipos asignados." } });
      expect(await call(usuarios.retirarEmpleado, { empleadoId: EMP_ID }, c.context)).toEqual({ error: "PAZ_Y_SALVO: El empleado tiene equipos asignados." });
      expect(admin.client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("sin fila actualizada (RLS) informa falta de permiso", async () => {
      const c = ctxRetiro({ data: null });
      expect(await call(usuarios.retirarEmpleado, { empleadoId: EMP_ID }, c.context)).toEqual({ error: "No tiene permiso para retirar empleados." });
    });

    it("suspende el acceso al portal si el empleado tenía cuenta", async () => {
      const c = ctxRetiro({ data: { id: EMP_ID, user_id: EMP_USER } });
      await call(usuarios.retirarEmpleado, { empleadoId: EMP_ID }, c.context);
      expect(admin.client.auth.admin.updateUserById).toHaveBeenCalledWith(EMP_USER, { ban_duration: "876000h" });
      expect(admin.find("profiles", "update")[0]!.payload).toEqual({ activo: false });
      expect(admin.auditorias()[0]).toMatchObject({ accion: "SUSPENDER_ACCESO", user_id: AUX });
    });
  });
});
