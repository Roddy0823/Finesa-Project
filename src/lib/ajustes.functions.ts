import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientIp, registrarAuditoria } from "./firmas.server";
import { checkRateLimit, validarPngBase64, validarPoliticaPassword } from "./security.server";

type Ctx = {
  supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>;
  userId: string;
};

async function esStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_staff", { _user_id: ctx.userId });
  return !!data;
}
const NO_STAFF = { error: "Solo administradores y auxiliares pueden usar los ajustes." };

const credencialesSchema = z.object({
  email: z.string().trim().email().max(200).optional(),
  passwordActual: z.string().min(1, "Debe ingresar su contraseña actual.").max(128),
});

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

/**
 * Reautentica al usuario en el servidor validando sus credenciales actuales
 * contra Supabase Auth antes de autorizar cualquier cambio sensible de perfil,
 * firma digital o contraseña.
 */
async function verificarCredencialesUsuario(
  userId: string,
  credenciales: z.infer<typeof credencialesSchema>,
  accionDetalle: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const ip = clientIp();
  const rl = checkRateLimit(`reauth:${userId}:${ip}`, 6, 5 * 60_000);
  if (!rl.allowed) {
    return {
      ok: false,
      error: `Demasiados intentos fallidos de verificación. Intente nuevamente en ${Math.ceil(rl.retryAfterSec / 60)} min.`,
    };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  const emailReal = u?.user?.email?.trim().toLowerCase();
  if (uErr || !emailReal) {
    return { ok: false, error: "No se pudo validar la identidad de la cuenta activa." };
  }

  if (credenciales.email && credenciales.email.trim().toLowerCase() !== emailReal) {
    await registrarAuditoria(
      supabaseAdmin,
      userId,
      "sesion",
      "REAUTH_FALLIDA",
      userId,
      `Verificación fallida (${accionDetalle}): correo no coincide con la sesión activa`,
    );
    return { ok: false, error: "El correo electrónico no coincide con el de su cuenta activa." };
  }

  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { ok: false, error: "Configuración de autenticación no disponible en el servidor." };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const ephemeral = createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: createSupabaseFetch(SUPABASE_KEY) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data: signData, error: signErr } = await ephemeral.auth.signInWithPassword({
    email: emailReal,
    password: credenciales.passwordActual,
  });

  if (signErr || !signData?.user || signData.user.id !== userId) {
    await registrarAuditoria(
      supabaseAdmin,
      userId,
      "sesion",
      "REAUTH_FALLIDA",
      userId,
      `Contraseña incorrecta al confirmar: ${accionDetalle}`,
    );
    return {
      ok: false,
      error: "Credenciales incorrectas. Verifique su contraseña actual e intente nuevamente.",
    };
  }

  // Cerrar únicamente el token efímero generado en el servidor sin afectar la sesión del navegador
  await ephemeral.auth.signOut({ scope: "local" }).catch(() => {});

  return { ok: true, email: emailReal };
}

function validarNombrePerfil(raw: string): { ok: true; nombre: string } | { ok: false; error: string } {
  const limpio = raw.trim().replace(/\s+/g, " ");
  if (limpio.length < 3) {
    return { ok: false, error: "El nombre debe tener al menos 3 caracteres." };
  }
  if (limpio.length > 120) {
    return { ok: false, error: "El nombre no puede superar los 120 caracteres." };
  }
  if (!/^[\p{L}\s.'-]+$/u.test(limpio)) {
    return {
      ok: false,
      error: "El nombre solo puede contener letras, espacios, puntos o guiones.",
    };
  }
  return { ok: true, nombre: limpio };
}

export const actualizarNombre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        nombre: z.string().trim().min(2).max(120),
        credenciales: credencialesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const valNombre = validarNombrePerfil(data.nombre);
    if (!valNombre.ok) return { error: valNombre.error };

    const verif = await verificarCredencialesUsuario(context.userId, data.credenciales, "Cambiar nombre de perfil");
    if (!verif.ok) return { error: verif.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin.from("profiles").select("nombre").eq("id", context.userId).maybeSingle();
    if ((prev?.nombre ?? "").trim() === valNombre.nombre) {
      return { error: "El nuevo nombre es idéntico al nombre actual." };
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ nombre: valNombre.nombre })
      .eq("id", context.userId);
    if (error) return { error: error.message };

    await supabaseAdmin.auth.admin
      .updateUserById(context.userId, { user_metadata: { nombre: valNombre.nombre } })
      .catch(() => {});

    await registrarAuditoria(
      supabaseAdmin,
      context.userId,
      "profiles",
      "CAMBIAR_NOMBRE",
      context.userId,
      `Nombre actualizado (con verificación de credenciales): ${prev?.nombre ?? ""} → ${valNombre.nombre}`,
    );
    return { ok: true };
  });

export const obtenerMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await esStaff(context))) return { url: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("firma_path").eq("id", context.userId).maybeSingle();
    if (!p?.firma_path) return { url: null as string | null };
    const { data: s } = await supabaseAdmin.storage.from("actas").createSignedUrl(p.firma_path, 300);
    return { url: s?.signedUrl ?? null };
  });

export const guardarMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        firma: z.string().max(3_000_000),
        credenciales: credencialesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const pngCheck = validarPngBase64(data.firma);
    if (!pngCheck.ok) return { error: pngCheck.error };

    const verif = await verificarCredencialesUsuario(
      context.userId,
      data.credenciales,
      "Registrar o actualizar firma digital",
    );
    if (!verif.ok) return { error: verif.error };

    const bytes = pngCheck.bytes;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin.from("profiles").select("firma_path").eq("id", context.userId).maybeSingle();
    const path = `firmas-usuarios/${context.userId}-${Date.now()}.png`;
    const up = await supabaseAdmin.storage.from("actas").upload(path, bytes, { contentType: "image/png" });
    if (up.error) return { error: "No se pudo guardar la firma: " + up.error.message };
    await supabaseAdmin.from("profiles").update({ firma_path: path }).eq("id", context.userId);
    if (prev?.firma_path && prev.firma_path.startsWith(`firmas-usuarios/${context.userId}`)) {
      await supabaseAdmin.storage.from("actas").remove([prev.firma_path]);
    }
    await registrarAuditoria(
      supabaseAdmin,
      context.userId,
      "profiles",
      "REGISTRAR_FIRMA",
      context.userId,
      "Firma digital del usuario registrada/actualizada (con verificación de credenciales)",
    );
    return { ok: true };
  });

export const borrarMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        credenciales: credencialesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const verif = await verificarCredencialesUsuario(
      context.userId,
      data.credenciales,
      "Eliminar firma digital",
    );
    if (!verif.ok) return { error: verif.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin.from("profiles").select("firma_path").eq("id", context.userId).maybeSingle();
    await supabaseAdmin.from("profiles").update({ firma_path: null }).eq("id", context.userId);
    if (prev?.firma_path && prev.firma_path.startsWith(`firmas-usuarios/${context.userId}`)) {
      await supabaseAdmin.storage.from("actas").remove([prev.firma_path]);
    }
    await registrarAuditoria(
      supabaseAdmin,
      context.userId,
      "profiles",
      "BORRAR_FIRMA",
      context.userId,
      "Firma digital del usuario eliminada (con verificación de credenciales)",
    );
    return { ok: true };
  });

export const cambiarMiPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        password: z.string().min(8).max(72),
        credenciales: credencialesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const pwdErr = validarPoliticaPassword(data.password);
    if (pwdErr) return { error: pwdErr };
    if (data.password === data.credenciales.passwordActual) {
      return { error: "La nueva contraseña debe ser diferente a su contraseña actual." };
    }

    const verif = await verificarCredencialesUsuario(
      context.userId,
      data.credenciales,
      "Cambiar contraseña de acceso",
    );
    if (!verif.ok) return { error: verif.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
    if (error) return { error: error.message };
    await registrarAuditoria(
      supabaseAdmin,
      context.userId,
      "sesion",
      "CAMBIO_CLAVE",
      context.userId,
      "Contraseña actualizada desde Configuración de seguridad (con verificación de credenciales)",
    );
    return { ok: true };
  });

/** Copia la firma registrada del técnico al acta recién creada (queda fija aunque luego cambie). */
export const adjuntarFirmaTecnico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: acta } = await supabaseAdmin.from("actas").select("id, tecnico_id, estado").eq("id", data.actaId).maybeSingle();
    if (!acta || acta.tecnico_id !== context.userId || acta.estado !== "pendiente") return { ok: false };
    const { data: p } = await supabaseAdmin.from("profiles").select("firma_path").eq("id", context.userId).maybeSingle();
    if (!p?.firma_path) return { ok: false };
    const dest = `${acta.id}/tecnico.png`;
    const { error } = await supabaseAdmin.storage.from("actas").copy(p.firma_path, dest);
    if (error) return { ok: false };
    await supabaseAdmin.from("actas").update({ tecnico_firma_path: dest }).eq("id", acta.id);
    return { ok: true };
  });

export const obtenerConfigPortal = createServerFn({ method: "GET" })
  .handler(async () => {
    const { leerPortalEmpleadosActivo } = await import("./configuracion.server");
    const portalEmpleadosActivo = await leerPortalEmpleadosActivo();
    return { portalEmpleadosActivo };
  });

export const configurarPortalEmpleados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ activo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: admin }, { data: activo }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("is_active", { _user_id: context.userId }),
    ]);
    if (!admin || !activo) {
      return { error: "Solo el Administrador puede cambiar esta configuración." };
    }
    const { guardarPortalEmpleadosActivo } = await import("./configuracion.server");
    return guardarPortalEmpleadosActivo(context.userId, data.activo);
  });
