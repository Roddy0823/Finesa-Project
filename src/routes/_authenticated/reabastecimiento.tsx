import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { fmtFecha } from "@/lib/constantes";
import { ESTADOS_PEDIDO, cop, pedidoAtrasado } from "@/lib/proveedores";
import { PageHeader } from "@/components/Estado";
import { useStockBajo } from "@/components/StockAlertas";
import { DetallePedido, EstadoPedido, NuevoPedido } from "@/components/Pedidos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { AlertTriangle, Plus, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reabastecimiento")({
  head: () => ({ meta: [{ title: "Reabastecimiento — Finesa" }, { name: "description", content: "Pedidos de compra y reabastecimiento del inventario." }] }),
  component: Reabastecimiento,
});

type Fila = { id: string; numero: number; estado: string; fecha_pedido: string | null; fecha_esperada: string | null; created_at: string; creado_nombre: string | null; proveedor: { nombre: string } | null; lineas: { tipo_id: string; cantidad: number; recibida: number; precio_estimado: number | null }[] };
const sel = "h-9 rounded-md border border-input bg-card px-3 text-sm";
const SELECT = "id, numero, estado, fecha_pedido, fecha_esperada, created_at, creado_nombre, proveedor:proveedores(nombre), lineas:pedido_lineas(tipo_id, cantidad, recibida, precio_estimado)";

function Reabastecimiento() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const stock = useStockBajo();
  const [estado, setEstado] = useState("abiertos");
  const [prov, setProv] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nuevo, setNuevo] = useState<{ proveedor_id?: string | null; lineas?: { tipo_id: string; cantidad: number }[] } | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const filtros = { estado, prov, desde, hasta };
  const pag = usePaginacion(filtros);
  const provs = useQuery({ queryKey: ["proveedores_lista"], queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [] });
  const principales = useQuery({ queryKey: ["proveedores_articulo", "principales"], queryFn: async () => (await supabase.from("articulo_proveedores").select("tipo_id, proveedor_id").eq("es_principal", true)).data ?? [] });
  const enCurso = useQuery({
    queryKey: ["pedidos", "en_curso_tipos"],
    queryFn: async () => new Set(((await supabase.from("pedido_lineas").select("tipo_id, pedido:pedidos_compra!inner(estado)").in("pedido.estado", ["borrador", "pedido", "parcial"])).data ?? []).map((l) => l.tipo_id)),
  });

  const filtrar = <T,>(qb: T) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let x = qb as any;
    if (estado === "abiertos") x = x.in("estado", ["borrador", "pedido", "parcial"]);
    else if (estado === "atrasados") x = x.in("estado", ["pedido", "parcial"]).lt("fecha_esperada", new Date().toISOString().slice(0, 10));
    else if (estado) x = x.eq("estado", estado);
    if (prov) x = x.eq("proveedor_id", prov);
    if (desde) x = x.gte("created_at", desde);
    if (hasta) x = x.lte("created_at", `${hasta}T23:59:59`);
    return x as T;
  };
  const q = useQuery({
    queryKey: ["pedidos", "lista", filtros, pag.desde, pag.tamano], placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await filtrar(supabase.from("pedidos_compra").select(SELECT, { count: "exact" })).order("created_at", { ascending: false }).range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: (data ?? []) as unknown as Fila[], total: count ?? 0 };
    },
  });

  const total = (f: Fila) => f.lineas.reduce((s, l) => s + l.cantidad * (Number(l.precio_estimado) || 0), 0);
  const resumen = (f: Fila) => f.lineas.map((l) => `${cat.nombre(l.tipo_id)} ${l.recibida}/${l.cantidad}`).join(", ");
  const bajos = stock.data ?? [];
  if (!me?.can("reabastecimiento_gestionar")) return <p className="text-muted-foreground">No tiene permiso para gestionar reabastecimiento.</p>;
  return (
    <div>
      <PageHeader title="Reabastecimiento" desc="Pedidos de compra a proveedores y recepción de equipos.">
        <Button onClick={() => setNuevo({})}><Plus className="mr-1 h-4 w-4" />Nuevo pedido</Button>
      </PageHeader>

      <section className="mb-6 rounded-md border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />Artículos por debajo del mínimo</h2>
        {!bajos.length ? <p className="text-sm text-muted-foreground">No hay artículos con stock bajo.</p> : (
          <ul className="divide-y divide-border">
            {bajos.map((a) => {
              const sugerida = Math.max(1, a.stock_minimo - a.disponibles + 1);
              const principal = principales.data?.find((p) => p.tipo_id === a.tipo_id)?.proveedor_id ?? null;
              const yaPedido = enCurso.data?.has(a.tipo_id);
              return (
                <li key={a.tipo_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div><b>{a.tipo}</b> · {a.disponibles} disponible(s), mínimo {a.stock_minimo} · sugerido pedir <b>{sugerida}</b>
                    {principal && <span className="text-muted-foreground"> · principal: {provs.data?.find((p) => p.id === principal)?.nombre}</span>}
                    {yaPedido && <span className="ml-2 rounded-full bg-warning/20 px-2 py-0.5 text-xs">Pedido en curso</span>}
                  </div>
                  <Button size="sm" variant={yaPedido ? "outline" : "default"} onClick={() => setNuevo({ proveedor_id: principal, lineas: [{ tipo_id: a.tipo_id, cantidad: sugerida }] })}><ShoppingCart className="mr-1 h-3.5 w-3.5" />Crear pedido</Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        <select className={sel} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="abiertos">Abiertos</option><option value="atrasados">Atrasados</option><option value="">Todos</option>
          {Object.entries(ESTADOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={prov} onChange={(e) => setProv(e.target.value)} aria-label="Proveedor"><option value="">Todos los proveedores</option>{(provs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        <Input type="date" className="w-40" value={desde} onChange={(e) => setDesde(e.target.value)} aria-label="Desde" />
        <Input type="date" className="w-40" value={hasta} onChange={(e) => setHasta(e.target.value)} aria-label="Hasta" />
      </div>
      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Proveedor</TableHead><TableHead>Artículos</TableHead><TableHead>Estado</TableHead><TableHead>Creado</TableHead><TableHead>Entrega esperada</TableHead><TableHead className="text-right">Total est.</TableHead></TableRow></TableHeader>
          <TableBody>
            {q.isLoading && <FilasSkeleton columnas={7} />}
            {(q.data?.filas ?? []).map((f) => (
              <TableRow key={f.id} className="cursor-pointer" onClick={() => setVer(f.id)}>
                <TableCell className="font-medium text-primary">#{f.numero}</TableCell>
                <TableCell>{f.proveedor?.nombre ?? "—"}</TableCell>
                <TableCell className="max-w-72 truncate text-xs" title={resumen(f)}>{resumen(f)}</TableCell>
                <TableCell><EstadoPedido p={f} /></TableCell>
                <TableCell className="text-xs">{fmtFecha(f.created_at)}<div className="text-muted-foreground">{f.creado_nombre ?? ""}</div></TableCell>
                <TableCell className="text-xs">{f.fecha_esperada ? fmtFecha(f.fecha_esperada) : "—"}</TableCell>
                <TableCell className="text-right">{cop(total(f))}</TableCell>
              </TableRow>
            ))}
            {q.data && !q.data.filas.length && <TableRow><TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No hay pedidos con estos filtros.</TableCell></TableRow>}
          </TableBody>
        </Table>
        <DataTablePagination total={q.data?.total ?? 0} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
      </div>
      {nuevo && <NuevoPedido inicial={nuevo} onClose={() => setNuevo(null)} onCreado={(id) => setVer(id)} />}
      <DetallePedido id={ver} onClose={() => setVer(null)} />
    </div>
  );
}
