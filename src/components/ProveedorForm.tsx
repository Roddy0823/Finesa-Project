import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { errMsg } from "@/lib/constantes";
import { ETIQUETAS_PROVEEDOR, FORMAS_PAGO, type Prov } from "@/lib/proveedores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

/** Crear / editar la ficha completa del proveedor. onSaved recibe el id. */
export function FormProveedor({ p, onClose, onSaved }: { p: Prov | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: p?.nombre ?? "", nit: p?.nit ?? "", ciudad: p?.ciudad ?? "", direccion: p?.direccion ?? "", sitio_web: p?.sitio_web ?? "",
    contacto_nombre: p?.contacto_nombre ?? "", asesor_telefono: p?.asesor_telefono ?? "", telefono: p?.telefono ?? "", whatsapp: p?.whatsapp ?? "", email: p?.email ?? "",
    dias_entrega: p?.dias_entrega?.toString() ?? "", forma_pago: p?.forma_pago ?? "", notas: p?.notas ?? "",
  });
  const [etiquetas, setEtiquetas] = useState<string[]>(p?.etiquetas ?? []);
  const [activo, setActivo] = useState(p?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const t = (s: string) => s.trim() || null;

  async function guardar() {
    if (!me?.can("proveedores_editar")) return toast.error("No tiene permiso para gestionar proveedores.");
    if (!f.nombre.trim()) return toast.error("La razón social es obligatoria");
    if (!f.telefono.trim() && !f.whatsapp.trim() && !f.asesor_telefono.trim()) return toast.error("Registre al menos un teléfono o celular");
    const dias = f.dias_entrega ? Number(f.dias_entrega) : null;
    if (dias !== null && (!Number.isInteger(dias) || dias < 0)) return toast.error("Días de entrega inválidos");
    setGuardando(true);
    const datos = {
      nombre: f.nombre.trim(), nit: t(f.nit), ciudad: t(f.ciudad), direccion: t(f.direccion), sitio_web: t(f.sitio_web),
      contacto_nombre: t(f.contacto_nombre), asesor_telefono: t(f.asesor_telefono), telefono: t(f.telefono), whatsapp: t(f.whatsapp),
      email: f.email.trim().toLowerCase() || null, dias_entrega: dias, forma_pago: t(f.forma_pago), notas: t(f.notas), etiquetas, activo,
    };
    const r = p ? await supabase.from("proveedores").update(datos).eq("id", p.id).select("id").single() : await supabase.from("proveedores").insert(datos).select("id").single();
    setGuardando(false);
    if (r.error) return toast.error(errMsg(r.error));
    toast.success(p ? "Proveedor actualizado" : "Proveedor creado");
    qc.invalidateQueries({ queryKey: ["proveedores"] }); qc.invalidateQueries({ queryKey: ["proveedor"] }); qc.invalidateQueries({ queryKey: ["proveedores_articulo"] }); qc.invalidateQueries({ queryKey: ["proveedores_lista"] });
    onSaved?.(r.data.id); onClose();
  }
  async function eliminar() {
    if (!me?.can("proveedores_editar")) return toast.error("No tiene permiso para eliminar proveedores.");
    if (!p || !confirm(`¿Eliminar el proveedor ${p.nombre}? Se quitarán sus vínculos con artículos. Si solo dejó de trabajar con él, márquelo como Inactivo.`)) return;
    const { error } = await supabase.from("proveedores").delete().eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    toast.success("Proveedor eliminado"); qc.invalidateQueries({ queryKey: ["proveedores"] }); onClose();
  }
  const campo = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1"><Label>{label}</Label><Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  const sel = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{p ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle></DialogHeader>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Empresa</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("nombre", "Razón social / Nombre comercial *")}{campo("nit", "NIT")}{campo("ciudad", "Ciudad")}{campo("direccion", "Dirección")}
          <div className="sm:col-span-2">{campo("sitio_web", "Sitio web")}</div>
        </div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Asesor asignado</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("contacto_nombre", "Nombre del asesor")}{campo("asesor_telefono", "Teléfono directo")}{campo("whatsapp", "Celular")}{campo("email", "Correo", "email")}
          {campo("telefono", "Teléfono de la empresa")}
        </div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Tipo de proveedor</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {ETIQUETAS_PROVEEDOR.map((e) => (
            <label key={e} className="flex items-center gap-2 text-sm">
              <Checkbox checked={etiquetas.includes(e)} onCheckedChange={(c) => setEtiquetas(c ? [...etiquetas, e] : etiquetas.filter((x) => x !== e))} />{e}
            </label>
          ))}
        </div>
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">Condiciones comerciales</h4>
        <div className="grid gap-3 sm:grid-cols-3">
          {campo("dias_entrega", "Días promedio de entrega", "number")}
          <div className="space-y-1"><Label>Forma de pago</Label>
            <select className={sel} value={f.forma_pago} onChange={(e) => setF({ ...f, forma_pago: e.target.value })}><option value="">—</option>{FORMAS_PAGO.map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Switch checked={activo} onCheckedChange={setActivo} />{activo ? "Activo" : "Inactivo"}</label>
        </div>
        <div className="space-y-1"><Label>Notas</Label><Textarea rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} /></div>
        <DialogFooter className="gap-2">
          {p && <Button variant="outline" className="text-destructive" onClick={eliminar}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button>}
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
