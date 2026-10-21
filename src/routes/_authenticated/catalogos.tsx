import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useCatalogos } from "@/lib/catalogos";
import { useMe } from "@/lib/me";
import { CATALOGOS, errMsg, type CatalogoTipo } from "@/lib/constantes";
import { gestionarCatalogo } from "@/lib/usuarios.functions";
import { PageHeader } from "@/components/Estado";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Pencil, Trash2, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/catalogos")({
  head: () => ({ meta: [{ title: "Catálogos — Finesa" }, { name: "description", content: "Listas maestras del sistema." }] }),
  component: Catalogos,
});

function Catalogos() {
  const { data: me } = useMe();
  if (!me?.isAdmin && !me?.can("catalogos_editar")) return <p className="text-muted-foreground">No tiene permiso para gestionar catálogos.</p>;
  return (
    <div>
      <PageHeader title="Catálogos" desc="Listas cerradas para estandarizar el ingreso de datos. Los ítems en uso no se pueden eliminar; solo desactivar." />
      <Tabs defaultValue="marca">
        <TabsList className="flex-wrap">{CATALOGOS.map((c) => <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>)}</TabsList>
        {CATALOGOS.map((c) => <TabsContent key={c.id} value={c.id}><Lista tipo={c.id} /></TabsContent>)}
      </Tabs>
    </div>
  );
}

function Lista({ tipo }: { tipo: CatalogoTipo }) {
  const qc = useQueryClient();
  const fn = useServerFn(gestionarCatalogo);
  const { byTipo } = useCatalogos();
  const items = byTipo(tipo, false);
  const [nuevo, setNuevo] = useState("");
  const [edit, setEdit] = useState<{ id: string; nombre: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["catalogos"] });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const nombre = nuevo.trim();
    if (!nombre) return;
    try {
      const r = await fn({ data: { accion: "crear", tipo, nombre } });
      if ("error" in r && r.error) return toast.error(r.error);
      setNuevo(""); refresh();
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function guardar() {
    if (!edit?.nombre.trim()) return;
    try {
      const r = await fn({ data: { accion: "renombrar", id: edit.id, nombre: edit.nombre.trim() } });
      if ("error" in r && r.error) return toast.error(r.error);
      setEdit(null); refresh();
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function toggle(id: string, activo: boolean) {
    try {
      const r = await fn({ data: { accion: "toggle", id, activo } });
      if ("error" in r && r.error) return toast.error(r.error);
      refresh();
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este ítem?")) return;
    try {
      const r = await fn({ data: { accion: "eliminar", id } });
      if ("error" in r && r.error) return toast.error(r.error);
      refresh();
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <div className="mt-4 max-w-2xl rounded-md border border-border bg-card">
      <form onSubmit={crear} className="flex gap-2 border-b border-border p-4">
        <Input placeholder="Nuevo ítem" value={nuevo} onChange={(e) => setNuevo(e.target.value)} maxLength={100} />
        <Button type="submit">Agregar</Button>
      </form>
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            {edit?.id === i.id ? (
              <>
                <Input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className="h-8" />
                <Button size="icon" variant="ghost" onClick={guardar} aria-label="Guardar"><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEdit(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className={i.activo ? "flex-1" : "flex-1 text-muted-foreground line-through"}>{i.nombre}</span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {i.activo ? "Activo" : "Inactivo"}
                  <Switch checked={i.activo} onCheckedChange={(v) => toggle(i.id, v)} />
                </label>
                <Button size="icon" variant="ghost" onClick={() => setEdit({ id: i.id, nombre: i.nombre })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => eliminar(i.id)} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </li>
        ))}
        {!items.length && <li className="px-4 py-6 text-sm text-muted-foreground">Sin ítems todavía.</li>}
      </ul>
    </div>
  );
}
