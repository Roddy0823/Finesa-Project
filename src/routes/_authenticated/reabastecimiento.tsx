import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { fmtFecha } from "@/lib/constantes";
import { cop, pedidoAtrasado } from "@/lib/proveedores";
import { PageHeader } from "@/components/Estado";
import { ConfigAlertas, ProveedoresSheet, infoLlegadaPedido, useStockBajo } from "@/components/StockAlertas";
import { DetallePedido, EstadoPedido, NuevoPedido } from "@/components/Pedidos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Star,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/reabastecimiento")({
  head: () => ({
    meta: [
      { title: "Reabastecimiento — Finesa" },
      { name: "description", content: "Pedidos de compra y reabastecimiento del inventario." },
    ],
  }),
  component: Reabastecimiento,
});

type Fila = {
  id: string;
  numero: number;
  estado: string;
  fecha_pedido: string | null;
  fecha_esperada: string | null;
  created_at: string;
  creado_nombre: string | null;
  proveedor: { nombre: string } | null;
  lineas: { tipo_id: string; cantidad: number; recibida: number; precio_estimado: number | null }[];
};

const sel =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const SELECT =
  "id, numero, estado, fecha_pedido, fecha_esperada, created_at, creado_nombre, proveedor:proveedores(nombre), lineas:pedido_lineas(tipo_id, cantidad, recibida, precio_estimado)";

const FILTROS_ESTADO = [
  { id: "abiertos", label: "Abiertos" },
  { id: "atrasados", label: "Atrasados" },
  { id: "borrador", label: "Borradores" },
  { id: "pedido", label: "Realizados" },
  { id: "parcial", label: "Parciales" },
  { id: "recibido", label: "Recibidos" },
  { id: "", label: "Todos" },
] as const;

function Reabastecimiento() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const stock = useStockBajo();
  const [estado, setEstado] = useState("abiertos");
  const [prov, setProv] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nuevo, setNuevo] = useState<{
    proveedor_id?: string | null;
    lineas?: { tipo_id: string; cantidad: number }[];
  } | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const [verProveedoresTipo, setVerProveedoresTipo] = useState<string | null>(null);
  const [configAlertas, setConfigAlertas] = useState(false);

  const filtros = { estado, prov, desde, hasta };
  const pag = usePaginacion(filtros);
  const provs = useQuery({
    queryKey: ["proveedores_lista"],
    queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [],
  });
  const principales = useQuery({
    queryKey: ["proveedores_articulo", "principales"],
    queryFn: async () =>
      (await supabase.from("articulo_proveedores").select("tipo_id, proveedor_id, precio_referencia").eq("es_principal", true)).data ?? [],
  });
  const enCurso = useQuery({
    queryKey: ["pedidos", "en_curso_tipos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedido_lineas")
        .select("tipo_id, pedido:pedidos_compra!inner(id, numero, estado, fecha_esperada)")
        .in("pedido.estado", ["borrador", "pedido", "parcial"]);
      const map = new Map<string, { id: string; numero: number; estado: string; fecha_esperada: string | null }>();
      for (const r of (data ?? []) as unknown as {
        tipo_id: string;
        pedido: { id: string; numero: number; estado: string; fecha_esperada: string | null };
      }[]) {
        if (!map.has(r.tipo_id)) map.set(r.tipo_id, r.pedido);
      }
      return map;
    },
  });

  const filtrar = <T,>(qb: T) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let x = qb as any;
    if (estado === "abiertos") x = x.in("estado", ["borrador", "pedido", "parcial"]);
    else if (estado === "atrasados")
      x = x.in("estado", ["pedido", "parcial"]).lt("fecha_esperada", new Date().toISOString().slice(0, 10));
    else if (estado) x = x.eq("estado", estado);
    if (prov) x = x.eq("proveedor_id", prov);
    if (desde) x = x.gte("created_at", desde);
    if (hasta) x = x.lte("created_at", `${hasta}T23:59:59`);
    return x as T;
  };
  const q = useQuery({
    queryKey: ["pedidos", "lista", filtros, pag.desde, pag.hasta],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await filtrar(supabase.from("pedidos_compra").select(SELECT, { count: "exact" }))
        .order("created_at", { ascending: false })
        .range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: (data ?? []) as unknown as Fila[], total: count ?? 0 };
    },
  });

  const total = (f: Fila) => f.lineas.reduce((s, l) => s + l.cantidad * (Number(l.precio_estimado) || 0), 0);
  const resumen = (f: Fila) => f.lineas.map((l) => `${cat.nombre(l.tipo_id)} ${l.recibida}/${l.cantidad}`).join(", ");
  const bajos = stock.data ?? [];

  if (!me?.can("reabastecimiento_gestionar"))
    return <p className="text-muted-foreground">No tiene permiso para gestionar reabastecimiento.</p>;

  const hayFiltrosExtra = Boolean(prov || desde || hasta || estado !== "abiertos");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reabastecimiento"
        desc="Control de stock mínimo, comparación de proveedores aliados, órdenes de compra y recepción de lotes."
      >
        <Button variant="outline" onClick={() => setConfigAlertas(true)}>
          <Settings2 className="mr-1.5 h-4 w-4" />
          Configurar alertas
        </Button>
        <Button onClick={() => setNuevo({})}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo pedido
        </Button>
      </PageHeader>

      {/* Tarjetas interactivas de artículos con stock bajo */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                bajos.length > 0
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-success/30 bg-success/10 text-success"
              }`}
            >
              {bajos.length > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Artículos por debajo del mínimo ({bajos.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                {bajos.length > 0
                  ? "Consulta proveedores aliados o lanza un pedido rápido con la cantidad sugerida."
                  : "Todos los artículos con alerta activa están por encima del umbral mínimo."}
              </p>
            </div>
          </div>
          {bajos.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setVerProveedoresTipo(bajos[0]!.tipo_id)}>
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              Explorar proveedores en alerta
            </Button>
          )}
        </div>

        {!bajos.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-muted-foreground">
            <span>No hay alertas de stock pendientes por atender en este momento.</span>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfigAlertas(true)}>
              Editar umbrales de stock →
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {bajos.map((a) => {
              const sugerida = Math.max(1, a.stock_minimo - a.disponibles + 1);
              const vincPrincipal = principales.data?.find((p) => p.tipo_id === a.tipo_id);
              const principal = vincPrincipal?.proveedor_id ?? null;
              const nombrePrincipal = principal ? provs.data?.find((p) => p.id === principal)?.nombre : null;
              const pedidoActivo = enCurso.data?.get(a.tipo_id);
              const yaPedido = Boolean(pedidoActivo);
              const infoPedido = pedidoActivo ? infoLlegadaPedido(pedidoActivo.fecha_esperada) : null;
              const pct = a.stock_minimo > 0 ? Math.min(100, Math.round((a.disponibles / a.stock_minimo) * 100)) : 0;

              return (
                <div
                  key={a.tipo_id}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-background/60 p-4 transition-all hover:border-border hover:shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setVerProveedoresTipo(a.tipo_id)}
                        className="text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
                      >
                        {a.tipo}
                      </button>
                      {pedidoActivo ? (
                        <button
                          type="button"
                          onClick={() => setVer(pedidoActivo.id)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium transition-opacity hover:opacity-80 ${
                            infoPedido?.cls ?? "border-warning/30 bg-warning/10 text-warning"
                          }`}
                          title="Ver pedido en curso"
                        >
                          <Clock className="h-2.5 w-2.5" />
                          #{pedidoActivo.numero} · {infoPedido?.etiqueta ?? "En curso"}
                        </button>
                      ) : (
                        <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                          Pedir +{sugerida}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Disponibles: <b className="font-mono text-destructive">{a.disponibles}</b> / mín.{" "}
                        <b className="font-mono text-foreground">{a.stock_minimo}</b>
                      </span>
                      <span className="font-mono text-[11px]">{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${a.disponibles === 0 ? "bg-destructive" : "bg-warning"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {pedidoActivo?.fecha_esperada && (
                      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <CalendarClock className="h-3 w-3 shrink-0 text-primary" />
                        <span>
                          Entrega esperada: <b className="text-foreground">{fmtFecha(pedidoActivo.fecha_esperada)}</b>
                        </span>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className={`h-3 w-3 shrink-0 ${nombrePrincipal ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
                      {nombrePrincipal ? (
                        <span className="truncate">
                          Principal: <b className="font-medium text-foreground">{nombrePrincipal}</b>
                        </span>
                      ) : (
                        <span className="italic">Sin proveedor principal asignado</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 flex-1 text-xs"
                      onClick={() => setVerProveedoresTipo(a.tipo_id)}
                    >
                      <Building2 className="mr-1.5 h-3.5 w-3.5" />
                      Ver proveedores
                    </Button>
                    <Button
                      size="sm"
                      variant={yaPedido ? "secondary" : "default"}
                      className="h-8 flex-1 text-xs"
                      onClick={() =>
                        setNuevo({
                          proveedor_id: principal,
                          lineas: [{ tipo_id: a.tipo_id, cantidad: sugerida }],
                        })
                      }
                    >
                      <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                      Crear pedido
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Barra interactiva de filtros de pedidos */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-muted/30 p-1">
          {FILTROS_ESTADO.map((f) => {
            const act = estado === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setEstado(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  act
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={sel}
            value={prov}
            onChange={(e) => setProv(e.target.value)}
            aria-label="Proveedor"
          >
            <option value="">Todos los proveedores</option>
            {(provs.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <Input
            type="date"
            className="h-9 w-36 text-xs"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            aria-label="Desde"
          />
          <Input
            type="date"
            className="h-9 w-36 text-xs"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            aria-label="Hasta"
          />
          {hayFiltrosExtra && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => {
                setEstado("abiertos");
                setProv("");
                setDesde("");
                setHasta("");
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Tabla de pedidos */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-24">Orden</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Artículos y avance</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Entrega esperada</TableHead>
              <TableHead className="text-right">Total est.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && <FilasSkeleton columnas={7} />}
            {(q.data?.filas ?? []).map((f) => {
              const pedidas = f.lineas.reduce((s, l) => s + l.cantidad, 0);
              const recibidas = f.lineas.reduce((s, l) => s + l.recibida, 0);
              const pct = pedidas > 0 ? Math.round((recibidas / pedidas) * 100) : 0;
              const atrasado = pedidoAtrasado(f);
              return (
                <TableRow
                  key={f.id}
                  className="group cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => setVer(f.id)}
                >
                  <TableCell>
                    <span className="inline-flex items-center rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-xs font-semibold text-primary group-hover:border-primary/40">
                      #{f.numero}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{f.proveedor?.nombre ?? "—"}</TableCell>
                  <TableCell className="max-w-72">
                    <div className="truncate text-xs text-foreground" title={resumen(f)}>
                      {resumen(f) || "Sin líneas"}
                    </div>
                    {pedidas > 0 && (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all ${pct === 100 ? "bg-success" : "bg-primary"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {recibidas}/{pedidas}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <EstadoPedido p={f} />
                  </TableCell>
                  <TableCell className="text-xs">
                    <div>{fmtFecha(f.created_at)}</div>
                    <div className="text-[11px] text-muted-foreground">{f.creado_nombre ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {f.fecha_esperada ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={atrasado ? "font-medium text-destructive" : "text-foreground"}>
                          {fmtFecha(f.fecha_esperada)}
                        </span>
                        {(f.estado === "pedido" || f.estado === "parcial") && (
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${
                              infoLlegadaPedido(f.fecha_esperada).cls
                            }`}
                          >
                            {infoLlegadaPedido(f.fecha_esperada).etiqueta}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">{cop(total(f))}</TableCell>
                </TableRow>
              );
            })}
            {q.data && !q.data.filas.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-xs text-muted-foreground">
                  No se encontraron pedidos de compra con los filtros seleccionados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataTablePagination
          total={q.data?.total ?? 0}
          pagina={pag.pagina}
          tamano={pag.tamano}
          onPagina={pag.setPagina}
          onTamano={pag.setTamano}
        />
      </div>

      {nuevo && <NuevoPedido inicial={nuevo} onClose={() => setNuevo(null)} onCreado={(id) => setVer(id)} />}
      <DetallePedido id={ver} onClose={() => setVer(null)} />
      <ProveedoresSheet tipoId={verProveedoresTipo} onClose={() => setVerProveedoresTipo(null)} />
      <ConfigAlertas
        open={configAlertas}
        onClose={() => setConfigAlertas(false)}
        onProveedores={(t) => {
          setConfigAlertas(false);
          setVerProveedoresTipo(t);
        }}
      />
    </div>
  );
}
