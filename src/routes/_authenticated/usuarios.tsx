import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { PERMISOS, errMsg, type Permiso } from "@/lib/constantes";
import { actualizarPermisos, cambiarEstadoUsuario, cambiarPasswordAuxiliar, crearAuxiliar, eliminarAuxiliar, obtenerPermisosExtraUsuarios } from "@/lib/usuarios.functions";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuarios y permisos — Finesa" }, { name: "description", content: "Gestión de auxiliares de soporte." }] }),
  component: Usuarios,
});

type Fila = { id: string; nombre: string; email: string; activo: boolean; roles: string[]; permisos: Permiso[] };

function Usuarios() {
  const { data: me } = useMe();
  const extrasFn = useServerFn(obtenerPermisosExtraUsuarios);
  const q = useQuery({
    queryKey: ["usuarios"],
    enabled: !!me?.isAdmin,
    queryFn: async (): Promise<Fila[]> => {
      const [p, r, pe, ex] = await Promise.all([
        supabase.from("profiles").select("*").order("nombre"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_permisos").select("user_id, permiso"),
        extrasFn(),
      ]);
      const extrasMap = ex?.extras ?? {};
      const visibles = new Set((r.data ?? []).map((y) => y.user_id));
      return (p.data ?? []).filter((x) => visibles.has(x.id)).map((x) => {
        const dbPerms = (pe.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.permiso as Permiso);
        const extraPerms = (extrasMap[x.id] ?? []) as Permiso[];
        return {
          id: x.id, nombre: x.nombre, email: x.email, activo: x.activo,
          roles: (r.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.role),
          permisos: [...new Set<Permiso>([...dbPerms, ...extraPerms])],
        };
      }).filter((f) => f.roles.includes("admin") || f.roles.includes("auxiliar"));
    },
  });
  if (!me?.isAdmin) return <p className="text-muted-foreground">Solo el Administrador puede gestionar usuarios.</p>;

  return (
    <div>
      <PageHeader title="Usuarios y permisos" desc="Cree auxiliares de soporte y defina qué puede hacer cada uno. Los administradores se crean únicamente en la base de datos.">
        <NuevoAuxiliar />
      </PageHeader>
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
            <tr><th className="px-4 py-2">Nombre</th><th className="px-4 py-2">Rol</th><th className="px-4 py-2">Permisos</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(q.data ?? []).map((u) => <FilaUsuario key={u.id} u={u} esYo={u.id === me.id} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaUsuario({ u, esYo }: { u: Fila; esYo: boolean }) {
  const qc = useQueryClient();
  const estado = useServerFn(cambiarEstadoUsuario);
  const eliminar = useServerFn(eliminarAuxiliar);
  const admin = u.roles.includes("admin");
  async function toggle() {
    try { const r = await estado({ data: { userId: u.id, activo: !u.activo } }); if ("error" in r && r.error) { toast.error(r.error); return; } toast.success(u.activo ? "Cuenta suspendida" : "Cuenta reactivada"); qc.invalidateQueries({ queryKey: ["usuarios"] }); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function borrar() {
    if (!window.confirm(`¿Eliminar definitivamente la cuenta de ${u.nombre || u.email}? Esta acción no se puede deshacer.`)) return;
    try {
      const r = await eliminar({ data: { userId: u.id } });
      if ("error" in r && r.error) { toast.error(r.error); return; }
      toast.success("Cuenta de auxiliar eliminada");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <tr>
      <td className="px-4 py-3"><div className="font-medium">{u.nombre || "—"}</div><div className="text-xs text-muted-foreground">{u.email}</div></td>
      <td className="px-4 py-3">{admin ? "Administrador" : "Auxiliar"}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{admin ? "Todos" : u.permisos.length ? `${u.permisos.length} de ${PERMISOS.length}` : "Ninguno"}</td>
      <td className="px-4 py-3">{u.activo ? <span className="text-success">Activa</span> : <span className="text-destructive">Suspendida</span>}</td>
      <td className="px-4 py-3">
        {!admin && !esYo && (
          <div className="flex flex-wrap justify-end gap-2">
            <EditarPermisos u={u} />
            <CambiarPassword u={u} />
            <Button size="sm" variant={u.activo ? "destructive" : "secondary"} onClick={toggle}>{u.activo ? "Suspender" : "Reactivar"}</Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={borrar}>Eliminar</Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SelectorPermisos({ value, onChange }: { value: Permiso[]; onChange: (v: Permiso[]) => void }) {
  const grupos = [...new Set(PERMISOS.map((p) => p.grupo))];
  const todosIds = PERMISOS.map((p) => p.id);
  const todosMarcados = todosIds.every((id) => value.includes(id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted-foreground">
        <span>{value.length} de {PERMISOS.length} permisos seleccionados</span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => onChange(todosMarcados ? [] : [...todosIds])}
        >
          {todosMarcados ? "Quitar todos" : "Seleccionar todos"}
        </button>
      </div>
      {grupos.map((grupo) => (
        <div key={grupo} className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{grupo}</div>
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            {PERMISOS.filter((p) => p.grupo === grupo).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-start gap-3 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={value.includes(p.id)}
                  onCheckedChange={(c) => onChange(c ? [...value, p.id] : value.filter((x) => x !== p.id))}
                />
                <div className="leading-snug">
                  <div className="font-medium text-foreground">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EditarPermisos({ u }: { u: Fila }) {
  const qc = useQueryClient();
  const fn = useServerFn(actualizarPermisos);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Permiso[]>(u.permisos);
  async function guardar() {
    try { const r = await fn({ data: { userId: u.id, permisos: sel } }); if ("error" in r && r.error) { toast.error(r.error); return; } toast.success("Permisos actualizados"); setOpen(false); qc.invalidateQueries({ queryKey: ["usuarios"] }); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setSel(u.permisos); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Permisos</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Permisos de {u.nombre || u.email}</DialogTitle></DialogHeader>
        <SelectorPermisos value={sel} onChange={setSel} />
        <DialogFooter><Button onClick={guardar}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevoAuxiliar() {
  const qc = useQueryClient();
  const fn = useServerFn(crearAuxiliar);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", email: "", password: "" });
  const [sel, setSel] = useState<Permiso[]>([
    "equipos_editar",
    "reabastecimiento_gestionar",
    "proveedores_editar",
    "empleados_editar",
    "actas_entrega",
    "actas_devolucion",
    "firmas_capturar",
    "repositorio_ver",
  ]);
  const [loading, setLoading] = useState(false);
  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fn({ data: { ...f, permisos: sel } });
      if ("error" in r && r.error) { toast.error(r.error); return; }
      toast.success("Auxiliar creado. Comparta la contraseña temporal de forma segura.");
      setOpen(false); setF({ nombre: "", email: "", password: "" });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Nuevo auxiliar</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo auxiliar de soporte</DialogTitle></DialogHeader>
        <form onSubmit={crear} className="space-y-4">
          <div className="space-y-1.5"><Label>Nombre completo</Label><Input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Correo</Label><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Contraseña temporal (mín. 8)</Label><Input required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          <div><Label className="mb-2 block">Permisos</Label><SelectorPermisos value={sel} onChange={setSel} /></div>
          <DialogFooter><Button type="submit" disabled={loading}>Crear auxiliar</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CambiarPassword({ u }: { u: Fila }) {
  const fn = useServerFn(cambiarPasswordAuxiliar);
  const [open, setOpen] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (p1 !== p2) { toast.error("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try {
      const r = await fn({ data: { userId: u.id, password: p1 } });
      if ("error" in r && r.error) { toast.error(r.error); return; }
      toast.success("Contraseña actualizada. Compártala de forma segura.");
      setOpen(false);
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setP1(""); setP2(""); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Contraseña</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nueva contraseña para {u.nombre || u.email}</DialogTitle></DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-1.5"><Label>Nueva contraseña (mín. 8)</Label><Input type="password" required minLength={8} value={p1} onChange={(e) => setP1(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Confirmar contraseña</Label><Input type="password" required minLength={8} value={p2} onChange={(e) => setP2(e.target.value)} /></div>
          <DialogFooter><Button type="submit" disabled={loading}>Cambiar contraseña</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
