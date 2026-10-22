import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { cop, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";
import { DetallePedido, EstadoPedido, NuevoPedido } from "@/components/Pedidos";
import { FormProveedor } from "@/components/ProveedorForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CalendarClock,
  Clock,
  CreditCard,
  Link2,
  Minus,
  Package,
  Plus,
  Settings2,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
} from "lucide-react";

export type StockBajo = { tipo_id: string; tipo: string; disponibles: number; stock_minimo: number };

export type PedidoEnCamino = {
  id: string;
  numero: number;
  estado: string;
  fecha_pedido: string | null;
  fecha_esperada: string | null;
  created_at: string;
  proveedor: { nombre: string } | null;
  lineas: { tipo_id: string; cantidad: number; recibida: number }[];
};

export function useStockBajo() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["equipos", "stock_bajo"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stock_bajo");
      if (error) throw error;
      return ((data ?? []) as StockBajo[]).map((r) => ({ ...r, disponibles: Number(r.disponibles) }));
    },
  });
}

/** Pedidos realizados o recibidos parcialmente que están pendientes de entrega. */
export function usePedidosEnCamino() {
  const { data: me } = useMe();
  return useQuery({
    queryKey: ["pedidos", "en_camino"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select(
          "id, numero, estado, fecha_pedido, fecha_esperada, created_at, proveedor:proveedores(nombre), lineas:pedido_lineas(tipo_id, cantidad, recibida)",
        )
        .in("estado", ["pedido", "parcial"])
        .order("fecha_esperada", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoEnCamino[];
    },
  });
}

/** Calcula el estado temporal de llegada de un pedido según su fecha_esperada. */
export function infoLlegadaPedido(fechaEsperada: string | null) {
  if (!fechaEsperada) {
    return {
      etiqueta: "Sin fecha estimada",
      detalle: "Entrega pendiente por confirmar",
      tono: "muted" as const,
      dias: null as number | null,
      cls: "border-border bg-muted/60 text-muted-foreground",
    };
  }
  const hoyStr = new Date().toISOString().slice(0, 10);
  const tEsp = new Date(`${fechaEsperada}T00:00:00`).getTime();
  const tHoy = new Date(`${hoyStr}T00:00:00`).getTime();
  const dias = Math.round((tEsp - tHoy) / 86_400_000);

  if (dias < 0) {
    const atr = Math.abs(dias);
    return {
      etiqueta: `Atrasado ${atr}d`,
      detalle: `Debía llegar el ${fmtFecha(fechaEsperada)}`,
      tono: "destructive" as const,
      dias,
      cls: "border-destructive/35 bg-destructive/10 text-destructive",
    };
  }
  if (dias === 0) {
    return {
      etiqueta: "Llega hoy",
      detalle: `Entrega esperada hoy (${fmtFecha(fechaEsperada)})`,
      tono: "warning" as const,
      dias: 0,
      cls: "border-warning/40 bg-warning/15 text-warning",
    };
  }
  if (dias === 1) {
    return {
      etiqueta: "Llega mañana",
      detalle: `Entrega esperada mañana (${fmtFecha(fechaEsperada)})`,
      tono: "warning" as const,
      dias: 1,
      cls: "border-warning/35 bg-warning/10 text-warning",
    };
  }
  if (dias <= 3) {
    return {
      etiqueta: `En ${dias} días`,
      detalle: `Entrega esperada el ${fmtFecha(fechaEsperada)}`,
      tono: "warning" as const,
      dias,
      cls: "border-warning/30 bg-warning/10 text-warning",
    };
  }
  return {
    etiqueta: `En ${dias} días`,
    detalle: `Entrega esperada el ${fmtFecha(fechaEsperada)}`,
    tono: "primary" as const,
    dias,
    cls: "border-primary/30 bg-primary/10 text-primary",
  };
}

const sel =
  "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** Campana de alertas y notificaciones con pestañas (Stock bajo | Pedidos). */
export function CampanaAlertas() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qStock = useStockBajo();
  const qPedidos = usePedidosEnCamino();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"stock" | "pedidos">("stock");
  const [tipo, setTipo] = useState<string | null>(null);
  const [verPedido, setVerPedido] = useState<string | null>(null);
  const [config, setConfig] = useState(false);

  const stockList = qStock.data ?? [];
  const pedidosList = qPedidos.data ?? [];
  const nStock = stockList.length;
  const nPedidos = pedidosList.length;
  const totalAlertas = nStock + nPedidos;
  const hayCritico =
    nStock > 0 || pedidosList.some((p) => p.fecha_esperada && p.fecha_esperada <= new Date().toISOString().slice(0, 10));
  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");

  useEffect(() => {
    if (nStock === 0 && nPedidos > 0) setTab("pedidos");
    else if (nStock > 0 && nPedidos === 0) setTab("stock");
  }, [nStock, nPedidos]);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`relative inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              hayCritico
                ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                : totalAlertas > 0
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border/60 bg-background/60 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
            }`}
            aria-label={`Notificaciones y alertas: ${totalAlertas}`}
            title="Centro de notificaciones (Stock bajo y Pedidos)"
          >
            <Bell className="h-3.5 w-3.5" />
            {totalAlertas > 0 && (
              <span
                className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold shadow-sm ${
                  hayCritico ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                }`}
              >
                {totalAlertas}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 overflow-hidden rounded-2xl border-border/80 p-0 shadow-xl">
          {/* Cabecera del panel de notificaciones */}
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/25 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-tight text-foreground">Notificaciones</span>
              {totalAlertas > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                  {totalAlertas}
                </span>
              )}
            </div>
            {puedeReabastecer && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfig(true);
                }}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Settings2 className="h-3 w-3" />
                Umbrales
              </button>
            )}
          </div>

          {/* Pestañas segmentadas: Stock bajo vs Pedidos */}
          <div className="grid grid-cols-2 gap-1 border-b border-border/60 bg-muted/15 p-1.5">
            <button
              type="button"
              onClick={() => setTab("stock")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
                tab === "stock"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className={`h-3.5 w-3.5 ${nStock > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              <span>Stock bajo</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                  nStock > 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {nStock}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("pedidos")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
                tab === "pedidos"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className={`h-3.5 w-3.5 ${nPedidos > 0 ? "text-primary" : "text-muted-foreground"}`} />
              <span>Pedidos</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                  nPedidos > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {nPedidos}
              </span>
            </button>
          </div>

          {/* Contenido de la pestaña activa */}
          <div className="max-h-80 overflow-y-auto">
            {tab === "stock" ? (
              nStock === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
                    <Package className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-medium text-foreground">Stock en niveles óptimos</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Ningún artículo se encuentra por debajo del mínimo configurado.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {stockList.map((a) => {
                    const sugerida = Math.max(1, a.stock_minimo - a.disponibles + 1);
                    const pct =
                      a.stock_minimo > 0 ? Math.min(100, Math.round((a.disponibles / a.stock_minimo) * 100)) : 0;
                    const contenido = (
                      <div className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-foreground">{a.tipo}</span>
                          <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                            Pedir +{sugerida}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>
                            Disponibles: <b className="font-mono text-destructive">{a.disponibles}</b> / mín.{" "}
                            <b className="font-mono text-foreground">{a.stock_minimo}</b>
                          </span>
                          {puedeReabastecer && (
                            <span className="font-medium text-primary">Reabastecer →</span>
                          )}
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-destructive transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                    return (
                      <li key={a.tipo_id}>
                        {puedeReabastecer ? (
                          <button
                            type="button"
                            className="w-full"
                            onClick={() => {
                              setOpen(false);
                              setTipo(a.tipo_id);
                            }}
                          >
                            {contenido}
                          </button>
                        ) : (
                          contenido
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : nPedidos === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Truck className="h-4 w-4" />
                </div>
                <p className="text-xs font-medium text-foreground">Sin pedidos en camino</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  No hay órdenes de compra pendientes de recepción.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {pedidosList.map((p) => {
                  const info = infoLlegadaPedido(p.fecha_esperada);
                  const totalU = p.lineas.reduce((s, l) => s + l.cantidad, 0);
                  const recU = p.lineas.reduce((s, l) => s + l.recibida, 0);
                  const pct = totalU > 0 ? Math.round((recU / totalU) * 100) : 0;
                  const resumenArt = p.lineas
                    .map((l) => `${cat.nombre(l.tipo_id)} (${l.recibida}/${l.cantidad})`)
                    .join(", ");
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setVerPedido(p.id);
                        }}
                        className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-foreground">
                            Pedido <span className="font-mono text-primary">#{p.numero}</span> ·{" "}
                            {p.proveedor?.nombre ?? "Proveedor"}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${info.cls}`}
                          >
                            {info.etiqueta}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground" title={resumenArt}>
                          {resumenArt || `${recU}/${totalU} unidades`}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px]">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarClock className="h-3 w-3 text-primary" />
                            {p.fecha_esperada ? (
                              <span>
                                Entrega esperada: <b className="text-foreground">{fmtFecha(p.fecha_esperada)}</b>
                              </span>
                            ) : (
                              <span>Sin fecha estimada</span>
                            )}
                          </span>
                          <span className="font-medium text-primary">Ver / Recibir →</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {recU}/{totalU}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pie del popover */}
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-4 py-2 text-xs">
            <Link
              to="/equipos"
              onClick={() => setOpen(false)}
              className="font-medium text-muted-foreground hover:text-foreground"
            >
              Ver inventario
            </Link>
            {puedeReabastecer && (
              <Link
                to="/reabastecimiento"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Ir a Reabastecimiento
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <DetallePedido id={verPedido} onClose={() => setVerPedido(null)} />
      {puedeReabastecer && (
        <>
          <ConfigAlertas
            open={config}
            onClose={() => setConfig(false)}
            onProveedores={(t) => {
              setConfig(false);
              setTipo(t);
            }}
          />
          <ProveedoresSheet tipoId={tipo} onClose={() => setTipo(null)} />
        </>
      )}
    </>
  );
}

/** Panel de alertas con pestañas (Stock bajo | Pedidos en camino) para Panel e Inventario. */
export function BannerStock() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const q = useStockBajo();
  const qPedidos = usePedidosEnCamino();
  const [tab, setTab] = useState<"stock" | "pedidos">("stock");
  const [config, setConfig] = useState(false);
  const [tipo, setTipo] = useState<string | null>(null);
  const [verPedido, setVerPedido] = useState<string | null>(null);

  const lista = q.data ?? [];
  const pedidos = qPedidos.data ?? [];

  useEffect(() => {
    if (lista.length === 0 && pedidos.length > 0) setTab("pedidos");
    else if (lista.length > 0 && pedidos.length === 0) setTab("stock");
  }, [lista.length, pedidos.length]);

  if (!me?.isStaff) return null;
  const puedeReabastecer = me.can("reabastecimiento_gestionar");

  if (lista.length === 0 && pedidos.length === 0) {
    return (
      <>
        {puedeReabastecer && (
          <div className="mb-4 flex justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfig(true)}>
              <Bell className="mr-1.5 h-3.5 w-3.5 text-primary" />
              Configurar alertas de stock
            </Button>
          </div>
        )}
        <ConfigAlertas
          open={config}
          onClose={() => setConfig(false)}
          onProveedores={(t) => {
            setConfig(false);
            setTipo(t);
          }}
        />
        <ProveedoresSheet tipoId={tipo} onClose={() => setTipo(null)} />
      </>
    );
  }

  return (
    <>
      <div
        className={`mb-6 overflow-hidden rounded-2xl border p-4 shadow-2xs transition-colors ${
          tab === "stock" && lista.length > 0
            ? "border-destructive/35 bg-gradient-to-r from-destructive/[0.08] via-destructive/[0.03] to-transparent"
            : "border-primary/25 bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent"
        }`}
      >
        {/* Barra superior con pestañas y acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-background/80 p-1 backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setTab("stock")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                tab === "stock"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className={`h-3.5 w-3.5 ${lista.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              <span>Stock bajo</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                  lista.length > 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {lista.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTab("pedidos")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                tab === "pedidos"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className={`h-3.5 w-3.5 ${pedidos.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
              <span>Pedidos en camino</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] font-semibold ${
                  pedidos.length > 0
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {pedidos.length}
              </span>
            </button>
          </div>

          {puedeReabastecer && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setConfig(true)}>
                <Settings2 className="mr-1.5 h-3.5 w-3.5" />
                Configurar alertas
              </Button>
              {tab === "stock" && lista.length > 0 ? (
                <Button size="sm" className="h-8 text-xs" onClick={() => setTipo(lista[0]!.tipo_id)}>
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                  Ver proveedores / Reabastecer
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild className="h-8 text-xs">
                  <Link to="/reabastecimiento">
                    Ver todos los pedidos
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Contenido de pestaña: Stock bajo vs Pedidos */}
        {tab === "stock" ? (
          lista.length === 0 ? (
            <div className="mt-3 rounded-xl border border-border/70 bg-card/80 px-4 py-4 text-xs text-muted-foreground">
              Todos los artículos están por encima del stock mínimo configurado.
            </div>
          ) : (
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((a) => {
                const sugerida = Math.max(1, a.stock_minimo - a.disponibles + 1);
                const pct =
                  a.stock_minimo > 0 ? Math.min(100, Math.round((a.disponibles / a.stock_minimo) * 100)) : 0;
                return (
                  <button
                    key={a.tipo_id}
                    type="button"
                    disabled={!puedeReabastecer}
                    onClick={() => puedeReabastecer && setTipo(a.tipo_id)}
                    className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card/95 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm disabled:cursor-default disabled:hover:translate-y-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-foreground group-hover:text-primary">{a.tipo}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Disponibles: <b className="font-mono text-destructive">{a.disponibles}</b> · Mínimo:{" "}
                          <b className="font-mono text-foreground">{a.stock_minimo}</b>
                        </div>
                      </div>
                      <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                        Pedir +{sugerida}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full transition-all ${a.disponibles === 0 ? "bg-destructive" : "bg-warning"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {puedeReabastecer && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground transition-colors group-hover:text-primary">
                          Proveedores
                          <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : pedidos.length === 0 ? (
          <div className="mt-3 rounded-xl border border-border/70 bg-card/80 px-4 py-4 text-xs text-muted-foreground">
            No hay pedidos de compra en tránsito en este momento.
          </div>
        ) : (
          <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {pedidos.slice(0, 6).map((p) => {
              const info = infoLlegadaPedido(p.fecha_esperada);
              const pedidas = p.lineas.reduce((s, l) => s + l.cantidad, 0);
              const recibidas = p.lineas.reduce((s, l) => s + l.recibida, 0);
              const pct = pedidas > 0 ? Math.round((recibidas / pedidas) * 100) : 0;
              const articulos = p.lineas
                .map((l) => `${cat.nombre(l.tipo_id)} (${l.recibida}/${l.cantidad})`)
                .join(", ");

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setVerPedido(p.id)}
                  className="group flex flex-col justify-between rounded-xl border border-border/80 bg-card/95 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground group-hover:text-primary">
                        <span className="font-mono text-primary">#{p.numero}</span> ·{" "}
                        {p.proveedor?.nombre ?? "Proveedor"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${info.cls}`}>
                        {info.etiqueta}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground" title={articulos}>
                      {articulos}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarClock className="h-3 w-3 shrink-0 text-primary" />
                      {p.fecha_esperada ? (
                        <span>
                          Entrega esperada: <b className="font-medium text-foreground">{fmtFecha(p.fecha_esperada)}</b>
                        </span>
                      ) : (
                        <span>Sin fecha de entrega definida</span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {recibidas}/{pedidas}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <DetallePedido id={verPedido} onClose={() => setVerPedido(null)} />
      <ConfigAlertas
        open={config}
        onClose={() => setConfig(false)}
        onProveedores={(t) => {
          setConfig(false);
          setTipo(t);
        }}
      />
      <ProveedoresSheet tipoId={tipo} onClose={() => setTipo(null)} />
    </>
  );
}

export function ConfigAlertas({
  open,
  onClose,
  onProveedores,
}: {
  open: boolean;
  onClose: () => void;
  onProveedores: (tipo: string) => void;
}) {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const bajos = useStockBajo();
  const [nuevo, setNuevo] = useState({ tipo_id: "", min: "3" });
  const q = useQuery({
    queryKey: ["alertas_config"],
    enabled: open,
    queryFn: async () => (await supabase.from("alertas_stock_config").select("*").order("created_at")).data ?? [],
  });
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["alertas_config"] });
    qc.invalidateQueries({ queryKey: ["equipos", "stock_bajo"] });
  };
  async function agregar() {
    if (!me?.can("reabastecimiento_gestionar"))
      return toast.error("No tiene permiso para configurar alertas de stock.");
    const min = Number(nuevo.min);
    if (!nuevo.tipo_id || !Number.isInteger(min) || min < 0)
      return toast.error("Seleccione el artículo y un mínimo válido");
    const { error } = await supabase
      .from("alertas_stock_config")
      .insert({ tipo_id: nuevo.tipo_id, stock_minimo: min });
    if (error) return toast.error(error.code === "23505" ? "Ese artículo ya tiene una alerta." : errMsg(error));
    setNuevo({ tipo_id: "", min: "3" });
    refrescar();
    toast.success("Alerta de stock creada");
  }
  async function actualizar(id: string, v: { stock_minimo?: number; activa?: boolean }) {
    if (!me?.can("reabastecimiento_gestionar"))
      return toast.error("No tiene permiso para configurar alertas de stock.");
    const { error } = await supabase.from("alertas_stock_config").update(v).eq("id", id);
    if (error) toast.error(errMsg(error));
    else refrescar();
  }
  async function eliminar(id: string) {
    if (!me?.can("reabastecimiento_gestionar"))
      return toast.error("No tiene permiso para configurar alertas de stock.");
    const { error } = await supabase.from("alertas_stock_config").delete().eq("id", id);
    if (error) toast.error(errMsg(error));
    else refrescar();
  }
  const usados = new Set((q.data ?? []).map((a) => a.tipo_id));
  const mapaBajos = new Map((bajos.data ?? []).map((b) => [b.tipo_id, b.disponibles]));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl overflow-hidden rounded-2xl border-border/80 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight">Configurar alertas de stock</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Recibe avisos automáticos cuando los equipos disponibles de un tipo sean iguales o menores al umbral.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {/* Crear nueva alerta */}
          <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5">
            <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nueva regla de alerta
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label className="text-xs">Artículo del catálogo</Label>
                <select
                  className={sel}
                  value={nuevo.tipo_id}
                  onChange={(e) => setNuevo({ ...nuevo, tipo_id: e.target.value })}
                >
                  <option value="">Seleccione artículo…</option>
                  {cat
                    .byTipo("tipo_equipo")
                    .filter((c) => !usados.has(c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stock mínimo</Label>
                <div className="flex items-center rounded-lg border border-input bg-background">
                  <button
                    type="button"
                    onClick={() => setNuevo({ ...nuevo, min: String(Math.max(0, (Number(nuevo.min) || 0) - 1)) })}
                    className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Disminuir mínimo"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <Input
                    type="number"
                    min={0}
                    className="h-9 w-14 border-0 bg-transparent px-1 text-center font-mono text-xs focus-visible:ring-0"
                    value={nuevo.min}
                    onChange={(e) => setNuevo({ ...nuevo, min: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setNuevo({ ...nuevo, min: String((Number(nuevo.min) || 0) + 1) })}
                    className="flex h-9 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Aumentar mínimo"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <Button onClick={agregar} disabled={!nuevo.tipo_id}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
          </div>

          {/* Lista de reglas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">
                Umbrales configurados ({(q.data ?? []).length})
              </span>
              <span>Clic en el artículo para ver proveedores</span>
            </div>
            <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/80 bg-card">
              {(q.data ?? []).map((a) => {
                const enAlerta = mapaBajos.has(a.tipo_id);
                const disp = mapaBajos.get(a.tipo_id);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-left font-medium text-foreground transition-colors hover:text-primary"
                        onClick={() => onProveedores(a.tipo_id)}
                      >
                        <span>{cat.nombre(a.tipo_id)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                        {!a.activa ? (
                          <span className="text-muted-foreground">Alerta pausada</span>
                        ) : enAlerta ? (
                          <span className="font-medium text-destructive">
                            En alerta ({disp} disponible{disp === 1 ? "" : "s"})
                          </span>
                        ) : (
                          <span className="text-success">Stock saludable</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Mín:</span>
                        <Input
                          type="number"
                          min={0}
                          className="h-8 w-16 text-center font-mono text-xs"
                          defaultValue={a.stock_minimo}
                          aria-label="Mínimo"
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isInteger(v) && v >= 0 && v !== a.stock_minimo)
                              actualizar(a.id, { stock_minimo: v });
                          }}
                        />
                      </div>
                      <Switch
                        checked={a.activa}
                        onCheckedChange={(c) => actualizar(a.id, { activa: c })}
                        aria-label="Activa"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => eliminar(a.id)}
                        aria-label="Eliminar alerta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
              {q.data && !q.data.length && (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Aún no hay alertas configuradas. Selecciona un artículo arriba para empezar.
                </li>
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ProvRow = Prov;
type Vinculo = {
  id: string;
  proveedor_id: string;
  es_principal: boolean;
  precio_referencia: number | null;
  ultimo_precio: number | null;
  ultima_compra: string | null;
  tiempo_entrega_dias: number | null;
  proveedor: ProvRow | null;
};

export function ProveedoresSheet({ tipoId, onClose }: { tipoId: string | null; onClose: () => void }) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const bajos = useStockBajo();

  // Permite cambiar de artículo dentro del mismo drawer sin cerrarlo
  const [activeTipoId, setActiveTipoId] = useState<string | null>(tipoId);
  useEffect(() => {
    setActiveTipoId(tipoId);
    setCantidad("");
  }, [tipoId]);

  const actualId = activeTipoId ?? tipoId;
  const nombre = actualId ? cat.nombre(actualId) : "";

  const q = useQuery({
    queryKey: ["proveedores_articulo", actualId],
    enabled: !!actualId,
    queryFn: async () => {
      const [vin, todos, disp, cfg, sol] = await Promise.all([
        supabase.from("articulo_proveedores").select("*, proveedor:proveedores(*)").eq("tipo_id", actualId!),
        supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
        supabase
          .from("equipos")
          .select("id", { count: "exact", head: true })
          .eq("tipo_id", actualId!)
          .eq("estado", "disponible"),
        supabase.from("alertas_stock_config").select("id, stock_minimo, activa").eq("tipo_id", actualId!).maybeSingle(),
        supabase
          .from("pedido_lineas")
          .select(
            "cantidad, recibida, pedido:pedidos_compra!inner(id, numero, estado, fecha_esperada, created_at, proveedor:proveedores(nombre))",
          )
          .eq("tipo_id", actualId!)
          .in("pedido.estado", ["borrador", "pedido", "parcial"]),
      ]);
      const vinculos = ((vin.data ?? []) as unknown as Vinculo[])
        .filter((v) => v.proveedor)
        .sort(
          (a, b) =>
            Number(b.es_principal) - Number(a.es_principal) ||
            Number(b.proveedor!.activo) - Number(a.proveedor!.activo),
        );
      return {
        vinculos,
        todos: todos.data ?? [],
        disponibles: disp.count ?? 0,
        alertaId: cfg.data?.id ?? null,
        minimo: cfg.data?.stock_minimo ?? null,
        solicitudes: sol.data ?? [],
      };
    },
  });

  const d = q.data;
  const sugerida = d && d.minimo !== null ? Math.max(1, d.minimo - d.disponibles + 1) : 1;
  const [cantidad, setCantidad] = useState<string>("");
  const cant = Number(cantidad) > 0 ? Number(cantidad) : sugerida;
  const [existente, setExistente] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [pedir, setPedir] = useState<string | null>(null);
  const [verPedido, setVerPedido] = useState<string | null>(null);
  const [editandoMin, setEditandoMin] = useState(false);
  const [minVal, setMinVal] = useState("");

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["proveedores_articulo"] });
    qc.invalidateQueries({ queryKey: ["proveedor"] });
    qc.invalidateQueries({ queryKey: ["equipos", "stock_bajo"] });
    qc.invalidateQueries({ queryKey: ["alertas_config"] });
  };

  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");
  const puedeProveedores = !!me?.can("proveedores_editar");

  async function guardarUmbral() {
    if (!puedeReabastecer || !actualId) return;
    const v = Number(minVal);
    if (!Number.isInteger(v) || v < 0) return toast.error("Ingrese un stock mínimo válido");
    const { error } = d?.alertaId
      ? await supabase.from("alertas_stock_config").update({ stock_minimo: v, activa: true }).eq("id", d.alertaId)
      : await supabase.from("alertas_stock_config").insert({ tipo_id: actualId, stock_minimo: v, activa: true });
    if (error) return toast.error(errMsg(error));
    toast.success("Umbral de alerta actualizado");
    setEditandoMin(false);
    refrescar();
  }

  async function vincular(proveedor_id: string) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    if (!actualId || !proveedor_id) return;
    const { error } = await supabase
      .from("articulo_proveedores")
      .insert({ tipo_id: actualId, proveedor_id, es_principal: !d?.vinculos.length });
    if (error) return toast.error(error.code === "23505" ? "Ese proveedor ya está vinculado." : errMsg(error));
    setExistente("");
    toast.success("Proveedor vinculado al artículo");
    refrescar();
  }
  async function marcarPrincipal(v: Vinculo) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    if (v.es_principal) return;
    await supabase
      .from("articulo_proveedores")
      .update({ es_principal: false })
      .eq("tipo_id", actualId!)
      .eq("es_principal", true);
    const { error } = await supabase.from("articulo_proveedores").update({ es_principal: true }).eq("id", v.id);
    if (error) toast.error(errMsg(error));
    else {
      toast.success(`${v.proveedor?.nombre} marcado como proveedor principal`);
      refrescar();
    }
  }
  async function desvincular(id: string) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    const { error } = await supabase.from("articulo_proveedores").delete().eq("id", id);
    if (error) toast.error(errMsg(error));
    else refrescar();
  }

  const vinculados = new Set((d?.vinculos ?? []).map((v) => v.proveedor_id));
  const critico = d && d.minimo !== null && d.disponibles <= d.minimo;
  const pctStock =
    d && d.minimo && d.minimo > 0 ? Math.min(100, Math.round((d.disponibles / d.minimo) * 100)) : 100;

  return (
    <Sheet open={!!tipoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5 pr-6">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                critico
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/20 bg-primary/10 text-primary"
              }`}
            >
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-semibold tracking-tight">
                Reabastecer · {nombre}
              </SheetTitle>
              <p className="text-xs text-muted-foreground">
                Selecciona un proveedor aliado para crear el pedido o ajusta la alerta de stock.
              </p>
            </div>
          </div>

          {/* Selector rápido entre artículos con stock bajo */}
          {(bajos.data?.length ?? 0) > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                En alerta:
              </span>
              {bajos.data!.map((b) => {
                const activo = b.tipo_id === actualId;
                return (
                  <button
                    key={b.tipo_id}
                    type="button"
                    onClick={() => {
                      setActiveTipoId(b.tipo_id);
                      setCantidad("");
                    }}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${
                      activo
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border/70 bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    {b.tipo} ({b.disponibles}/{b.stock_minimo})
                  </button>
                );
              })}
            </div>
          )}
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Tarjeta interactiva de estado de stock y cantidad a pedir */}
          <div
            className={`rounded-xl border p-4 ${
              critico ? "border-destructive/35 bg-destructive/5" : "border-border/80 bg-muted/20"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Estado de inventario
                  </span>
                  {critico && (
                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-destructive">
                      Bajo mínimo
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-bold text-foreground">{d ? d.disponibles : "…"}</span>
                  <span className="text-xs text-muted-foreground">
                    disponible(s) {d?.minimo != null ? `· mínimo requerido: ${d.minimo}` : "· sin alerta activa"}
                  </span>
                </div>
              </div>

              {puedeReabastecer && !editandoMin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setMinVal(String(d?.minimo ?? 3));
                    setEditandoMin(true);
                  }}
                >
                  <Bell className="mr-1 h-3 w-3" />
                  {d?.minimo != null ? "Cambiar mínimo" : "Crear alerta"}
                </Button>
              )}
            </div>

            {d?.minimo != null && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-background/80">
                <div
                  className={`h-full transition-all ${critico ? "bg-destructive" : "bg-success"}`}
                  style={{ width: `${pctStock}%` }}
                />
              </div>
            )}

            {editandoMin && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background p-2.5">
                <Label className="text-xs whitespace-nowrap">Stock mínimo:</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20 font-mono text-xs"
                  value={minVal}
                  onChange={(e) => setMinVal(e.target.value)}
                />
                <Button size="sm" className="h-8 text-xs" onClick={guardarUmbral}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditandoMin(false)}>
                  Cancelar
                </Button>
              </div>
            )}

            {puedeReabastecer && (
              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div>
                  <Label className="text-xs font-medium text-foreground">Cantidad a solicitar</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Sugerido para superar el mínimo: <b className="font-mono text-foreground">{sugerida} u.</b>
                  </p>
                </div>
                <div className="flex items-center rounded-lg border border-input bg-background shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setCantidad(String(Math.max(1, cant - 1)))}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Disminuir cantidad"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    type="number"
                    min={1}
                    aria-label="Cantidad requerida"
                    className="h-8 w-16 border-0 bg-transparent px-1 text-center font-mono text-xs font-semibold focus-visible:ring-0"
                    placeholder={String(sugerida)}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setCantidad(String(cant + 1))}
                    className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Aumentar cantidad"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Pedidos en curso para este artículo */}
          {(d?.solicitudes ?? []).length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pedidos en curso ({d!.solicitudes.length})
              </div>
              {d!.solicitudes.map((l, i) => {
                const p = l.pedido as unknown as {
                  id: string;
                  numero: number;
                  estado: string;
                  fecha_esperada: string | null;
                  created_at: string;
                  proveedor: { nombre: string } | null;
                };
                const info = infoLlegadaPedido(p.fecha_esperada);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => puedeReabastecer && setVerPedido(p.id)}
                    className="group block w-full rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-left text-xs transition-all hover:border-warning hover:bg-warning/15"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        <Clock className="mr-1.5 inline h-3.5 w-3.5 text-warning" />
                        Pedido <b className="font-mono">#{p.numero}</b> · {p.proveedor?.nombre ?? "—"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {p.fecha_esperada && (
                          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium ${info.cls}`}>
                            {info.etiqueta}
                          </span>
                        )}
                        <EstadoPedido p={p} />
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Recibidos: <b className="font-mono text-foreground">{l.recibida}/{l.cantidad}</b> unidades
                        {p.fecha_esperada ? ` · Entrega esperada: ${fmtFecha(p.fecha_esperada)}` : ""}
                      </span>
                      {puedeReabastecer && (
                        <span className="font-medium text-foreground group-hover:underline">Ver / Recibir →</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Lista de tarjetas de proveedores del artículo */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Proveedores aliados ({(d?.vinculos ?? []).length})
              </h3>
              {puedeProveedores && (d?.vinculos ?? []).length > 1 && (
                <span className="text-[11px] text-muted-foreground">★ marca el proveedor sugerido</span>
              )}
            </div>

            <ul className="space-y-3">
              {(d?.vinculos ?? []).map((v) => {
                const p = v.proveedor!;
                const precioEst = v.precio_referencia ?? v.ultimo_precio;
                return (
                  <li
                    key={v.id}
                    className={`rounded-xl border p-4 text-sm transition-all ${
                      v.es_principal
                        ? "border-primary/40 bg-gradient-to-b from-primary/[0.04] to-transparent shadow-xs"
                        : "border-border/80 bg-card"
                    } ${p.activo ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {puedeProveedores ? (
                            <button
                              type="button"
                              onClick={() => marcarPrincipal(v)}
                              aria-label="Marcar como principal"
                              title="Marcar como proveedor principal"
                              className="rounded p-0.5 transition-transform hover:scale-110"
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  v.es_principal
                                    ? "fill-warning text-warning"
                                    : "text-muted-foreground/50 hover:text-warning"
                                }`}
                              />
                            </button>
                          ) : (
                            v.es_principal && <Star className="h-4 w-4 fill-warning text-warning" />
                          )}
                          <span className="font-semibold text-foreground">{p.nombre}</span>
                          {v.es_principal && (
                            <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              Principal
                            </span>
                          )}
                          {!p.activo && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              Inactivo
                            </span>
                          )}
                        </div>

                        {/* Píldoras de condiciones y precios */}
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          {p.dias_entrega != null && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-muted-foreground">
                              <Truck className="h-3 w-3" />
                              {p.dias_entrega} días
                            </span>
                          )}
                          {p.forma_pago && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-muted-foreground">
                              <CreditCard className="h-3 w-3" />
                              {p.forma_pago}
                            </span>
                          )}
                          {v.precio_referencia != null && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/5 px-2 py-0.5 font-mono text-foreground">
                              Ref: {cop(v.precio_referencia)}
                            </span>
                          )}
                          {v.ultimo_precio != null && (
                            <span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                              Últ. compra: {cop(v.ultimo_precio)}
                              {v.ultima_compra ? ` (${fmtFecha(v.ultima_compra)})` : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {puedeProveedores && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => desvincular(v.id)}
                          aria-label="Desvincular"
                          title="Desvincular proveedor de este artículo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="mt-3">
                      <ContactoProveedor p={p} compacto />
                    </div>

                    {puedeReabastecer && (
                      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                        <div className="text-xs text-muted-foreground">
                          {precioEst != null ? (
                            <span>
                              Est. por {cant} u.: <b className="font-mono text-foreground">{cop(precioEst * cant)}</b>
                            </span>
                          ) : (
                            <span>Sin precio de referencia registrado</span>
                          )}
                        </div>
                        <Button size="sm" className="h-8 text-xs" onClick={() => setPedir(p.id)}>
                          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                          Crear pedido ({cant} u.)
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}

              {d && !d.vinculos.length && (
                <li className="rounded-xl border border-dashed border-border p-6 text-center">
                  <Building2 className="mx-auto h-7 w-7 text-muted-foreground/50" />
                  <p className="mt-2 text-xs font-medium text-foreground">
                    Aún no hay proveedores vinculados a {nombre}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Vincula un proveedor existente o registra uno nuevo abajo para poder realizar pedidos.
                  </p>
                </li>
              )}
            </ul>
          </div>

          {/* Vincular o crear proveedor */}
          {puedeProveedores && (
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/15 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                Agregar proveedor para {nombre}
              </div>
              <div className="flex gap-2">
                <select className={sel} value={existente} onChange={(e) => setExistente(e.target.value)}>
                  <option value="">Seleccionar proveedor existente…</option>
                  {(d?.todos ?? [])
                    .filter((p) => !vinculados.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                </select>
                <Button disabled={!existente} onClick={() => vincular(existente)}>
                  Vincular
                </Button>
              </div>
              <Button variant="outline" className="w-full text-xs" onClick={() => setNuevo(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Registrar proveedor nuevo y vincular
              </Button>
            </div>
          )}
        </div>

        {nuevo && puedeProveedores && (
          <FormProveedor p={null} onClose={() => setNuevo(false)} onSaved={(id) => vincular(id)} />
        )}
        {pedir && actualId && puedeReabastecer && (
          <NuevoPedido
            inicial={{ proveedor_id: pedir, lineas: [{ tipo_id: actualId, cantidad: cant }] }}
            onClose={() => setPedir(null)}
            onCreado={(id) => setVerPedido(id)}
          />
        )}
        {puedeReabastecer && <DetallePedido id={verPedido} onClose={() => setVerPedido(null)} />}
      </SheetContent>
    </Sheet>
  );
}
