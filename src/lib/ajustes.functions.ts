import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { registrarAuditoria } from "./firmas.server";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };

async function esStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("is_staff", { _user_id: ctx.userId });
  return !!data;
}
const NO_STAFF = { error: "Solo administradores y auxiliares pueden usar los ajustes." };

export const actualizarNombre = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ nombre: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prev } = await supabaseAdmin.from("profiles").select("nombre").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin.from("profiles").update({ nombre: data.nombre }).eq("id", context.userId);
    if (error) return { error: error.message };
    await registrarAuditoria(supabaseAdmin, context.userId, "profiles", "CAMBIAR_NOMBRE", context.userId, `Nombre: ${prev?.nombre ?? ""} → ${data.nombre}`);
    return { ok: true };
  });

export const obtenerMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("firma_path").eq("id", context.userId).maybeSingle();
    if (!p?.firma_path) return { url: null as string | null };
    const { data: s } = await supabaseAdmin.storage.from("actas").createSignedUrl(p.firma_path, 300);
    return { url: s?.signedUrl ?? null };
  });

export const guardarMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ firma: z.string().max(3_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await esStaff(context))) return NO_STAFF;
    const m = /^data:image\/png;base64,(.+)$/.exec(data.firma);
    if (!m) return { error: "Firma inválida" };
    const bytes = Uint8Array.from(atob(m[1]!), (c) => c.charCodeAt(0));
    if (bytes.length < 500) return { error: "La firma está vacía" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `firmas-usuarios/${context.userId}-${Date.now()}.png`;
    const up = await supabaseAdmin.storage.from("actas").upload(path, bytes, { contentType: "image/png" });
    if (up.error) return { error: "No se pudo guardar la firma: " + up.error.message };
    await supabaseAdmin.from("profiles").update({ firma_path: path }).eq("id", context.userId);
    await registrarAuditoria(supabaseAdmin, context.userId, "profiles", "REGISTRAR_FIRMA", context.userId, "Firma del usuario registrada/actualizada");
    return { ok: true };
  });

export const borrarMiFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles").update({ firma_path: null }).eq("id", context.userId);
    await registrarAuditoria(supabaseAdmin, context.userId, "profiles", "BORRAR_FIRMA", context.userId, "Firma del usuario eliminada");
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
