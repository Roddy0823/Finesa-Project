import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { BannerStock } from "@/components/StockAlertas";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { ESTADO_EQUIPO, descargarCSV, errMsg, fmtFecha } from "@/lib/constantes";
import { FinalizarReparacion } from "@/components/FinalizarReparacion";
import { copiarTexto, cn, sanitizarFilaExcel } from "@/lib/utils";

import { PageHeader, EstadoEquipo } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Laptop,
  Package,
  Plus,
  Search,
  ShieldCheck,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/equipos/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    tab?: "activos" | "en_reparacion" | "en_alistamiento" | "de_baja" | undefined;
    estado?: "disponible" | "asignado" | undefined;
    tipo?: string | undefined;
    marca?: string | undefined;
    sede?: string | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
  } => ({
    tab:
      s.tab === "en_reparacion" || s.tab === "en_alistamiento" || s.tab === "de_baja" || s.tab === "activos"
        ? s.tab
        : undefined,
    estado: s.estado === "disponible" || s.estado === "asignado" ? s.estado : undefined,
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
    marca: typeof s.marca === "string" ? s.marca : undefined,
    sede: typeof s.sede === "string" ? s.sede : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    page: typeof s.page === "number" ? s.page : Number(s.page) || undefined,
    pageSize: typeof s.pageSize === "number" ? s.pageSize : Number(s.pageSize) || undefined,
  }),
  head: () => ({
    meta: [{ title: "Inventario — Finesa" }, { name: "description", content: "Equipos de cómputo y periféricos." }],
  }),
  component: Equipos,
});

const sel =
  "h-9 rounded-lg border border-input bg-card/70 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors hover:border-border focus:border-primary/60 focus:outline-none";

type Pestana = "activos" | "en_reparacion" | "en_alistamiento" | "de_baja";

const limpiar = (t: string) => t.replace(/[%,()*\\]/g, " ").trim();

function Equipos() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const nav = useNavigate();
  const sp = Route.useSearch();
  const [tab, setTab] = useState<Pestana>(sp.tab ?? "activos");
  const [f, setF] = useState({
    texto: sp.q ?? "",
    tipo: sp.tipo ?? "",
    marca: sp.marca ?? "",
    estado: sp.estado ?? "",
    sede: sp.sede ?? "",
  });
  const [texto, setTexto] = useState(limpiar(f.texto));
  useEffect(() => {
    const h = setTimeout(() => setTexto(limpiar(f.texto)), 250);
    return () => clearTimeout(h);
  }, [f.texto]);

  const filtros = { texto, tipo: f.tipo, marca: f.marca, estado: f.estado, sede: f.sede };
  const pag = usePaginacion({ ...filtros, tab }, sp.pageSize ?? 25);

  // Sincronizar filtros con la URL
  useEffect(() => {
    void nav({
      to: "/equipos",
      search: {
        tab: tab !== "activos" ? tab : undefined,
        estado: (f.estado as "disponible" | "asignado") || undefined,
        tipo: f.tipo || undefined,
        marca: f.marca || undefined,
        sede: f.sede || undefined,
        q: texto || undefined,
        page: pag.pagina > 1 ? pag.pagina : undefined,
        pageSize: pag.tamano !== 25 ? pag.tamano : undefined,
      },
      replace: true,
    });
  }, [tab, f.estado, f.tipo, f.marca, f.sede, texto, pag.pagina, pag.tamano, nav]);

  const conteoQ = useQuery({
    queryKey: ["equipos", "conteo"],
    queryFn: async () => {
      const { data } = await supabase.rpc("panel_conteos");
      const c: Record<string, number> = {};
      for (const r of (data ?? []) as { estado: string; total: number }[]) c[r.estado] = Number(r.total);
      return {
        activos: (c.disponible ?? 0) + (c.asignado ?? 0),
        disponible: c.disponible ?? 0,
        asignado: c.asignado ?? 0,
        en_reparacion: c.en_reparacion ?? 0,
        en_alistamiento: c.en_alistamiento ?? 0,
        de_baja: c.de_baja ?? 0,
      };
    },
  });

  const q = useQuery({
    queryKey: ["equipos", "pagina", tab, filtros, pag.desde, pag.tamano],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let s = supabase.from("equipos").select("*, empleado:empleados(id, nombre)", { count: "exact" });
      if (tab === "activos") {
        s = f.estado ? s.eq("estado", f.estado as "disponible") : s.in("estado", ["disponible", "asignado"]);
      } else {
        s = s.eq("estado", tab);
      }
      if (f.tipo) s = s.eq("tipo_id", f.tipo);
      if (f.marca) s = s.eq("marca_id", f.marca);
      if (f.sede) s = s.eq("sede_id", f.sede);
      if (texto) {
        const { data: emps } = await supabase.from("empleados").select("id").ilike("nombre", `%${texto}%`).limit(200);
        const conds = [
          `serie.ilike.%${texto}%`,
          `activo_fijo.ilike.%${texto}%`,
          `modelo.ilike.%${texto}%`,
          `nombre_equipo.ilike.%${texto}%`,
        ];
        if (emps?.length) conds.push(`empleado_id.in.(${emps.map((e) => e.id).join(",")})`);
        s = s.or(conds.join(","));
      }
      const ordenCol = tab === "activos" ? "created_at" : "updated_at";
      const { data, count, error } = await s
        .order(ordenCol, { ascending: false })
        .order("id")
        .range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: data ?? [], total: count ?? 0 };
    },
  });

  const total = q.data?.total ?? 0;
  const lista = q.data?.filas ?? [];
  const conteo = conteoQ.data ?? {
    activos: 0,
    disponible: 0,
    asignado: 0,
    en_reparacion: 0,
    en_alistamiento: 0,
    de_baja: 0,
  };
  const tabs: [Pestana, string][] = [
    ["activos", "Activos"],
    ["en_alistamiento", "En alistamiento"],
    ["en_reparacion", "En reparación"],
    ["de_baja", "Dados de baja"],
  ];

  const hayFiltros = Boolean(f.texto || f.tipo || f.marca || f.estado || f.sede);
  const totalGeneral =
    conteo.activos + conteo.en_alistamiento + conteo.en_reparacion + conteo.de_baja;
  const pctDisponible = totalGeneral > 0 ? Math.round((conteo.disponible / totalGeneral) * 100) : 0;
  const pctAsignado = totalGeneral > 0 ? Math.round((conteo.asignado / totalGeneral) * 100) : 0;
  const hoyIso = new Date().toISOString().slice(0, 10);

  async function exportarActivosCSV() {
    if (!lista.length) return toast.info("No hay equipos en la vista actual para exportar");
    descargarCSV(
      `inventario_equipos_${hoyIso}.csv`,
      lista.map((e) => {
        const emp = e.empleado as { id: string; nombre: string } | null;
        return {
          Serie: e.serie,
          Activo_Fijo: e.activo_fijo ?? "",
          Tipo: cat.nombre(e.tipo_id),
          Marca: cat.nombre(e.marca_id),
          Modelo: e.modelo ?? "",
          Sede: cat.nombre(e.sede_id),
          Asignado_A: emp?.nombre ?? "",
          Valor_Compra: e.valor_compra ?? "",
          Garantia_Hasta: e.garantia_fin ?? "",
          Estado: ESTADO_EQUIPO[e.estado]?.label ?? e.estado,
        };
      }),
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Inventario" desc={`${total.toLocaleString("es-CO")} equipo(s) en la vista actual`}>
        {tab === "activos" && (
          <Button variant="outline" size="sm" onClick={exportarActivosCSV} disabled={!lista.length}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Exportar CSV
          </Button>
        )}
        {me?.can("equipos_editar") && <NuevoEquipo />}
      </PageHeader>
      <BannerStock />

      {/* KPIs interactivos de estado del inventario */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            setTab("activos");
            setF({ ...f, estado: "" });
          }}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            tab === "activos" && f.estado === ""
              ? "border-primary/40 ring-1 ring-primary/20"
              : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Equipos activos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Laptop className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {conteo.activos.toLocaleString("es-CO")}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Disponibles en bodega y asignados en operación.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("activos");
            setF({ ...f, estado: f.estado === "disponible" ? "" : "disponible" });
          }}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            tab === "activos" && f.estado === "disponible"
              ? "border-success/40 ring-1 ring-success/20"
              : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Disponibles para entrega</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {conteo.disponible.toLocaleString("es-CO")}
            </span>
            <span className="rounded-full bg-success/12 px-2 py-0.2 font-mono text-[10px] font-semibold text-success">
              {pctDisponible}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Listos en stock para nuevas actas de entrega.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setTab("activos");
            setF({ ...f, estado: f.estado === "asignado" ? "" : "asignado" });
          }}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            tab === "activos" && f.estado === "asignado"
              ? "border-primary/40 ring-1 ring-primary/20"
              : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Asignados a colaboradores</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {conteo.asignado.toLocaleString("es-CO")}
            </span>
            <span className="rounded-full bg-primary/12 px-2 py-0.2 font-mono text-[10px] font-semibold text-primary">
              {pctAsignado}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">En custodia activa respaldados por acta firmada.</p>
        </button>

        <button
          type="button"
          onClick={() => setTab(tab === "en_reparacion" ? "en_alistamiento" : "en_reparacion")}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            tab === "en_reparacion" || tab === "en_alistamiento"
              ? "border-warning/40 ring-1 ring-warning/20"
              : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Taller y alistamiento</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-warning/30 bg-warning/15 text-warning-foreground">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {(conteo.en_reparacion + conteo.en_alistamiento).toLocaleString("es-CO")}
            </span>
            <span className="text-xs text-muted-foreground">
              {conteo.en_reparacion} rep. · {conteo.en_alistamiento} alist.
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {conteo.de_baja.toLocaleString("es-CO")} equipo(s) dados de baja históricos.
          </p>
        </button>
      </div>

      {/* Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
          {tabs.map(([k, l]) => {
            const active = tab === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  active
                    ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{l}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 font-mono text-[10px]",
                    active ? "bg-primary/15 text-primary font-semibold" : "bg-muted text-muted-foreground",
                  )}
                >
                  {conteo[k]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Interactive Status Quick-Pills when in Activos */}
        {tab === "activos" && (
          <div className="flex items-center gap-1.5 text-xs">
            {(
              [
                ["", "Todos", conteo.activos],
                ["disponible", "Disponibles", conteo.disponible],
                ["asignado", "Asignados", conteo.asignado],
              ] as const
            ).map(([val, label, count]) => (
              <button
                key={val}
                type="button"
                onClick={() => setF({ ...f, estado: f.estado === val ? "" : val })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                  f.estado === val
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <span>{label}</span>
                <span className="font-mono text-[10px] opacity-75">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar serie, activo fijo, modelo o empleado…"
            className="pl-8 pr-8"
            value={f.texto}
            onChange={(e) => setF({ ...f, texto: e.target.value })}
          />
          {f.texto && (
            <button
              type="button"
              onClick={() => setF({ ...f, texto: "" })}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select className={sel} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          <option value="">Todos los tipos</option>
          {cat.byTipo("tipo_equipo", false).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select className={sel} value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })}>
          <option value="">Todas las marcas</option>
          {cat.byTipo("marca", false).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select className={sel} value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })}>
          <option value="">Todas las sedes</option>
          {cat.byTipo("sede", false).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setF({ texto: "", tipo: "", marca: "", estado: "", sede: "" })}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Table */}
      {tab !== "activos" ? (
        <ListaEspecial
          tab={tab}
          lista={lista}
          cargando={q.isLoading}
          puedeEditar={!!me?.can("equipos_editar")}
          filtrosActuales={filtros}
        />
      ) : (
        <div
          className={`overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs transition-opacity ${q.isFetching && !q.isLoading ? "opacity-60" : ""}`}
        >
          <table className="w-full text-sm">
            <thead className="border-b border-border/70 bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Serie / código</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Marca / modelo</th>
                <th className="px-4 py-2.5">Sede</th>
                <th className="px-4 py-2.5">Asignado a</th>
                <th className="px-4 py-2.5 text-right">Valor</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="w-8 px-2 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {q.isLoading && <FilasSkeleton columnas={8} />}
              {lista.map((e) => {
                const emp = e.empleado as { id: string; nombre: string } | null;
                return (
                  <tr
                    key={e.id}
                    onClick={() => nav({ to: "/equipos/$id", params: { id: e.id } })}
                    className="group cursor-pointer transition-colors hover:bg-muted/45"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/equipos/$id"
                          params={{ id: e.id }}
                          onClick={(ev) => ev.stopPropagation()}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {e.serie}
                        </Link>
                        <button
                          type="button"
                          title="Copiar serie"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            if (await copiarTexto(e.serie)) toast.success(`Serie ${e.serie} copiada`);
                          }}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      {e.activo_fijo && (
                        <div className="font-mono text-[11px] text-muted-foreground">AF: {e.activo_fijo}</div>
                      )}
                      {e.garantia_fin && e.garantia_fin >= hoyIso && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-success">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          En garantía
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium">{cat.nombre(e.tipo_id)}</td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                      <span className="text-foreground">{cat.nombre(e.marca_id)}</span> {e.modelo}
                      {e.nombre_equipo && (
                        <div className="font-mono text-[10px] text-muted-foreground">Host: {e.nombre_equipo}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{cat.nombre(e.sede_id)}</td>
                    <td className="px-4 py-2.5 text-[13px]">
                      {emp ? (
                        <div>
                          <Link
                            to="/empleados/$id"
                            params={{ id: emp.id }}
                            onClick={(ev) => ev.stopPropagation()}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {emp.nombre}
                          </Link>
                          {e.prestamo_hasta && (
                            <div className="mt-0.5 inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/15 px-1.5 py-0.2 text-[10px] font-medium text-warning-foreground">
                              <CalendarClock className="h-2.5 w-2.5" />
                              Préstamo hasta {fmtFecha(e.prestamo_hasta)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {e.valor_compra != null ? `$${Number(e.valor_compra).toLocaleString("es-CO")}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <EstadoEquipo estado={e.estado} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </td>
                  </tr>
                );
              })}
              {!q.isLoading && !lista.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No hay equipos que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <DataTablePagination
        total={total}
        pagina={pag.pagina}
        tamano={pag.tamano}
        onPagina={pag.setPagina}
        onTamano={pag.setTamano}
      />
    </div>
  );
}

type Eq = {
  id: string;
  serie: string;
  activo_fijo: string | null;
  tipo_id: string;
  marca_id: string | null;
  modelo: string | null;
  sede_id: string | null;
  estado: string;
  empleado: unknown;
};

function ListaEspecial({
  tab,
  lista,
  cargando,
  puedeEditar,
  filtrosActuales,
}: {
  tab: "en_reparacion" | "en_alistamiento" | "de_baja";
  lista: Eq[];
  cargando: boolean;
  puedeEditar: boolean;
  filtrosActuales: { tipo: string; marca: string; sede: string; texto: string };
}) {
  const cat = useCatalogos();
  const nav = useNavigate();
  const [exportando, setExportando] = useState(false);
  const ids = lista.map((e) => e.id);
  const hq = useQuery({
    queryKey: ["equipos", "eventos", tab, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("equipo_historial")
        .select("equipo_id, detalle, created_at, user_id")
        .eq("evento", tab)
        .in("equipo_id", ids)
        .order("created_at", { ascending: false });
      const filas = data ?? [];
      const ultimo: Record<string, (typeof filas)[number]> = {};
      for (const r of filas) if (!ultimo[r.equipo_id]) ultimo[r.equipo_id] = r;
      const uids = [...new Set(Object.values(ultimo).map((r) => r.user_id).filter(Boolean))] as string[];
      const { data: ps } = uids.length
        ? await supabase.from("profiles").select("id, nombre, email").in("id", uids)
        : { data: [] };
      const usuarios = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nombre || p.email]));
      return { ultimo, usuarios };
    },
  });
  const info = (id: string) => {
    const r = hq.data?.ultimo[id];
    const d = r?.detalle ?? "";
    return {
      fecha: r ? fmtFecha(r.created_at) : "—",
      motivo: d.match(/Motivo:\s*(.*)$/)?.[1] ?? "—",
      anterior: d.match(/Responsable:\s*(.*?)\s*→/)?.[1] ?? "—",
      por: r?.user_id ? (hq.data?.usuarios[r.user_id] ?? "Usuario") : "—",
    };
  };
  async function exportar() {
    setExportando(true);
    try {
      toast.info("Generando reporte de exportación…");
      let s = supabase
        .from("equipos")
        .select("*, empleado:empleados(id, nombre)")
        .eq("estado", tab);
      if (filtrosActuales.tipo) s = s.eq("tipo_id", filtrosActuales.tipo);
      if (filtrosActuales.marca) s = s.eq("marca_id", filtrosActuales.marca);
      if (filtrosActuales.sede) s = s.eq("sede_id", filtrosActuales.sede);
      if (filtrosActuales.texto) {
        const { data: emps } = await supabase.from("empleados").select("id").ilike("nombre", `%${filtrosActuales.texto}%`).limit(200);
        const conds = [
          `serie.ilike.%${filtrosActuales.texto}%`,
          `activo_fijo.ilike.%${filtrosActuales.texto}%`,
          `modelo.ilike.%${filtrosActuales.texto}%`,
          `nombre_equipo.ilike.%${filtrosActuales.texto}%`,
        ];
        if (emps?.length) conds.push(`empleado_id.in.(${emps.map((e) => e.id).join(",")})`);
        s = s.or(conds.join(","));
      }
      const { data: items, error } = await s.order("updated_at", { ascending: false }).limit(2000);
      if (error) throw error;
      if (!items?.length) return toast.info("No hay registros para exportar");

      const itemIds = items.map((e) => e.id);
      const filasHist: { equipo_id: string; detalle: string | null; created_at: string; user_id: string | null }[] = [];
      for (let i = 0; i < itemIds.length; i += 200) {
        const { data } = await supabase
          .from("equipo_historial")
          .select("equipo_id, detalle, created_at, user_id")
          .eq("evento", tab)
          .in("equipo_id", itemIds.slice(i, i + 200))
          .order("created_at", { ascending: false });
        filasHist.push(...(data ?? []));
      }
      const ultimo: Record<string, (typeof filasHist)[number]> = {};
      for (const r of filasHist) if (!ultimo[r.equipo_id]) ultimo[r.equipo_id] = r;
      const uids = [...new Set(Object.values(ultimo).map((r) => r.user_id).filter(Boolean))] as string[];
      const { data: ps } = uids.length
        ? await supabase.from("profiles").select("id, nombre, email").in("id", uids)
        : { data: [] };
      const usuarios = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nombre || p.email]));

      const getInfo = (id: string) => {
        const r = ultimo[id];
        const d = r?.detalle ?? "";
        return {
          fecha: r ? fmtFecha(r.created_at) : "—",
          motivo: d.match(/Motivo:\s*(.*)$/)?.[1] ?? "—",
          anterior: d.match(/Responsable:\s*(.*?)\s*→/)?.[1] ?? "—",
          por: r?.user_id ? (usuarios[r.user_id] ?? "Usuario") : "—",
        };
      };

      const XLSX = await import("xlsx");
      const filas = items.map((e) => {
        const i = getInfo(e.id);
        const emp = (e.empleado as { nombre: string } | null)?.nombre ?? "";
        return sanitizarFilaExcel(
          tab === "en_reparacion"
            ? {
                Serie: e.serie,
                "Activo fijo": e.activo_fijo ?? "",
                Tipo: cat.nombre(e.tipo_id),
                Marca: cat.nombre(e.marca_id),
                Modelo: e.modelo ?? "",
                Empleado: emp,
                Desde: i.fecha,
                Motivo: i.motivo,
              }
            : {
                Serie: e.serie,
                "Activo fijo": e.activo_fijo ?? "",
                Tipo: cat.nombre(e.tipo_id),
                Marca: cat.nombre(e.marca_id),
                Modelo: e.modelo ?? "",
                "Último responsable": i.anterior,
                "Fecha de baja": i.fecha,
                Motivo: i.motivo,
                "Dado de baja por": i.por,
              },
        );
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(filas),
        tab === "en_reparacion" ? "En reparación" : tab === "en_alistamiento" ? "En alistamiento" : "Dados de baja",
      );
      XLSX.writeFile(
        wb,
        tab === "en_reparacion"
          ? "equipos-en-reparacion.xlsx"
          : tab === "en_alistamiento"
            ? "equipos-en-alistamiento.xlsx"
            : "equipos-dados-de-baja.xlsx",
      );
      toast.success("Archivo Excel exportado exitosamente");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setExportando(false);
    }
  }
  const th = "px-4 py-2.5";
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button variant="outline" size="sm" onClick={exportar} disabled={exportando || !lista.length}>
          <Download className="mr-1 h-3.5 w-3.5" />
          {exportando ? "Exportando…" : "Exportar a Excel"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-2xs">
        <table className="w-full text-sm">
          <thead className="border-b border-border/70 bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tab === "en_reparacion" ? (
              <tr>
                <th className={th}>Serie / código</th>
                <th className={th}>Equipo</th>
                <th className={th}>Empleado ligado</th>
                <th className={th}>Desde</th>
                <th className={th}>Motivo</th>
                <th className={th}></th>
              </tr>
            ) : (
              <tr>
                <th className={th}>Serie / código</th>
                <th className={th}>Equipo</th>
                <th className={th}>Último responsable</th>
                <th className={th}>Fecha</th>
                <th className={th}>Motivo</th>
                <th className={th}>Por</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border/60">
            {lista.map((e) => {
              const i = info(e.id);
              const emp = e.empleado as { id: string; nombre: string } | null;
              return (
                <tr
                  key={e.id}
                  onClick={() => nav({ to: "/equipos/$id", params: { id: e.id } })}
                  className="cursor-pointer transition-colors hover:bg-muted/45"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      to="/equipos/$id"
                      params={{ id: e.id }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {e.serie}
                    </Link>
                    {e.activo_fijo && <div className="font-mono text-[11px] text-muted-foreground">{e.activo_fijo}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-[13px]">
                    {cat.nombre(e.tipo_id)} · {cat.nombre(e.marca_id)} {e.modelo}
                  </td>
                  {tab === "en_reparacion" ? (
                    <td className="px-4 py-2.5 text-[13px]">
                      {emp ? (
                        <Link
                          to="/empleados/$id"
                          params={{ id: emp.id }}
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-primary hover:underline"
                        >
                          {emp.nombre}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : (
                    <td className="px-4 py-2.5 text-[13px]">{i.anterior}</td>
                  )}
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{i.fecha}</td>
                  <td className="max-w-xs px-4 py-2.5 text-xs text-muted-foreground">{i.motivo}</td>
                  {tab === "en_reparacion" ? (
                    <td className="px-4 py-2.5 text-right" onClick={(ev) => ev.stopPropagation()}>
                      {puedeEditar && <FinalizarReparacion id={e.id} empleado={emp?.nombre ?? null} size="sm" />}
                    </td>
                  ) : (
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{i.por}</td>
                  )}
                </tr>
              );
            })}
            {cargando && <FilasSkeleton columnas={6} />}
            {!cargando && !lista.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No hay equipos en esta sección.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NuevoEquipo() {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const [open, setOpen] = useState(false);
  const vacio = {
    tipo_id: "",
    marca_id: "",
    sede_id: "",
    modelo: "",
    serie: "",
    fecha_ingreso: new Date().toISOString().slice(0, 10),
    estado: "disponible",
    observaciones: "",
    proveedor: "",
    garantia_fin: "",
  };
  const [f, setF] = useState(vacio);
  const [factura, setFactura] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.tipo_id) return toast.error("Seleccione el tipo de equipo");
    setLoading(true);
    try {
      let factura_path: string | null = null;
      if (factura) {
        if (factura.size > 10 * 1024 * 1024) throw new Error("La factura supera 10 MB");
        const ext = factura.name.split(".").pop()?.toLowerCase() ?? "pdf";
        factura_path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("facturas").upload(factura_path, factura, { contentType: factura.type });
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from("equipos")
        .insert({
          tipo_id: f.tipo_id,
          marca_id: f.marca_id || null,
          sede_id: f.sede_id || null,
          modelo: f.modelo || null,
          serie: f.serie.trim(),
          fecha_ingreso: f.fecha_ingreso,
          estado: f.estado as "disponible",
          observaciones: f.observaciones || null,
          proveedor: f.proveedor || null,
          garantia_fin: f.garantia_fin || null,
          factura_path,
        })
        .select("serie")
        .single();
      if (error) throw error.code === "23505" ? new Error("Ya existe un equipo con esa serie o código.") : error;
      toast.success(`Equipo registrado: ${data.serie}`);
      setF(vacio);
      setFactura(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["equipos"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const opt = (tipo: string) =>
    cat.byTipo(tipo).map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Registrar equipo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar equipo</DialogTitle>
        </DialogHeader>
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipo de equipo *</Label>
            <select
              className={sel + " w-full"}
              value={f.tipo_id}
              onChange={(e) => setF({ ...f, tipo_id: e.target.value })}
              required
            >
              <option value="">Seleccione…</option>
              {opt("tipo_equipo")}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Marca</Label>
            <select className={sel + " w-full"} value={f.marca_id} onChange={(e) => setF({ ...f, marca_id: e.target.value })}>
              <option value="">—</option>
              {opt("marca")}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Modelo</Label>
            <Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Número de serie</Label>
            <Input
              value={f.serie}
              placeholder="Vacío = código FIN-ACC automático"
              onChange={(e) => setF({ ...f, serie: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sede</Label>
            <select className={sel + " w-full"} value={f.sede_id} onChange={(e) => setF({ ...f, sede_id: e.target.value })}>
              <option value="">—</option>
              {opt("sede")}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Estado inicial</Label>
            <select className={sel + " w-full"} value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="disponible">Disponible</option>
              <option value="en_reparacion">En reparación</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de ingreso</Label>
            <Input type="date" value={f.fecha_ingreso} onChange={(e) => setF({ ...f, fecha_ingreso: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Fin de garantía</Label>
            <Input type="date" value={f.garantia_fin} onChange={(e) => setF({ ...f, garantia_fin: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <Input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Factura (PDF o imagen)</Label>
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setFactura(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observaciones</Label>
            <Textarea value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={loading}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
