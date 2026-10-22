import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actaDTO, cargarActaCompleta, clientIp, ejecutarFirma, registrarAuditoria } from "./firmas.server";
import { checkRateLimit } from "./security.server";

const firmaSchema = z.string().max(3_000_000).startsWith("data:image/png;base64,");

async function validarToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("tokens_firma").select("*").eq("token", token).maybeSingle();
  if (!data) return { admin: supabaseAdmin, error: "El enlace no es válido." as const };
  if (data.used_at) return { admin: supabaseAdmin, error: "Este enlace ya fue utilizado." as const };
  if (new Date(data.expires_at).getTime() < Date.now()) return { admin: supabaseAdmin, error: "El enlace expiró (vigencia de 48 horas)." as const };
  return { admin: supabaseAdmin, tk: data };
}

export const crearEnlaceFirma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_permiso", { _user_id: context.userId, _p: "firmas_capturar" });
    if (!ok) throw new Error("No tiene permiso para generar enlaces de firma.");
    const { data: acta } = await context.supabase.from("actas").select("id, estado").eq("id", data.actaId).maybeSingle();
    if (!acta || acta.estado !== "pendiente") throw new Error("El acta no está pendiente de firma.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("tokens_firma").update({ used_at: new Date().toISOString() }).eq("acta_id", data.actaId).is("used_at", null);
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("tokens_firma").insert({ acta_id: data.actaId, token, expires_at: expires, created_by: context.userId });
    if (error) throw new Error(error.message);
    await registrarAuditoria(supabaseAdmin, context.userId, "tokens_firma", "ENLACE", data.actaId, "Enlace de firma remota generado (48 h)");
    return { token, expires };
  });

export const obtenerActaPorToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const rl = checkRateLimit(`ver-token:${clientIp()}`, 25, 5 * 60_000);
    if (!rl.allowed) return { error: "Demasiadas solicitudes. Intente nuevamente en unos minutos.", acta: null };
    const v = await validarToken(data.token);
    if ("error" in v && v.error) return { error: v.error, acta: null };
    const c = await cargarActaCompleta(v.admin, v.tk!.acta_id);
    if (c.acta.estado !== "pendiente") return { error: "Esta acta ya no está pendiente de firma.", acta: null };
    return { error: null, acta: actaDTO(c) };
  });

export const firmarConToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), firma: firmaSchema, ip: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const rl = checkRateLimit(`firmar-token:${clientIp()}`, 10, 5 * 60_000);
    if (!rl.allowed) throw new Error("Demasiados intentos de firma desde esta conexión. Espere unos minutos.");
    const v = await validarToken(data.token);
    if ("error" in v && v.error) throw new Error(v.error);
    // Marcar como usado primero (un solo uso, evita dobles envíos)
    const { data: upd } = await v.admin.from("tokens_firma").update({ used_at: new Date().toISOString() }).eq("id", v.tk!.id).is("used_at", null).select("id");
    if (!upd?.length) throw new Error("Este enlace ya fue utilizado.");
    return ejecutarFirma(v.admin, { actaId: v.tk!.acta_id, firmaDataUrl: data.firma, medio: "enlace remoto", actorId: null, ipCliente: data.ip });
  });

export const firmarPresencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actaId: z.string().uuid(), firma: firmaSchema, ip: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("has_permiso", { _user_id: context.userId, _p: "firmas_capturar" });
    if (!ok) throw new Error("No tiene permiso para capturar firmas.");
    // Verificar visibilidad en el ecosistema del usuario mediante RLS antes de usar cliente admin
    const { data: actaVisible } = await context.supabase
      .from("actas")
      .select("id, estado")
      .eq("id", data.actaId)
      .maybeSingle();
    if (!actaVisible || actaVisible.estado !== "pendiente") {
      throw new Error("El acta no está pendiente de firma o no pertenece a su ecosistema.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("tokens_firma").update({ used_at: new Date().toISOString() }).eq("acta_id", data.actaId).is("used_at", null);
    return ejecutarFirma(supabaseAdmin, { actaId: data.actaId, firmaDataUrl: data.firma, medio: "presencial", actorId: context.userId, ipCliente: data.ip });
  });

export const firmarComoEmpleado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actaId: z.string().uuid(), firma: firmaSchema, ip: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = await cargarActaCompleta(supabaseAdmin, data.actaId);
    const emp = c.acta.empleado as unknown as { user_id: string | null } | null;
    if (!emp || emp.user_id !== context.userId) throw new Error("Esta acta no le pertenece.");
    await supabaseAdmin.from("tokens_firma").update({ used_at: new Date().toISOString() }).eq("acta_id", data.actaId).is("used_at", null);
    return ejecutarFirma(supabaseAdmin, { actaId: data.actaId, firmaDataUrl: data.firma, medio: "portal del empleado", actorId: context.userId, ipCliente: data.ip });
  });

export const urlArchivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ actaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS confirma que el usuario puede ver el acta (personal o el propio empleado)
    const { data: acta } = await context.supabase.from("actas").select("id, pdf_path").eq("id", data.actaId).maybeSingle();
    if (!acta?.pdf_path) throw new Error("El acta no tiene PDF disponible.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s, error } = await supabaseAdmin.storage.from("actas").createSignedUrl(acta.pdf_path, 300);
    if (error) throw new Error(error.message);
    return { url: s.signedUrl };
  });
