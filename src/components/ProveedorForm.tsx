import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { errMsg } from "@/lib/constantes";
import { urlExternaSegura } from "@/lib/utils";
import { ETIQUETAS_PROVEEDOR, FORMAS_PAGO, type Prov } from "@/lib/proveedores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Check, CreditCard, Globe, Mail, MapPin, Phone, Smartphone, Tag, Trash2, Truck, UserCheck } from "lucide-react";

const sel =
  "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** Crear / editar la ficha completa del proveedor. onSaved recibe el id. */
export function FormProveedor({ p, onClose, onSaved }: { p: Prov | null; onClose: () => void; onSaved?: (id: string) => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [f, setF] = useState({
    nombre: p?.nombre ?? "",
    nit: p?.nit ?? "",
    ciudad: p?.ciudad ?? "",
    direccion: p?.direccion ?? "",
    sitio_web: p?.sitio_web ?? "",
    contacto_nombre: p?.contacto_nombre ?? "",
    asesor_telefono: p?.asesor_telefono ?? "",
    telefono: p?.telefono ?? "",
    whatsapp: p?.whatsapp ?? "",
    email: p?.email ?? "",
    dias_entrega: p?.dias_entrega?.toString() ?? "",
    forma_pago: p?.forma_pago ?? "",
    notas: p?.notas ?? "",
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
    const webRaw = t(f.sitio_web);
    if (webRaw && !urlExternaSegura(webRaw)) {
      return toast.error("El sitio web debe ser una dirección HTTP o HTTPS válida");
    }
    setGuardando(true);
    const datos = {
      nombre: f.nombre.trim(),
      nit: t(f.nit),
      ciudad: t(f.ciudad),
      direccion: t(f.direccion),
      sitio_web: webRaw,
      contacto_nombre: t(f.contacto_nombre),
      asesor_telefono: t(f.asesor_telefono),
      telefono: t(f.telefono),
      whatsapp: t(f.whatsapp),
      email: f.email.trim().toLowerCase() || null,
      dias_entrega: dias,
      forma_pago: t(f.forma_pago),
      notas: t(f.notas),
      etiquetas,
      activo,
    };
    const r = p
      ? await supabase.from("proveedores").update(datos).eq("id", p.id).select("id").single()
      : await supabase.from("proveedores").insert(datos).select("id").single();
    setGuardando(false);
    if (r.error) return toast.error(errMsg(r.error));
    toast.success(p ? "Proveedor actualizado" : "Proveedor creado");
    qc.invalidateQueries({ queryKey: ["proveedores"] });
    qc.invalidateQueries({ queryKey: ["proveedor"] });
    qc.invalidateQueries({ queryKey: ["proveedores_articulo"] });
    qc.invalidateQueries({ queryKey: ["proveedores_lista"] });
    qc.invalidateQueries({ queryKey: ["proveedores_lista_full"] });
    onSaved?.(r.data.id);
    onClose();
  }

  async function eliminar() {
    if (!me?.can("proveedores_editar")) return toast.error("No tiene permiso para eliminar proveedores.");
    if (!p || !confirm(`¿Eliminar el proveedor ${p.nombre}? Se quitarán sus vínculos con artículos. Si solo dejó de trabajar con él, márquelo como Inactivo.`)) return;
    const { error } = await supabase.from("proveedores").delete().eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    toast.success("Proveedor eliminado");
    qc.invalidateQueries({ queryKey: ["proveedores"] });
    onClose();
  }

  function toggleEtiqueta(e: string) {
    setEtiquetas((actual) => (actual.includes(e) ? actual.filter((x) => x !== e) : [...actual, e]));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-border/80 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {p ? "Editar proveedor" : "Registrar nuevo proveedor"}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  Información comercial, contacto directo y categorías de suministro.
                </p>
              </div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium">
              <span className={`h-2 w-2 rounded-full ${activo ? "bg-success" : "bg-muted-foreground/50"}`} />
              <span>{activo ? "Activo" : "Inactivo"}</span>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </label>
          </div>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          {/* Empresa */}
          <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Datos de la empresa
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium">Razón social / Nombre comercial *</Label>
                <Input
                  placeholder="Ej. Soluciones Tecnológicas S.A.S."
                  value={f.nombre}
                  onChange={(e) => setF({ ...f, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">NIT</Label>
                <Input
                  placeholder="Ej. 900.123.456-7"
                  className="font-mono text-xs"
                  value={f.nit}
                  onChange={(e) => setF({ ...f, nit: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Ciudad</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Cali, Bogotá, Medellín…"
                    value={f.ciudad}
                    onChange={(e) => setF({ ...f, ciudad: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Dirección</Label>
                <Input
                  placeholder="Dirección física o sede comercial"
                  value={f.direccion}
                  onChange={(e) => setF({ ...f, direccion: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Sitio web</Label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="https://proveedor.com"
                    value={f.sitio_web}
                    onChange={(e) => setF({ ...f, sitio_web: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Asesor y Contacto */}
          <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <UserCheck className="h-3.5 w-3.5 text-primary" />
                Asesor comercial y canales de contacto
              </div>
              <span className="text-[11px] text-muted-foreground">Al menos 1 teléfono requerido</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Nombre del asesor</Label>
                <Input
                  placeholder="Nombre del ejecutivo de cuenta"
                  value={f.contacto_nombre}
                  onChange={(e) => setF({ ...f, contacto_nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Correo electrónico</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    className="pl-8"
                    placeholder="asesor@proveedor.com"
                    value={f.email}
                    onChange={(e) => setF({ ...f, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Celular / WhatsApp</Label>
                <div className="relative">
                  <Smartphone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="300 000 0000"
                    value={f.whatsapp}
                    onChange={(e) => setF({ ...f, whatsapp: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Teléfono directo asesor</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Extensión o línea directa"
                    value={f.asesor_telefono}
                    onChange={(e) => setF({ ...f, asesor_telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium">Teléfono fijo de la empresa (PBX)</Label>
                <Input
                  placeholder="(602) 000 0000"
                  value={f.telefono}
                  onChange={(e) => setF({ ...f, telefono: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Especialidad / Etiquetas interactivas */}
          <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Tag className="h-3.5 w-3.5 text-primary" />
              Categorías del proveedor
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {ETIQUETAS_PROVEEDOR.map((e) => {
                const sel = etiquetas.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => toggleEtiqueta(e)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                      sel
                        ? "border-primary/40 bg-primary/10 text-primary shadow-xs"
                        : "border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground"
                    }`}
                  >
                    <span>{e}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                        sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
                      }`}
                    >
                      {sel && <Check className="h-2.5 w-2.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Condiciones comerciales */}
          <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              Condiciones comerciales y entrega
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Días promedio de entrega</Label>
                <div className="relative">
                  <Truck className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min={0}
                    className="pl-8"
                    placeholder="Ej. 5"
                    value={f.dias_entrega}
                    onChange={(e) => setF({ ...f, dias_entrega: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Forma de pago habitual</Label>
                <select
                  className={sel}
                  value={f.forma_pago}
                  onChange={(e) => setF({ ...f, forma_pago: e.target.value })}
                >
                  <option value="">Seleccione…</option>
                  {FORMAS_PAGO.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium">Notas u observaciones comerciales</Label>
                <Textarea
                  rows={2}
                  placeholder="Acuerdos de garantía, descuentos por volumen, horarios de recepción…"
                  value={f.notas}
                  onChange={(e) => setF({ ...f, notas: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-3.5">
          {p && (
            <Button variant="outline" className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={eliminar}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : p ? "Guardar cambios" : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
