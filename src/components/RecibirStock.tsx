import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

/** Registro rápido de un lote recibido de un proveedor. */
export function RecibirStock({ proveedorId, tipoId, solicitudId, onClose }: { proveedorId?: string | null; tipoId?: string | null; solicitudId?: string | null; onClose: () => void }) {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const provs = useQuery({ queryKey: ["proveedores_lista"], queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [] });
  const [f, setF] = useState({ proveedor_id: proveedorId ?? "", tipo_id: tipoId ?? "", marca_id: "", sede_id: "", modelo: "", valor: "", factura: "", garantia: "", seriales: "", sinSerial: "" });
  const [guardando, setGuardando] = useState(false);
  const seriales = [...new Set(f.seriales.split(/[\n,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const sinSerial = Math.max(0, Math.min(500, Number(f.sinSerial) || 0));
  const total = seriales.length + sinSerial;

  async function guardar() {
    if (!me?.can("reabastecimiento_gestionar") && !me?.can("proveedores_editar")) return toast.error("No tiene permiso para recibir stock de proveedores.");
    if (!f.proveedor_id || !f.tipo_id) return toast.error("Seleccione proveedor y tipo de equipo");
    if (!total) return toast.error("Escriba al menos un serial o una cantidad sin serial");
    const valor = f.valor ? Number(f.valor) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return toast.error("Valor inválido");
    setGuardando(true);
    const nombreProv = provs.data?.find((p) => p.id === f.proveedor_id)?.nombre ?? null;
    const base = {
      tipo_id: f.tipo_id, marca_id: f.marca_id || null, sede_id: f.sede_id || null, modelo: f.modelo.trim() || null,
      proveedor_id: f.proveedor_id, proveedor: nombreProv, valor_compra: valor, factura_numero: f.factura.trim() || null,
      garantia_fin: f.garantia || null, anio_compra: new Date().getFullYear(), estado: "disponible" as const,
    };
    const filas = [...seriales.map((serie) => ({ ...base, serie })), ...Array.from({ length: sinSerial }, () => ({ ...base, serie: "" }))];
    const { error } = await supabase.from("equipos").insert(filas);
    if (error) { setGuardando(false); return toast.error(error.code === "23505" ? "Alguno de los seriales ya existe en el inventario." : errMsg(error)); }
    // Actualiza último precio / compra del vínculo artículo-proveedor
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: vin } = await supabase.from("articulo_proveedores").select("id").eq("tipo_id", f.tipo_id).eq("proveedor_id", f.proveedor_id).maybeSingle();
    if (vin) await supabase.from("articulo_proveedores").update({ ultima_compra: hoy, ...(valor !== null ? { ultimo_precio: valor } : {}) }).eq("id", vin.id);
    else await supabase.from("articulo_proveedores").insert({ tipo_id: f.tipo_id, proveedor_id: f.proveedor_id, ultima_compra: hoy, ultimo_precio: valor });
    setGuardando(false);
    toast.success(`${total} equipo(s) registrados como disponibles`);
    ["equipos", "proveedores", "proveedor", "proveedores_articulo", "solicitudes"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onClose();
  }
  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  const opc = (tipo: string) => cat.byTipo(tipo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Recibir stock del proveedor</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Proveedor *</Label><select className={sel} value={f.proveedor_id} onChange={(e) => setF({ ...f, proveedor_id: e.target.value })}><option value="">—</option>{(provs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="space-y-1"><Label>Tipo de equipo *</Label><select className={sel} value={f.tipo_id} onChange={(e) => setF({ ...f, tipo_id: e.target.value })}><option value="">—</option>{opc("tipo_equipo")}</select></div>
          <div className="space-y-1"><Label>Marca</Label><select className={sel} value={f.marca_id} onChange={(e) => setF({ ...f, marca_id: e.target.value })}><option value="">—</option>{opc("marca")}</select></div>
          <div className="space-y-1"><Label>Sede</Label><select className={sel} value={f.sede_id} onChange={(e) => setF({ ...f, sede_id: e.target.value })}><option value="">—</option>{opc("sede")}</select></div>
          <div className="space-y-1"><Label>Modelo</Label><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></div>
          <div className="space-y-1"><Label>Valor unitario (COP)</Label><Input type="number" min={0} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
          <div className="space-y-1"><Label>Factura / orden de compra</Label><Input value={f.factura} onChange={(e) => setF({ ...f, factura: e.target.value })} /></div>
          <div className="space-y-1"><Label>Fin de garantía</Label><Input type="date" value={f.garantia} onChange={(e) => setF({ ...f, garantia: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Seriales (uno por línea)</Label><Textarea rows={5} className="font-mono" value={f.seriales} onChange={(e) => setF({ ...f, seriales: e.target.value })} /></div>
          <div className="space-y-1"><Label>Cantidad sin serial (accesorios)</Label><Input type="number" min={0} value={f.sinSerial} onChange={(e) => setF({ ...f, sinSerial: e.target.value })} /></div>
          <p className="self-end pb-2 text-sm text-muted-foreground">Se registrarán <b>{total}</b> equipo(s) como Disponibles.</p>
        </div>
        <DialogFooter><Button onClick={guardar} disabled={guardando}>{guardando ? "Registrando…" : "Registrar lote"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
