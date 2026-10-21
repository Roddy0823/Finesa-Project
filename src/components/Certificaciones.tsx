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
import { ShieldCheck } from "lucide-react";

/** Campañas de certificación anual de inventario (vista de mesa de ayuda). */
export function Certificaciones({ admin, ownerId }: { admin: boolean; ownerId: string | null }) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState(`Certificación ${new Date().getFullYear()}`);
  const [limite, setLimite] = useState(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  const q = useQuery({
    queryKey: ["certificaciones"],
    queryFn: async () => {
      const { data: camp } = await supabase.from("certificaciones").select("*").eq("activa", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!camp) return null;
      const [resp, emps] = await Promise.all([
        supabase.from("certificacion_respuestas").select("empleado_id, equipos_faltantes, comentario, created_at").eq("certificacion_id", camp.id),
        fetchAll((a, b) => supabase.from("empleados").select("id, nombre, identificacion").eq("activo", true).order("id").range(a, b)),
      ]);
      return { camp, resp: resp.data ?? [], emps };
    },
  });
  async function crear() {
    if (!nombre.trim() || !limite) return toast.error("Complete nombre y fecha límite");
    const { error } = await supabase.from("certificaciones").insert({ nombre: nombre.trim(), fecha_limite: limite, owner_id: ownerId!, creado_por: ownerId });
    if (error) return toast.error(errMsg(error));
    toast.success("Campaña lanzada. Los empleados la verán en su portal."); qc.invalidateQueries({ queryKey: ["certificaciones"] });
  }
  async function cerrar(id: string) {
    const { error } = await supabase.from("certificaciones").update({ activa: false }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    qc.invalidateQueries({ queryKey: ["certificaciones"] });
  }
  const d = q.data;
  function exportar() {
    if (!d) return;
    const porEmp = new Map(d.resp.map((r) => [r.empleado_id, r]));
    const filas = d.emps.map((e) => { const r = porEmp.get(e.id); return { Empleado: e.nombre, Cédula: e.identificacion, Estado: !r ? "Pendiente" : r.equipos_faltantes.length ? "Con novedad" : "Certificado", "Equipos faltantes": r?.equipos_faltantes.length ?? "", Comentario: r?.comentario ?? "", Fecha: r ? fmtFecha(r.created_at, true) : "" }; });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Certificación"); XLSX.writeFile(wb, `certificacion-${d.camp.nombre}.xlsx`);
  }
  if (!d && !admin) return null;
  const novedad = d?.resp.filter((r) => r.equipos_faltantes.length).length ?? 0;
  const cert = (d?.resp.length ?? 0) - novedad;
  return (
    <section className="mt-6 rounded-md border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Certificación anual de inventario</div>
      {d ? (
        <div className="space-y-3 text-sm">
          <div><b>{d.camp.nombre}</b> · fecha límite {fmtFecha(d.camp.fecha_limite)}</div>
          <div className="flex flex-wrap gap-6">
            <span>Certificados: <b>{cert}</b></span><span>Con novedad: <b className="text-destructive">{novedad}</b></span><span>Pendientes: <b>{Math.max(0, d.emps.length - d.resp.length)}</b></span>
          </div>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={exportar}>Exportar Excel</Button>{admin && <Button size="sm" variant="ghost" onClick={() => cerrar(d.camp.id)}>Cerrar campaña</Button>}</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="space-y-1"><Label>Fecha límite</Label><Input type="date" value={limite} onChange={(e) => setLimite(e.target.value)} /></div>
          <Button onClick={crear}>Lanzar campaña</Button>
        </div>
      )}
    </section>
  );
}
