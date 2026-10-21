import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { TIPO_ACTA, errMsg, fmtFecha } from "@/lib/constantes";
import { habilitarAccesoEmpleado, retirarEmpleado } from "@/lib/usuarios.functions";
import { PageHeader, EstadoActa, EstadoEquipo } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { FormEmpleado } from "./empleados.index";
import { toast } from "sonner";
import { copiarTexto } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/empleados/$id")({
  head: () => ({ meta: [{ title: "Perfil del empleado — Finesa" }, { name: "description", content: "Equipos y actas del empleado." }] }),
  component: PerfilEmpleado,
});

function PerfilEmpleado() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const habilitar = useServerFn(habilitarAccesoEmpleado);
  const retirar = useServerFn(retirarEmpleado);
  const q = useQuery({
    queryKey: ["empleado", id],
    queryFn: async () => {
      const [e, eq, ac] = await Promise.all([
        supabase.from("empleados").select("*").eq("id", id).maybeSingle(),
        supabase.from("equipos").select("*").eq("empleado_id", id),
        supabase.from("actas").select("*").eq("empleado_id", id).order("created_at", { ascending: false }),
      ]);
      return { e: e.data, equipos: eq.data ?? [], actas: ac.data ?? [] };
    },
  });
  const e = q.data?.e;
  if (q.isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!e) return <p className="text-muted-foreground">Empleado no encontrado.</p>;
  const asignados = q.data!.equipos.filter((x) => x.estado === "asignado");

  async function onHabilitar() {
    if (e?.user_id && !confirm("Se generará un PIN nuevo y el anterior dejará de funcionar. ¿Continuar?")) return;
    try {
      const r = await habilitar({ data: { empleadoId: id } });
      if ("error" in r) return toast.error(r.error);
      const texto = `Portal Finesa — Cédula: ${r.cedula} · PIN: ${r.pin}`;
      await copiarTexto(texto);
      toast.success(`PIN de acceso: ${r.pin}`, { description: "Copiado al portapapeles. Entréguelo al empleado: ingresa con su cédula y este PIN.", duration: 30000 });
      qc.invalidateQueries({ queryKey: ["empleado", id] });
    } catch (x) { toast.error(errMsg(x)); }
  }
  async function onRetirar() {
    if (asignados.length) return toast.error(`Paz y salvo pendiente: el empleado tiene ${asignados.length} equipo(s) asignado(s). Realice primero el acta de devolución.`);
    if (!confirm("¿Marcar al empleado como inactivo? Se conservará su historial.")) return;
    try { const r = await retirar({ data: { empleadoId: id } }); if ("error" in r && r.error) { toast.error(r.error); return; } toast.success("Empleado retirado"); qc.invalidateQueries({ queryKey: ["empleado", id] }); qc.invalidateQueries({ queryKey: ["empleados"] }); }
    catch (x) { toast.error(errMsg(x)); }
  }
  async function reactivar() {
    const { error } = await supabase.from("empleados").update({ activo: true }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    qc.invalidateQueries({ queryKey: ["empleado", id] });
  }

  return (
    <div>
      <PageHeader title={e.nombre} desc={`C.C. ${e.identificacion} · ${e.cargo ?? "Sin cargo"} · ${cat.nombre(e.area_id)} · ${cat.nombre(e.sede_id)}`}>
        {!e.activo && <span className="rounded border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">Inactivo</span>}
        {me?.can("empleados_editar") && (
          <>
            <FormEmpleado inicial={{ id: e.id, nombre: e.nombre, identificacion: e.identificacion, email: e.email ?? "", cargo: e.cargo ?? "", area_id: e.area_id ?? "", sede_id: e.sede_id ?? "", empresa_id: e.empresa_id ?? "" }} />
            {e.activo && <Button variant="outline" onClick={onHabilitar}>{e.user_id ? "Generar nuevo PIN" : "Habilitar acceso al portal"}</Button>}
            {e.activo ? <Button variant="destructive" onClick={onRetirar}>Retirar</Button> : <Button variant="secondary" onClick={reactivar}>Reactivar</Button>}
          </>
        )}
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-5 py-3 font-medium">Equipos actuales ({asignados.length})</div>
          <ul className="divide-y divide-border">
            {asignados.map((x) => (
              <li key={x.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link to="/equipos/$id" params={{ id: x.id }} className="hover:underline">{cat.nombre(x.tipo_id)} {cat.nombre(x.marca_id)} {x.modelo} <span className="font-mono text-xs text-muted-foreground">{x.serie}</span></Link>
                <EstadoEquipo estado={x.estado} />
              </li>
            ))}
            {!asignados.length && <li className="px-5 py-6 text-sm text-muted-foreground">Sin equipos asignados. Paz y salvo.</li>}
          </ul>
        </section>
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-5 py-3 font-medium">Historial de actas</div>
          <ul className="divide-y divide-border">
            {q.data!.actas.map((a) => (
              <li key={a.id}>
                <Link to="/actas/$id" params={{ id: a.id }} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-muted">
                  <span><span className="font-mono text-xs text-muted-foreground">#{a.numero}</span> {TIPO_ACTA[a.tipo]} · {fmtFecha(a.created_at)}</span>
                  <EstadoActa estado={a.estado} />
                </Link>
              </li>
            ))}
            {!q.data!.actas.length && <li className="px-5 py-6 text-sm text-muted-foreground">Sin actas.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
