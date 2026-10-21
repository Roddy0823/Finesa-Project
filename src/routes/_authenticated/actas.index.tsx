import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { fetchAll } from "@/lib/fetchAll";
import { TIPO_ACTA, ESTADO_ACTA, fmtFecha, errMsg } from "@/lib/constantes";
import { urlArchivo } from "@/lib/firmas.functions";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ban, Download, FileArchive } from "lucide-react";

export const Route = createFileRoute("/_authenticated/actas/")({
  validateSearch: z.object({ estado: z.string().optional() }),
  head: () => ({ meta: [{ title: "Repositorio de actas — Finesa" }, { name: "description", content: "Listado centralizado de actas." }] }),
  component: Repositorio,
});

type Fila = { id: string; numero: number; tipo: "entrega" | "devolucion"; estado: "pendiente" | "firmada" | "anulada"; created_at: string; firmado_at: string | null; pdf_path: string | null; tecnico_nombre: string | null; empleado: { nombre: string; identificacion: string } | null };

const MAX_ZIP = 100;

function Repositorio() {
  const search = Route.useSearch();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const url = useServerFn(urlArchivo);
  const [f, setF] = useState({ desde: "", hasta: "", empleado: "", tecnico: "", tipo: "", estado: search.estado ?? "" });
  const [sel, setSel] = useState<string[]>([]);
  const [anular, setAnular] = useState<Fila | null>(null);
  const [zipando, setZipando] = useState(false);
  const pag = usePaginacion(f);

  const q = useQuery({
    queryKey: ["actas", "repo"],
    queryFn: () => fetchAll((a, b) => supabase.from("actas").select("id, numero, tipo, estado, created_at, firmado_at, pdf_path, tecnico_nombre, empleado:empleados(nombre, identificacion)").order("created_at", { ascending: false }).order("id").range(a, b)) as Promise<Fila[]>,
  });

  const filas = useMemo(() => {
    const t = f.empleado.toLowerCase(), tc = f.tecnico.toLowerCase();
    return (q.data ?? []).filter((a) =>
      (!f.tipo || a.tipo === f.tipo) && (!f.estado || a.estado === f.estado) &&
      (!f.desde || a.created_at >= f.desde) && (!f.hasta || a.created_at <= f.hasta + "T23:59:59") &&
      (!t || (a.empleado && (a.empleado.nombre.toLowerCase().includes(t) || a.empleado.identificacion.includes(t)))) &&
      (!tc || (a.tecnico_nombre ?? "").toLowerCase().includes(tc)));
  }, [q.data, f]);
  const tecnicos = useMemo(() => [...new Set((q.data ?? []).map((a) => a.tecnico_nombre).filter(Boolean) as string[])].sort(), [q.data]);

  const pagina = filas.slice(pag.desde, pag.desde + pag.tamano);
  const puedeVer = me?.can("repositorio_ver");
  const descargables = filas.filter((a) => a.pdf_path);
  const todos = descargables.length > 0 && descargables.every((a) => sel.includes(a.id));

  async function zip() {
    const elegidas = (q.data ?? []).filter((a) => sel.includes(a.id) && a.pdf_path);
    if (!elegidas.length) return;
    if (elegidas.length > MAX_ZIP) return toast.error(`Máximo ${MAX_ZIP} actas por descarga.`);
    setZipando(true);
    try {
      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      for (const a of elegidas) {
        const r = await url({ data: { actaId: a.id } });
        const res = await fetch(r.url);
        if (!res.ok) throw new Error(`No se pudo descargar el acta #${a.numero}`);
        z.file(`acta-${a.numero}-${a.tipo}.pdf`, await res.blob());
      }
      const blob = await z.generateAsync({ type: "blob" });
      const o = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = o; el.download = `actas_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(el); el.click(); el.remove();
      setTimeout(() => URL.revokeObjectURL(o), 5000);
      await supabase.rpc("log_evento", { p_accion: "DESCARGA_MASIVA", p_detalle: `Actas: ${elegidas.map((a) => a.numero).join(", ")}` });
      setSel([]);
    } catch (e) { toast.error(errMsg(e)); } finally { setZipando(false); }
  }

  const s = "h-9 rounded-md border border-input bg-card px-3 text-sm";
  return (
    <div>
      <PageHeader title="Repositorio de actas" desc="Filtre, consulte, descargue y gestione las actas." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Empleado o identificación" className="w-full sm:w-56" value={f.empleado} onChange={(e) => setF({ ...f, empleado: e.target.value })} />
        <select className={s} value={f.tecnico} onChange={(e) => setF({ ...f, tecnico: e.target.value })} aria-label="Técnico"><option value="">Técnico</option>{tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <Input type="date" className="w-auto" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} aria-label="Desde" />
        <Input type="date" className="w-auto" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} aria-label="Hasta" />
        <select className={s} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo"><option value="">Tipo</option>{Object.entries(TIPO_ACTA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={s} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })} aria-label="Estado"><option value="">Estado</option>{Object.entries(ESTADO_ACTA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <Button variant="ghost" onClick={() => setF({ desde: "", hasta: "", empleado: "", tecnico: "", tipo: "", estado: "" })}>Limpiar</Button>
      </div>
      <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>{filas.length} acta{filas.length === 1 ? "" : "s"}</span>
        {puedeVer && <Button size="sm" disabled={!sel.length || zipando} onClick={zip}><FileArchive className="mr-1 h-4 w-4" />{zipando ? "Preparando…" : `Descargar seleccionadas (${sel.length})`}</Button>}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2">{puedeVer && <Checkbox aria-label="Seleccionar todas" checked={todos} onCheckedChange={(c) => setSel(c ? descargables.slice(0, MAX_ZIP).map((a) => a.id) : [])} />}</th>
              <th className="px-4 py-2">No.</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Empleado</th><th className="px-4 py-2">Técnico</th><th className="px-4 py-2">Creada</th><th className="px-4 py-2">Firmada</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && <FilasSkeleton columnas={9} />}
            {pagina.map((a) => (
              <tr key={a.id} className="hover:bg-muted/50">
                <td className="px-3 py-2.5">{a.pdf_path && puedeVer && <Checkbox aria-label={`Seleccionar acta ${a.numero}`} checked={sel.includes(a.id)} onCheckedChange={(c) => setSel(c ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />}</td>
                <td className="px-4 py-2.5"><Link to="/actas/$id" params={{ id: a.id }} className="font-mono text-xs font-medium text-primary hover:underline">#{a.numero}</Link></td>
                <td className="px-4 py-2.5">{TIPO_ACTA[a.tipo]}</td>
                <td className="px-4 py-2.5">{a.empleado?.nombre}</td>
                <td className="px-4 py-2.5 text-xs">{a.tecnico_nombre}</td>
                <td className="px-4 py-2.5 text-xs">{fmtFecha(a.created_at)}</td>
                <td className="px-4 py-2.5 text-xs">{fmtFecha(a.firmado_at, true)}</td>
                <td className="px-4 py-2.5"><EstadoActa estado={a.estado} /></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  {a.pdf_path && puedeVer && <Button size="icon" variant="ghost" onClick={() => descargarPdfActa(url, a.id, `acta-${a.numero}.pdf`)} aria-label="Descargar PDF"><Download className="h-4 w-4" /></Button>}
                  {me?.isAdmin && a.estado !== "anulada" && <Button size="icon" variant="ghost" onClick={() => setAnular(a)} aria-label="Anular acta"><Ban className="h-4 w-4 text-destructive" /></Button>}
                </td>
              </tr>
            ))}
            {!q.isLoading && !filas.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No hay actas.</td></tr>}
          </tbody>
        </table>
      </div>
      <DataTablePagination total={filas.length} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
      <AnularDialog acta={anular} onClose={() => setAnular(null)} onDone={() => { setAnular(null); qc.invalidateQueries({ queryKey: ["actas"] }); qc.invalidateQueries({ queryKey: ["equipos"] }); }} />
    </div>
  );
}

function AnularDialog({ acta, onClose, onDone }: { acta: Fila | null; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  async function confirmar() {
    if (!acta) return;
    setLoading(true);
    const { error } = await supabase.rpc("anular_acta", { p_acta: acta.id, p_motivo: motivo.trim() });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    toast.success(`Acta #${acta.numero} anulada`);
    setMotivo("");
    onDone();
  }
  return (
    <Dialog open={!!acta} onOpenChange={(o) => { if (!o) { setMotivo(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Anular acta #{acta?.numero}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{acta?.estado === "firmada" ? "El acta está firmada: revise después el estado de sus equipos. " : ""}Esta acción queda registrada en la auditoría.</p>
        <Textarea placeholder="Motivo de la anulación (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <DialogFooter><Button variant="destructive" onClick={confirmar} disabled={!motivo.trim() || loading}>Anular acta</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
