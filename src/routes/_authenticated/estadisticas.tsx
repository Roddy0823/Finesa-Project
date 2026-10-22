import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label as RLabel,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { ESTADO_EQUIPO } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProveedoresSheet, usePedidosEnCamino, useStockBajo } from "@/components/StockAlertas";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileSignature,
  FileText,
  Layers,
  Package,
  PieChart as PieChartIcon,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/estadisticas")({
  head: () => ({
    meta: [
      { title: "Estadísticas — Finesa" },
      { name: "description", content: "Indicadores ejecutivos, estados y valor del inventario." },
    ],
  }),
  component: Estadisticas,
});

type Fila = { nombre: string; cantidad: number; valor: number };
type Tipo = Fila & {
  disponibles: number;
  asignados: number;
  en_reparacion: number;
  de_baja: number;
  promedio: number | null;
};
type Stats = {
  total: number;
  valor_total: number;
  sin_valor: number;
  garantia_vencida: number;
  garantia_por_vencer: number;
  actas_firmadas_mes: number;
  actas_pendientes: number;
  por_estado: Record<string, number>;
  valor_por_estado: Record<string, number>;
  por_tipo: Tipo[];
  por_marca: Fila[];
  por_sede: Fila[];
  top_proveedores: Fila[];
};
type N = { nombre: string; cantidad: number };
type Av = {
  fallas_30: number;
  fallas_30_prev: number;
  asignados_prev: number;
  firmadas: number;
  pendientes: number;
  firmadas_mes_prev: number;
  horas_firma: number | null;
  por_tipo_estado: {
    nombre: string;
    disponible: number;
    asignado: number;
    en_reparacion: number;
    de_baja: number;
  }[];
  fallas_marca: { nombre: string; reparaciones: number; bajas: number }[];
  fallas_modelo: { nombre: string; reparaciones: number; bajas: number }[];
  por_cargo: N[];
  por_area: N[];
  por_sede_emp: N[];
  movimientos: { mes: string; entregas: number; devoluciones: number; ingresos: number; acumulado: number }[];
  stock: { nombre: string; disponibles: number; minimo: number }[];
  garantias: { d30: number; d60: number; d90: number };
};

const cop = (n: number | null | undefined) => `$${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const copCompact = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
};

const C: Record<string, string> = {
  disponible: "var(--success, #10b981)",
  asignado: "var(--primary, #3b82f6)",
  en_alistamiento: "var(--chart-3, #8b5cf6)",
  en_reparacion: "var(--warning, #f59e0b)",
  de_baja: "var(--destructive, #ef4444)",
};
const COLORES = [
  "var(--primary)",
  "var(--success, #10b981)",
  "var(--chart-3, #8b5cf6)",
  "var(--warning, #f59e0b)",
  "var(--destructive, #ef4444)",
  "var(--chart-5, #06b6d4)",
];

const etiquetaEstado = (k: string) =>
  (ESTADO_EQUIPO as Record<string, { label: string } | undefined>)[k]?.label ?? k;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const sel =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Estadisticas() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const stock = useStockBajo();
  const pedidosCamino = usePedidosEnCamino();
  const [sede, setSede] = useState("");
  const [tipo, setTipo] = useState("");
  const [grupo, setGrupo] = useState<"por_cargo" | "por_area" | "por_sede_emp">("por_cargo");
  const [dimValor, setDimValor] = useState<"por_tipo" | "por_marca" | "por_sede">("por_tipo");
  const [reabastecerTipo, setReabastecerTipo] = useState<string | null>(null);

  const args = { p_sede: sede || undefined, p_tipo: tipo || undefined } as never;
  const q = useQuery({
    queryKey: ["estadisticas", sede, tipo],
    enabled: !!me?.isStaff,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estadisticas_inventario", args);
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const qa = useQuery({
    queryKey: ["estadisticas_avanzadas", sede, tipo],
    enabled: !!me?.isStaff,
    placeholderData: keepPreviousData,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("estadisticas_avanzadas", args);
      if (error) throw error;
      return data as Av;
    },
  });

  if (!me?.can("estadisticas_ver"))
    return <p className="text-muted-foreground">No tiene permiso para ver estadísticas.</p>;

  const s = q.data;
  const a = qa.data;

  async function excel() {
    if (!s || !a) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (rows: object[], n: string) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Sin datos" }]), n);
    add(
      [
        { Indicador: "Total equipos", Valor: s.total },
        { Indicador: "Valor total (sin bajas)", Valor: s.valor_total },
        { Indicador: "Tasa de utilización (%)", Valor: kpi.util },
        { Indicador: "Disponibles", Valor: kpi.disp },
        { Indicador: "Tipos con stock crítico", Valor: kpi.criticos },
        { Indicador: "Tasa de falla 30 días (%)", Valor: kpi.falla },
        { Indicador: "Efectividad de firmas (%)", Valor: kpi.firmas },
        { Indicador: "Horas promedio para firmar", Valor: a.horas_firma ?? "" },
        ...Object.entries(s.por_estado).map(([k, n]) => ({ Indicador: `Equipos ${etiquetaEstado(k)}`, Valor: n })),
        ...Object.entries(s.valor_por_estado).map(([k, n]) => ({ Indicador: `Valor ${etiquetaEstado(k)}`, Valor: n })),
      ],
      "Resumen",
    );
    add(
      s.por_tipo.map((t) => ({
        Tipo: t.nombre,
        Cantidad: t.cantidad,
        Disponibles: t.disponibles,
        Asignados: t.asignados,
        "En reparación": t.en_reparacion,
        "De baja": t.de_baja,
        "Valor promedio": t.promedio ?? 0,
        "Valor total": t.valor,
      })),
      "Por tipo",
    );
    add(
      s.por_marca.map((m) => ({ Marca: m.nombre, Cantidad: m.cantidad, Valor: m.valor })),
      "Por marca",
    );
    add(
      s.por_sede.map((x) => ({ Sede: x.nombre, Cantidad: x.cantidad, Valor: x.valor })),
      "Por sede",
    );
    add(
      a.movimientos.map((m) => ({
        Mes: m.mes,
        Entregas: m.entregas,
        Devoluciones: m.devoluciones,
        Ingresos: m.ingresos,
        "Inventario acumulado": m.acumulado,
      })),
      "Movimientos",
    );
    add(
      a.fallas_marca.map((m) => ({ Marca: m.nombre, Reparaciones: m.reparaciones, Bajas: m.bajas })),
      "Fallas por marca",
    );
    add(
      a.fallas_modelo.map((m) => ({ Modelo: m.nombre, Reparaciones: m.reparaciones, Bajas: m.bajas })),
      "Fallas por modelo",
    );
    add(
      a.por_cargo.map((m) => ({ Cargo: m.nombre, Equipos: m.cantidad })),
      "Por cargo",
    );
    add(
      a.por_area.map((m) => ({ Área: m.nombre, Equipos: m.cantidad })),
      "Por área",
    );
    add(
      a.stock.map((m) => ({ Artículo: m.nombre, Disponibles: m.disponibles, Mínimo: m.minimo })),
      "Stock",
    );
    add(
      s.top_proveedores.map((t) => ({ Proveedor: t.nombre, Equipos: t.cantidad, Valor: t.valor })),
      "Proveedores",
    );
    XLSX.writeFile(wb, `estadisticas-inventario-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const operativos = s ? s.total - (s.por_estado.de_baja ?? 0) : 0;
  const asignados = s?.por_estado.asignado ?? 0;
  const criticos = stock.data?.length ?? 0;
  const kpi = {
    util: pct(asignados, operativos),
    utilPrev: pct(a?.asignados_prev ?? 0, operativos),
    disp: s?.por_estado.disponible ?? 0,
    criticos,
    falla: pct(a?.fallas_30 ?? 0, s?.total ?? 0),
    fallaPrev: pct(a?.fallas_30_prev ?? 0, s?.total ?? 0),
    firmas: pct(a?.firmadas ?? 0, (a?.firmadas ?? 0) + (a?.pendientes ?? 0)),
  };

  const estados = s
    ? Object.entries(s.por_estado).map(([k, n]) => ({
        key: k,
        nombre: etiquetaEstado(k),
        cantidad: n,
        valor: s.valor_por_estado[k] ?? 0,
      }))
    : [];

  const grupos = a?.[grupo] ?? [];
  const totalGrupo = grupos.reduce((acc, g) => acc + g.cantidad, 0);
  const serieValor = s ? [...s[dimValor]].sort((x, y) => y.valor - x.valor).slice(0, 12) : [];

  const totEntregas12m = (a?.movimientos ?? []).reduce((acc, m) => acc + m.entregas, 0);
  const totDevoluciones12m = (a?.movimientos ?? []).reduce((acc, m) => acc + m.devoluciones, 0);
  const totIngresos12m = (a?.movimientos ?? []).reduce((acc, m) => acc + m.ingresos, 0);

  return (
    <div className="space-y-6 print:p-0">
      <PageHeader
        title="Inteligencia y Estadísticas"
        desc="Analítica ejecutiva sobre utilización del parque tecnológico, valoración patrimonial, calidad y abastecimiento."
      >
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <select className={sel} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Filtrar por sede">
            <option value="">Todas las sedes</option>
            {cat.byTipo("sede").map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <select
            className={sel}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            aria-label="Filtrar por tipo de equipo"
          >
            <option value="">Todos los tipos</option>
            {cat.byTipo("tipo_equipo").map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          {(sede || tipo) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => {
                setSede("");
                setTipo("");
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9" onClick={excel} disabled={!s || !a}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Excel
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()} disabled={!s}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </PageHeader>

      {/* Píldoras de filtro activo */}
      {(sede || tipo) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2 text-xs">
          <span className="font-medium text-muted-foreground">Vista filtrada por:</span>
          {sede && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-0.5 font-medium text-foreground shadow-2xs">
              Sede: {cat.nombre(sede)}
            </span>
          )}
          {tipo && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-0.5 font-medium text-foreground shadow-2xs">
              Tipo: {cat.nombre(tipo)}
            </span>
          )}
        </div>
      )}

      {!s || !a ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-border/70 bg-card p-4"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Fila 1: KPIs Operativos con Semáforo y Tendencia */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Activity}
              label="Tasa de utilización"
              v={`${kpi.util}%`}
              sub={`${asignados.toLocaleString("es-CO")} asignados de ${operativos.toLocaleString("es-CO")} operativos`}
              salud={kpi.util >= 75 ? "ok" : kpi.util >= 50 ? "medio" : "mal"}
              delta={kpi.util - kpi.utilPrev}
              progress={kpi.util}
            />
            <KpiCard
              icon={Package}
              label="Disponibilidad inmediata"
              v={`${kpi.disp} listos`}
              sub={
                criticos > 0
                  ? `${criticos} artículo(s) bajo stock mínimo`
                  : "Todos los artículos sobre el mínimo"
              }
              salud={criticos === 0 ? "ok" : criticos <= 2 ? "medio" : "mal"}
              progress={operativos > 0 ? Math.round((kpi.disp / operativos) * 100) : 0}
            />
            <KpiCard
              icon={Wrench}
              label="Incidencias (30 días)"
              v={`${kpi.falla}%`}
              sub={`${a.fallas_30} equipo(s) en reparación o baja`}
              salud={kpi.falla <= 2 ? "ok" : kpi.falla <= 5 ? "medio" : "mal"}
              delta={kpi.falla - kpi.fallaPrev}
              invertir
              progress={Math.min(100, kpi.falla * 10)}
            />
            <KpiCard
              icon={FileSignature}
              label="Efectividad de firmas"
              v={`${kpi.firmas}%`}
              sub={`${a.pendientes} pendientes · ${a.horas_firma ?? "—"} h prom. firma`}
              salud={kpi.firmas >= 90 ? "ok" : kpi.firmas >= 70 ? "medio" : "mal"}
              progress={kpi.firmas}
            />
          </div>

          {/* Fila 2: Indicadores Patrimoniales y Ciclo de Vida */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={DollarSign}
              label="Valor patrimonial activo"
              v={cop(s.valor_total)}
              sub={`Promedio ${cop(operativos > 0 ? s.valor_total / operativos : 0)} / equipo activo`}
              badge={s.sin_valor > 0 ? `${s.sin_valor} sin avalúo` : "100% valorado"}
              destacado
            />
            <MetricCard
              icon={Layers}
              label="Parque tecnológico total"
              v={s.total.toLocaleString("es-CO")}
              sub={`${operativos.toLocaleString("es-CO")} operativos · ${(s.por_estado.de_baja ?? 0).toLocaleString("es-CO")} de baja`}
              badge={`${s.por_tipo.length} categorías`}
            />
            <MetricCard
              icon={ShieldAlert}
              label="Estado de garantías"
              v={`${s.garantia_por_vencer} por vencer`}
              sub={`En los próximos 90 días · ${s.garantia_vencida} vencidas`}
              badge={a.garantias.d30 > 0 ? `${a.garantias.d30} en ≤30d` : "Sin urgencias 30d"}
              alerta={a.garantias.d30 > 0}
            />
            <MetricCard
              icon={Award}
              label="Actas firmadas (mes)"
              v={String(s.actas_firmadas_mes)}
              sub={`Mes anterior: ${a.firmadas_mes_prev} · ${s.actas_pendientes} por firmar`}
              badge={
                s.actas_firmadas_mes >= a.firmadas_mes_prev
                  ? `+${s.actas_firmadas_mes - a.firmadas_mes_prev} vs mes ant.`
                  : `${s.actas_firmadas_mes - a.firmadas_mes_prev} vs mes ant.`
              }
            />
          </div>

          {/* Navegación por Pestañas Analíticas */}
          <Tabs defaultValue="general" className="space-y-5">
            <TabsList className="inline-flex h-auto flex-wrap gap-1 rounded-xl border border-border/80 bg-muted/30 p-1 print:hidden">
              <TabsTrigger value="general" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <PieChartIcon className="h-3.5 w-3.5" />
                Visión general
              </TabsTrigger>
              <TabsTrigger value="movimientos" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <Activity className="h-3.5 w-3.5" />
                Movimientos (12m)
              </TabsTrigger>
              <TabsTrigger value="calidad" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <Wrench className="h-3.5 w-3.5" />
                Calidad y garantías
              </TabsTrigger>
              <TabsTrigger value="empleados" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Asignación organizacional
              </TabsTrigger>
              <TabsTrigger value="proveedores" className="gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" />
                Proveedores y stock
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: VISIÓN GENERAL */}
            <TabsContent value="general" className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-12">
                {/* Donut + desglose financiero por estado */}
                <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs lg:col-span-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Composición por estado operativo</h3>
                      <p className="text-xs text-muted-foreground">Unidades y capital distribuido por estado</p>
                    </div>
                  </div>
                  <div className="grid items-center gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={estados}
                            dataKey="cantidad"
                            nameKey="nombre"
                            innerRadius={58}
                            outerRadius={84}
                            paddingAngle={2}
                          >
                            {estados.map((e) => (
                              <Cell key={e.key} fill={C[e.key] ?? COLORES[0]} stroke="transparent" />
                            ))}
                            <RLabel
                              position="center"
                              content={({ viewBox }) => {
                                const vb = viewBox as { cx: number; cy: number };
                                return (
                                  <text x={vb.cx} y={vb.cy} textAnchor="middle" dominantBaseline="middle">
                                    <tspan x={vb.cx} className="fill-foreground font-mono text-2xl font-bold">
                                      {s.total.toLocaleString("es-CO")}
                                    </tspan>
                                    <tspan x={vb.cx} dy={18} className="fill-muted-foreground text-[11px]">
                                      equipos
                                    </tspan>
                                  </text>
                                );
                              }}
                            />
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <ul className="space-y-2 text-xs">
                      {estados.map((e) => {
                        const share = s.total > 0 ? Math.round((e.cantidad / s.total) * 100) : 0;
                        return (
                          <li
                            key={e.key}
                            className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: C[e.key] ?? COLORES[0] }}
                              />
                              <span className="font-medium text-foreground">{e.nombre}</span>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-semibold text-foreground">
                                {e.cantidad} <span className="text-[10px] font-normal text-muted-foreground">({share}%)</span>
                              </div>
                              {e.valor > 0 && (
                                <div className="font-mono text-[10px] text-muted-foreground">{copCompact(e.valor)}</div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                {/* Barras apiladas por tipo y estado */}
                <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs lg:col-span-7">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Disponibilidad vs. Asignación por tipo</h3>
                      <p className="text-xs text-muted-foreground">
                        Comparativa del estado operativo en cada categoría de hardware
                      </p>
                    </div>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={a.por_tipo_estado} margin={{ top: 8, right: 8, left: -12, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="nombre"
                          fontSize={11}
                          tick={{ fill: "var(--muted-foreground)" }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={55}
                        />
                        <YAxis fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {(["disponible", "asignado", "en_reparacion", "de_baja"] as const).map((k, idx) => (
                          <Bar
                            key={k}
                            dataKey={k}
                            stackId="a"
                            name={etiquetaEstado(k)}
                            fill={C[k]}
                            radius={idx === 3 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Valoración patrimonial interactiva (Tipo | Marca | Sede) */}
              <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Concentración de valor patrimonial</h3>
                    <p className="text-xs text-muted-foreground">
                      Distribución financiera del inventario según categoría, fabricante o sede
                    </p>
                  </div>
                  <div className="inline-flex rounded-xl border border-border/80 bg-muted/30 p-1">
                    {(
                      [
                        { id: "por_tipo", label: "Por tipo de equipo" },
                        { id: "por_marca", label: "Por marca" },
                        { id: "por_sede", label: "Por sede" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDimValor(opt.id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                          dimValor === opt.id
                            ? "bg-background text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieValor} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="nombre"
                        fontSize={11}
                        tick={{ fill: "var(--muted-foreground)" }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={55}
                      />
                      <YAxis
                        fontSize={11}
                        tick={{ fill: "var(--muted-foreground)" }}
                        tickFormatter={(v) => copCompact(Number(v))}
                      />
                      <Tooltip content={<CustomTooltip isCurrency />} />
                      <Bar dataKey="valor" name="Valor total" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Matriz ejecutiva por tipo de equipo */}
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-5 py-3.5">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Matriz ejecutiva por categoría</h3>
                    <p className="text-xs text-muted-foreground">
                      Desglose de unidades, tasa de uso, costo unitario promedio y valoración total
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5">Categoría</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                        <th className="px-4 py-2.5 text-right">Disponibles</th>
                        <th className="px-4 py-2.5 text-right">Asignados</th>
                        <th className="px-4 py-2.5 text-right">Reparación</th>
                        <th className="px-4 py-2.5 text-right">Baja</th>
                        <th className="px-4 py-2.5">Utilización</th>
                        <th className="px-4 py-2.5 text-right">Costo prom.</th>
                        <th className="px-4 py-2.5 text-right">Valor total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {s.por_tipo.map((t) => {
                        const op = Math.max(0, t.cantidad - t.de_baja);
                        const u = op > 0 ? Math.round((t.asignados / op) * 100) : 0;
                        return (
                          <tr key={t.nombre} className="transition-colors hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-semibold text-foreground">{t.nombre}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-medium">{t.cantidad}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-success">{t.disponibles}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary">{t.asignados}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-warning">{t.en_reparacion}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{t.de_baja}</td>
                            <td className="w-36 px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full bg-primary" style={{ width: `${u}%` }} />
                                </div>
                                <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
                                  {u}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                              {t.promedio ? cop(t.promedio) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">
                              {cop(t.valor)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: MOVIMIENTOS */}
            <TabsContent value="movimientos" className="space-y-6">
              <div className="grid gap-3.5 sm:grid-cols-3">
                <div className="rounded-xl border border-border/80 bg-card p-4">
                  <div className="text-xs text-muted-foreground">Entregas firmadas (12 meses)</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-primary">{totEntregas12m}</div>
                  <div className="text-[11px] text-muted-foreground">Equipos entregados a colaboradores</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-card p-4">
                  <div className="text-xs text-muted-foreground">Devoluciones firmadas (12 meses)</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-warning">{totDevoluciones12m}</div>
                  <div className="text-[11px] text-muted-foreground">Equipos reintegrados al almacén</div>
                </div>
                <div className="rounded-xl border border-border/80 bg-card p-4">
                  <div className="text-xs text-muted-foreground">Nuevos ingresos (12 meses)</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-success">+{totIngresos12m}</div>
                  <div className="text-[11px] text-muted-foreground">Adquisiciones sumadas al inventario</div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Grafico
                  titulo="Dinámica de entregas y devoluciones (12 meses)"
                  sub="Flujo mensual de actas perfeccionadas"
                >
                  <AreaChart data={a.movimientos} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradEntregas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradDevoluciones" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--warning, #f59e0b)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--warning, #f59e0b)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="mes" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                    <YAxis fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="entregas"
                      name="Entregas"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#gradEntregas)"
                    />
                    <Area
                      type="monotone"
                      dataKey="devoluciones"
                      name="Devoluciones"
                      stroke="var(--warning, #f59e0b)"
                      strokeWidth={2}
                      fill="url(#gradDevoluciones)"
                    />
                  </AreaChart>
                </Grafico>

                <Grafico
                  titulo="Evolución y crecimiento del parque tecnológico"
                  sub="Inventario acumulado frente a ingresos mensuales"
                >
                  <AreaChart data={a.movimientos} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--success, #10b981)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--success, #10b981)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="mes" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                    <YAxis fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="acumulado"
                      name="Total acumulado"
                      stroke="var(--success, #10b981)"
                      strokeWidth={2}
                      fill="url(#gradAcum)"
                    />
                    <Area
                      type="monotone"
                      dataKey="ingresos"
                      name="Ingresos del mes"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="var(--primary)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </Grafico>
              </div>

              <Tabla
                titulo="Detalle histórico mensual (12 meses)"
                cols={["Mes", "Entregas", "Devoluciones", "Ingresos nuevos", "Parque acumulado"]}
                filas={a.movimientos.map((m) => [m.mes, m.entregas, m.devoluciones, `+${m.ingresos}`, m.acumulado])}
              />
            </TabsContent>

            {/* TAB 3: CALIDAD Y FALLAS */}
            <TabsContent value="calidad" className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <Grafico
                  titulo="Siniestralidad por marca (Reparaciones y Bajas)"
                  sub="Fabricantes con mayor volumen de incidencias técnicas"
                >
                  <BarChart data={a.fallas_marca} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={110}
                      fontSize={11}
                      tick={{ fill: "var(--foreground)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="reparaciones" name="Reparaciones" stackId="f" fill={C.en_reparacion} />
                    <Bar dataKey="bajas" name="Bajas" stackId="f" fill={C.de_baja} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </Grafico>

                <Grafico
                  titulo="Modelos con mayor índice de falla"
                  sub="Referencias específicas que concentran mantenimientos"
                >
                  <BarChart data={a.fallas_modelo} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={130}
                      fontSize={11}
                      tick={{ fill: "var(--foreground)" }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="reparaciones" name="Reparaciones" stackId="f" fill={C.en_reparacion} />
                    <Bar dataKey="bajas" name="Bajas" stackId="f" fill={C.de_baja} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </Grafico>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Grafico
                  titulo="Cronograma de vencimiento de garantías (próximos 90 días)"
                  sub="Equipos cuya cobertura del proveedor expira próximamente"
                >
                  <BarChart
                    data={[
                      { nombre: "0–30 días", cantidad: a.garantias.d30 },
                      { nombre: "31–60 días", cantidad: a.garantias.d60 },
                      { nombre: "61–90 días", cantidad: a.garantias.d90 },
                    ]}
                    margin={{ top: 8, right: 12, left: -12, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="nombre" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                    <YAxis fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="cantidad" name="Equipos por vencer" fill="var(--warning, #f59e0b)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </Grafico>

                <Tabla
                  titulo="Detalle de fallas por marca"
                  cols={["Marca", "En reparación", "Dados de baja", "Total incidencias"]}
                  filas={a.fallas_marca.map((m) => [m.nombre, m.reparaciones, m.bajas, m.reparaciones + m.bajas])}
                  vacio="Sin reparaciones ni bajas registradas."
                />
              </div>
            </TabsContent>

            {/* TAB 4: EMPLEADOS */}
            <TabsContent value="empleados" className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Distribución organizacional de equipos</h3>
                  <p className="text-xs text-muted-foreground">
                    Analiza cómo están repartidos los activos asignados según cargo, área o sede del colaborador
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-border/80 bg-muted/30 p-1">
                  {(
                    [
                      { id: "por_cargo", label: "Por cargo" },
                      { id: "por_area", label: "Por área / departamento" },
                      { id: "por_sede_emp", label: "Por sede" },
                    ] as const
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGrupo(g.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        grupo === g.id
                          ? "bg-background text-foreground shadow-2xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <Grafico titulo="Volumen de equipos asignados" alto="h-96">
                    <BarChart data={grupos} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="nombre"
                        width={150}
                        fontSize={11}
                        tick={{ fill: "var(--foreground)" }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="cantidad" name="Equipos asignados" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </Grafico>
                </div>

                <div className="lg:col-span-5">
                  <Tabla
                    titulo="Participación porcentual"
                    cols={["Segmento", "Equipos", "% del total"]}
                    filas={grupos.map((g) => [
                      g.nombre,
                      g.cantidad,
                      `${totalGrupo > 0 ? Math.round((g.cantidad / totalGrupo) * 100) : 0}%`,
                    ])}
                    vacio="Sin equipos asignados en este segmento."
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 5: PROVEEDORES Y STOCK */}
            <TabsContent value="proveedores" className="space-y-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <Grafico
                  titulo="Stock disponible vs. mínimo requerido"
                  sub="Comparación directa frente al umbral de seguridad configurado"
                >
                  <BarChart data={a.stock} margin={{ top: 8, right: 12, left: -12, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="nombre"
                      fontSize={11}
                      tick={{ fill: "var(--muted-foreground)" }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={55}
                    />
                    <YAxis fontSize={11} tick={{ fill: "var(--muted-foreground)" }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="disponibles" name="Disponibles" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="minimo" name="Stock mínimo" fill={C.de_baja} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </Grafico>

                <Grafico
                  titulo="Top proveedores por inversión acumulada"
                  sub="Aliados comerciales con mayor facturación en el inventario"
                >
                  <BarChart
                    data={s.top_proveedores.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      fontSize={11}
                      tick={{ fill: "var(--muted-foreground)" }}
                      tickFormatter={(v) => copCompact(Number(v))}
                    />
                    <YAxis
                      type="category"
                      dataKey="nombre"
                      width={135}
                      fontSize={11}
                      tick={{ fill: "var(--foreground)" }}
                    />
                    <Tooltip content={<CustomTooltip isCurrency />} />
                    <Bar dataKey="valor" name="Inversión total" fill="var(--success, #10b981)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </Grafico>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Tabla
                  titulo="Ranking de proveedores por valor suministrado"
                  cols={["Proveedor", "Equipos", "Costo prom.", "Valor total"]}
                  filas={s.top_proveedores.map((p) => [
                    p.nombre,
                    p.cantidad,
                    cop(p.cantidad > 0 ? p.valor / p.cantidad : 0),
                    cop(p.valor),
                  ])}
                  vacio="Sin proveedores registrados en equipos."
                />

                {/* Tarjeta interactiva de alertas de stock y pedidos en camino */}
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
                  <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-5 py-3.5">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">Alertas de reabastecimiento activas</h3>
                      <p className="text-xs text-muted-foreground">
                        {(pedidosCamino.data?.length ?? 0) > 0
                          ? `${pedidosCamino.data!.length} pedido(s) en camino hacia el almacén`
                          : "Haz clic en un artículo para consultar proveedores y pedir"}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-border/60">
                    {(stock.data ?? []).map((x) => {
                      const falta = Math.max(1, x.stock_minimo - x.disponibles + 1);
                      return (
                        <div
                          key={x.tipo_id}
                          className="flex items-center justify-between gap-3 px-5 py-3 text-xs transition-colors hover:bg-muted/30"
                        >
                          <div>
                            <div className="font-semibold text-foreground">{x.tipo}</div>
                            <div className="text-muted-foreground">
                              Disponibles: <b className="font-mono text-destructive">{x.disponibles}</b> · Mínimo:{" "}
                              <b className="font-mono text-foreground">{x.stock_minimo}</b>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                              Faltan +{falta}
                            </span>
                            {me?.can("reabastecimiento_gestionar") && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => setReabastecerTipo(x.tipo_id)}
                              >
                                Reabastecer
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!(stock.data ?? []).length && (
                      <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                        Sin alertas de stock bajo activas.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <ProveedoresSheet tipoId={reabastecerTipo} onClose={() => setReabastecerTipo(null)} />
    </div>
  );
}

function CustomTooltip({
  active,
  payload,
  label,
  isCurrency = false,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string; fill?: string }[];
  label?: string;
  isCurrency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/80 bg-popover/95 px-3 py-2 text-xs text-popover-foreground shadow-xl backdrop-blur-md">
      {label && <div className="mb-1.5 font-semibold text-foreground">{label}</div>}
      <div className="space-y-1">
        {payload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color || entry.fill || "var(--primary)" }}
              />
              {entry.name}:
            </span>
            <span className="font-mono font-semibold text-foreground">
              {isCurrency ? cop(entry.value) : Number(entry.value).toLocaleString("es-CO")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  v,
  sub,
  salud,
  delta,
  invertir,
  progress,
}: {
  icon: typeof Activity;
  label: string;
  v: string;
  sub: string;
  salud: "ok" | "medio" | "mal";
  delta?: number;
  invertir?: boolean;
  progress?: number;
}) {
  const cfg = {
    ok: {
      dot: "bg-success",
      badge: "border-success/30 bg-success/10 text-success",
      bar: "bg-success",
      txt: "Saludable",
    },
    medio: {
      dot: "bg-warning",
      badge: "border-warning/30 bg-warning/10 text-warning",
      bar: "bg-warning",
      txt: "Atención",
    },
    mal: {
      dot: "bg-destructive",
      badge: "border-destructive/30 bg-destructive/10 text-destructive",
      bar: "bg-destructive",
      txt: "Crítico",
    },
  }[salud];

  const d = delta != null ? Math.round(delta * 10) / 10 : null;
  const bueno = d != null && (invertir ? d <= 0 : d >= 0);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5 text-primary" />
            {label}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.txt}
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-bold tracking-tight text-foreground">{v}</div>
          {d != null && d !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-medium ${
                bueno ? "text-success" : "text-destructive"
              }`}
            >
              {d >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {d >= 0 ? "+" : ""}
              {d} pts
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </div>

      {progress !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full transition-all duration-500 ${cfg.bar}`} style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  v,
  sub,
  badge,
  destacado,
  alerta,
}: {
  icon: typeof DollarSign;
  label: string;
  v: string;
  sub?: string;
  badge?: string;
  destacado?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-4 shadow-2xs ${
        destacado
          ? "border-primary/35 bg-gradient-to-br from-primary/[0.10] via-primary/[0.04] to-card"
          : alerta
            ? "border-warning/35 bg-gradient-to-br from-warning/[0.08] to-card"
            : "border-border/80 bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${destacado ? "text-primary" : alerta ? "text-warning" : "text-muted-foreground"}`} />
          {label}
        </span>
        {badge && (
          <span className="rounded-md border border-border/70 bg-background/80 px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2.5 font-display text-2xl font-bold tracking-tight text-foreground">{v}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Grafico({
  titulo,
  sub,
  children,
  alto = "h-72",
}: {
  titulo: string;
  sub?: string;
  children: React.ReactElement;
  alto?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-2xs">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className={alto}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Tabla({
  titulo,
  cols,
  filas,
  vacio = "Sin datos.",
}: {
  titulo: string;
  cols: string[];
  filas: (string | number)[][];
  vacio?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
      <div className="border-b border-border/70 bg-muted/20 px-5 py-3.5 text-sm font-semibold text-foreground">
        {titulo}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              {cols.map((c, i) => (
                <th key={c} className={`px-4 py-2.5 ${i ? "text-right" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filas.map((f, i) => (
              <tr key={i} className="transition-colors hover:bg-muted/30">
                {f.map((c, j) => (
                  <td
                    key={j}
                    className={`px-4 py-2.5 ${
                      j ? "text-right font-mono tabular-nums text-foreground" : "font-medium text-foreground"
                    }`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {!filas.length && (
              <tr>
                <td colSpan={cols.length} className="px-4 py-8 text-center text-muted-foreground">
                  {vacio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
