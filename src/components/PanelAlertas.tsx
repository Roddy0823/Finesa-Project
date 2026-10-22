import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, Clock } from "lucide-react";

type Falla = {
  id: string;
  descripcion: string;
  created_at: string;
  equipo: { id: string; serie: string; modelo: string | null; tipo_id: string } | null;
  empleado: { nombre: string } | null;
};

/** Reportes de falla abiertos y préstamos vencidos, para mesa de ayuda. */
export function PanelAlertas({ puedeEditar }: { puedeEditar: boolean }) {
  const cat = useCatalogos();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState<{ f: Falla; estado: "atendido" | "descartado" | "en_reparacion" } | null>(null);
  const [resp, setResp] = useState("");
  const q = useQuery({
    queryKey: ["panel", "alertas"],
    queryFn: async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const [f, p] = await Promise.all([
        supabase
          .from("reportes_falla")
          .select("id, descripcion, created_at, equipo:equipos(id, serie, modelo, tipo_id), empleado:empleados(nombre)")
          .eq("estado", "abierto")
          .order("created_at", { ascending: false }),
        supabase
          .from("equipos")
          .select("id, serie, modelo, tipo_id, prestamo_hasta, empleado:empleados(nombre)")
          .eq("estado", "asignado")
          .not("prestamo_hasta", "is", null)
          .lte("prestamo_hasta", hoy)
          .order("prestamo_hasta"),
      ]);
      return { fallas: (f.data ?? []) as unknown as Falla[], vencidos: p.data ?? [] };
    },
  });

  async function cerrar() {
    if (!abierto) return;
    const { f, estado } = abierto;
    if (estado === "en_reparacion" && f.equipo) {
      const { error } = await supabase.rpc("cambiar_estado_equipo", {
        p_equipo: f.equipo.id,
        p_estado: "en_reparacion",
        p_motivo: `Falla reportada por el empleado: ${f.descripcion}${resp.trim() ? ` · ${resp.trim()}` : ""}`,
      });
      if (error) return toast.error(errMsg(error));
    }
    const { error } = await supabase.rpc("atender_falla", { p_reporte: f.id, p_estado: estado, p_respuesta: resp.trim() });
    if (error) return toast.error(errMsg(error));
    toast.success("Reporte cerrado");
    setAbierto(null);
    setResp("");
    qc.invalidateQueries({ queryKey: ["panel"] });
    qc.invalidateQueries({ queryKey: ["equipos"] });
  }

  const d = q.data;
  if (!d || (!d.fallas.length && !d.vencidos.length)) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {d.fallas.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-destructive/30 bg-card shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/70 bg-destructive/5 px-5 py-3 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>Fallas reportadas por empleados ({d.fallas.length})</span>
          </div>
          <ul className="divide-y divide-border/60">
            {d.fallas.map((f) => (
              <li key={f.id} className="space-y-2 px-5 py-3.5 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>
                    <b className="font-semibold">{f.empleado?.nombre}</b> ·{" "}
                    {f.equipo && (
                      <Link to="/equipos/$id" params={{ id: f.equipo.id }} className="text-primary hover:underline">
                        {cat.nombre(f.equipo.tipo_id)} {f.equipo.modelo}{" "}
                        <span className="font-mono text-xs">{f.equipo.serie}</span>
                      </Link>
                    )}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{fmtFecha(f.created_at, true)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{f.descripcion}</p>
                {puedeEditar && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => setAbierto({ f, estado: "en_reparacion" })}>
                      Enviar a reparación
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAbierto({ f, estado: "atendido" })}>
                      Atendida
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAbierto({ f, estado: "descartado" })}>
                      Descartar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {d.vencidos.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-warning/35 bg-card shadow-2xs">
          <div className="flex items-center gap-2 border-b border-border/70 bg-warning/10 px-5 py-3 text-sm font-semibold">
            <Clock className="h-4 w-4 text-warning-foreground" />
            <span>Préstamos vencidos ({d.vencidos.length})</span>
          </div>
          <ul className="divide-y divide-border/60">
            {d.vencidos.map((e) => (
              <li key={e.id}>
                <Link
                  to="/equipos/$id"
                  params={{ id: e.id }}
                  className="flex items-center justify-between gap-2 px-5 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <span>
                    {cat.nombre(e.tipo_id)} {e.modelo} <span className="font-mono text-xs">{e.serie}</span> ·{" "}
                    {(e.empleado as { nombre: string } | null)?.nombre}
                  </span>
                  <span className="font-mono text-xs text-destructive">venció {fmtFecha(e.prestamo_hasta)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Dialog open={!!abierto} onOpenChange={(o) => !o && setAbierto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {abierto?.estado === "en_reparacion"
                ? "Enviar a reparación"
                : abierto?.estado === "atendido"
                  ? "Marcar como atendida"
                  : "Descartar reporte"}
            </DialogTitle>
          </DialogHeader>
          <Textarea placeholder="Comentario (opcional)" value={resp} onChange={(e) => setResp(e.target.value)} />
          <DialogFooter>
            <Button onClick={cerrar}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
