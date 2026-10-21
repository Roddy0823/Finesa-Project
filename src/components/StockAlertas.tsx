import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { AlertTriangle, Bell, Clock, ShoppingCart, Star, Trash2 } from "lucide-react";

export type StockBajo = { tipo_id: string; tipo: string; disponibles: number; stock_minimo: number };

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

const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

/** Campana con contador; abre el panel de proveedores del artículo elegido. */
export function CampanaAlertas() {
  const { data: me } = useMe();
  const q = useStockBajo();
  const [tipo, setTipo] = useState<string | null>(null);
  const n = q.data?.length ?? 0;
  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button className="relative rounded p-1.5 hover:bg-sidebar-accent" aria-label={`Alertas de stock: ${n}`}>
            <Bell className="h-4 w-4" />
            {n > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{n}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">Stock bajo</div>
          {n === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">Sin alertas activas.</p> : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {q.data!.map((a) => (
                <li key={a.tipo_id}>
                  {puedeReabastecer ? (
                    <button className="flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-muted" onClick={() => setTipo(a.tipo_id)}>
                      <span>{a.tipo}</span><span className="text-destructive">{a.disponibles} / mín. {a.stock_minimo}</span>
                    </button>
                  ) : (
                    <div className="flex w-full justify-between px-4 py-2 text-left text-sm">
                      <span>{a.tipo}</span><span className="text-destructive">{a.disponibles} / mín. {a.stock_minimo}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link to="/equipos" className="block border-t border-border px-4 py-2 text-xs text-primary hover:underline">Ir al inventario</Link>
        </PopoverContent>
      </Popover>
      {puedeReabastecer && <ProveedoresSheet tipoId={tipo} onClose={() => setTipo(null)} />}
    </>
  );
}

/** Aviso destacado para Panel e Inventario. */
export function BannerStock() {
  const { data: me } = useMe();
  const q = useStockBajo();
  const [config, setConfig] = useState(false);
  const [tipo, setTipo] = useState<string | null>(null);
  if (!me?.isStaff) return null;
  const puedeReabastecer = me.can("reabastecimiento_gestionar");
  const lista = q.data ?? [];
  return (
    <>
      {lista.length > 0 ? (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <div className="font-medium">{lista.length} artículo(s) con stock bajo</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {lista.map((a) => (
                    <button key={a.tipo_id} onClick={() => puedeReabastecer && setTipo(a.tipo_id)} className="rounded-full border border-destructive/40 bg-card px-2.5 py-0.5 text-xs hover:bg-muted">
                      {a.tipo}: {a.disponibles} disp. (mín. {a.stock_minimo})
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {puedeReabastecer && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfig(true)}>Configurar alertas</Button>
                <Button size="sm" onClick={() => setTipo(lista[0]!.tipo_id)}>Ver proveedores / Reabastecer</Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        puedeReabastecer && <div className="mb-4 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setConfig(true)}><Bell className="mr-1 h-4 w-4" />Configurar alertas de stock</Button></div>
      )}
      <ConfigAlertas open={config} onClose={() => setConfig(false)} onProveedores={(t) => { setConfig(false); setTipo(t); }} />
      <ProveedoresSheet tipoId={tipo} onClose={() => setTipo(null)} />
    </>
  );
}

function ConfigAlertas({ open, onClose, onProveedores }: { open: boolean; onClose: () => void; onProveedores: (tipo: string) => void }) {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const [nuevo, setNuevo] = useState({ tipo_id: "", min: "3" });
  const q = useQuery({
    queryKey: ["alertas_config"], enabled: open,
    queryFn: async () => (await supabase.from("alertas_stock_config").select("*").order("created_at")).data ?? [],
  });
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["alertas_config"] }); qc.invalidateQueries({ queryKey: ["equipos", "stock_bajo"] }); };
  async function agregar() {
    if (!me?.can("reabastecimiento_gestionar")) return toast.error("No tiene permiso para configurar alertas de stock.");
    const min = Number(nuevo.min);
    if (!nuevo.tipo_id || !Number.isInteger(min) || min < 0) return toast.error("Seleccione el artículo y un mínimo válido");
    const { error } = await supabase.from("alertas_stock_config").insert({ tipo_id: nuevo.tipo_id, stock_minimo: min });
    if (error) return toast.error(error.code === "23505" ? "Ese artículo ya tiene una alerta." : errMsg(error));
    setNuevo({ tipo_id: "", min: "3" }); refrescar(); toast.success("Alerta creada");
  }
  async function actualizar(id: string, v: { stock_minimo?: number; activa?: boolean }) {
    if (!me?.can("reabastecimiento_gestionar")) return toast.error("No tiene permiso para configurar alertas de stock.");
    const { error } = await supabase.from("alertas_stock_config").update(v).eq("id", id);
    if (error) toast.error(errMsg(error)); else refrescar();
  }
  async function eliminar(id: string) {
    if (!me?.can("reabastecimiento_gestionar")) return toast.error("No tiene permiso para configurar alertas de stock.");
    const { error } = await supabase.from("alertas_stock_config").delete().eq("id", id);
    if (error) toast.error(errMsg(error)); else refrescar();
  }
  const usados = new Set((q.data ?? []).map((a) => a.tipo_id));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Alertas de stock</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">La alerta se activa cuando los equipos disponibles de ese tipo son iguales o menores al mínimo.</p>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5"><Label>Artículo</Label>
            <select className={sel} value={nuevo.tipo_id} onChange={(e) => setNuevo({ ...nuevo, tipo_id: e.target.value })}>
              <option value="">Seleccione…</option>
              {cat.byTipo("tipo_equipo").filter((c) => !usados.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className="w-24 space-y-1.5"><Label>Mínimo</Label><Input type="number" min={0} value={nuevo.min} onChange={(e) => setNuevo({ ...nuevo, min: e.target.value })} /></div>
          <Button onClick={agregar}>Agregar</Button>
        </div>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {(q.data ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <button className="flex-1 text-left text-primary hover:underline" onClick={() => onProveedores(a.tipo_id)}>{cat.nombre(a.tipo_id)}</button>
              <Input type="number" min={0} className="h-8 w-20" defaultValue={a.stock_minimo} aria-label="Mínimo"
                onBlur={(e) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v !== a.stock_minimo) actualizar(a.id, { stock_minimo: v }); }} />
              <Switch checked={a.activa} onCheckedChange={(c) => actualizar(a.id, { activa: c })} aria-label="Activa" />
              <Button size="icon" variant="ghost" onClick={() => eliminar(a.id)} aria-label="Eliminar alerta"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </li>
          ))}
          {q.data && !q.data.length && <li className="px-3 py-4 text-sm text-muted-foreground">Aún no hay alertas configuradas.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

type ProvRow = Prov;
type Vinculo = { id: string; proveedor_id: string; es_principal: boolean; precio_referencia: number | null; ultimo_precio: number | null; ultima_compra: string | null; tiempo_entrega_dias: number | null; proveedor: ProvRow | null };

export function ProveedoresSheet({ tipoId, onClose }: { tipoId: string | null; onClose: () => void }) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const nombre = tipoId ? cat.nombre(tipoId) : "";
  const q = useQuery({
    queryKey: ["proveedores_articulo", tipoId], enabled: !!tipoId,
    queryFn: async () => {
      const [vin, todos, disp, cfg, sol] = await Promise.all([
        supabase.from("articulo_proveedores").select("*, proveedor:proveedores(*)").eq("tipo_id", tipoId!),
        supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
        supabase.from("equipos").select("id", { count: "exact", head: true }).eq("tipo_id", tipoId!).eq("estado", "disponible"),
        supabase.from("alertas_stock_config").select("stock_minimo, activa").eq("tipo_id", tipoId!).maybeSingle(),
        supabase.from("pedido_lineas").select("cantidad, recibida, pedido:pedidos_compra!inner(id, numero, estado, fecha_esperada, created_at, proveedor:proveedores(nombre))").eq("tipo_id", tipoId!).in("pedido.estado", ["borrador", "pedido", "parcial"]),
      ]);
      const vinculos = ((vin.data ?? []) as unknown as Vinculo[]).filter((v) => v.proveedor)
        .sort((a, b) => Number(b.es_principal) - Number(a.es_principal) || Number(b.proveedor!.activo) - Number(a.proveedor!.activo));
      return { vinculos, todos: todos.data ?? [], disponibles: disp.count ?? 0, minimo: cfg.data?.stock_minimo ?? null, solicitudes: sol.data ?? [] };
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
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["proveedores_articulo"] }); qc.invalidateQueries({ queryKey: ["proveedor"] }); };

  const puedeReabastecer = !!me?.can("reabastecimiento_gestionar");
  const puedeProveedores = !!me?.can("proveedores_editar");

  async function vincular(proveedor_id: string) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    if (!tipoId || !proveedor_id) return;
    const { error } = await supabase.from("articulo_proveedores").insert({ tipo_id: tipoId, proveedor_id, es_principal: !d?.vinculos.length });
    if (error) return toast.error(error.code === "23505" ? "Ese proveedor ya está vinculado." : errMsg(error));
    setExistente(""); toast.success("Proveedor vinculado"); refrescar();
  }
  async function marcarPrincipal(v: Vinculo) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    if (v.es_principal) return;
    await supabase.from("articulo_proveedores").update({ es_principal: false }).eq("tipo_id", tipoId!).eq("es_principal", true);
    const { error } = await supabase.from("articulo_proveedores").update({ es_principal: true }).eq("id", v.id);
    if (error) toast.error(errMsg(error)); else refrescar();
  }
  async function desvincular(id: string) {
    if (!puedeProveedores) return toast.error("No tiene permiso para gestionar proveedores.");
    const { error } = await supabase.from("articulo_proveedores").delete().eq("id", id);
    if (error) toast.error(errMsg(error)); else refrescar();
  }

  const vinculados = new Set((d?.vinculos ?? []).map((v) => v.proveedor_id));
  return (
    <Sheet open={!!tipoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader><SheetTitle>Reabastecer · {nombre}</SheetTitle></SheetHeader>
        <div className={`mt-4 rounded-md border p-3 text-sm ${d && d.minimo !== null && d.disponibles <= d.minimo ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40"}`}>
          {d ? <><b>{nombre}:</b> {d.disponibles} disponible(s) — {d.minimo !== null ? `mínimo ${d.minimo}` : "sin alerta configurada"}</> : "Cargando…"}
          {puedeReabastecer && <div className="mt-2 flex items-center gap-2"><Label className="text-xs">Cantidad requerida</Label><Input type="number" min={1} className="h-8 w-24" placeholder={String(sugerida)} value={cantidad} onChange={(e) => setCantidad(e.target.value)} /></div>}
        </div>

        {(d?.solicitudes ?? []).map((l, i) => {
          const p = l.pedido as unknown as { id: string; numero: number; estado: string; fecha_esperada: string | null; created_at: string; proveedor: { nombre: string } | null };
          return (
            <button key={i} onClick={() => puedeReabastecer && setVerPedido(p.id)} className="mt-3 block w-full rounded-md border border-warning/50 bg-warning/10 p-3 text-left text-sm hover:bg-warning/20">
              <div className="flex items-center justify-between gap-2"><span><Clock className="mr-1 inline h-3.5 w-3.5" />Pedido #{p.numero} a <b>{p.proveedor?.nombre ?? "—"}</b> · {l.recibida}/{l.cantidad} recibidos</span><EstadoPedido p={p} /></div>
              <div className="mt-1 text-xs text-muted-foreground">Ya hay un pedido en curso para este artículo{p.fecha_esperada ? ` · entrega esperada ${fmtFecha(p.fecha_esperada)}` : ""}</div>
            </button>
          );
        })}

        <h3 className="mt-5 text-sm font-medium">Proveedores del artículo</h3>
        <ul className="mt-2 space-y-2">
          {(d?.vinculos ?? []).map((v) => {
            const p = v.proveedor!;
            return (
              <li key={v.id} className={`rounded-md border border-border bg-card p-3 text-sm ${p.activo ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1 font-medium">
                      {puedeProveedores && <button onClick={() => marcarPrincipal(v)} aria-label="Marcar como principal" title="Proveedor principal"><Star className={`h-4 w-4 ${v.es_principal ? "fill-warning text-warning" : "text-muted-foreground"}`} /></button>}
                      {p.nombre}{!p.activo && <span className="text-xs text-muted-foreground">(inactivo)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{[p.contacto_nombre && `Asesor: ${p.contacto_nombre}`, p.dias_entrega != null ? `${p.dias_entrega} días` : null, p.forma_pago].filter(Boolean).join(" · ")}</div>
                    <div className="text-xs text-muted-foreground">{[v.precio_referencia != null ? `Ref. ${cop(v.precio_referencia)}` : null, v.ultimo_precio != null ? `Última compra ${cop(v.ultimo_precio)}${v.ultima_compra ? ` (${fmtFecha(v.ultima_compra)})` : ""}` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  {puedeProveedores && <Button size="icon" variant="ghost" onClick={() => desvincular(v.id)} aria-label="Desvincular"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
                <div className="mt-2"><ContactoProveedor p={p} compacto /></div>
                {puedeReabastecer && <div className="mt-2"><Button size="sm" onClick={() => setPedir(p.id)}><ShoppingCart className="mr-1 h-3.5 w-3.5" />Crear pedido</Button></div>}
              </li>
            );
          })}
          {d && !d.vinculos.length && <li className="text-sm text-muted-foreground">Aún no hay proveedores para este artículo.</li>}
        </ul>

        {puedeProveedores && (
          <div className="mt-6 space-y-2 rounded-md border border-border p-3">
            <h3 className="text-sm font-medium">Agregar proveedor al artículo</h3>
            <div className="flex gap-2">
              <select className={sel} value={existente} onChange={(e) => setExistente(e.target.value)}>
                <option value="">Proveedor existente…</option>
                {(d?.todos ?? []).filter((p) => !vinculados.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <Button disabled={!existente} onClick={() => vincular(existente)}>Vincular</Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setNuevo(true)}>Registrar proveedor nuevo</Button>
          </div>
        )}
        {nuevo && puedeProveedores && <FormProveedor p={null} onClose={() => setNuevo(false)} onSaved={(id) => vincular(id)} />}
        {pedir && tipoId && puedeReabastecer && <NuevoPedido inicial={{ proveedor_id: pedir, lineas: [{ tipo_id: tipoId, cantidad: cant }] }} onClose={() => setPedir(null)} onCreado={(id) => setVerPedido(id)} />}
        {puedeReabastecer && <DetallePedido id={verPedido} onClose={() => setVerPedido(null)} />}
      </SheetContent>
    </Sheet>
  );
}
