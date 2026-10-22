import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { ESTADOS_PEDIDO, cop, pedidoAtrasado, sumarDias, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  AlertTriangle,
  Barcode,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Minus,
  PackageCheck,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  XCircle,
} from "lucide-react";

const sel =
  "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const INVALIDAR = ["pedidos", "pedido", "equipos", "proveedores", "proveedor", "proveedores_articulo"];
export const refrescarPedidos = (qc: ReturnType<typeof useQueryClient>) =>
  INVALIDAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export function EstadoPedido({ p }: { p: { estado: string; fecha_esperada: string | null } }) {
  if (pedidoAtrasado(p)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Atrasado
      </span>
    );
  }
  const cfg: Record<string, { cls: string; dot: string }> = {
    recibido: {
      cls: "border-success/30 bg-success/10 text-success",
      dot: "bg-success",
    },
    parcial: {
      cls: "border-warning/30 bg-warning/10 text-warning",
      dot: "bg-warning",
    },
    pedido: {
      cls: "border-primary/30 bg-primary/10 text-primary",
      dot: "bg-primary",
    },
    borrador: {
      cls: "border-border bg-muted/60 text-muted-foreground",
      dot: "bg-muted-foreground/60",
    },
    cancelado: {
      cls: "border-border/70 bg-muted/30 text-muted-foreground line-through",
      dot: "bg-muted-foreground/40",
    },
  };
  const st = cfg[p.estado] ?? cfg.borrador!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${st.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
      {ESTADOS_PEDIDO[p.estado] ?? p.estado}
    </span>
  );
}

type LineaForm = { tipo_id: string; cantidad: string; precio: string };

/** Crear un pedido nuevo (borrador o realizado). */
export function NuevoPedido({
  inicial,
  onClose,
  onCreado,
}: {
  inicial?: { proveedor_id?: string | null; lineas?: { tipo_id: string; cantidad: number }[] };
  onClose: () => void;
  onCreado?: (id: string) => void;
}) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const provs = useQuery({
    queryKey: ["proveedores_lista_full"],
    queryFn: async () =>
      ((await supabase.from("proveedores").select("*").eq("activo", true).order("nombre")).data ?? []) as Prov[],
  });
  const [provId, setProvId] = useState(inicial?.proveedor_id ?? "");
  const prov = provs.data?.find((p) => p.id === provId);
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>(
    inicial?.lineas?.length
      ? inicial.lineas.map((l) => ({ tipo_id: l.tipo_id, cantidad: String(l.cantidad), precio: "" }))
      : [{ tipo_id: "", cantidad: "1", precio: "" }],
  );
  const [guardando, setGuardando] = useState(false);

  // Vínculos artículo-proveedor para autocompletar precios de referencia
  const vinculosProv = useQuery({
    queryKey: ["articulo_proveedores_precios", provId],
    enabled: !!provId,
    queryFn: async () =>
      (
        await supabase
          .from("articulo_proveedores")
          .select("tipo_id, precio_referencia, ultimo_precio, es_principal")
          .eq("proveedor_id", provId)
      ).data ?? [],
  });

  // Autocompletar precios cuando se cargan los vínculos del proveedor inicial
  useEffect(() => {
    if (!vinculosProv.data?.length) return;
    setLineas((actual) =>
      actual.map((l) => {
        if (!l.tipo_id || l.precio) return l;
        const v = vinculosProv.data.find((x) => x.tipo_id === l.tipo_id);
        const sugerido = v?.precio_referencia ?? v?.ultimo_precio ?? null;
        return sugerido != null ? { ...l, precio: String(sugerido) } : l;
      }),
    );
  }, [vinculosProv.data]);

  const fechaEsp = fecha || (prov?.dias_entrega != null ? sumarDias(prov.dias_entrega) : "");
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
  const totalUnidades = lineas.reduce((s, l) => s + (l.tipo_id ? Math.max(0, Number(l.cantidad) || 0) : 0), 0);

  const upd = (i: number, v: Partial<LineaForm>) =>
    setLineas(
      lineas.map((l, j) => {
        if (j !== i) return l;
        const next = { ...l, ...v };
        // Si cambió el artículo y no tenía precio, autocompletar desde el proveedor
        if (v.tipo_id && !l.precio && vinculosProv.data?.length) {
          const vin = vinculosProv.data.find((x) => x.tipo_id === v.tipo_id);
          const sug = vin?.precio_referencia ?? vin?.ultimo_precio ?? null;
          if (sug != null) next.precio = String(sug);
        }
        return next;
      }),
    );

  async function guardar(estado: "borrador" | "pedido") {
    if (!me?.can("reabastecimiento_gestionar")) return toast.error("No tiene permiso para crear pedidos de compra.");
    if (!provId) return toast.error("Seleccione el proveedor");
    const validas = lineas.filter((l) => l.tipo_id);
    if (!validas.length) return toast.error("Agregue al menos un artículo");
    if (validas.some((l) => !Number.isInteger(Number(l.cantidad)) || Number(l.cantidad) < 1))
      return toast.error("Cantidades inválidas");
    if (new Set(validas.map((l) => l.tipo_id)).size !== validas.length)
      return toast.error("Hay artículos repetidos");
    setGuardando(true);
    const { data, error } = await supabase
      .from("pedidos_compra")
      .insert({
        proveedor_id: provId,
        estado,
        fecha_esperada: fechaEsp || null,
        notas: notas.trim() || null,
        fecha_pedido: estado === "pedido" ? new Date().toISOString().slice(0, 10) : null,
        creado_nombre: me?.nombre ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      setGuardando(false);
      return toast.error(errMsg(error));
    }
    const { error: e2 } = await supabase.from("pedido_lineas").insert(
      validas.map((l) => ({
        pedido_id: data.id,
        tipo_id: l.tipo_id,
        cantidad: Number(l.cantidad),
        precio_estimado: l.precio ? Number(l.precio) : null,
      })),
    );
    setGuardando(false);
    if (e2) return toast.error(errMsg(e2));
    toast.success(estado === "pedido" ? "Pedido registrado" : "Borrador guardado");
    refrescarPedidos(qc);
    onCreado?.(data.id);
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-border/80 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight">Nuevo pedido de compra</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Solicita reabastecimiento a un proveedor aliado o guarda un borrador para cotización.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {/* Proveedor y Fecha */}
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/15 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Proveedor *
              </Label>
              <select className={sel} value={provId} onChange={(e) => setProvId(e.target.value)}>
                <option value="">Seleccione proveedor…</option>
                {(provs.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.dias_entrega != null ? ` (${p.dias_entrega}d)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                Fecha esperada de entrega
              </Label>
              <Input type="date" value={fechaEsp} onChange={(e) => setFecha(e.target.value)} />
              {prov?.dias_entrega != null && !fecha && (
                <p className="text-[11px] text-muted-foreground">
                  Calculada automáticamente ({prov.dias_entrega} días de entrega promedio)
                </p>
              )}
            </div>

            {prov && (
              <div className="rounded-lg border border-border/70 bg-background/80 p-3 sm:col-span-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{prov.nombre}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {prov.forma_pago && <span>Pago: {prov.forma_pago}</span>}
                    {prov.ciudad && <span>· {prov.ciudad}</span>}
                  </div>
                </div>
                <ContactoProveedor p={prov} compacto />
              </div>
            )}
          </div>

          {/* Líneas de artículos */}
          <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Artículos solicitados ({lineas.length})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setLineas([...lineas, { tipo_id: "", cantidad: "1", precio: "" }])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Agregar línea
              </Button>
            </div>

            <div className="space-y-2">
              {lineas.map((l, i) => {
                const cantNum = Math.max(1, Number(l.cantidad) || 1);
                const sub = (Number(l.cantidad) || 0) * (Number(l.precio) || 0);
                return (
                  <div
                    key={i}
                    className="grid gap-2 rounded-lg border border-border/70 bg-background/90 p-2.5 sm:grid-cols-[1fr_auto_140px_auto] sm:items-center"
                  >
                    <select
                      className={sel}
                      value={l.tipo_id}
                      onChange={(e) => upd(i, { tipo_id: e.target.value })}
                    >
                      <option value="">Artículo…</option>
                      {cat.byTipo("tipo_equipo").map((c) => {
                        const vin = vinculosProv.data?.find((x) => x.tipo_id === c.id);
                        return (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                            {vin ? " ★" : ""}
                          </option>
                        );
                      })}
                    </select>

                    {/* Stepper interactivo de cantidad */}
                    <div className="flex items-center rounded-lg border border-input bg-background">
                      <button
                        type="button"
                        onClick={() => upd(i, { cantidad: String(Math.max(1, cantNum - 1)) })}
                        className="flex h-9 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Disminuir cantidad"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <Input
                        type="number"
                        min={1}
                        aria-label="Cantidad"
                        className="h-9 w-14 border-0 bg-transparent px-1 text-center font-mono text-xs focus-visible:ring-0"
                        value={l.cantidad}
                        onChange={(e) => upd(i, { cantidad: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => upd(i, { cantidad: String(cantNum + 1) })}
                        className="flex h-9 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Aumentar cantidad"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>

                    <div className="space-y-0.5">
                      <Input
                        type="number"
                        min={0}
                        placeholder="Precio unit."
                        aria-label="Precio unitario estimado"
                        className="h-9 font-mono text-xs"
                        value={l.precio}
                        onChange={(e) => upd(i, { precio: e.target.value })}
                      />
                      {sub > 0 && (
                        <div className="text-right font-mono text-[10px] text-muted-foreground">Sub: {cop(sub)}</div>
                      )}
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      disabled={lineas.length === 1}
                      onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                      aria-label="Quitar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
              <span className="text-muted-foreground">
                Total unidades: <b className="font-mono text-foreground">{totalUnidades}</b>
              </span>
              <span className="text-muted-foreground">
                Total estimado:{" "}
                <b className="font-mono text-sm font-semibold text-foreground">{total > 0 ? cop(total) : "$0"}</b>
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notas / Referencia de cotización</Label>
            <Textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Cotización #..., condiciones de entrega, número de orden de compra…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="outline" disabled={guardando} onClick={() => guardar("borrador")}>
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Guardar borrador
          </Button>
          <Button disabled={guardando} onClick={() => guardar("pedido")}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Registrar pedido realizado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Linea = { id: string; tipo_id: string; cantidad: number; recibida: number; precio_estimado: number | null };

/** Ficha del pedido con acciones: marcar realizado, recibir por línea, cancelar. */
export function DetallePedido({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");
  const q = useQuery({
    queryKey: ["pedido", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select("*, proveedor:proveedores(*), lineas:pedido_lineas(*)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as typeof data & { proveedor: Prov; lineas: Linea[] };
    },
  });
  const [recibir, setRecibir] = useState<Linea | null>(null);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const p = q.data;
  const abierto = p && (p.estado === "pedido" || p.estado === "parcial");

  async function marcarPedido() {
    if (!puedeReabastecer) return toast.error("No tiene permiso para gestionar pedidos.");
    const { error } = await supabase
      .from("pedidos_compra")
      .update({ estado: "pedido", fecha_pedido: new Date().toISOString().slice(0, 10) })
      .eq("id", id!);
    if (error) toast.error(errMsg(error));
    else {
      toast.success("Pedido marcado como realizado");
      refrescarPedidos(qc);
    }
  }
  async function confirmarCancelar() {
    if (!puedeReabastecer) return toast.error("No tiene permiso para cancelar pedidos.");
    if (!motivo.trim()) return toast.error("Indique el motivo");
    const { error } = await supabase
      .from("pedidos_compra")
      .update({ estado: "cancelado", cancelado_motivo: motivo.trim(), cerrado_at: new Date().toISOString() })
      .eq("id", id!);
    if (error) return toast.error(errMsg(error));
    toast.success("Pedido cancelado");
    setCancelar(false);
    setMotivo("");
    refrescarPedidos(qc);
  }
  async function eliminarBorrador() {
    if (!puedeReabastecer) return toast.error("No tiene permiso para eliminar pedidos.");
    const { error } = await supabase.from("pedidos_compra").delete().eq("id", id!);
    if (error) return toast.error(errMsg(error));
    toast.success("Borrador eliminado");
    refrescarPedidos(qc);
    onClose();
  }

  const total = (p?.lineas ?? []).reduce((s, l) => s + l.cantidad * (Number(l.precio_estimado) || 0), 0);
  const totalPedidas = (p?.lineas ?? []).reduce((s, l) => s + l.cantidad, 0);
  const totalRecibidas = (p?.lineas ?? []).reduce((s, l) => s + l.recibida, 0);
  const pctGlobal = totalPedidas > 0 ? Math.round((totalRecibidas / totalPedidas) * 100) : 0;

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <div className="flex items-center gap-2">
                <SheetTitle className="font-mono text-lg font-semibold">Pedido #{p?.numero ?? ""}</SheetTitle>
                {p && <EstadoPedido p={p} />}
              </div>
              {p?.proveedor && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Proveedor: <span className="font-medium text-foreground">{p.proveedor.nombre}</span>
                </p>
              )}
            </div>
            {total > 0 && (
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total estimado</div>
                <div className="font-mono text-sm font-semibold">{cop(total)}</div>
              </div>
            )}
          </div>
        </SheetHeader>

        {p && (
          <div className="mt-5 space-y-5 text-sm">
            {/* Tarjetas de fechas y progreso */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="text-[11px] text-muted-foreground">Creado</div>
                <div className="mt-0.5 text-xs font-medium">{fmtFecha(p.created_at)}</div>
                <div className="truncate text-[10px] text-muted-foreground">por {p.creado_nombre ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <div className="text-[11px] text-muted-foreground">Entrega esperada</div>
                <div className="mt-0.5 text-xs font-medium">
                  {p.fecha_esperada ? fmtFecha(p.fecha_esperada) : "Sin fecha"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Pedido: {p.fecha_pedido ? fmtFecha(p.fecha_pedido) : "En borrador"}
                </div>
              </div>
              <div className="col-span-2 rounded-xl border border-border/70 bg-muted/15 p-3 sm:col-span-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Recepción</span>
                  <span className="font-mono font-semibold text-foreground">{pctGlobal}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${pctGlobal === 100 ? "bg-success" : "bg-primary"}`}
                    style={{ width: `${pctGlobal}%` }}
                  />
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {totalRecibidas} / {totalPedidas} unidades
                </div>
              </div>
            </div>

            {p.cancelado_motivo && (
              <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <div className="font-semibold text-destructive">Pedido cancelado</div>
                  <div className="text-muted-foreground">{p.cancelado_motivo}</div>
                </div>
              </div>
            )}

            {p.notas && (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs">
                <div className="mb-1 font-medium text-muted-foreground">Notas de la orden</div>
                <p className="text-foreground">{p.notas}</p>
              </div>
            )}

            {p.proveedor && (
              <div className="rounded-xl border border-border/70 bg-card p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Contacto del proveedor
                  </span>
                  {p.proveedor.forma_pago && (
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {p.proveedor.forma_pago}
                    </span>
                  )}
                </div>
                <ContactoProveedor p={p.proveedor} compacto />
              </div>
            )}

            {/* Artículos del pedido */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Líneas del pedido ({p.lineas.length})
                </h3>
                {abierto && puedeReabastecer && (
                  <span className="text-[11px] text-muted-foreground">Haz clic en Recibir al llegar la mercancía</span>
                )}
              </div>
              <ul className="space-y-2">
                {p.lineas.map((l) => {
                  const pend = l.cantidad - l.recibida;
                  const pct = l.cantidad > 0 ? Math.round((l.recibida / l.cantidad) * 100) : 0;
                  const completo = pend <= 0;
                  return (
                    <li
                      key={l.id}
                      className={`rounded-xl border p-3.5 transition-all ${
                        completo
                          ? "border-success/30 bg-success/5"
                          : "border-border/80 bg-card hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{cat.nombre(l.tipo_id)}</span>
                            {completo ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                                <CheckCircle2 className="h-3 w-3" />
                                Completado
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                Pendientes: {pend}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              Recibidos <b className="font-mono text-foreground">{l.recibida}</b> de{" "}
                              <b className="font-mono text-foreground">{l.cantidad}</b>
                            </span>
                            {l.precio_estimado != null && (
                              <span className="font-mono">
                                · {cop(l.precio_estimado)} c/u (Sub: {cop(l.cantidad * l.precio_estimado)})
                              </span>
                            )}
                          </div>
                          <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full transition-all ${completo ? "bg-success" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {abierto && pend > 0 && puedeReabastecer && (
                          <Button size="sm" onClick={() => setRecibir(l)}>
                            <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
                            Recibir
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {puedeReabastecer && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
                <div className="flex flex-wrap gap-2">
                  {p.estado === "borrador" && (
                    <Button onClick={marcarPedido}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Marcar como pedido realizado
                    </Button>
                  )}
                  {(p.estado === "borrador" || abierto) && (
                    <Button variant="outline" onClick={() => setCancelar(true)}>
                      Cancelar pedido
                    </Button>
                  )}
                </div>
                {p.estado === "borrador" && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={eliminarBorrador}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Eliminar borrador
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {recibir && p && (
          <RecibirLinea linea={recibir} nombre={cat.nombre(recibir.tipo_id)} onClose={() => setRecibir(null)} />
        )}

        <Dialog open={cancelar} onOpenChange={setCancelar}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar pedido #{p?.numero}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Indica el motivo por el cual se cancela esta orden de compra. Quedará registrado en el historial.
            </p>
            <Textarea
              placeholder="Motivo de la cancelación *"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelar(false)}>
                Volver
              </Button>
              <Button variant="destructive" onClick={confirmarCancelar}>
                Confirmar cancelación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

function RecibirLinea({ linea, nombre, onClose }: { linea: Linea; nombre: string; onClose: () => void }) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const pend = linea.cantidad - linea.recibida;
  const [f, setF] = useState({
    marca: "",
    sede: "",
    modelo: "",
    valor: linea.precio_estimado != null ? String(linea.precio_estimado) : "",
    factura: "",
    garantia: "",
    seriales: "",
    sinSerial: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [extra, setExtra] = useState<Record<string, { af: string; nombre: string }>>({});
  const seriales = [...new Set(f.seriales.split(/[\n,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const sinSerial = Math.max(0, Number(f.sinSerial) || 0);
  const total = seriales.length + sinSerial;

  async function guardar() {
    if (!total) return toast.error("Escriba seriales o una cantidad sin serial");
    if (total > pend) return toast.error(`Solo faltan ${pend} unidad(es)`);
    const valor = f.valor ? Number(f.valor) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return toast.error("Valor inválido");
    setGuardando(true);
    const { data, error } = await supabase.rpc("recibir_pedido_linea", {
      p_linea: linea.id,
      p_seriales: seriales,
      p_sin_serial: sinSerial,
      p_marca: (f.marca || null) as unknown as string,
      p_sede: (f.sede || null) as unknown as string,
      p_modelo: f.modelo,
      p_valor: valor as unknown as number,
      p_factura: f.factura,
      p_garantia: (f.garantia || null) as unknown as string,
      p_activos: seriales.map((x) => extra[x]?.af ?? ""),
      p_nombres: seriales.map((x) => extra[x]?.nombre ?? ""),
    });
    setGuardando(false);
    if (error)
      return toast.error(
        error.code === "23505" ? "Alguno de los seriales ya existe en el inventario." : errMsg(error),
      );
    toast.success(`${data} equipo(s) ingresados como disponibles`);
    refrescarPedidos(qc);
    onClose();
  }
  const opc = (t: string) =>
    cat.byTipo(t).map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-border/80 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <PackageCheck className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight">Recibir {nombre}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Pendientes por recibir en esta línea: <b className="font-mono text-foreground">{pend}</b> unidad(es)
                </p>
              </div>
            </div>
            <span
              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium ${
                total > pend
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : total > 0
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {total} / {pend}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/15 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Marca</Label>
              <select className={sel} value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })}>
                <option value="">—</option>
                {opc("marca")}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sede de ingreso</Label>
              <select className={sel} value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })}>
                <option value="">—</option>
                {opc("sede")}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Modelo</Label>
              <Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Valor unitario real (COP)</Label>
              <Input
                type="number"
                min={0}
                className="font-mono"
                value={f.valor}
                onChange={(e) => setF({ ...f, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">N.º de factura</Label>
              <Input value={f.factura} onChange={(e) => setF({ ...f, factura: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Garantía hasta</Label>
              <Input type="date" value={f.garantia} onChange={(e) => setF({ ...f, garantia: e.target.value })} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Barcode className="h-3.5 w-3.5 text-primary" />
                Seriales recibidos (uno por línea)
              </Label>
              {seriales.length > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {seriales.length} serial(es) detectado(s)
                </span>
              )}
            </div>
            <Textarea
              rows={4}
              className="font-mono text-xs"
              placeholder={"Pegue o escanee los números de serie aquí…"}
              value={f.seriales}
              onChange={(e) => setF({ ...f, seriales: e.target.value })}
            />

            {seriales.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="grid grid-cols-3 gap-2 border-b border-border bg-muted/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Serial</span>
                  <span>Activo fijo (opcional)</span>
                  <span>Nombre de equipo</span>
                </div>
                <div className="max-h-44 divide-y divide-border/60 overflow-y-auto">
                  {seriales.map((x) => (
                    <div key={x} className="grid grid-cols-3 items-center gap-2 px-3 py-1.5">
                      <span className="truncate font-mono text-xs font-medium">{x}</span>
                      <Input
                        className="h-7 text-xs"
                        placeholder="AF-000"
                        value={extra[x]?.af ?? ""}
                        onChange={(e) =>
                          setExtra({ ...extra, [x]: { nombre: extra[x]?.nombre ?? "", af: e.target.value } })
                        }
                      />
                      <Input
                        className="h-7 text-xs"
                        placeholder="PC-FIN-01"
                        value={extra[x]?.nombre ?? ""}
                        onChange={(e) =>
                          setExtra({ ...extra, [x]: { af: extra[x]?.af ?? "", nombre: e.target.value } })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Cantidad sin serial (accesorios)</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-24 font-mono"
                  value={f.sinSerial}
                  onChange={(e) => setF({ ...f, sinSerial: e.target.value })}
                />
              </div>
              <p className="text-xs">
                Se ingresarán <b className="font-mono">{total}</b> equipo(s) como Disponibles
                {total > pend && (
                  <span className="ml-1 font-medium text-destructive">— supera lo pendiente ({pend})</span>
                )}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={guardando || total > pend} onClick={guardar}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            {guardando ? "Procesando…" : "Confirmar recepción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de pedidos de un proveedor con cumplimiento. */
export function PedidosProveedor({ proveedorId }: { proveedorId: string }) {
  const q = useQuery({
    queryKey: ["pedidos", "proveedor", proveedorId],
    queryFn: async () =>
      (
        await supabase
          .from("pedidos_compra")
          .select("id, numero, estado, fecha_esperada, cerrado_at, created_at, lineas:pedido_lineas(cantidad, precio_estimado)")
          .eq("proveedor_id", proveedorId)
          .order("created_at", { ascending: false })
          .limit(50)
      ).data ?? [],
  });
  const [ver, setVer] = useState<string | null>(null);
  const lista = q.data ?? [];
  const recibidos = lista.filter((p) => p.estado === "recibido");
  const aTiempo = recibidos.filter(
    (p) => !p.fecha_esperada || (p.cerrado_at ?? "").slice(0, 10) <= p.fecha_esperada,
  ).length;
  const atrasados = lista.filter(pedidoAtrasado).length;
  const totalComprado = recibidos.reduce(
    (s, p) =>
      s +
      (p.lineas as { cantidad: number; precio_estimado: number | null }[]).reduce(
        (a, l) => a + l.cantidad * (Number(l.precio_estimado) || 0),
        0,
      ),
    0,
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Historial de pedidos ({lista.length})
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
            <CheckCircle2 className="h-3 w-3 text-success" />
            {recibidos.length} recibidos ({aTiempo} a tiempo)
          </span>
          {atrasados > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {atrasados} atrasado(s)
            </span>
          )}
          {totalComprado > 0 && (
            <span className="font-mono font-medium text-foreground">{cop(totalComprado)}</span>
          )}
        </div>
      </div>

      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card">
        {lista.map((p) => {
          const monto = (p.lineas as { cantidad: number; precio_estimado: number | null }[]).reduce(
            (a, l) => a + l.cantidad * (Number(l.precio_estimado) || 0),
            0,
          );
          return (
            <li key={p.id}>
              <button
                className="group flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-muted/50"
                onClick={() => setVer(p.id)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono font-semibold text-primary">#{p.numero}</span>
                  <span className="text-muted-foreground">{fmtFecha(p.created_at)}</span>
                  {p.fecha_esperada && (
                    <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:inline-flex">
                      <Clock className="h-3 w-3" />
                      esp. {fmtFecha(p.fecha_esperada)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  {monto > 0 && <span className="font-mono text-xs text-muted-foreground">{cop(monto)}</span>}
                  <EstadoPedido p={p} />
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </button>
            </li>
          );
        })}
        {!lista.length && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">
            Aún no se han registrado pedidos de compra con este proveedor.
          </li>
        )}
      </ul>
      <DetallePedido id={ver} onClose={() => setVer(null)} />
    </div>
  );
}
