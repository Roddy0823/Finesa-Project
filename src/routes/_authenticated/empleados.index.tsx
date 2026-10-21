import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/empleados/")({
  head: () => ({ meta: [{ title: "Empleados — Finesa" }, { name: "description", content: "Directorio de empleados." }] }),
  component: Empleados,
});

function Empleados() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const [t, setT] = useState("");
  const [texto, setTexto] = useState("");
  useEffect(() => { const h = setTimeout(() => setTexto(t.replace(/[%,()*\\]/g, " ").trim()), 300); return () => clearTimeout(h); }, [t]);
  const [estado, setEstado] = useState("activos");
  const pag = usePaginacion({ texto, estado });
  const q = useQuery({
    queryKey: ["empleados", "pagina", texto, estado, pag.desde, pag.tamano],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let s = supabase.from("empleados").select("*", { count: "exact" });
      if (estado !== "todos") s = s.eq("activo", estado === "activos");
      if (texto) s = s.or(`nombre.ilike.%${texto}%,identificacion.ilike.%${texto}%,email.ilike.%${texto}%`);
      const { data, count, error } = await s.order("nombre").order("id").range(pag.desde, pag.hasta);
      if (error) throw error;
      return { filas: data ?? [], total: count ?? 0 };
    },
  });
  const lista = q.data?.filas ?? [];
  const total = q.data?.total ?? 0;

  return (
    <div>
      <PageHeader title="Empleados" desc={`${total.toLocaleString("es-CO")} empleado(s)`}>
        {me?.can("empleados_editar") && <FormEmpleado />}
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        <Input placeholder="Buscar por nombre, identificación o correo" className="w-full sm:w-80" value={t} onChange={(e) => setT(e.target.value)} />
        <select className="h-9 rounded-md border border-input bg-card px-3 text-sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Nombre</th><th className="px-4 py-2">Identificación</th><th className="px-4 py-2">Cargo</th><th className="px-4 py-2">Área</th><th className="px-4 py-2">Sede</th><th className="px-4 py-2">Portal</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && <FilasSkeleton columnas={6} />}
            {lista.map((e) => (
              <tr key={e.id} className="hover:bg-muted/50">
                <td className="px-4 py-2.5"><Link to="/empleados/$id" params={{ id: e.id }} className="font-medium text-primary hover:underline">{e.nombre}</Link>{!e.activo && <span className="ml-2 text-xs text-destructive">Inactivo</span>}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{e.identificacion}</td>
                <td className="px-4 py-2.5">{e.cargo ?? "—"}</td>
                <td className="px-4 py-2.5">{cat.nombre(e.area_id)}</td>
                <td className="px-4 py-2.5">{cat.nombre(e.sede_id)}</td>
                <td className="px-4 py-2.5 text-xs">{e.user_id ? "Habilitado" : "—"}</td>
              </tr>
            ))}
            {!q.isLoading && !lista.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No hay empleados que coincidan.</td></tr>}
          </tbody>
        </table>
      </div>
      <DataTablePagination total={total} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
    </div>
  );
}

export type EmpleadoForm = { id?: string; nombre: string; identificacion: string; email: string; cargo: string; area_id: string; sede_id: string; empresa_id: string };

export function FormEmpleado({ inicial }: { inicial?: EmpleadoForm }) {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const [open, setOpen] = useState(false);
  const vacio: EmpleadoForm = { nombre: "", identificacion: "", email: "", cargo: "", area_id: "", sede_id: "", empresa_id: "" };
  const [f, setF] = useState<EmpleadoForm>(inicial ?? vacio);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const row = { nombre: f.nombre.trim(), identificacion: f.identificacion.trim(), email: f.email.trim().toLowerCase() || null, cargo: f.cargo || null, area_id: f.area_id || null, sede_id: f.sede_id || null, empresa_id: f.empresa_id || null };
    const { error } = f.id ? await supabase.from("empleados").update(row).eq("id", f.id) : await supabase.from("empleados").insert(row);
    if (error) return toast.error(error.code === "23505" ? "Ya existe un empleado con esa identificación." : errMsg(error));
    toast.success(f.id ? "Empleado actualizado" : "Empleado registrado");
    setOpen(false); if (!f.id) setF(vacio);
    qc.invalidateQueries({ queryKey: ["empleados"] }); if (f.id) qc.invalidateQueries({ queryKey: ["empleado", f.id] });
  }
  const s = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  const opt = (tipo: string) => cat.byTipo(tipo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={inicial ? "outline" : "default"}>{inicial ? "Editar" : "Registrar empleado"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{inicial ? "Editar empleado" : "Registrar empleado"}</DialogTitle></DialogHeader>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Nombre completo *</Label><Input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div className="space-y-1"><Label>Identificación *</Label><Input required value={f.identificacion} onChange={(e) => setF({ ...f, identificacion: e.target.value })} /></div>
          <div className="space-y-1"><Label>Correo</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1"><Label>Cargo</Label><Input value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} /></div>
          <div className="space-y-1"><Label>Área</Label><select className={s} value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}><option value="">—</option>{opt("area")}</select></div>
          <div className="space-y-1"><Label>Sede</Label><select className={s} value={f.sede_id} onChange={(e) => setF({ ...f, sede_id: e.target.value })}><option value="">—</option>{opt("sede")}</select></div>
          <div className="space-y-1"><Label>Empresa</Label><select className={s} value={f.empresa_id} onChange={(e) => setF({ ...f, empresa_id: e.target.value })}><option value="">—</option>{opt("empresa")}</select></div>
          <DialogFooter className="sm:col-span-2"><Button type="submit">Guardar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
