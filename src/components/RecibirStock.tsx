import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg } from "@/lib/constantes";
import { cop } from "@/lib/proveedores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Barcode, PackageCheck, ShieldCheck } from "lucide-react";

const sel =
  "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/** Registro rápido de un lote recibido de un proveedor. */
export function RecibirStock({
  proveedorId,
  tipoId,
  solicitudId,
  onClose,
}: {
  proveedorId?: string | null;
  tipoId?: string | null;
  solicitudId?: string | null;
  onClose: () => void;
}) {
  void solicitudId;
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const provs = useQuery({
    queryKey: ["proveedores_lista"],
    queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [],
  });
  const [f, setF] = useState({
    proveedor_id: proveedorId ?? "",
    tipo_id: tipoId ?? "",
    marca_id: "",
    sede_id: "",
    modelo: "",
    valor: "",
    factura: "",
    garantia: "",
    seriales: "",
    sinSerial: "",
  });
  const [guardando, setGuardando] = useState(false);
  const seriales = [...new Set(f.seriales.split(/[\n,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const sinSerial = Math.max(0, Math.min(500, Number(f.sinSerial) || 0));
  const total = seriales.length + sinSerial;
  const valorNum = f.valor ? Number(f.valor) : null;
  const subtotal = valorNum && total > 0 ? valorNum * total : 0;

  async function guardar() {
    if (!me?.can("reabastecimiento_gestionar") && !me?.can("proveedores_editar")) {
      return toast.error("No tiene permiso para recibir stock de proveedores.");
    }
    if (!f.proveedor_id || !f.tipo_id) return toast.error("Seleccione proveedor y tipo de equipo");
    if (!total) return toast.error("Escriba al menos un serial o una cantidad sin serial");
    const valor = f.valor ? Number(f.valor) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return toast.error("Valor inválido");
    setGuardando(true);
    const nombreProv = provs.data?.find((p) => p.id === f.proveedor_id)?.nombre ?? null;
    const base = {
      tipo_id: f.tipo_id,
      marca_id: f.marca_id || null,
      sede_id: f.sede_id || null,
      modelo: f.modelo.trim() || null,
      proveedor_id: f.proveedor_id,
      proveedor: nombreProv,
      valor_compra: valor,
      factura_numero: f.factura.trim() || null,
      garantia_fin: f.garantia || null,
      anio_compra: new Date().getFullYear(),
      estado: "disponible" as const,
    };
    const filas = [
      ...seriales.map((serie) => ({ ...base, serie })),
      ...Array.from({ length: sinSerial }, () => ({ ...base, serie: "" })),
    ];
    const { error } = await supabase.from("equipos").insert(filas);
    if (error) {
      setGuardando(false);
      return toast.error(error.code === "23505" ? "Alguno de los seriales ya existe en el inventario." : errMsg(error));
    }
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: vin } = await supabase
      .from("articulo_proveedores")
      .select("id")
      .eq("tipo_id", f.tipo_id)
      .eq("proveedor_id", f.proveedor_id)
      .maybeSingle();
    if (vin) {
      await supabase
        .from("articulo_proveedores")
        .update({ ultima_compra: hoy, ...(valor !== null ? { ultimo_precio: valor } : {}) })
        .eq("id", vin.id);
    } else {
      await supabase
        .from("articulo_proveedores")
        .insert({ tipo_id: f.tipo_id, proveedor_id: f.proveedor_id, ultima_compra: hoy, ultimo_precio: valor });
    }
    setGuardando(false);
    toast.success(`${total} equipo(s) registrados como disponibles`);
    ["equipos", "proveedores", "proveedor", "proveedores_articulo", "solicitudes"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
    onClose();
  }

  const opc = (tipo: string) =>
    cat.byTipo(tipo).map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl border-border/80 p-0">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <PackageCheck className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight">Recibir stock del proveedor</DialogTitle>
              <p className="text-xs text-muted-foreground">
                Registra un lote directo en el inventario con estado Disponible y actualiza el último precio de compra.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/15 p-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Proveedor *</Label>
              <select
                className={sel}
                value={f.proveedor_id}
                onChange={(e) => setF({ ...f, proveedor_id: e.target.value })}
              >
                <option value="">Seleccione…</option>
                {(provs.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tipo de equipo *</Label>
              <select className={sel} value={f.tipo_id} onChange={(e) => setF({ ...f, tipo_id: e.target.value })}>
                <option value="">Seleccione…</option>
                {opc("tipo_equipo")}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Marca</Label>
              <select className={sel} value={f.marca_id} onChange={(e) => setF({ ...f, marca_id: e.target.value })}>
                <option value="">—</option>
                {opc("marca")}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Sede de destino</Label>
              <select className={sel} value={f.sede_id} onChange={(e) => setF({ ...f, sede_id: e.target.value })}>
                <option value="">—</option>
                {opc("sede")}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Modelo</Label>
              <Input
                placeholder="Ej. ThinkPad E14 Gen 5"
                value={f.modelo}
                onChange={(e) => setF({ ...f, modelo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Valor unitario (COP)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={f.valor}
                onChange={(e) => setF({ ...f, valor: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Factura / Orden de compra</Label>
              <Input
                placeholder="FE-10294"
                value={f.factura}
                onChange={(e) => setF({ ...f, factura: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 text-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                Fin de garantía
              </Label>
              <Input
                type="date"
                value={f.garantia}
                onChange={(e) => setF({ ...f, garantia: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-medium">
                <Barcode className="h-3.5 w-3.5 text-primary" />
                Seriales (uno por línea o separados por coma)
              </Label>
              {seriales.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
                  {seriales.length} serial(es) único(s)
                </span>
              )}
            </div>
            <Textarea
              rows={4}
              placeholder={"PF3X910A\nPF3X910B\nPF3X910C"}
              className="font-mono text-xs"
              value={f.seriales}
              onChange={(e) => setF({ ...f, seriales: e.target.value })}
            />
            {seriales.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {seriales.slice(0, 12).map((s) => (
                  <span
                    key={s}
                    className="rounded-md border border-border/80 bg-background px-2 py-0.5 font-mono text-[11px] text-foreground"
                  >
                    {s}
                  </span>
                ))}
                {seriales.length > 12 && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    +{seriales.length - 12} más
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Cantidad sin serial (accesorios)</Label>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-24"
                  placeholder="0"
                  value={f.sinSerial}
                  onChange={(e) => setF({ ...f, sinSerial: e.target.value })}
                />
              </div>
              <div className="text-right text-xs text-muted-foreground">
                Se ingresarán <b className="font-semibold text-foreground">{total}</b> unidad(es) como{" "}
                <span className="font-medium text-success">Disponibles</span>
                {subtotal > 0 && (
                  <span className="ml-1.5 font-mono text-foreground">· {cop(subtotal)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            <PackageCheck className="mr-1.5 h-4 w-4" />
            {guardando ? "Registrando…" : `Registrar ${total > 0 ? `${total} equipo(s)` : "lote"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
