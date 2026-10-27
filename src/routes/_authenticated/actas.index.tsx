import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { TIPO_ACTA, errMsg, fmtFecha } from "@/lib/constantes";
import { urlArchivo, crearEnlaceFirma } from "@/lib/firmas.functions";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { copiarTexto } from "@/lib/utils";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Ban, Download, FileArchive, Plus, Search, X, ChevronRight, Copy, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/actas/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    estado?: string | undefined;
    tipo?: string | undefined;
    tecnico?: string | undefined;
    desde?: string | undefined;
    hasta?: string | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
  } => ({
    estado: typeof s.estado === "string" ? s.estado : undefined,
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
    tecnico: typeof s.tecnico === "string" ? s.tecnico : undefined,
    desde: typeof s.desde === "string" ? s.desde : undefined,
    hasta: typeof s.hasta === "string" ? s.hasta : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    page: typeof s.page === "number" ? s.page : Number(s.page) || undefined,
    pageSize: typeof s.pageSize === "number" ? s.pageSize : Number(s.pageSize) || undefined,
  }),
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
const limpiar = (t: string) => t.replace(/[%,()*\\]/g, " ").trim();

function Repositorio() {
  const search = Route.useSearch();
  const { data: me } = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const url = useServerFn(urlArchivo);
  const enlace = useServerFn(crearEnlaceFirma);

  const estado = search.estado ?? "";
  const tipo = search.tipo ?? "";
  const tecnico = search.tecnico ?? "";
  const desde = search.desde ?? "";
  const hasta = search.hasta ?? "";
  const qParam = search.q ?? "";

  const [textoInput, setTextoInput] = useState(qParam);

  useEffect(() => {
    setTextoInput(qParam);
  }, [qParam]);

  useEffect(() => {
    const h = setTimeout(() => {
      const limpio = limpiar(textoInput);
      if (limpio !== qParam) {
        void nav({
          to: "/actas",
          search: (prev) => ({
            ...prev,
            q: limpio || undefined,
            page: undefined,
          }),
          replace: true,
        });
      }
    }, 250);
    return () => clearTimeout(h);
  }, [textoInput, qParam, nav]);

  const [sel, setSel] = useState<string[]>([]);
  const [anular, setAnular] = useState<Fila | null>(null);
  const [zipando, setZipando] = useState(false);

  const filtros = { desde, hasta, texto: qParam, tecnico, tipo, estado };
  const pag = usePaginacion(filtros, search.pageSize ?? 25);

  const conteoQ = useQuery({
    queryKey: ["actas", "conteos"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("panel_conteos_actas");
        if (!error && data && Array.isArray(data) && data.length > 0) {
          const c: Record<string, number> = {};
          let total = 0;
          for (const r of data as { estado: string; total: number }[]) {
            const val = Number(r.total);
            c[r.estado] = val;
            total += val;
          }
          return {
            todas: total,
            pendiente: c.pendiente ?? 0,
            firmada: c.firmada ?? 0,
            anulada: c.anulada ?? 0,
          };
        }
      } catch {
        /* fallback si aún no existe la función en la réplica local */
      }
      const [todas, pendiente, firmada, anulada] = await Promise.all([
        supabase.from("actas").select("id", { count: "exact", head: true }),
        supabase.from("actas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("actas").select("id", { count: "exact", head: true }).eq("estado", "firmada"),
        supabase.from("actas").select("id", { count: "exact", head: true }).eq("estado", "anulada"),
      ]);
      return {
        todas: todas.count ?? 0,
        pendiente: pendiente.count ?? 0,
        firmada: firmada.count ?? 0,
        anulada: anulada.count ?? 0,
      };
    },
  });

  const tecnicosQ = useQuery({
    queryKey: ["actas", "tecnicos-lista"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nombre, email").order("nombre");
      return [...new Set((data ?? []).map((p) => p.nombre || p.email).filter(Boolean))] as string[];
    },
  });

  const q = useQuery({
    queryKey: ["actas", "repo-paginado", filtros, pag.desde, pag.tamano],
    staleTime: 0,
    refetchOnMount: "always",
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let s = supabase
        .from("actas")
        .select(
          "id, numero, tipo, estado, created_at, firmado_at, pdf_path, tecnico_nombre, empleado:empleados(nombre, identificacion)",
          { count: "exact" },
        );

      if (estado) s = s.eq("estado", estado as "pendiente");
      if (tipo) s = s.eq("tipo", tipo as "entrega");
      if (desde) s = s.gte("created_at", desde);
      if (hasta) s = s.lte("created_at", hasta + "T23:59:59");
      if (tecnico) s = s.ilike("tecnico_nombre", `%${tecnico}%`);

      if (qParam) {
        const { data: emps } = await supabase
          .from("empleados")
          .select("id")
          .or(`nombre.ilike.%${qParam}%,identificacion.ilike.%${qParam}%`)
          .limit(100);
        const conds: string[] = [];
        const num = Number(qParam);
        if (!isNaN(num) && num > 0) conds.push(`numero.eq.${num}`);
        if (emps?.length) conds.push(`empleado_id.in.(${emps.map((e) => e.id).join(",")})`);
        if (conds.length) {
          s = s.or(conds.join(","));
        } else {
          return { filas: [] as Fila[], total: 0 };
        }
      }

      const { data, count, error } = await s
        .order("created_at", { ascending: false })
        .order("id")
        .range(pag.desde, pag.hasta);

      if (error) throw error;
      return { filas: (data ?? []) as Fila[], total: count ?? 0 };
    },
  });

  const conteos = conteoQ.data ?? { todas: 0, pendiente: 0, firmada: 0, anulada: 0 };
  const filas = q.data?.filas ?? [];
  const total = q.data?.total ?? 0;
  const tecnicos = tecnicosQ.data ?? [];

  const puedeVer = me?.can("repositorio_ver");
  const descargables = filas.filter((a) => a.pdf_path);
  const todos = descargables.length > 0 && descargables.every((a) => sel.includes(a.id));

  async function zip() {
    if (!sel.length) return;
    if (sel.length > MAX_ZIP) return toast.error(`Máximo ${MAX_ZIP} actas por descarga.`);
    setZipando(true);
    try {
      const { data: elegidas, error } = await supabase
        .from("actas")
        .select("id, numero, tipo, pdf_path")
        .in("id", sel);
      if (error) throw error;
      const conPdf = (elegidas ?? []).filter((a) => a.pdf_path);
      if (!conPdf.length) throw new Error("Las actas seleccionadas no cuentan con PDF disponible.");

      const { default: JSZip } = await import("jszip");
      const z = new JSZip();
      for (const a of conPdf) {
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
        p_detalle: `Actas: ${conPdf.map((a) => a.numero).join(", ")}`,
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
  const hayFiltros = Boolean(desde || hasta || qParam || tecnico || tipo || estado);

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
            const active = estado === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() =>
                  nav({
                    to: "/actas",
                    search: (prev) => ({ ...prev, estado: val || undefined, page: undefined }),
                    replace: true,
                  })
                }
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
            value={textoInput}
            onChange={(e) => setTextoInput(e.target.value)}
          />
          {textoInput && (
            <button
              type="button"
              onClick={() => {
                setTextoInput("");
                void nav({
                  to: "/actas",
                  search: (prev) => ({ ...prev, q: undefined, page: undefined }),
                  replace: true,
                });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          className={s}
          value={tipo}
          onChange={(e) =>
            nav({
              to: "/actas",
              search: (prev) => ({ ...prev, tipo: e.target.value || undefined, page: undefined }),
              replace: true,
            })
          }
          aria-label="Tipo"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_ACTA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={s}
          value={tecnico}
          onChange={(e) =>
            nav({
              to: "/actas",
              search: (prev) => ({ ...prev, tecnico: e.target.value || undefined, page: undefined }),
              replace: true,
            })
          }
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
          value={desde}
          onChange={(e) =>
            nav({
              to: "/actas",
              search: (prev) => ({ ...prev, desde: e.target.value || undefined, page: undefined }),
              replace: true,
            })
          }
          aria-label="Desde"
        />
        <Input
          type="date"
          className="w-auto text-xs"
          value={hasta}
          onChange={(e) =>
            nav({
              to: "/actas",
              search: (prev) => ({ ...prev, hasta: e.target.value || undefined, page: undefined }),
              replace: true,
            })
          }
          aria-label="Hasta"
        />
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTextoInput("");
              void nav({ to: "/actas", search: {}, replace: true });
            }}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Table */}
      <div className={cn("overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs transition-opacity", q.isFetching && !q.isLoading ? "opacity-60" : "")}>
        <table className="w-full text-sm">
          <thead className="border-b border-border/70 bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2.5">
                {puedeVer && (
                  <Checkbox
                    aria-label="Seleccionar todas"
                    checked={todos}
                    onCheckedChange={(c) =>
                      setSel(
                        c
                          ? Array.from(new Set([...sel, ...descargables.slice(0, MAX_ZIP).map((a) => a.id)]))
                          : sel.filter((id) => !filas.some((a) => a.id === id)),
                      )
                    }
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
            {filas.map((a) => (
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
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {a.firmado_at ? (
                    fmtFecha(a.firmado_at, true)
                  ) : (
                    <span className="text-[11px] font-medium text-warning">Pendiente de firma</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <EstadoActa estado={a.estado} />
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                  <div className="inline-flex items-center gap-1">
                    {a.estado === "pendiente" && me?.can("firmas_capturar") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Copiar enlace de firma"
                        onClick={async () => {
                          try {
                            const r = await enlace({ data: { actaId: a.id } });
                            const link = `${window.location.origin}/firmar/${r.token}`;
                            const copiado = await copiarTexto(link);
                            if (copiado) toast.success("Enlace de firma copiado (15 minutos). Si vence, genere y envíe uno nuevo.");
                            else toast.info("Enlace generado (15 minutos). Si vence, genere y envíe uno nuevo.");
                          } catch (err) {
                            toast.error(errMsg(err));
                          }
                        }}
                        aria-label="Copiar enlace de firma"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {a.estado === "pendiente" && me?.can("firmas_capturar") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Firma presencial"
                        onClick={() => nav({ to: "/actas/$id", params: { id: a.id } })}
                        aria-label="Firma presencial"
                      >
                        <PenLine className="h-4 w-4" />
                      </Button>
                    )}
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
        total={total}
        pagina={pag.pagina}
        tamano={pag.tamano}
        onPagina={(p) =>
          nav({
            to: "/actas",
            search: (prev) => ({ ...prev, page: p > 1 ? p : undefined }),
            replace: true,
          })
        }
        onTamano={(t) =>
          nav({
            to: "/actas",
            search: (prev) => ({ ...prev, pageSize: t !== 25 ? t : undefined, page: undefined }),
            replace: true,
          })
        }
      />
      <AnularDialog
        acta={anular}
        onClose={() => setAnular(null)}
        onDone={() => {
          setAnular(null);
          ["actas", "panel", "equipos"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
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
