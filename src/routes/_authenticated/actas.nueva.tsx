import { fetchAll } from "@/lib/fetchAll";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { adjuntarFirmaTecnico, obtenerMiFirma } from "@/lib/ajustes.functions";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, DESTINO_DEVOLUCION } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/actas/nueva")({
  head: () => ({ meta: [{ title: "Nueva acta — Finesa" }, { name: "description", content: "Crear acta de entrega o devolución." }] }),
  component: NuevaActa,
});

function NuevaActa() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const nav = useNavigate();
  const [tipo, setTipo] = useState<"entrega" | "devolucion" | "cambio">(me?.can("actas_entrega") ? "entrega" : "devolucion");
  const [empleadoId, setEmpleadoId] = useState("");
  const [buscaEmp, setBuscaEmp] = useState("");
  const [buscaEq, setBuscaEq] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fMarca, setFMarca] = useState("");
  const [fSede, setFSede] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [det, setDet] = useState<Record<string, { estado_fisico: string; accesorios: string; nota: string; destino?: string }>>({});
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const adjuntar = useServerFn(adjuntarFirmaTecnico);
  const verFirma = useServerFn(obtenerMiFirma);
  const miFirma = useQuery({ queryKey: ["mi-firma"], queryFn: () => verFirma() });

  const emps = useQuery({ queryKey: ["empleados"], queryFn: () => fetchAll((a, b) => supabase.from("empleados").select("*").order("nombre").order("id").range(a, b)) });
  const eqs = useQuery({ queryKey: ["equipos"], queryFn: () => fetchAll((a, b) => supabase.from("equipos").select("*, empleado:empleados(id, nombre)").order("created_at", { ascending: false }).order("id").range(a, b)) });

  const empleados = (emps.data ?? []).filter((e) => (tipo === "devolucion" || e.activo) && (!buscaEmp || e.nombre.toLowerCase().includes(buscaEmp.toLowerCase()) || e.identificacion.includes(buscaEmp)));
  const disponibles = useMemo(() => {
    const t = buscaEq.toLowerCase();
    return (eqs.data ?? []).filter((e) =>
      (tipo === "entrega" ? e.estado === "disponible" : tipo === "devolucion" ? e.estado === "asignado" && e.empleado_id === empleadoId : (e.estado === "disponible" || (e.estado === "asignado" && e.empleado_id === empleadoId))) &&
      (!fTipo || e.tipo_id === fTipo) && (!fMarca || e.marca_id === fMarca) && (!fSede || e.sede_id === fSede) &&
      (!t || [e.serie, e.modelo, e.activo_fijo, e.nombre_equipo].some((v) => (v ?? "").toLowerCase().includes(t)))).slice(0, 300);
  }, [eqs.data, tipo, empleadoId, buscaEq, fTipo, fMarca, fSede]);
  const eqPorId = useMemo(() => new Map((eqs.data ?? []).map((e) => [e.id, e])), [eqs.data]);
  const dirDe = (id: string) => tipo === "cambio" ? (eqPorId.get(id)?.estado === "asignado" ? "devolucion" : "entrega") : tipo;
  const setD = (id: string, k: "estado_fisico" | "accesorios" | "nota" | "destino", v: string) => setDet((d) => ({ ...d, [id]: { ...(d[id] ?? { estado_fisico: "Bueno", accesorios: "", nota: "" }), [k]: v } }));

  if (!me?.can("actas_entrega") && !me?.can("actas_devolucion")) return <p className="text-muted-foreground">No tiene permiso para crear actas.</p>;

  async function crear() {
    if (!empleadoId) return toast.error("Seleccione un empleado");
    if (!sel.length) return toast.error("Seleccione al menos un equipo");
    if (tipo === "cambio" && (!sel.some((i) => dirDe(i) === "entrega") || !sel.some((i) => dirDe(i) === "devolucion"))) return toast.error("Un cambio necesita al menos un equipo que devuelve y uno que recibe");
    setLoading(true);
    try {
      const { data: acta, error } = await supabase.from("actas").insert({ tipo, empleado_id: empleadoId, tecnico_id: me!.id, observaciones: obs || null }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("acta_items").insert(sel.map((equipo_id) => {
        const d = det[equipo_id];
        const dir = dirDe(equipo_id);
        return { acta_id: acta.id, equipo_id, direccion: dir, estado_destino: dir === "devolucion" ? (d?.destino ?? "disponible") : "disponible", estado_fisico: d?.estado_fisico ?? "Bueno", accesorios: d?.accesorios.trim() || null, nota: d?.nota.trim() || null };
      }));
      if (e2) throw e2;
      try { await adjuntar({ data: { actaId: acta.id } }); } catch { /* la firma del técnico es opcional */ }
      toast.success("Acta creada. Proceda con la firma.");
      nav({ to: "/actas/$id", params: { id: acta.id } });
    } catch (e) { toast.error(errMsg(e)); } finally { setLoading(false); }
  }

  const empSel = emps.data?.find((e) => e.id === empleadoId);
  const fs = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm";
  return (
    <div className="max-w-4xl">
      <PageHeader title="Nueva acta" desc="Seleccione empleado y equipos. El estado de los equipos cambia solo cuando el acta queda firmada." />
      {miFirma.data && !miFirma.data.url && <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">No tiene una firma registrada; el acta saldrá sin firma del técnico. <Link to="/ajustes" search={{ tab: "firma" }} className="font-medium text-primary underline">Registrar mi firma</Link></div>}
      <div className="mb-6 inline-flex rounded-md border border-border bg-card p-1">
        {me.can("actas_entrega") && <button onClick={() => { setTipo("entrega"); setSel([]); }} className={`rounded px-4 py-1.5 text-sm ${tipo === "entrega" ? "bg-primary text-primary-foreground" : ""}`}>Entrega</button>}
        {me.can("actas_devolucion") && <button onClick={() => { setTipo("devolucion"); setSel([]); }} className={`rounded px-4 py-1.5 text-sm ${tipo === "devolucion" ? "bg-primary text-primary-foreground" : ""}`}>Devolución</button>}
        {me.can("actas_entrega") && me.can("actas_devolucion") && <button onClick={() => { setTipo("cambio"); setSel([]); }} className={`rounded px-4 py-1.5 text-sm ${tipo === "cambio" ? "bg-primary text-primary-foreground" : ""}`}>Cambio de equipo</button>}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-4">
          <Label className="mb-2 block">1. Empleado {tipo === "entrega" && "(solo activos)"}</Label>
          <Input placeholder="Buscar…" value={buscaEmp} onChange={(e) => setBuscaEmp(e.target.value)} className="mb-2" />
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded border border-border">
            {empleados.map((e) => (
              <li key={e.id}>
                <button onClick={() => { setEmpleadoId(e.id); setSel([]); }} className={`w-full px-3 py-2 text-left text-sm hover:bg-muted ${empleadoId === e.id ? "bg-accent" : ""}`}>
                  <div className="font-medium">{e.nombre}</div><div className="text-xs text-muted-foreground">{e.identificacion} · {cat.nombre(e.area_id)}</div>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-md border border-border bg-card p-4">
          <Label className="mb-2 block">2. Equipos {tipo === "entrega" ? "disponibles (puede agregar periféricos)" : tipo === "cambio" ? "— marque los que devuelve y los que recibe" : `asignados a ${empSel?.nombre ?? "…"}`}</Label>
          <Input placeholder="Buscar serie, modelo, activo fijo o nombre…" value={buscaEq} onChange={(e) => setBuscaEq(e.target.value)} className="mb-2" />
          <div className="mb-2 grid grid-cols-3 gap-2">
            <select aria-label="Tipo" className={fs} value={fTipo} onChange={(e) => setFTipo(e.target.value)}><option value="">Tipo</option>{cat.byTipo("tipo_equipo", false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            <select aria-label="Marca" className={fs} value={fMarca} onChange={(e) => setFMarca(e.target.value)}><option value="">Marca</option>{cat.byTipo("marca", false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            <select aria-label="Sede" className={fs} value={fSede} onChange={(e) => setFSede(e.target.value)}><option value="">Sede</option>{cat.byTipo("sede", false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
          </div>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded border border-border">
            {disponibles.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                  <Checkbox checked={sel.includes(e.id)} onCheckedChange={(c) => setSel(c ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />
                  <span className="flex-1">{cat.nombre(e.tipo_id)} {cat.nombre(e.marca_id)} {e.modelo}{e.activo_fijo && <span className="block text-xs text-muted-foreground">AF {e.activo_fijo}</span>}</span>
                  {tipo === "cambio" && <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${e.estado === "asignado" ? "bg-warning/20" : "bg-success/15 text-success"}`}>{e.estado === "asignado" ? "Devuelve" : "Recibe"}</span>}
                  <span className="font-mono text-xs text-muted-foreground">{e.serie}</span>
                </label>
              </li>
            ))}
            {!disponibles.length && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{tipo === "devolucion" && !empleadoId ? "Seleccione un empleado" : "Sin equipos"}</li>}
          </ul>
        </section>
      </div>
      {sel.length > 0 && (
        <section className="mt-6 rounded-md border border-border bg-card p-4">
          <Label className="mb-3 block">3. Estado de cada equipo {tipo === "entrega" ? "entregado" : tipo === "devolucion" ? "devuelto" : "entregado / devuelto"}</Label>
          <div className="space-y-3">
            {sel.map((id) => {
              const e = eqPorId.get(id); const d = det[id] ?? { estado_fisico: "Bueno", accesorios: "", nota: "" };
              return (
                <div key={id} className="grid gap-2 rounded border border-border p-3 md:grid-cols-[1.4fr_0.8fr_1fr_1fr]">
                  <div className="text-sm"><div className="font-medium">{cat.nombre(e?.tipo_id)} {cat.nombre(e?.marca_id)} {e?.modelo}</div><div className="font-mono text-xs text-muted-foreground">{e?.serie}</div>{tipo === "cambio" && <div className="text-xs font-medium">{dirDe(id) === "devolucion" ? "Devuelve" : "Recibe"}</div>}{dirDe(id) === "devolucion" && <select aria-label="Queda como" className={fs + " mt-1"} value={d.destino ?? "disponible"} onChange={(ev) => setD(id, "destino", ev.target.value)}>{Object.entries(DESTINO_DEVOLUCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</div>
                  <select aria-label="Estado físico" className={fs} value={d.estado_fisico} onChange={(ev) => setD(id, "estado_fisico", ev.target.value)}>{["Nuevo", "Bueno", "Regular", "Con daños"].map((x) => <option key={x}>{x}</option>)}</select>
                  <Input placeholder="Accesorios (cargador, maleta…)" value={d.accesorios} onChange={(ev) => setD(id, "accesorios", ev.target.value)} />
                  <Input placeholder="Nota" value={d.nota} onChange={(ev) => setD(id, "nota", ev.target.value)} />
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div className="mt-6 space-y-2">
        <Label>4. Observaciones generales</Label>
        <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Novedades generales del acta…" />
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={crear} disabled={loading}>Crear acta y continuar a la firma ({sel.length} equipo{sel.length === 1 ? "" : "s"})</Button>
      </div>
    </div>
  );
}
