import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { crearEnlaceFirma, firmarPresencial, urlArchivo } from "@/lib/firmas.functions";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { copiarTexto } from "@/lib/utils";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { ActaResumen } from "@/components/ActaResumen";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Download, PenLine } from "lucide-react";

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
      const { data: a, error } = await supabase.from("actas").select("*, empleado:empleados(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: items } = await supabase.from("acta_items").select("equipo:equipos(*)").eq("acta_id", id);
      return { a, equipos: (items ?? []).map((i) => i.equipo).filter(Boolean) };
    },
  });
  const a = q.data?.a;
  if (q.isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!a) return <p className="text-muted-foreground">Acta no encontrada.</p>;
  const emp = a.empleado as { nombre: string; identificacion: string; cargo: string | null; area_id: string | null; sede_id: string | null };
  const vista = {
    numero: a.numero, tipo: a.tipo, created_at: a.created_at, observaciones: a.observaciones, tecnico: a.tecnico_nombre,
    empleado: { nombre: emp.nombre, identificacion: emp.identificacion, cargo: emp.cargo ?? "", area: cat.nombre(emp.area_id), sede: cat.nombre(emp.sede_id) },
    equipos: q.data!.equipos.map((e) => ({ serie: e!.serie, activo_fijo: e!.activo_fijo ?? "", modelo: e!.modelo ?? "", tipo: cat.nombre(e!.tipo_id), marca: cat.nombre(e!.marca_id) })),
  };

  async function copiarEnlace() {
    try {
      const r = await enlace({ data: { actaId: id } });
      const link = `${window.location.origin}/firmar/${r.token}`;
      setEnlaceGenerado(link);
      const copiado = await copiarTexto(link);
      if (copiado) {
        toast.success("Enlace copiado. Válido por 48 horas y un solo uso.");
      } else {
        toast.info("Enlace generado (48 h). Pulse «Copiar» en el recuadro para copiarlo.");
      }
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function confirmarFirma() {
    if (!firma) return;
    setFirmando(true);
    try {
      await firmar({ data: { actaId: id, firma } });
      toast.success("Acta firmada y PDF generado");
      setModo(false);
      ["acta", "actas", "equipos", "panel"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(errMsg(e)); } finally { setFirmando(false); }
  }
  async function descargar() {
    await descargarPdfActa(url, id, `acta-${a?.numero ?? id.slice(0, 8)}.pdf`);
  }


  const puedeFirmar = a.estado === "pendiente" && me?.can("firmas_capturar");
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Acta #${a.numero}`} desc={`Creada ${fmtFecha(a.created_at, true)}`}>
        <EstadoActa estado={a.estado} />
        {a.pdf_path && <Button variant="outline" onClick={descargar}><Download className="mr-1 h-4 w-4" /> PDF</Button>}
        {puedeFirmar && <Button variant="outline" onClick={copiarEnlace}><Copy className="mr-1 h-4 w-4" /> Copiar enlace de firma</Button>}
        {puedeFirmar && !modo && <Button onClick={() => setModo(true)}><PenLine className="mr-1 h-4 w-4" /> Firma presencial</Button>}
        {me?.isAdmin && a.estado !== "anulada" && <Anular id={id} firmada={a.estado === "firmada"} />}
      </PageHeader>

      {enlaceGenerado && puedeFirmar && (
        <div className="mb-4 flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center">
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
        <div className="mt-4 rounded-md border border-success/30 bg-success/10 p-4 text-sm">
          Firmada el {fmtFecha(a.firmado_at, true)} · Medio: {a.firma_medio} · IP: <span className="font-mono">{a.firma_ip}</span>
        </div>
      )}
      {a.estado === "anulada" && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          Anulada el {fmtFecha(a.anulada_at, true)}. Motivo: {a.anulada_motivo}. Ajuste manualmente el estado de los equipos si aplica.
        </div>
      )}

      {modo && puedeFirmar && (
        <section className="mt-6 space-y-3 rounded-md border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Firma de {emp.nombre}</h2>
          <p className="text-sm text-muted-foreground">Entregue el dispositivo al empleado para que firme.</p>
          <SignaturePad onChange={setFirma} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModo(false)}>Cancelar</Button>
            <Button onClick={confirmarFirma} disabled={!firma || firmando}>{firmando ? "Generando PDF…" : "Confirmar firma"}</Button>
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
  async function anular() {
    const { error } = await supabase.rpc("anular_acta", { p_acta: id, p_motivo: motivo.trim() });
    if (error) return toast.error(errMsg(error));
    toast.success("Acta anulada"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["acta", id] }); qc.invalidateQueries({ queryKey: ["actas"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="destructive">Anular</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular acta</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Las actas nunca se eliminan. {firmada && "Al estar firmada, deberá ajustar manualmente el estado de los equipos si aplica."}</p>
        <div className="space-y-1"><Label>Motivo *</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter><Button variant="destructive" onClick={anular} disabled={!motivo.trim()}>Anular acta</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
