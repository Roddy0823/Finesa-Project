import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { PackageCheck, Plus, Trash2 } from "lucide-react";

const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
const INVALIDAR = ["pedidos", "pedido", "equipos", "proveedores", "proveedor", "proveedores_articulo"];
export const refrescarPedidos = (qc: ReturnType<typeof useQueryClient>) => INVALIDAR.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

export function EstadoPedido({ p }: { p: { estado: string; fecha_esperada: string | null } }) {
  if (pedidoAtrasado(p)) return <Badge variant="destructive">Atrasado</Badge>;
  const v = p.estado === "recibido" ? "default" : p.estado === "cancelado" ? "outline" : "secondary";
  return <Badge variant={v}>{ESTADOS_PEDIDO[p.estado] ?? p.estado}</Badge>;
}

type LineaForm = { tipo_id: string; cantidad: string; precio: string };

/** Crear un pedido nuevo (borrador o realizado). */
export function NuevoPedido({ inicial, onClose, onCreado }: { inicial?: { proveedor_id?: string | null; lineas?: { tipo_id: string; cantidad: number }[] }; onClose: () => void; onCreado?: (id: string) => void }) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const provs = useQuery({ queryKey: ["proveedores_lista_full"], queryFn: async () => ((await supabase.from("proveedores").select("*").eq("activo", true).order("nombre")).data ?? []) as Prov[] });
  const [provId, setProvId] = useState(inicial?.proveedor_id ?? "");
  const prov = provs.data?.find((p) => p.id === provId);
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>(inicial?.lineas?.length ? inicial.lineas.map((l) => ({ tipo_id: l.tipo_id, cantidad: String(l.cantidad), precio: "" })) : [{ tipo_id: "", cantidad: "1", precio: "" }]);
  const [guardando, setGuardando] = useState(false);
  const fechaEsp = fecha || (prov?.dias_entrega != null ? sumarDias(prov.dias_entrega) : "");
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio) || 0), 0);
  const upd = (i: number, v: Partial<LineaForm>) => setLineas(lineas.map((l, j) => (j === i ? { ...l, ...v } : l)));

  async function guardar(estado: "borrador" | "pedido") {
    if (!me?.can("reabastecimiento_gestionar")) return toast.error("No tiene permiso para crear pedidos de compra.");
    if (!provId) return toast.error("Seleccione el proveedor");
    const validas = lineas.filter((l) => l.tipo_id);
    if (!validas.length) return toast.error("Agregue al menos un artículo");
    if (validas.some((l) => !Number.isInteger(Number(l.cantidad)) || Number(l.cantidad) < 1)) return toast.error("Cantidades inválidas");
    if (new Set(validas.map((l) => l.tipo_id)).size !== validas.length) return toast.error("Hay artículos repetidos");
    setGuardando(true);
    const { data, error } = await supabase.from("pedidos_compra").insert({
      proveedor_id: provId, estado, fecha_esperada: fechaEsp || null, notas: notas.trim() || null,
      fecha_pedido: estado === "pedido" ? new Date().toISOString().slice(0, 10) : null, creado_nombre: me?.nombre ?? null,
    }).select("id").single();
    if (error || !data) { setGuardando(false); return toast.error(errMsg(error)); }
    const { error: e2 } = await supabase.from("pedido_lineas").insert(validas.map((l) => ({ pedido_id: data.id, tipo_id: l.tipo_id, cantidad: Number(l.cantidad), precio_estimado: l.precio ? Number(l.precio) : null })));
    setGuardando(false);
    if (e2) return toast.error(errMsg(e2));
    toast.success(estado === "pedido" ? "Pedido registrado" : "Borrador guardado");
    refrescarPedidos(qc); onCreado?.(data.id); onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo pedido de compra</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Proveedor *</Label>
            <select className={sel} value={provId} onChange={(e) => setProvId(e.target.value)}><option value="">—</option>{(provs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
          </div>
          <div className="space-y-1"><Label>Fecha esperada de entrega</Label><Input type="date" value={fechaEsp} onChange={(e) => setFecha(e.target.value)} />
            {prov?.dias_entrega != null && !fecha && <p className="text-[11px] text-muted-foreground">Calculada con {prov.dias_entrega} días de entrega del proveedor</p>}
          </div>
        </div>
        {prov && <div className="rounded-md border border-border bg-muted/40 p-2"><div className="mb-1 text-xs font-medium">Datos de contacto de {prov.nombre}</div><ContactoProveedor p={prov} compacto /></div>}
        <div className="space-y-2">
          <Label>Artículos</Label>
          {lineas.map((l, i) => (
            <div key={i} className="flex gap-2">
              <select className={sel} value={l.tipo_id} onChange={(e) => upd(i, { tipo_id: e.target.value })}><option value="">Artículo…</option>{cat.byTipo("tipo_equipo").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
              <Input type="number" min={1} className="w-24" aria-label="Cantidad" value={l.cantidad} onChange={(e) => upd(i, { cantidad: e.target.value })} />
              <Input type="number" min={0} className="w-36" placeholder="Precio unit." aria-label="Precio unitario estimado" value={l.precio} onChange={(e) => upd(i, { precio: e.target.value })} />
              <Button size="icon" variant="ghost" disabled={lineas.length === 1} onClick={() => setLineas(lineas.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setLineas([...lineas, { tipo_id: "", cantidad: "1", precio: "" }])}><Plus className="mr-1 h-3.5 w-3.5" />Agregar artículo</Button>
          {total > 0 && <p className="text-right text-sm">Total estimado: <b>{cop(total)}</b></p>}
        </div>
        <div className="space-y-1"><Label>Notas</Label><Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Cotización, condiciones, número de orden…" /></div>
        <DialogFooter>
          <Button variant="outline" disabled={guardando} onClick={() => guardar("borrador")}>Guardar borrador</Button>
          <Button disabled={guardando} onClick={() => guardar("pedido")}>Registrar pedido realizado</Button>
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
    queryKey: ["pedido", id], enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos_compra").select("*, proveedor:proveedores(*), lineas:pedido_lineas(*)").eq("id", id!).single();
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
    const { error } = await supabase.from("pedidos_compra").update({ estado: "pedido", fecha_pedido: new Date().toISOString().slice(0, 10) }).eq("id", id!);
    if (error) toast.error(errMsg(error)); else { toast.success("Pedido marcado como realizado"); refrescarPedidos(qc); }
  }
  async function confirmarCancelar() {
    if (!puedeReabastecer) return toast.error("No tiene permiso para cancelar pedidos.");
    if (!motivo.trim()) return toast.error("Indique el motivo");
    const { error } = await supabase.from("pedidos_compra").update({ estado: "cancelado", cancelado_motivo: motivo.trim(), cerrado_at: new Date().toISOString() }).eq("id", id!);
    if (error) return toast.error(errMsg(error));
    toast.success("Pedido cancelado"); setCancelar(false); setMotivo(""); refrescarPedidos(qc);
  }
  async function eliminarBorrador() {
    if (!puedeReabastecer) return toast.error("No tiene permiso para eliminar pedidos.");
    const { error } = await supabase.from("pedidos_compra").delete().eq("id", id!);
    if (error) return toast.error(errMsg(error));
    toast.success("Borrador eliminado"); refrescarPedidos(qc); onClose();
  }
  const total = (p?.lineas ?? []).reduce((s, l) => s + l.cantidad * (Number(l.precio_estimado) || 0), 0);

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle>Pedido #{p?.numero ?? ""}</SheetTitle></SheetHeader>
        {p && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><EstadoPedido p={p} /><span className="font-medium">{p.proveedor?.nombre}</span></div>
            <dl className="grid grid-cols-2 gap-1 text-xs">
              <dt className="text-muted-foreground">Creado</dt><dd>{fmtFecha(p.created_at, true)} por {p.creado_nombre ?? "—"}</dd>
              <dt className="text-muted-foreground">Fecha de pedido</dt><dd>{p.fecha_pedido ? fmtFecha(p.fecha_pedido) : "—"}</dd>
              <dt className="text-muted-foreground">Entrega esperada</dt><dd>{p.fecha_esperada ? fmtFecha(p.fecha_esperada) : "—"}</dd>
              {p.cerrado_at && <><dt className="text-muted-foreground">Cerrado</dt><dd>{fmtFecha(p.cerrado_at, true)}</dd></>}
              {p.cancelado_motivo && <><dt className="text-muted-foreground">Motivo cancelación</dt><dd>{p.cancelado_motivo}</dd></>}
            </dl>
            {p.notas && <p className="rounded bg-muted/40 p-2 text-xs">{p.notas}</p>}
            {p.proveedor && <div className="rounded-md border border-border p-2"><div className="mb-1 text-xs font-medium">Datos de contacto</div><ContactoProveedor p={p.proveedor} compacto /></div>}
            <div>
              <h3 className="mb-2 font-medium">Artículos</h3>
              <ul className="space-y-2">
                {p.lineas.map((l) => {
                  const pend = l.cantidad - l.recibida;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                      <div>
                        <div className="font-medium">{cat.nombre(l.tipo_id)}</div>
                        <div className="text-xs text-muted-foreground">Recibidos {l.recibida} de {l.cantidad}{l.precio_estimado != null ? ` · ${cop(l.precio_estimado)} c/u` : ""}</div>
                        <div className="mt-1 h-1.5 w-40 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${(l.recibida / l.cantidad) * 100}%` }} /></div>
                      </div>
                      {abierto && pend > 0 && puedeReabastecer && <Button size="sm" onClick={() => setRecibir(l)}><PackageCheck className="mr-1 h-3.5 w-3.5" />Recibir</Button>}
                    </li>
                  );
                })}
              </ul>
              {total > 0 && <p className="mt-2 text-right">Total estimado: <b>{cop(total)}</b></p>}
            </div>
            {puedeReabastecer && (
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {p.estado === "borrador" && <Button onClick={marcarPedido}>Marcar como pedido realizado</Button>}
                {p.estado === "borrador" && <Button variant="ghost" onClick={eliminarBorrador}>Eliminar borrador</Button>}
                {(p.estado === "borrador" || abierto) && <Button variant="outline" onClick={() => setCancelar(true)}>Cancelar pedido</Button>}
              </div>
            )}
          </div>
        )}
        {recibir && p && <RecibirLinea linea={recibir} nombre={cat.nombre(recibir.tipo_id)} onClose={() => setRecibir(null)} />}
        <Dialog open={cancelar} onOpenChange={setCancelar}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cancelar pedido</DialogTitle></DialogHeader>
            <Textarea placeholder="Motivo de la cancelación *" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <DialogFooter><Button variant="destructive" onClick={confirmarCancelar}>Cancelar pedido</Button></DialogFooter>
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
  const [f, setF] = useState({ marca: "", sede: "", modelo: "", valor: linea.precio_estimado != null ? String(linea.precio_estimado) : "", factura: "", garantia: "", seriales: "", sinSerial: "" });
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
      p_linea: linea.id, p_seriales: seriales, p_sin_serial: sinSerial, p_marca: f.marca || null as unknown as string, p_sede: f.sede || null as unknown as string,
      p_modelo: f.modelo, p_valor: valor as unknown as number, p_factura: f.factura, p_garantia: (f.garantia || null) as unknown as string,
      p_activos: seriales.map((x) => extra[x]?.af ?? ""), p_nombres: seriales.map((x) => extra[x]?.nombre ?? ""),
    });
    setGuardando(false);
    if (error) return toast.error(error.code === "23505" ? "Alguno de los seriales ya existe en el inventario." : errMsg(error));
    toast.success(`${data} equipo(s) ingresados como disponibles`);
    refrescarPedidos(qc); onClose();
  }
  const opc = (t: string) => cat.byTipo(t).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Recibir {nombre} · pendientes {pend}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Marca</Label><select className={sel} value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })}><option value="">—</option>{opc("marca")}</select></div>
          <div className="space-y-1"><Label>Sede</Label><select className={sel} value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })}><option value="">—</option>{opc("sede")}</select></div>
          <div className="space-y-1"><Label>Modelo</Label><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></div>
          <div className="space-y-1"><Label>Valor unitario real</Label><Input type="number" min={0} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
          <div className="space-y-1"><Label>N.º de factura</Label><Input value={f.factura} onChange={(e) => setF({ ...f, factura: e.target.value })} /></div>
          <div className="space-y-1"><Label>Garantía hasta</Label><Input type="date" value={f.garantia} onChange={(e) => setF({ ...f, garantia: e.target.value })} /></div>
        </div>
        <div className="space-y-1"><Label>Seriales (uno por línea)</Label><Textarea rows={4} value={f.seriales} onChange={(e) => setF({ ...f, seriales: e.target.value })} /></div>
        {seriales.length > 0 && (
          <div className="rounded border border-border">
            <div className="grid grid-cols-3 gap-2 border-b border-border bg-muted px-2 py-1 text-xs font-medium"><span>Serial</span><span>Activo fijo</span><span>Nombre de equipo</span></div>
            {seriales.map((x) => (
              <div key={x} className="grid grid-cols-3 items-center gap-2 px-2 py-1">
                <span className="font-mono text-xs">{x}</span>
                <Input className="h-8" value={extra[x]?.af ?? ""} onChange={(e) => setExtra({ ...extra, [x]: { nombre: extra[x]?.nombre ?? "", af: e.target.value } })} />
                <Input className="h-8" value={extra[x]?.nombre ?? ""} onChange={(e) => setExtra({ ...extra, [x]: { af: extra[x]?.af ?? "", nombre: e.target.value } })} />
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1"><Label>Cantidad sin serial (accesorios)</Label><Input type="number" min={0} className="w-32" value={f.sinSerial} onChange={(e) => setF({ ...f, sinSerial: e.target.value })} /></div>
        <p className="text-sm">Se ingresarán <b>{total}</b> equipo(s) como Disponibles{total > pend && <span className="text-destructive"> — supera lo pendiente</span>}.</p>
        <DialogFooter><Button disabled={guardando} onClick={guardar}>Confirmar recepción</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lista de pedidos de un proveedor con cumplimiento. */
export function PedidosProveedor({ proveedorId }: { proveedorId: string }) {
  const q = useQuery({
    queryKey: ["pedidos", "proveedor", proveedorId],
    queryFn: async () => (await supabase.from("pedidos_compra").select("id, numero, estado, fecha_esperada, cerrado_at, created_at, lineas:pedido_lineas(cantidad, precio_estimado)").eq("proveedor_id", proveedorId).order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const [ver, setVer] = useState<string | null>(null);
  const lista = q.data ?? [];
  const recibidos = lista.filter((p) => p.estado === "recibido");
  const aTiempo = recibidos.filter((p) => !p.fecha_esperada || (p.cerrado_at ?? "").slice(0, 10) <= p.fecha_esperada).length;
  const atrasados = lista.filter(pedidoAtrasado).length;
  const totalComprado = recibidos.reduce((s, p) => s + (p.lineas as { cantidad: number; precio_estimado: number | null }[]).reduce((a, l) => a + l.cantidad * (Number(l.precio_estimado) || 0), 0), 0);
  return (
    <div>
      <h3 className="mb-2 font-medium">Pedidos de compra</h3>
      <p className="mb-2 text-xs text-muted-foreground">{recibidos.length} recibidos · {aTiempo} a tiempo · {atrasados} atrasado(s) en curso · total estimado comprado {cop(totalComprado)}</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {lista.map((p) => (
          <li key={p.id}><button className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted" onClick={() => setVer(p.id)}>
            <span>#{p.numero} · {fmtFecha(p.created_at)}</span><EstadoPedido p={p} />
          </button></li>
        ))}
        {!lista.length && <li className="px-3 py-3 text-xs text-muted-foreground">Sin pedidos.</li>}
      </ul>
      <DetallePedido id={ver} onClose={() => setVer(null)} />
    </div>
  );
}
