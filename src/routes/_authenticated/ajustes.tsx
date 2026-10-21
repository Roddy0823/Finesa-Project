import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useMe } from "@/lib/me";
import { errMsg } from "@/lib/constantes";
import { actualizarNombre, borrarMiFirma, guardarMiFirma, obtenerMiFirma } from "@/lib/ajustes.functions";
import { PageHeader } from "@/components/Estado";
import { Certificaciones } from "@/components/Certificaciones";
import { ConfigPortalEmpleados } from "@/components/ConfigPortalEmpleados";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z.object({ tab: z.enum(["perfil", "firma", "portal", "certificacion"]).optional() });

export const Route = createFileRoute("/_authenticated/ajustes")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Ajustes — Finesa" }, { name: "description", content: "Perfil, firma y configuración del sistema." }] }),
  component: Ajustes,
});

function Ajustes() {
  const { data: me } = useMe();
  const { tab = "perfil" } = Route.useSearch();
  const nav = useNavigate({ from: "/ajustes" });
  if (!me?.isStaff) return <p className="text-muted-foreground">Los ajustes son para administradores y auxiliares.</p>;
  const tabs: [typeof tab, string][] = [
    ["perfil", "Mi perfil"],
    ["firma", "Mi firma"],
    ...(me.isAdmin
      ? ([
          ["portal", "Portal de empleados"],
          ["certificacion", "Certificación anual"],
        ] as [typeof tab, string][])
      : []),
  ];
  const actual = (tab === "certificacion" || tab === "portal") && !me.isAdmin ? "perfil" : tab;
  return (
    <div>
      <PageHeader title="Ajustes" desc="Su nombre, su firma para las actas y configuración general." />
      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => nav({ search: { tab: k } })} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${actual === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</button>
        ))}
      </div>
      {actual === "perfil" && <Perfil nombre={me.nombre} email={me.email} />}
      {actual === "firma" && <Firma />}
      {actual === "portal" && <ConfigPortalEmpleados />}
      {actual === "certificacion" && <Certificaciones admin ownerId={me.id} />}
    </div>
  );
}

function Perfil({ nombre, email }: { nombre: string; email: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(actualizarNombre);
  const [n, setN] = useState(nombre);
  const [loading, setLoading] = useState(false);
  useEffect(() => setN(nombre), [nombre]);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fn({ data: { nombre: n } });
      if ("error" in r && r.error) { toast.error(r.error); return; }
      toast.success("Nombre actualizado");
      qc.invalidateQueries({ queryKey: ["me"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }
  return (
    <form onSubmit={guardar} className="max-w-md space-y-4 rounded-md border border-border bg-card p-5">
      <div className="space-y-1.5"><Label>Correo</Label><Input value={email} disabled /></div>
      <div className="space-y-1.5"><Label>Nombre completo</Label><Input required minLength={2} value={n} onChange={(e) => setN(e.target.value)} /></div>
      <Button type="submit" disabled={loading || n.trim() === nombre}>Guardar</Button>
    </form>
  );
}

function Firma() {
  const ver = useServerFn(obtenerMiFirma);
  const guardarFn = useServerFn(guardarMiFirma);
  const borrarFn = useServerFn(borrarMiFirma);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mi-firma"], queryFn: () => ver() });
  const [firma, setFirma] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [loading, setLoading] = useState(false);
  const url = q.data?.url;

  async function guardar() {
    if (!firma) return;
    setLoading(true);
    try {
      const r = await guardarFn({ data: { firma } });
      if ("error" in r && r.error) { toast.error(r.error); return; }
      toast.success("Firma guardada. Se agregará a las actas que genere.");
      setEditar(false); setFirma(null);
      qc.invalidateQueries({ queryKey: ["mi-firma"] });
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }
  async function borrar() {
    if (!window.confirm("¿Borrar su firma registrada?")) return;
    await borrarFn();
    toast.success("Firma eliminada");
    qc.invalidateQueries({ queryKey: ["mi-firma"] });
  }

  return (
    <div className="max-w-xl space-y-4 rounded-md border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">Su firma se agrega automáticamente en el espacio "Técnico" de cada acta que usted genere.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : url && !editar ? (
        <>
          <div className="flex h-40 items-center justify-center rounded-md border border-border bg-background"><img src={url} alt="Firma registrada" className="max-h-36" /></div>
          <div className="flex gap-2"><Button onClick={() => setEditar(true)}>Reemplazar</Button><Button variant="outline" className="text-destructive" onClick={borrar}>Borrar</Button></div>
        </>
      ) : (
        <>
          <SignaturePad onChange={setFirma} />
          <div className="flex gap-2">
            <Button disabled={!firma || loading} onClick={guardar}>{loading ? "Guardando…" : "Guardar firma"}</Button>
            {url && <Button variant="outline" onClick={() => setEditar(false)}>Cancelar</Button>}
          </div>
        </>
      )}
    </div>
  );
}
