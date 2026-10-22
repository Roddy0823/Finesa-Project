import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import { actaDTO, clientIp, ejecutarFirma, generarPdf, registrarAuditoria, resolverIpFirma, type ActaCompleta, type ActaDTO } from "@/lib/firmas.server";
import { crearPng, pngDataUrl } from "../helpers/png";
import { setRequestHeaders } from "../helpers/request";
import { crearSupabaseMock, filtro, type SupabaseMock } from "../helpers/supabase-mock";

type Admin = Parameters<typeof ejecutarFirma>[0];

const ACTA_ID = "aaaaaaaa-0000-4000-8000-000000000001";

function actaBase(over: Record<string, unknown> = {}) {
  return {
    id: ACTA_ID,
    numero: 12,
    tipo: "entrega",
    estado: "pendiente",
    es_prestamo: false,
    prestamo_hasta: null,
    created_at: "2026-10-01T15:00:00.000Z",
    observaciones: "Equipo nuevo",
    tecnico_nombre: "Técnico Uno",
    tecnico_firma_path: null,
    empleado: {
      nombre: "Ana Pérez",
      identificacion: "1234567",
      email: "ana@finesa.com.co",
      cargo: "Analista",
      area: { nombre: "Riesgos" },
      sede: { nombre: "Bogotá" },
      empresa: { nombre: "Finesa S.A." },
    },
    ...over,
  };
}

function itemBase(over: Record<string, unknown> = {}) {
  return {
    estado_fisico: "Bueno",
    accesorios: "Cargador",
    nota: null,
    direccion: "entrega",
    estado_destino: "disponible",
    equipo: {
      id: "eq-1",
      serie: "SN-001",
      activo_fijo: "AF-10",
      modelo: "Latitude 5440",
      tipo: { nombre: "Portátil" },
      marca: { nombre: "Dell" },
    },
    ...over,
  };
}

function completa(acta = actaBase(), equipos: Record<string, unknown>[] = [itemBase()]): ActaCompleta {
  return {
    acta,
    equipos: equipos.map((i) => ({ ...(i["equipo"] as object), ...i, equipo: undefined })),
  } as unknown as ActaCompleta;
}

const META = { fecha: "2026-10-22T15:00:00.000Z", ip: "10.0.0.5", medio: "presencial", ua: "Vitest" };

describe("firmas.server", () => {
  describe("clientIp", () => {
    it("prioriza cf-connecting-ip", () => {
      setRequestHeaders({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" });
      expect(clientIp()).toBe("1.1.1.1");
    });

    it("usa la primera IP de x-forwarded-for", () => {
      setRequestHeaders({ "x-forwarded-for": " 2.2.2.2 , 10.0.0.1", "x-real-ip": "3.3.3.3" });
      expect(clientIp()).toBe("2.2.2.2");
    });

    it("recurre a x-real-ip y luego a 'desconocida'", () => {
      setRequestHeaders({ "x-real-ip": "3.3.3.3" });
      expect(clientIp()).toBe("3.3.3.3");
      setRequestHeaders({});
      expect(clientIp()).toBe("desconocida");
    });
  });

  describe("resolverIpFirma", () => {
    it("prioriza cabeceras si son IPs públicas", async () => {
      setRequestHeaders({ "cf-connecting-ip": "1.1.1.1" });
      await expect(resolverIpFirma({ ipCliente: "190.90.34.66" })).resolves.toBe("1.1.1.1");
    });

    it("utiliza ipCliente si las cabeceras son vacías o locales", async () => {
      setRequestHeaders({});
      await expect(resolverIpFirma({ ipCliente: "190.90.34.66" })).resolves.toBe("190.90.34.66");

      setRequestHeaders({ "x-forwarded-for": "127.0.0.1" });
      await expect(resolverIpFirma({ ipCliente: "190.90.34.66" })).resolves.toBe("190.90.34.66");
    });

    it("ignora ipCliente si es loopback o 'desconocida'", async () => {
      setRequestHeaders({ "x-real-ip": "4.4.4.4" });
      await expect(resolverIpFirma({ ipCliente: "127.0.0.1" })).resolves.toBe("4.4.4.4");
      await expect(resolverIpFirma({ ipCliente: "desconocida" })).resolves.toBe("4.4.4.4");
    });
  });

  describe("registrarAuditoria", () => {
    it("inserta el actor y el detalle en la tabla auditoria", async () => {
      const sb = crearSupabaseMock();
      await registrarAuditoria(sb.client as unknown as Admin, "user-1", "actas", "FIRMA", "acta-1", "detalle");
      expect(sb.auditorias()).toEqual([{ user_id: "user-1", tabla: "actas", accion: "FIRMA", registro_id: "acta-1", detalle: "detalle" }]);
    });
  });

  describe("actaDTO", () => {
    it("aplana empleado y equipos con sus catálogos", () => {
      const dto = actaDTO(completa());
      expect(dto).toMatchObject({
        id: ACTA_ID,
        numero: 12,
        tipo: "entrega",
        es_prestamo: false,
        tecnico: "Técnico Uno",
        empleado: { nombre: "Ana Pérez", identificacion: "1234567", cargo: "Analista", area: "Riesgos", sede: "Bogotá", empresa: "Finesa S.A." },
      });
      expect(dto.equipos).toEqual([
        { serie: "SN-001", activo_fijo: "AF-10", modelo: "Latitude 5440", tipo: "Portátil", marca: "Dell", estado_fisico: "Bueno", accesorios: "Cargador", nota: "", direccion: "entrega", estado_destino: "disponible" },
      ]);
    });

    it("rellena con cadenas vacías cuando faltan datos opcionales", () => {
      const dto = actaDTO(
        completa(actaBase({ empleado: null }), [itemBase({ estado_fisico: null, accesorios: null, equipo: { serie: "X", activo_fijo: null, modelo: null, tipo: null, marca: null } })]),
      );
      expect(dto.empleado).toEqual({ nombre: "", identificacion: "", cargo: "", area: "", sede: "", empresa: "" });
      expect(dto.equipos[0]).toMatchObject({ serie: "X", activo_fijo: "", modelo: "", tipo: "", marca: "", estado_fisico: "", accesorios: "" });
    });

    it.each([
      ["devolucion", "devolucion"],
      ["entrega", "entrega"],
      ["cambio", "entrega"],
    ])("si el ítem no trae dirección, la deriva del tipo de acta (%s → %s)", (tipo, esperado) => {
      const dto = actaDTO(completa(actaBase({ tipo }), [itemBase({ direccion: null })]));
      expect(dto.equipos[0]!.direccion).toBe(esperado);
    });

    it("expone los datos del préstamo de contingencia", () => {
      const dto = actaDTO(completa(actaBase({ es_prestamo: true, prestamo_hasta: "2026-11-01" })));
      expect(dto.es_prestamo).toBe(true);
      expect(dto.prestamo_hasta).toBe("2026-11-01");
    });
  });

  describe("generarPdf", () => {
    const firma = crearPng();

    async function pdfDe(dto: ActaDTO, tecnico?: Uint8Array | null) {
      const bytes = await generarPdf(dto, firma, META, tecnico);
      return { bytes, doc: await PDFDocument.load(bytes) };
    }

    it("genera un PDF válido de una página con metadatos del acta", async () => {
      const { bytes, doc } = await pdfDe(actaDTO(completa()));
      expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe("Acta entrega #12");
      expect(doc.getAuthor()).toBe("Finesa");
    });

    it("soporta actas de cambio con equipos en ambos sentidos", async () => {
      const dto = actaDTO(
        completa(actaBase({ tipo: "cambio" }), [itemBase(), itemBase({ direccion: "devolucion", estado_destino: "en_reparacion", equipo: { serie: "SN-OLD", activo_fijo: null, modelo: "Viejo", tipo: null, marca: null } })]),
      );
      const { doc } = await pdfDe(dto);
      expect(doc.getTitle()).toBe("Acta cambio #12");
    });

    it("no falla con caracteres fuera de WinAnsi (emojis, CJK)", async () => {
      const dto = actaDTO(completa(actaBase({ observaciones: "Entregado ✅ 设备 🚀".repeat(20) })));
      await expect(pdfDe(dto)).resolves.toBeTruthy();
    });

    it("omite una firma de técnico ilegible sin abortar", async () => {
      const { doc } = await pdfDe(actaDTO(completa()), new Uint8Array([1, 2, 3]));
      expect(doc.getPageCount()).toBe(1);
    });

    it("incrusta la firma del técnico cuando es válida", async () => {
      const sinTecnico = await generarPdf(actaDTO(completa()), firma, META, null);
      const conTecnico = await generarPdf(actaDTO(completa()), firma, META, crearPng(120, 40, 99));
      expect(conTecnico.length).toBeGreaterThan(sinTecnico.length);
    });

    it("rechaza una firma de empleado que no es PNG", async () => {
      await expect(generarPdf(actaDTO(completa()), new Uint8Array([0, 1, 2]), META)).rejects.toThrow();
    });
  });

  describe("ejecutarFirma", () => {
    let sb: SupabaseMock;
    let acta: ReturnType<typeof actaBase>;
    let updateError: { message: string } | null;
    const firmaUrl = pngDataUrl(crearPng());

    beforeEach(() => {
      setRequestHeaders({ "cf-connecting-ip": "190.0.0.7", "user-agent": "Mozilla/5.0 Vitest" });
      acta = actaBase();
      updateError = null;
      sb = crearSupabaseMock({
        onQuery: (q) => {
          if (q.table === "actas" && q.op === "select") return { data: acta };
          if (q.table === "acta_items") return { data: [itemBase(), itemBase({ equipo: null })] };
          if (q.table === "actas" && q.op === "update") return { error: updateError };
          return undefined;
        },
      });
    });

    const firmar = (over: Partial<Parameters<typeof ejecutarFirma>[1]> = {}) =>
      ejecutarFirma(sb.client as unknown as Admin, { actaId: ACTA_ID, firmaDataUrl: firmaUrl, medio: "presencial", actorId: "tecnico-1", ...over });

    it("firma el acta: guarda firma + PDF, actualiza estado y audita", async () => {
      const res = await firmar();
      expect(res).toMatchObject({ ok: true, numero: 12 });
      expect(typeof res.pdfHash).toBe("string");
      expect(res.pdfHash).toHaveLength(64); // SHA-256 en hexadecimal

      expect(sb.storageBuckets.every((b) => b === "actas")).toBe(true);
      expect(sb.storageUpload).toHaveBeenCalledTimes(2);
      const [firmaCall, pdfCall] = sb.storageUpload.mock.calls;
      expect(firmaCall![0]).toBe(`${ACTA_ID}/firma.png`);
      expect(firmaCall![2]).toEqual({ contentType: "image/png", upsert: true });
      expect(pdfCall![0]).toBe(`${ACTA_ID}/acta-12.pdf`);
      expect(pdfCall![2]).toEqual({ contentType: "application/pdf", upsert: true });
      await expect(PDFDocument.load(pdfCall![1] as Uint8Array)).resolves.toBeTruthy();

      const [upd] = sb.find("actas", "update");
      expect(upd!.payload).toMatchObject({
        estado: "firmada",
        firma_ip: "190.0.0.7",
        firma_user_agent: "Mozilla/5.0 Vitest",
        firma_medio: "presencial",
        firma_path: `${ACTA_ID}/firma.png`,
        pdf_path: `${ACTA_ID}/acta-12.pdf`,
        pdf_hash: res.pdfHash,
      });
      // Solo actualiza si sigue pendiente (evita doble firma concurrente).
      expect(filtro(upd!, "id")).toBe(ACTA_ID);
      expect(filtro(upd!, "estado")).toBe("pendiente");

      expect(sb.auditorias()).toEqual([
        expect.objectContaining({ user_id: "tecnico-1", tabla: "actas", accion: "FIRMA", registro_id: ACTA_ID, detalle: expect.stringContaining("190.0.0.7") }),
      ]);
    });

    it("registra actor nulo para firmas remotas por enlace", async () => {
      await firmar({ actorId: null, medio: "remoto" });
      expect(sb.auditorias()[0]).toMatchObject({ user_id: null, detalle: expect.stringContaining("remoto") });
    });

    it("registra la IP reportada por el cliente si las cabeceras están vacías", async () => {
      setRequestHeaders({});
      await firmar({ ipCliente: "190.90.34.66" });
      const [upd] = sb.find("actas", "update");
      expect(upd!.payload).toMatchObject({
        firma_ip: "190.90.34.66",
      });
      expect(sb.auditorias()[0]).toMatchObject({
        detalle: expect.stringContaining("190.90.34.66"),
      });
    });

    it.each(["firmada", "anulada"])("rechaza un acta en estado %s", async (estado) => {
      acta = actaBase({ estado });
      await expect(firmar()).rejects.toThrow("El acta ya no está pendiente de firma.");
      expect(sb.storageUpload).not.toHaveBeenCalled();
      expect(sb.find("actas", "update")).toHaveLength(0);
    });

    it("rechaza firmas que no son PNG válidos antes de subir nada", async () => {
      await expect(firmar({ firmaDataUrl: "data:image/png;base64,AAAA" })).rejects.toThrow(/firma/);
      expect(sb.storageUpload).not.toHaveBeenCalled();
    });

    it("falla si el acta no existe", async () => {
      sb.setOnQuery(() => ({ data: null }));
      await expect(firmar()).rejects.toThrow("Acta no encontrada");
    });

    it("descarga y usa la firma del técnico copiada en el acta", async () => {
      acta = actaBase({ tecnico_firma_path: "tecnicos/t1.png" });
      sb.storageDownload.mockResolvedValueOnce({ data: new Blob([crearPng(100, 40, 5) as BlobPart]), error: null });
      await firmar();
      expect(sb.storageDownload).toHaveBeenCalledWith("tecnicos/t1.png");
    });

    it("aborta sin cambiar estado si no se puede guardar la firma", async () => {
      sb.storageUpload.mockResolvedValueOnce({ data: { path: "" }, error: { message: "duplicate" } });
      await expect(firmar()).rejects.toThrow("No se pudo guardar la firma: duplicate");
      expect(sb.find("actas", "update")).toHaveLength(0);
      expect(sb.auditorias()).toHaveLength(0);
    });

    it("aborta sin cambiar estado si no se puede guardar el PDF", async () => {
      sb.storageUpload.mockResolvedValueOnce({ data: { path: "ok" }, error: null }).mockResolvedValueOnce({ data: { path: "" }, error: { message: "quota" } });
      await expect(firmar()).rejects.toThrow("No se pudo guardar el PDF: quota");
      expect(sb.find("actas", "update")).toHaveLength(0);
    });

    it("propaga errores de la base de datos al actualizar y no audita", async () => {
      updateError = { message: "Un acta anulada no puede cambiar de estado" };
      await expect(firmar()).rejects.toThrow("Un acta anulada no puede cambiar de estado");
      expect(sb.auditorias()).toHaveLength(0);
    });

    it("trunca el user-agent a 400 caracteres", async () => {
      setRequestHeaders({ "user-agent": "x".repeat(1_000) });
      await firmar();
      const [upd] = sb.find("actas", "update");
      expect((upd!.payload as { firma_user_agent: string }).firma_user_agent).toHaveLength(400);
    });

    it("reintenta la actualización omitiendo pdf_hash si la columna no existe en la base de datos", async () => {
      let intento = 0;
      sb.setOnQuery((q) => {
        if (q.table === "actas" && q.op === "select") return { data: acta };
        if (q.table === "acta_items") return { data: [itemBase()] };
        if (q.table === "actas" && q.op === "update") {
          intento++;
          if (intento === 1) {
            return { error: { message: "Could not find the 'pdf_hash' column of 'actas' in the schema cache." } };
          }
          expect((q.payload as Record<string, unknown>).pdf_hash).toBeUndefined();
          return { error: null, data: { id: ACTA_ID } };
        }
        return undefined;
      });
      const res = await firmar();
      expect(res.ok).toBe(true);
      expect(intento).toBe(2);
    });
  });
});
