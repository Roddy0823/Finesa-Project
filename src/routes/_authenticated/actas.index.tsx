import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Ban, Download, FileArchive, Plus, Search, X, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/actas/")({
  validateSearch: z.object({ estado: z.string().optional() }),
  head: () => ({
    meta: [{ title: "Repositorio de actas — Finesa" }, { name: "description", content: "Listado centralizado de actas." }],
  }),
  component: Repositorio,
});

type Fila = {
  id: string;
  numero: number;
  tipo: "entrega" | "devolucion" | "cambio";
  estado: "pendiente" | "firmada" | "anulada";
  created_at: string;
  firmado_at: string | null;
  pdf_path: string | null;
  tecnico_nombre: string | null;
  empleado: { nombre: string; identificacion: string } | null;
};

const MAX_ZIP = 100;

function Repositorio() {
  const search = Route.useSearch();
  const { data: me } = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const url = useServerFn(urlArchivo);
  const [f, setF] = useState({
    desde: "",
    hasta: "",
    empleado: "",
    tecnico: "",
    tipo: "",
    estado: search.estado ?? "",
  });
  const [sel, setSel] = useState<string[]>([]);
  const [anular, setAnular] = useState<Fila | null>(null);
  const [zipando, setZipando] = useState(false);
  const pag = usePaginacion(f);

  const q = useQuery({
    queryKey: ["actas", "repo"],
    queryFn: () =>
      fetchAll((a, b) =>
        supabase
          .from("actas")
          .select(
            "id, numero, tipo, estado, created_at, firmado_at, pdf_path, tecnico_nombre, empleado:empleados(nombre, identificacion)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      ) as Promise<Fila[]>,
  });

  const conteos = useMemo(() => {
    const all = q.data ?? [];
    return {
      todas: all.length,
      pendiente: all.filter((x) => x.estado === "pendiente").length,
      firmada: all.filter((x) => x.estado === "firmada").length,
      anulada: all.filter((x) => x.estado === "anulada").length,
    };
  }, [q.data]);

  const filas = useMemo(() => {
    const t = f.empleado.toLowerCase(),
      tc = f.tecnico.toLowerCase();
    return (q.data ?? []).filter(
      (a) =>
        (!f.tipo || a.tipo === f.tipo) &&
        (!f.estado || a.estado === f.estado) &&
        (!f.desde || a.created_at >= f.desde) &&
        (!f.hasta || a.created_at <= f.hasta + "T23:59:59") &&
        (!t ||
          String(a.numero).includes(t) ||
          (a.empleado && (a.empleado.nombre.toLowerCase().includes(t) || a.empleado.identificacion.includes(t)))) &&
        (!tc || (a.tecnico_nombre ?? "").toLowerCase().includes(tc)),
    );
  }, [q.data, f]);
  const tecnicos = useMemo(
    () => [...new Set((q.data ?? []).map((a) => a.tecnico_nombre).filter(Boolean) as string[])].sort(),
    [q.data],
  );

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
      el.href = o;
      el.download = `actas_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(o), 5000);
      await supabase.rpc("log_evento", {
        p_accion: "DESCARGA_MASIVA",
        p_detalle: `Actas: ${elegidas.map((a) => a.numero).join(", ")}`,
      });
      setSel([]);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setZipando(false);
    }
  }

  const s =
    "h-9 rounded-lg border border-input bg-card/70 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-border focus:border-primary/60 focus:outline-none";
  const hayFiltros = Boolean(f.desde || f.hasta || f.empleado || f.tecnico || f.tipo || f.estado);

  return (
    <div className="space-y-4">
      <PageHeader title="Repositorio de actas" desc="Consulte, filtre y descargue las actas digitales de entrega, devolución y cambio.">
        {(me?.can("actas_entrega") || me?.can("actas_devolucion")) && (
          <Button size="sm" asChild className="gap-1.5">
            <Link to="/actas/nueva">
              <Plus className="h-3.5 w-3.5" />
              Nueva acta
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Interactive Status Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
          {(
            [
              ["", "Todas", conteos.todas],
              ["pendiente", "Pendientes de firma", conteos.pendiente],
              ["firmada", "Firmadas", conteos.firmada],
              ["anulada", "Anuladas", conteos.anulada],
            ] as const
          ).map(([val, label, count]) => {
            const active = f.estado === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setF({ ...f, estado: val })}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                    active ? "bg-primary/15 text-primary font-semibold" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {puedeVer && sel.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs">
            <span className="font-medium text-primary">{sel.length} seleccionada(s)</span>
            <Button size="sm" className="h-7 text-xs" disabled={zipando} onClick={zip}>
              <FileArchive className="mr-1 h-3.5 w-3.5" />
              {zipando ? "Empaquetando…" : "Descargar ZIP"}
            </Button>
            <button
              type="button"
              onClick={() => setSel([])}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Empleado, cédula o #acta…"
            className="pl-8 pr-8"
            value={f.empleado}
            onChange={(e) => setF({ ...f, empleado: e.target.value })}
          />
          {f.empleado && (
            <button
              type="button"
              onClick={() => setF({ ...f, empleado: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select className={s} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_ACTA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={s}
          value={f.tecnico}
          onChange={(e) => setF({ ...f, tecnico: e.target.value })}
          aria-label="Técnico"
        >
          <option value="">Todos los técnicos</option>
          {tecnicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Input
          type="date"
          className="w-auto text-xs"
          value={f.desde}
          onChange={(e) => setF({ ...f, desde: e.target.value })}
          aria-label="Desde"
        />
        <Input
          type="date"
          className="w-auto text-xs"
          value={f.hasta}
          onChange={(e) => setF({ ...f, hasta: e.target.value })}
          aria-label="Hasta"
        />
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setF({ desde: "", hasta: "", empleado: "", tecnico: "", tipo: "", estado: "" })}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full text-sm">
          <thead className="border-b border-border/70 bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2.5">
                {puedeVer && (
                  <Checkbox
                    aria-label="Seleccionar todas"
                    checked={todos}
                    onCheckedChange={(c) => setSel(c ? descargables.slice(0, MAX_ZIP).map((a) => a.id) : [])}
                  />
                )}
              </th>
              <th className="px-4 py-2.5">No.</th>
              <th className="px-4 py-2.5">Tipo</th>
              <th className="px-4 py-2.5">Empleado</th>
              <th className="px-4 py-2.5">Técnico</th>
              <th className="px-4 py-2.5">Creada</th>
              <th className="px-4 py-2.5">Firmada</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {q.isLoading && <FilasSkeleton columnas={9} />}
            {pagina.map((a) => (
              <tr
                key={a.id}
                onClick={() => nav({ to: "/actas/$id", params: { id: a.id } })}
                className="group cursor-pointer transition-colors hover:bg-muted/45"
              >
                <td className="px-3 py-2.5" onClick={(ev) => ev.stopPropagation()}>
                  {a.pdf_path && puedeVer && (
                    <Checkbox
                      aria-label={`Seleccionar acta ${a.numero}`}
                      checked={sel.includes(a.id)}
                      onCheckedChange={(c) => setSel(c ? [...sel, a.id] : sel.filter((x) => x !== a.id))}
                    />
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    to="/actas/$id"
                    params={{ id: a.id }}
                    onClick={(ev) => ev.stopPropagation()}
                    className="rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-primary hover:underline"
                  >
                    #{a.numero}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-[13px] font-medium">{TIPO_ACTA[a.tipo]}</td>
                <td className="px-4 py-2.5 text-[13px]">
                  <div className="font-medium text-foreground">{a.empleado?.nombre}</div>
                  {a.empleado?.identificacion && (
                    <div className="font-mono text-[11px] text-muted-foreground">CC {a.empleado.identificacion}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.tecnico_nombre ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{fmtFecha(a.created_at)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{fmtFecha(a.firmado_at, true)}</td>
                <td className="px-4 py-2.5">
                  <EstadoActa estado={a.estado} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                  <div className="inline-flex items-center gap-1">
                    {a.pdf_path && puedeVer && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Descargar PDF"
                        onClick={() => descargarPdfActa(url, a.id, `acta-${a.numero}.pdf`)}
                        aria-label="Descargar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {me?.isAdmin && a.estado !== "anulada" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Anular acta"
                        onClick={() => setAnular(a)}
                        aria-label="Anular acta"
                      >
                        <Ban className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    <ChevronRight
                      onClick={() => nav({ to: "/actas/$id", params: { id: a.id } })}
                      className="ml-1 h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </div>
                </td>
              </tr>
            ))}
            {!q.isLoading && !filas.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No se encontraron actas con estos criterios.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <DataTablePagination
        total={filas.length}
        pagina={pag.pagina}
        tamano={pag.tamano}
        onPagina={pag.setPagina}
        onTamano={pag.setTamano}
      />
      <AnularDialog
        acta={anular}
        onClose={() => setAnular(null)}
        onDone={() => {
          setAnular(null);
          qc.invalidateQueries({ queryKey: ["actas"] });
          qc.invalidateQueries({ queryKey: ["equipos"] });
        }}
      />
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
    <Dialog
      open={!!acta}
      onOpenChange={(o) => {
        if (!o) {
          setMotivo("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular acta #{acta?.numero}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {acta?.estado === "firmada" ? "El acta está firmada: revise después el estado de sus equipos. " : ""}
          Esta acción queda registrada en la auditoría.
        </p>
        <Textarea
          placeholder="Motivo de la anulación (obligatorio)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <DialogFooter>
          <Button variant="destructive" onClick={confirmar} disabled={!motivo.trim() || loading}>
            Anular acta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
