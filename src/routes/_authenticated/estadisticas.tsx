import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label as RLabel, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { ESTADO_EQUIPO } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStockBajo } from "@/components/StockAlertas";
import { Download, FileText, TrendingDown, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/estadisticas")({
  head: () => ({ meta: [{ title: "Estadísticas — Finesa" }, { name: "description", content: "Indicadores ejecutivos, estados y valor del inventario." }] }),
  component: Estadisticas,
});

type Fila = { nombre: string; cantidad: number; valor: number };
type Tipo = Fila & { disponibles: number; asignados: number; en_reparacion: number; de_baja: number; promedio: number | null };
type Stats = {
  total: number; valor_total: number; sin_valor: number; garantia_vencida: number; garantia_por_vencer: number;
  actas_firmadas_mes: number; actas_pendientes: number;
  por_estado: Record<string, number>; valor_por_estado: Record<string, number>;
  por_tipo: Tipo[]; por_marca: Fila[]; por_sede: Fila[]; top_proveedores: Fila[];
};
type N = { nombre: string; cantidad: number };
type Av = {
  fallas_30: number; fallas_30_prev: number; asignados_prev: number; firmadas: number; pendientes: number; firmadas_mes_prev: number; horas_firma: number | null;
  por_tipo_estado: { nombre: string; disponible: number; asignado: number; en_reparacion: number; de_baja: number }[];
  fallas_marca: { nombre: string; reparaciones: number; bajas: number }[]; fallas_modelo: { nombre: string; reparaciones: number; bajas: number }[];
  por_cargo: N[]; por_area: N[]; por_sede_emp: N[];
  movimientos: { mes: string; entregas: number; devoluciones: number; ingresos: number; acumulado: number }[];
  stock: { nombre: string; disponibles: number; minimo: number }[]; garantias: { d30: number; d60: number; d90: number };
};
const cop = (n: number | null | undefined) => `$${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const C = { disponible: "var(--chart-2, #134074)", asignado: "var(--primary)", en_reparacion: "var(--chart-4, #E0A458)", de_baja: "var(--destructive)" } as Record<string, string>;
const COLORES = ["var(--primary)", "var(--chart-2, #134074)", "var(--chart-3, #8DA9C4)", "var(--chart-4, #E0A458)", "var(--destructive)", "var(--chart-5, #5A7D9A)"];
const etiquetaEstado = (k: string) => (ESTADO_EQUIPO as Record<string, { label: string } | undefined>)[k]?.label ?? k;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

function Estadisticas() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const stock = useStockBajo();
  const [sede, setSede] = useState("");
  const [tipo, setTipo] = useState("");
  const [grupo, setGrupo] = useState<"por_cargo" | "por_area" | "por_sede_emp">("por_cargo");
  const args = { p_sede: sede || undefined, p_tipo: tipo || undefined } as never;
  const q = useQuery({
    queryKey: ["estadisticas", sede, tipo], enabled: !!me?.isStaff, placeholderData: keepPreviousData,
    queryFn: async () => { const { data, error } = await supabase.rpc("estadisticas_inventario", args); if (error) throw error; return data as unknown as Stats; },
  });
  const qa = useQuery({
    queryKey: ["estadisticas_avanzadas", sede, tipo], enabled: !!me?.isStaff, placeholderData: keepPreviousData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => { const { data, error } = await (supabase.rpc as any)("estadisticas_avanzadas", args); if (error) throw error; return data as Av; },
  });
  if (!me?.can("estadisticas_ver")) return <p className="text-muted-foreground">No tiene permiso para ver estadísticas.</p>;
  const s = q.data; const a = qa.data;
  const sel = "h-9 rounded-md border border-input bg-card px-3 text-sm";

  async function excel() {
    if (!s || !a) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (rows: object[], n: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Sin datos" }]), n);
    add([
      { Indicador: "Total equipos", Valor: s.total }, { Indicador: "Valor total (sin bajas)", Valor: s.valor_total },
      { Indicador: "Tasa de utilización (%)", Valor: kpi.util }, { Indicador: "Disponibles", Valor: kpi.disp }, { Indicador: "Tipos con stock crítico", Valor: kpi.criticos },
      { Indicador: "Tasa de falla 30 días (%)", Valor: kpi.falla }, { Indicador: "Efectividad de firmas (%)", Valor: kpi.firmas }, { Indicador: "Horas promedio para firmar", Valor: a.horas_firma ?? "" },
      ...Object.entries(s.por_estado).map(([k, n]) => ({ Indicador: `Equipos ${etiquetaEstado(k)}`, Valor: n })),
      ...Object.entries(s.valor_por_estado).map(([k, n]) => ({ Indicador: `Valor ${etiquetaEstado(k)}`, Valor: n })),
    ], "Resumen");
    add(s.por_tipo.map((t) => ({ Tipo: t.nombre, Cantidad: t.cantidad, Disponibles: t.disponibles, Asignados: t.asignados, "En reparación": t.en_reparacion, "De baja": t.de_baja, "Valor total": t.valor })), "Por tipo");
    add(a.movimientos.map((m) => ({ Mes: m.mes, Entregas: m.entregas, Devoluciones: m.devoluciones, Ingresos: m.ingresos, "Inventario acumulado": m.acumulado })), "Movimientos");
    add(a.fallas_marca.map((m) => ({ Marca: m.nombre, Reparaciones: m.reparaciones, Bajas: m.bajas })), "Fallas por marca");
    add(a.fallas_modelo.map((m) => ({ Modelo: m.nombre, Reparaciones: m.reparaciones, Bajas: m.bajas })), "Fallas por modelo");
    add(a.por_cargo.map((m) => ({ Cargo: m.nombre, Equipos: m.cantidad })), "Por cargo");
    add(a.por_area.map((m) => ({ Área: m.nombre, Equipos: m.cantidad })), "Por área");
    add(a.stock.map((m) => ({ Artículo: m.nombre, Disponibles: m.disponibles, Mínimo: m.minimo })), "Stock");
    add(s.top_proveedores.map((t) => ({ Proveedor: t.nombre, Equipos: t.cantidad, Valor: t.valor })), "Proveedores");
    XLSX.writeFile(wb, `estadisticas-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const operativos = s ? s.total - (s.por_estado.de_baja ?? 0) : 0;
  const asignados = s?.por_estado.asignado ?? 0;
  const criticos = stock.data?.length ?? 0;
  const kpi = {
    util: pct(asignados, operativos), utilPrev: pct(a?.asignados_prev ?? 0, operativos),
    disp: s?.por_estado.disponible ?? 0, criticos,
    falla: pct(a?.fallas_30 ?? 0, s?.total ?? 0), fallaPrev: pct(a?.fallas_30_prev ?? 0, s?.total ?? 0),
    firmas: pct(a?.firmadas ?? 0, (a?.firmadas ?? 0) + (a?.pendientes ?? 0)),
  };
  const estados = s ? Object.entries(s.por_estado).map(([k, n]) => ({ key: k, nombre: etiquetaEstado(k), cantidad: n })) : [];
  const grupos = a?.[grupo] ?? [];

  return (
    <div className="print:p-0">
      <PageHeader title="Estadísticas del inventario" desc="Indicadores ejecutivos y análisis del inventario.">
        <select className={sel} value={sede} onChange={(e) => setSede(e.target.value)}><option value="">Todas las sedes</option>{cat.byTipo("sede").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <select className={sel} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos los tipos</option>{cat.byTipo("tipo_equipo").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <Button variant="outline" onClick={excel} disabled={!s || !a}><Download className="mr-1 h-4 w-4" />Excel</Button>
        <Button variant="outline" onClick={() => window.print()} disabled={!s}><FileText className="mr-1 h-4 w-4" />PDF</Button>
      </PageHeader>
      {!s || !a ? <p className="text-muted-foreground">{q.error || qa.error ? "No se pudieron cargar las estadísticas." : "Cargando estadísticas…"}</p> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Tasa de utilización" v={`${kpi.util}%`} sub={`${asignados} asignados de ${operativos} operativos`} salud={kpi.util >= 75 ? "ok" : kpi.util >= 50 ? "medio" : "mal"} delta={kpi.util - kpi.utilPrev} />
            <Kpi label="Disponibilidad inmediata" v={`${kpi.disp} listos`} sub={`${criticos} tipo(s) con stock crítico`} salud={criticos === 0 ? "ok" : criticos <= 2 ? "medio" : "mal"} />
            <Kpi label="Tasa de falla (30 días)" v={`${kpi.falla}%`} sub={`${a.fallas_30} equipos a reparación o baja`} salud={kpi.falla <= 2 ? "ok" : kpi.falla <= 5 ? "medio" : "mal"} delta={kpi.falla - kpi.fallaPrev} invertir />
            <Kpi label="Efectividad de firmas" v={`${kpi.firmas}%`} sub={`${a.pendientes} pendientes · ${a.horas_firma ?? "—"} h promedio`} salud={kpi.firmas >= 90 ? "ok" : kpi.firmas >= 70 ? "medio" : "mal"} />
            <Tarjeta label="Valor total del inventario" v={cop(s.valor_total)} sub="Sin contar dados de baja" destacado />
            <Tarjeta label="Equipos totales" v={s.total.toLocaleString("es-CO")} sub={`${s.sin_valor} sin valor registrado`} />
            <Tarjeta label="Garantías vencidas" v={String(s.garantia_vencida)} />
            <Tarjeta label="Garantías por vencer" v={String(s.garantia_por_vencer)} sub="Próximos 90 días" />
          </div>

          <Tabs defaultValue="general">
            <TabsList className="flex h-auto flex-wrap print:hidden">
              <TabsTrigger value="general">Visión general</TabsTrigger>
              <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
              <TabsTrigger value="calidad">Calidad y fallas</TabsTrigger>
              <TabsTrigger value="empleados">Empleados</TabsTrigger>
              <TabsTrigger value="proveedores">Proveedores y stock</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="grid gap-6 lg:grid-cols-2">
              <Grafico titulo="Inventario por estado">
                <PieChart><Pie data={estados} dataKey="cantidad" nameKey="nombre" innerRadius={65} outerRadius={100}>
                  {estados.map((e) => <Cell key={e.key} fill={C[e.key] ?? COLORES[0]} />)}
                  <RLabel position="center" content={({ viewBox }) => { const vb = viewBox as { cx: number; cy: number }; return <text x={vb.cx} y={vb.cy} textAnchor="middle" dominantBaseline="middle"><tspan x={vb.cx} className="fill-foreground text-2xl font-bold">{s.total.toLocaleString("es-CO")}</tspan><tspan x={vb.cx} dy={20} className="fill-muted-foreground text-xs">equipos</tspan></text>; }} />
                </Pie><Tooltip /><Legend /></PieChart>
              </Grafico>
              <Grafico titulo="Cantidad por tipo y estado">
                <BarChart data={a.por_tipo_estado}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" fontSize={11} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis fontSize={11} /><Tooltip /><Legend />
                  {(["disponible", "asignado", "en_reparacion", "de_baja"] as const).map((k) => <Bar key={k} dataKey={k} stackId="a" name={etiquetaEstado(k)} fill={C[k]} />)}
                </BarChart>
              </Grafico>
              <Grafico titulo="Valor por tipo">
                <BarChart data={[...s.por_tipo].sort((x, y) => y.valor - x.valor).slice(0, 12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" fontSize={11} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis fontSize={11} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} /><Tooltip formatter={(v) => cop(Number(v))} /><Bar dataKey="valor" name="Valor" fill={COLORES[1]} /></BarChart>
              </Grafico>
              <Tabla titulo="Resumen por tipo" cols={["Tipo", "Cant.", "Disp.", "Asig.", "Rep.", "Baja", "Valor"]}
                filas={s.por_tipo.map((t) => [t.nombre, t.cantidad, t.disponibles, t.asignados, t.en_reparacion, t.de_baja, cop(t.valor)])} />
            </TabsContent>

            <TabsContent value="movimientos" className="grid gap-6 lg:grid-cols-2">
              <Grafico titulo="Entregas y devoluciones firmadas (12 meses)">
                <AreaChart data={a.movimientos}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
                  <Area dataKey="entregas" name="Entregas" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.25} />
                  <Area dataKey="devoluciones" name="Devoluciones" stroke={COLORES[3]} fill={COLORES[3]} fillOpacity={0.25} />
                </AreaChart>
              </Grafico>
              <Grafico titulo="Crecimiento del inventario">
                <AreaChart data={a.movimientos}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend />
                  <Area dataKey="acumulado" name="Total acumulado" stroke={COLORES[1]} fill={COLORES[1]} fillOpacity={0.2} />
                  <Area dataKey="ingresos" name="Ingresos del mes" stroke={COLORES[2]} fill={COLORES[2]} fillOpacity={0.4} />
                </AreaChart>
              </Grafico>
            </TabsContent>

            <TabsContent value="calidad" className="grid gap-6 lg:grid-cols-2">
              <Grafico titulo="Marcas con más reparaciones y bajas">
                <BarChart data={a.fallas_marca} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="nombre" width={110} fontSize={11} /><Tooltip /><Legend />
                  <Bar dataKey="reparaciones" name="Reparaciones" stackId="f" fill={C.en_reparacion} /><Bar dataKey="bajas" name="Bajas" stackId="f" fill={C.de_baja} /></BarChart>
              </Grafico>
              <Grafico titulo="Modelos con más reparaciones y bajas">
                <BarChart data={a.fallas_modelo} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="nombre" width={130} fontSize={11} /><Tooltip /><Legend />
                  <Bar dataKey="reparaciones" name="Reparaciones" stackId="f" fill={C.en_reparacion} /><Bar dataKey="bajas" name="Bajas" stackId="f" fill={C.de_baja} /></BarChart>
              </Grafico>
            </TabsContent>

            <TabsContent value="empleados" className="space-y-3">
              <select className={sel} value={grupo} onChange={(e) => setGrupo(e.target.value as typeof grupo)}>
                <option value="por_cargo">Por cargo</option><option value="por_area">Por área</option><option value="por_sede_emp">Por sede del empleado</option>
              </select>
              <Grafico titulo="Equipos asignados" alto="h-96">
                <BarChart data={grupos} layout="vertical"><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="nombre" width={160} fontSize={11} /><Tooltip /><Bar dataKey="cantidad" name="Equipos" fill="var(--primary)" /></BarChart>
              </Grafico>
            </TabsContent>

            <TabsContent value="proveedores" className="grid gap-6 lg:grid-cols-2">
              <Grafico titulo="Stock disponible vs. mínimo configurado">
                <BarChart data={a.stock}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" fontSize={11} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Legend />
                  <Bar dataKey="disponibles" name="Disponibles" fill="var(--primary)" /><Bar dataKey="minimo" name="Mínimo" fill={C.de_baja} /></BarChart>
              </Grafico>
              <Grafico titulo="Garantías próximas a vencer">
                <BarChart data={[{ nombre: "0–30 días", cantidad: a.garantias.d30 }, { nombre: "31–60 días", cantidad: a.garantias.d60 }, { nombre: "61–90 días", cantidad: a.garantias.d90 }]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="nombre" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="cantidad" name="Equipos" fill={COLORES[3]} /></BarChart>
              </Grafico>
              <Tabla titulo="Top proveedores por valor" cols={["Proveedor", "Equipos", "Valor"]} filas={s.top_proveedores.map((p) => [p.nombre, p.cantidad, cop(p.valor)])} />
              <Tabla titulo="Alertas de stock bajo" cols={["Tipo", "Disponibles", "Mínimo"]} filas={(stock.data ?? []).map((x) => [x.tipo, x.disponibles, x.stock_minimo])} vacio="Sin alertas de stock bajo." />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, sub, salud, delta, invertir }: { label: string; v: string; sub: string; salud: "ok" | "medio" | "mal"; delta?: number; invertir?: boolean }) {
  const color = salud === "ok" ? "bg-chart-2" : salud === "medio" ? "bg-chart-4" : "bg-destructive";
  const txt = salud === "ok" ? "Saludable" : salud === "medio" ? "Atención" : "Crítico";
  const d = delta != null ? Math.round(delta * 10) / 10 : null;
  const bueno = d != null && (invertir ? d <= 0 : d >= 0);
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">{label}
        <span className="flex items-center gap-1 normal-case"><span className={`h-2 w-2 rounded-full ${color}`} />{txt}</span></div>
      <div className="mt-1 font-display text-2xl font-bold">{v}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {d != null && <div className={`mt-1 flex items-center gap-1 text-xs ${bueno ? "text-primary" : "text-destructive"}`}>{d >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{d >= 0 ? "+" : ""}{d} pts vs. periodo anterior</div>}
    </div>
  );
}
function Tarjeta({ label, v, sub, destacado }: { label: string; v: string; sub?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${destacado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>
      <div className={`text-xs uppercase tracking-wide ${destacado ? "opacity-80" : "text-muted-foreground"}`}>{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{v}</div>
      {sub && <div className={`text-xs ${destacado ? "opacity-80" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}
function Grafico({ titulo, children, alto = "h-72" }: { titulo: string; children: React.ReactElement; alto?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 text-sm font-medium">{titulo}</div>
      <div className={alto}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  );
}
function Tabla({ titulo, cols, filas, vacio = "Sin datos." }: { titulo: string; cols: string[]; filas: (string | number)[][]; vacio?: string }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">{titulo}</div>
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs uppercase text-muted-foreground"><tr>{cols.map((c, i) => <th key={c} className={`px-4 py-2 ${i ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j} className={`px-4 py-2 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}
          {!filas.length && <tr><td colSpan={cols.length} className="px-4 py-6 text-center text-muted-foreground">{vacio}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
