import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Download, Play, XCircle, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

/** Campañas de certificación anual de inventario (vista de mesa de ayuda). */
export function Certificaciones({ admin, ownerId }: { admin: boolean; ownerId: string | null }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(`Certificación ${new Date().getFullYear()}`);
  const [limite, setLimite] = useState(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  const q = useQuery({
    queryKey: ["certificaciones"],
    queryFn: async () => {
      const { data: camp } = await supabase
        .from("certificaciones")
        .select("*")
        .eq("activa", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!camp) return null;
      const [resp, emps] = await Promise.all([
        supabase
          .from("certificacion_respuestas")
          .select("empleado_id, equipos_faltantes, comentario, created_at")
          .eq("certificacion_id", camp.id),
        fetchAll((a, b) =>
          supabase.from("empleados").select("id, nombre, identificacion").eq("activo", true).order("id").range(a, b),
        ),
      ]);
      return { camp, resp: resp.data ?? [], emps };
    },
  });

  async function crear() {
    if (!nombre.trim() || !limite) return toast.error("Complete nombre y fecha límite");
    const { error } = await supabase
      .from("certificaciones")
      .insert({ nombre: nombre.trim(), fecha_limite: limite, owner_id: ownerId!, creado_por: ownerId });
    if (error) return toast.error(errMsg(error));
    toast.success("Campaña lanzada. Los empleados la verán en su portal.");
    qc.invalidateQueries({ queryKey: ["certificaciones"] });
  }

  async function cerrar(id: string) {
    if (!window.confirm("¿Cerrar la campaña actual de certificación?")) return;
    const { error } = await supabase.from("certificaciones").update({ activa: false }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Campaña cerrada");
    qc.invalidateQueries({ queryKey: ["certificaciones"] });
  }

  const d = q.data;
  function exportar() {
    if (!d) return;
    const porEmp = new Map(d.resp.map((r) => [r.empleado_id, r]));
    const filas = d.emps.map((e) => {
      const r = porEmp.get(e.id);
      return {
        Empleado: e.nombre,
        Cédula: e.identificacion,
        Estado: !r ? "Pendiente" : r.equipos_faltantes.length ? "Con novedad" : "Certificado",
        "Equipos faltantes": r?.equipos_faltantes.length ?? "",
        Comentario: r?.comentario ?? "",
        Fecha: r ? fmtFecha(r.created_at, true) : "",
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Certificación");
    XLSX.writeFile(wb, `certificacion-${d.camp.nombre}.xlsx`);
  }

  if (!d && !admin) return null;
  const novedad = d?.resp.filter((r) => r.equipos_faltantes.length).length ?? 0;
  const cert = (d?.resp.length ?? 0) - novedad;
  const pendientes = d ? Math.max(0, d.emps.length - d.resp.length) : 0;
  const totalEmps = d?.emps.length ?? 0;
  const avance = totalEmps > 0 ? Math.round(((d?.resp.length ?? 0) / totalEmps) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-6 py-4">
        <div>
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm">Campaña de certificación anual de inventario</span>
            {d && (
              <span className="rounded-full border border-success/30 bg-success/12 px-2 py-0.5 text-[10px] font-medium text-success">
                En curso
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Solicita a cada empleado activo confirmar los equipos que tiene asignados desde su portal.
          </p>
        </div>
      </div>

      <div className="p-6">
        {d ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-foreground">{d.camp.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  Fecha límite: <span className="font-mono text-foreground">{fmtFecha(d.camp.fecha_limite)}</span>
                </div>
              </div>
              <div className="text-right font-mono text-xs text-muted-foreground">
                Avance global: <b className="text-foreground">{avance}%</b> ({d.resp.length}/{totalEmps})
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${avance}%` }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Certificados sin novedad</span>
                </div>
                <div className="mt-1.5 font-display text-2xl font-bold text-foreground">{cert}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  <span>Con novedad / faltantes</span>
                </div>
                <div className="mt-1.5 font-display text-2xl font-bold text-destructive">{novedad}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/50 p-3.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-warning-foreground" />
                  <span>Pendientes por responder</span>
                </div>
                <div className="mt-1.5 font-display text-2xl font-bold text-foreground">{pendientes}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
              <Button size="sm" variant="outline" onClick={exportar}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar resultados (Excel)
              </Button>
              {admin && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => cerrar(d.camp.id)}>
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Cerrar campaña
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre de la campaña</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Certificación 2026" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha límite</Label>
              <Input type="date" value={limite} onChange={(e) => setLimite(e.target.value)} />
            </div>
            <Button onClick={crear} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Lanzar campaña
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
