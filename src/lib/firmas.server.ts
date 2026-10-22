import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { validarPngBase64 } from "./security.server";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export function clientIp() {
  const cf = getRequestHeader("cf-connecting-ip");
  const xff = getRequestHeader("x-forwarded-for");
  return cf || (xff ? xff.split(",")[0]!.trim() : "") || getRequestHeader("x-real-ip") || "desconocida";
}

let serverEgressIpCache: { ip: string; timestamp: number } | null = null;

async function obtenerIpSalidaServidor(): Promise<string | null> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return null;
  }
  const ahora = Date.now();
  if (serverEgressIpCache && ahora - serverEgressIpCache.timestamp < 10 * 60_000) {
    return serverEgressIpCache.ip;
  }
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data?.ip) {
        serverEgressIpCache = { ip: data.ip, timestamp: ahora };
        return data.ip;
      }
    }
  } catch {
    /* fallback si no hay salida a internet o falla la resolución */
  }
  return null;
}

function esIpLocalOInvalida(ip?: string | null): boolean {
  if (!ip) return true;
  const normalizada = ip.trim().toLowerCase();
  return (
    normalizada === "" ||
    normalizada === "desconocida" ||
    normalizada === "127.0.0.1" ||
    normalizada === "::1" ||
    normalizada === "localhost" ||
    normalizada === "::ffff:127.0.0.1"
  );
}

export async function resolverIpFirma(opts?: { ipCliente?: string | null | undefined }): Promise<string> {
  // 1. Cabeceras directas de proxy estándar
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf && !esIpLocalOInvalida(cf)) return cf.trim();

  const xff = getRequestHeader("x-forwarded-for");
  if (xff) {
    const primera = xff.split(",")[0]?.trim();
    if (primera && !esIpLocalOInvalida(primera)) return primera;
  }

  const real = getRequestHeader("x-real-ip");
  if (real && !esIpLocalOInvalida(real)) return real.trim();

  const trueClient = getRequestHeader("true-client-ip") || getRequestHeader("x-client-ip");
  if (trueClient && !esIpLocalOInvalida(trueClient)) return trueClient.trim();

  // 2. IP del socket / conexión HTTP de TanStack Start
  try {
    const socketIp = typeof getRequestIP === "function" ? getRequestIP({ xForwardedFor: true }) : undefined;
    if (socketIp) {
      const limpia = socketIp.replace(/^::ffff:/, "").trim();
      if (!esIpLocalOInvalida(limpia)) return limpia;
    }
  } catch {
    /* getRequestIP no disponible o no aplicable */
  }

  // 3. IP reportada por el navegador del cliente (detectada vía detectarIpNavegador)
  if (opts?.ipCliente && !esIpLocalOInvalida(opts.ipCliente)) {
    return opts.ipCliente.trim();
  }

  // 4. IP pública de salida corporativa (ej. Artemis 190.90.34.66) consultada desde el servidor
  const ipSalida = await obtenerIpSalidaServidor();
  if (ipSalida && !esIpLocalOInvalida(ipSalida)) {
    return ipSalida;
  }

  // 5. Último recurso (compatibilidad con clientIp())
  return clientIp();
}

export async function registrarAuditoria(admin: Admin, userId: string | null, tabla: string, accion: string, registroId: string | null, detalle: string) {
  await admin.from("auditoria").insert({ user_id: userId, tabla, accion, registro_id: registroId, detalle });
}

export async function cargarActaCompleta(admin: Admin, actaId: string) {
  const { data: acta, error } = await admin
    .from("actas")
    .select("*, empleado:empleados(id, nombre, identificacion, email, cargo, user_id, area:catalogo_items!empleados_area_id_fkey(nombre), sede:catalogo_items!empleados_sede_id_fkey(nombre), empresa:catalogo_items!empleados_empresa_id_fkey(nombre))")
    .eq("id", actaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!acta) throw new Error("Acta no encontrada");
  const { data: items } = await admin
    .from("acta_items")
    .select("estado_fisico, accesorios, nota, direccion, estado_destino, equipo:equipos(id, serie, activo_fijo, modelo, tipo:catalogo_items!equipos_tipo_id_fkey(nombre), marca:catalogo_items!equipos_marca_id_fkey(nombre))")
    .eq("acta_id", actaId);
  return {
    acta,
    equipos: (items ?? []).filter((i) => i.equipo).map((i) => ({ ...(i.equipo as object), estado_fisico: i.estado_fisico, accesorios: i.accesorios, nota: i.nota, direccion: i.direccion, estado_destino: i.estado_destino })) as unknown as NonNullable<(typeof items)>[number]["equipo"][],
  };
}

export type ActaCompleta = Awaited<ReturnType<typeof cargarActaCompleta>>;

export function actaDTO(c: ActaCompleta) {
  const a = c.acta;
  const e = a.empleado as unknown as {
    nombre: string; identificacion: string; email: string | null; cargo: string | null;
    area: { nombre: string } | null; sede: { nombre: string } | null; empresa: { nombre: string } | null;
  } | null;
  return {
    id: a.id,
    numero: a.numero,
    tipo: a.tipo,
    es_prestamo: !!(a as { es_prestamo?: boolean }).es_prestamo,
    prestamo_hasta: (a as { prestamo_hasta?: string | null }).prestamo_hasta ?? null,
    estado: a.estado,
    created_at: a.created_at,
    observaciones: a.observaciones,
    tecnico: a.tecnico_nombre,
    empleado: {
      nombre: e?.nombre ?? "",
      identificacion: e?.identificacion ?? "",
      cargo: e?.cargo ?? "",
      area: e?.area?.nombre ?? "",
      sede: e?.sede?.nombre ?? "",
      empresa: e?.empresa?.nombre ?? "",
    },
    equipos: c.equipos.map((q) => {
      const x = q as unknown as { serie: string; activo_fijo: string | null; modelo: string | null; tipo: { nombre: string } | null; marca: { nombre: string } | null; estado_fisico: string | null; accesorios: string | null; nota: string | null; direccion: string | null; estado_destino: string | null };
      return { serie: x.serie, activo_fijo: x.activo_fijo ?? "", modelo: x.modelo ?? "", tipo: x.tipo?.nombre ?? "", marca: x.marca?.nombre ?? "", estado_fisico: x.estado_fisico ?? "", accesorios: x.accesorios ?? "", nota: x.nota ?? "", direccion: x.direccion ?? dtoTipo(a.tipo), estado_destino: x.estado_destino ?? "" };
    }),
  };
}
function dtoTipo(t: string) { return t === "devolucion" ? "devolucion" : "entrega"; }
export type ActaDTO = ReturnType<typeof actaDTO>;

function limpiar(s: string) {
  // Helvetica (WinAnsi) no soporta ciertos caracteres; se reemplazan.
  return (s ?? "").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

async function sha256Hex(data: Uint8Array | string) {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", buf as BufferSource);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generarPdf(dto: ActaDTO, firmaPng: Uint8Array, meta: { fecha: string; ip: string; medio: string; ua: string }, tecnicoPng?: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Acta ${dto.tipo} #${dto.numero}`);
  pdf.setAuthor("Finesa");
  pdf.setProducer("Finesa Inventario");
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.043, 0.145, 0.27);
  const gray = rgb(0.35, 0.4, 0.48);
  let y = 800;
  const text = (t: string, x: number, size = 10, f = font, color = navy) => page.drawText(limpiar(t), { x, y, size, font: f, color });

  page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: navy });
  page.drawText("FINESA", { x: 40, y: 808, size: 20, font: bold, color: rgb(0.93, 0.96, 0.93) });
  page.drawText(limpiar(`${dto.tipo === "cambio" ? "ACTA DE CAMBIO / RENOVACION TECNOLOGICA" : `ACTA DE ${dto.tipo === "entrega" ? (dto.es_prestamo ? "PRESTAMO TEMPORAL" : "ENTREGA") : "DEVOLUCION"} DE EQUIPOS`} No. ${dto.numero}`), { x: 40, y: 785, size: 11, font: font, color: rgb(0.55, 0.66, 0.77) });
  y = 740;
  text(`Fecha de elaboración: ${new Date(dto.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" })}`, 40, 10, font, gray);
  y -= 30;
  text("DATOS DEL EMPLEADO", 40, 11, bold); y -= 18;
  const campos: [string, string][] = [
    ["Nombre", dto.empleado.nombre], ["Identificación", dto.empleado.identificacion], ["Cargo", dto.empleado.cargo],
    ["Área", dto.empleado.area], ["Sede", dto.empleado.sede], ["Empresa", dto.empleado.empresa],
  ];
  for (const [k, v] of campos) { text(`${k}:`, 40, 10, bold); text(v || "—", 140, 10); y -= 15; }
  y -= 15;
  const DEST: Record<string, string> = { disponible: "Disponible", en_alistamiento: "En alistamiento", en_reparacion: "En reparación" };
  const grupos: [string, typeof dto.equipos][] = dto.tipo === "cambio"
    ? [["EQUIPOS QUE RECIBE EL EMPLEADO", dto.equipos.filter((q) => q.direccion === "entrega")], ["EQUIPOS QUE DEVUELVE EL EMPLEADO", dto.equipos.filter((q) => q.direccion === "devolucion")]]
    : [["EQUIPOS", dto.equipos]];
  if (dto.es_prestamo) { text(`Préstamo temporal. Fecha estimada de devolución: ${dto.prestamo_hasta ?? "—"}`, 40, 10, bold); y -= 18; }
  for (const [titulo, lista] of grupos) {
  text(titulo, 40, 11, bold); y -= 18;
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 18, color: rgb(0.93, 0.95, 0.97) });
  text("Tipo", 46, 9, bold); text("Marca", 170, 9, bold); text("Modelo", 290, 9, bold); text("Serie / Código", 420, 9, bold);
  y -= 20;
  for (const q of lista) {
    text(q.tipo, 46, 9); text(q.marca, 170, 9); text(q.modelo.slice(0, 24), 290, 9); text(q.serie, 420, 9);
    y -= 11;
    if (q.activo_fijo) { text(`Activo fijo: ${q.activo_fijo}`, 420, 8, font, gray); y -= 11; }
    const det = [`Estado: ${q.estado_fisico || "—"}`, `Accesorios: ${q.accesorios || "—"}`, q.direccion === "devolucion" && q.estado_destino ? `Queda: ${DEST[q.estado_destino] ?? q.estado_destino}` : "", q.nota ? `Nota: ${q.nota}` : ""].filter(Boolean).join("  ·  ");
    text(det.slice(0, 110), 46, 8, font, gray);
    y -= 14;
  }
  y -= 6;
  }
  y -= 15;
  text("OBSERVACIONES", 40, 11, bold); y -= 16;
  const obs = limpiar(dto.observaciones || "Sin observaciones.");
  for (let i = 0; i < obs.length && y > 300; i += 95) { text(obs.slice(i, i + 95), 40, 9, font, gray); y -= 13; }
  y -= 10;
  const decl = dto.tipo === "cambio"
    ? "El empleado declara devolver los equipos relacionados como devueltos y recibir en buen estado los equipos nuevos, comprometiéndose a su cuidado y uso exclusivo para fines laborales."
    : dto.tipo === "entrega" && dto.es_prestamo
    ? "El empleado recibe los equipos en calidad de préstamo temporal y se compromete a devolverlos en la fecha indicada o al terminar la reparación de su equipo."
    : dto.tipo === "entrega"
    ? "El empleado declara recibir los equipos relacionados en buen estado y se compromete a su cuidado y uso exclusivo para fines laborales, así como a devolverlos al finalizar su vínculo."
    : "El empleado declara haber devuelto los equipos relacionados. La recepción queda sujeta a verificación técnica.";
  for (let i = 0; i < decl.length; i += 100) { text(decl.slice(i, i + 100), 40, 9, font, gray); y -= 13; }

  const png = await pdf.embedPng(firmaPng);
  const dims = png.scaleToFit(220, 90);
  const baseY = 170;
  page.drawImage(png, { x: 40, y: baseY + 8, width: dims.width, height: dims.height });
  page.drawLine({ start: { x: 40, y: baseY }, end: { x: 280, y: baseY }, thickness: 0.8, color: navy });
  y = baseY - 14; text(`Firma: ${dto.empleado.nombre}`, 40, 9, bold);
  y -= 12; text(`C.C. ${dto.empleado.identificacion}`, 40, 9);
  page.drawLine({ start: { x: 320, y: baseY }, end: { x: 555, y: baseY }, thickness: 0.8, color: navy });
  if (tecnicoPng) {
    try {
      const tp = await pdf.embedPng(tecnicoPng);
      const td = tp.scaleToFit(220, 90);
      page.drawImage(tp, { x: 320, y: baseY + 8, width: td.width, height: td.height });
    } catch { /* firma del técnico ilegible: se omite */ }
  }
  y = baseY - 14; text(`Técnico: ${dto.tecnico ?? ""}`, 320, 9, bold);

  const hashFirma = await sha256Hex(firmaPng);
  const hashDatos = await sha256Hex(JSON.stringify(dto));
  page.drawRectangle({ x: 40, y: 40, width: 515, height: 80, borderColor: rgb(0.8, 0.84, 0.9), borderWidth: 0.8 });
  y = 106; text("REGISTRO DE FIRMA ELECTRÓNICA (Ley 527 de 1999)", 50, 8, bold);
  y -= 12; text(`Fecha y hora: ${meta.fecha} (UTC) — Medio: ${meta.medio} — IP: ${meta.ip}`, 50, 7.5, font, gray);
  y -= 11; text(`Dispositivo: ${meta.ua.slice(0, 110)}`, 50, 7.5, font, gray);
  y -= 11; text(`Huella firma SHA-256: ${hashFirma}`, 50, 7, font, gray);
  y -= 11; text(`Huella datos SHA-256: ${hashDatos}`, 50, 7, font, gray);

  return pdf.save();
}

export async function ejecutarFirma(
  admin: Admin,
  opts: { actaId: string; firmaDataUrl: string; medio: string; actorId: string | null; ipCliente?: string | null | undefined },
) {
  const completa = await cargarActaCompleta(admin, opts.actaId);
  if (completa.acta.estado !== "pendiente") throw new Error("El acta ya no está pendiente de firma.");
  const pngCheck = validarPngBase64(opts.firmaDataUrl);
  if (!pngCheck.ok) throw new Error(pngCheck.error);
  const bytes = pngCheck.bytes;

  const fecha = new Date().toISOString();
  const ip = await resolverIpFirma({ ipCliente: opts.ipCliente });
  const ua = getRequestHeader("user-agent") ?? "";
  const dto = actaDTO(completa);
  let tecnicoPng: Uint8Array | null = null;
  const tfp = (completa.acta as { tecnico_firma_path?: string | null }).tecnico_firma_path;
  if (tfp) {
    const { data: blob } = await admin.storage.from("actas").download(tfp);
    if (blob) tecnicoPng = new Uint8Array(await blob.arrayBuffer());
  }
  const pdfBytes = await generarPdf(dto, bytes, { fecha, ip, medio: opts.medio, ua }, tecnicoPng);
  const pdfHash = await sha256Hex(pdfBytes);

  const base = `${opts.actaId}`;
  const firmaPath = `${base}/firma.png`;
  const pdfPath = `${base}/acta-${dto.numero}.pdf`;
  const up1 = await admin.storage.from("actas").upload(firmaPath, bytes, { contentType: "image/png", upsert: true });
  if (up1.error) throw new Error("No se pudo guardar la firma: " + up1.error.message);
  const up2 = await admin.storage.from("actas").upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (up2.error) throw new Error("No se pudo guardar el PDF: " + up2.error.message);

  const updatePayload: Record<string, unknown> = {
    estado: "firmada",
    firmado_at: fecha,
    firma_ip: ip,
    firma_user_agent: ua.slice(0, 400),
    firma_medio: opts.medio,
    firma_path: firmaPath,
    pdf_path: pdfPath,
    pdf_hash: pdfHash,
  };

  let { error } = await admin
    .from("actas")
    .update(updatePayload as never)
    .eq("id", opts.actaId)
    .eq("estado", "pendiente");

  // Fallback si la migración de 'pdf_hash' aún no se ha ejecutado en Supabase
  if (error && /pdf_hash/i.test(error.message)) {
    delete updatePayload.pdf_hash;
    const retry = await admin
      .from("actas")
      .update(updatePayload as never)
      .eq("id", opts.actaId)
      .eq("estado", "pendiente");
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  await registrarAuditoria(
    admin,
    opts.actorId,
    "actas",
    "FIRMA",
    opts.actaId,
    `Acta #${dto.numero} firmada (${opts.medio}) desde IP ${ip} · SHA-256 PDF: ${pdfHash.slice(0, 16)}…`,
  );
  return { ok: true, numero: dto.numero, pdfHash };
}
