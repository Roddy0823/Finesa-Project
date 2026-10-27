import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { crearEnlaceFirma, firmarPresencial, urlArchivo } from "@/lib/firmas.functions";
import { detectarIpNavegador } from "@/lib/detectarIp";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { copiarTexto } from "@/lib/utils";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { ActaResumen, type ActaVista } from "@/components/ActaResumen";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Download, PenLine, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/actas/$id")({
  head: () => ({ meta: [{ title: "Acta — Finesa" }, { name: "description", content: "Detalle y firma del acta." }] }),
  component: DetalleActa,
});

function DetalleActa() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const enlace = useServerFn(crearEnlaceFirma);
  const firmar = useServerFn(firmarPresencial);
  const url = useServerFn(urlArchivo);
  const [firma, setFirma] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [modo, setModo] = useState(false);
  const [enlaceGenerado, setEnlaceGenerado] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["acta", id],
    queryFn: async () => {
      const { data: a, error } = await supabase
        .from("actas")
        .select("*, empleado:empleados(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!a) return null;

      const { data: items, error: itemsErr } = await supabase
        .from("acta_items")
        .select("id, direccion, estado_destino, estado_fisico, accesorios, nota, equipo:equipos(*)")
        .eq("acta_id", id);
      if (itemsErr) throw itemsErr;

      return { a, items: items ?? [] };
    },
  });

  const a = q.data?.a;
  if (q.isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!a) return <p className="text-muted-foreground">Acta no encontrada.</p>;

  const emp = (a.empleado as {
    nombre?: string;
    identificacion?: string;
    cargo?: string | null;
    area_id?: string | null;
    sede_id?: string | null;
    empresa_id?: string | null;
  } | null) ?? {
    nombre: "Colaborador no registrado",
    identificacion: "—",
    cargo: null,
    area_id: null,
    sede_id: null,
    empresa_id: null,
  };

  const vista: ActaVista = {
    numero: a.numero,
    tipo: a.tipo,
    created_at: a.created_at,
    observaciones: a.observaciones,
    tecnico: a.tecnico_nombre,
    es_prestamo: a.es_prestamo,
    prestamo_hasta: a.prestamo_hasta,
    empleado: {
      nombre: emp.nombre || "—",
      identificacion: emp.identificacion || "—",
      cargo: emp.cargo ?? "",
      area: cat.nombre(emp.area_id),
      sede: cat.nombre(emp.sede_id),
      empresa: cat.nombre(emp.empresa_id),
    },
    equipos: (q.data?.items ?? []).map((i) => {
      const e = i.equipo as {
        serie?: string;
        activo_fijo?: string | null;
        modelo?: string | null;
        tipo_id?: string | null;
        marca_id?: string | null;
      } | null;
      return {
        serie: e?.serie || "Sin serie",
        activo_fijo: e?.activo_fijo ?? "",
        modelo: e?.modelo ?? "",
        tipo: cat.nombre(e?.tipo_id),
        marca: cat.nombre(e?.marca_id),
        direccion: i.direccion ?? (a.tipo === "devolucion" ? "devolucion" : "entrega"),
        estado_fisico: i.estado_fisico ?? "Bueno",
        accesorios: i.accesorios,
        estado_destino: i.estado_destino,
        nota: i.nota,
      };
    }),
  };

  async function copiarEnlace() {
    try {
      const r = await enlace({ data: { actaId: id } });
      const link = `${window.location.origin}/firmar/${r.token}`;
      setEnlaceGenerado(link);
      const copiado = await copiarTexto(link);
      if (copiado) {
        toast.success("Enlace copiado. Válido por 15 minutos y un solo uso. Si vence, genere y envíe uno nuevo.");
      } else {
        toast.info("Enlace generado (15 minutos). Pulse «Copiar» y envíelo. Si vence, genere y envíe uno nuevo.");
      }
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function confirmarFirma() {
    if (!firma) return;
    setFirmando(true);
    try {
      const ip = await detectarIpNavegador();
      await firmar({ data: { actaId: id, firma, ip } });
      toast.success("Acta firmada y PDF generado");
      setModo(false);
      ["acta", "actas", "equipos", "panel"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setFirmando(false);
    }
  }

  async function descargar() {
    await descargarPdfActa(url, id, `acta-${a?.numero ?? id.slice(0, 8)}.pdf`);
  }

  const puedeFirmar = a.estado === "pendiente" && me?.can("firmas_capturar");

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={`Acta #${a.numero}`} desc={`Creada ${fmtFecha(a.created_at, true)}`}>
        <EstadoActa estado={a.estado} />
        {a.pdf_path && (
          <Button variant="outline" onClick={descargar}>
            <Download className="mr-1 h-4 w-4" /> PDF
          </Button>
        )}
        {puedeFirmar && (
          <Button variant="outline" onClick={copiarEnlace}>
            <Copy className="mr-1 h-4 w-4" /> Copiar enlace de firma
          </Button>
        )}
        {puedeFirmar && !modo && (
          <Button onClick={() => setModo(true)}>
            <PenLine className="mr-1 h-4 w-4" /> Firma presencial
          </Button>
        )}
        {me?.isAdmin && a.estado !== "anulada" && <Anular id={id} firmada={a.estado === "firmada"} />}
      </PageHeader>

      {a.estado === "pendiente" && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/10 p-3.5 text-xs text-muted-foreground">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground">Acta pendiente de firma</p>
            <p>
              Esta es la información previa del movimiento. Puede capturar la firma presencial de forma inmediata o
              generar un enlace seguro para que el colaborador firme desde su dispositivo móvil o computador. Al
              firmarse, se generará el PDF oficial sellado con SHA-256.
            </p>
          </div>
        </div>
      )}

      {enlaceGenerado && puedeFirmar && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5 sm:flex-row sm:items-center">
          <Input
            readOnly
            value={enlaceGenerado}
            onFocus={(e) => e.currentTarget.select()}
            className="h-9 bg-background font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              const ok = await copiarTexto(enlaceGenerado);
              if (ok) toast.success("Enlace copiado al portapapeles");
            }}
          >
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
          </Button>
        </div>
      )}

      <ActaResumen a={vista} />

      {a.estado === "firmada" && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
          Firmada el {fmtFecha(a.firmado_at, true)} · Medio: {a.firma_medio} · IP:{" "}
          <span className="font-mono">{a.firma_ip}</span>
        </div>
      )}
      {a.estado === "anulada" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Anulada el {fmtFecha(a.anulada_at, true)}. Motivo: {a.anulada_motivo}. Ajuste manualmente el estado de los
          equipos si aplica.
        </div>
      )}

      {modo && puedeFirmar && (
        <section className="space-y-3 rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
          <h2 className="text-base font-bold text-foreground">Firma de {emp.nombre}</h2>
          <p className="text-xs text-muted-foreground">Entregue el dispositivo al colaborador para que firme en pantalla.</p>
          <SignaturePad onChange={setFirma} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModo(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarFirma} disabled={!firma || firmando}>
              {firmando ? "Generando PDF…" : "Confirmar firma"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Anular({ id, firmada }: { id: string; firmada: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  async function anular() {
    setLoading(true);
    const { error } = await supabase.rpc("anular_acta", { p_acta: id, p_motivo: motivo.trim() });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Acta anulada");
    setOpen(false);
    ["acta", "actas", "panel", "equipos"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Anular</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular acta</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Las actas nunca se eliminan físicamente.{" "}
          {firmada && "Al estar firmada, deberá ajustar manualmente el estado de los equipos si aplica."}
        </p>
        <div className="space-y-1">
          <Label>Motivo *</Label>
          <Textarea
            placeholder="Indique el motivo de la anulación"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={anular} disabled={!motivo.trim() || loading}>
            Anular acta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
