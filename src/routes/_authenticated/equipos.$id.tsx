import { FinalizarReparacion } from "@/components/FinalizarReparacion";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { adjuntarFirmaTecnico } from "@/lib/ajustes.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg, fmtFecha } from "@/lib/constantes";
import { PageHeader, EstadoEquipo } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTablePagination, usePaginacion } from "@/components/DataTablePagination";
import { ChevronDown, ShieldCheck, ShieldOff, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_SERVICIO, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";

export const Route = createFileRoute("/_authenticated/equipos/$id")({
  head: () => ({ meta: [{ title: "Ficha del equipo — Finesa" }, { name: "description", content: "Datos e historial del equipo." }] }),
  component: FichaEquipo,
});

const EVENTOS: Record<string, string> = {
  ingreso: "Ingreso", entrega: "Entrega", devolucion: "Devolución", en_reparacion: "En reparación", de_baja: "De baja", cambio: "Acta de cambio", alistado: "Alistamiento terminado", en_alistamiento: "En alistamiento", falla_reportada: "Falla reportada", falla_atendido: "Falla atendida", falla_descartado: "Falla descartada", falla_en_reparacion: "Falla → reparación",
  disponible: "Disponible", correccion_serie: "Corrección de serie", acta_anulada: "Acta anulada", carga_inicial: "Asignación por carga inicial",
  asignacion: "Cambio de responsable", edicion: "Cambio de datos", asignado: "Asignado",
};

function FichaEquipo() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const cat = useCatalogos();
  const q = useQuery({
    queryKey: ["equipo", id],
    queryFn: async () => {
      const [e, h] = await Promise.all([
        supabase.from("equipos").select("*, empleado:empleados(id, nombre)").eq("id", id).maybeSingle(),
        supabase.from("equipo_historial").select("*").eq("equipo_id", id).order("created_at", { ascending: false }),
      ]);
      if (e.error) throw e.error;
      const ids = [...new Set((h.data ?? []).map((x) => x.user_id).filter(Boolean))] as string[];
      const { data: ps } = ids.length ? await supabase.from("profiles").select("id, nombre, email").in("id", ids) : { data: [] };
      const usuarios = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nombre || p.email]));
      return { e: e.data, h: h.data ?? [], usuarios };
    },
  });
  const e = q.data?.e;
  if (q.isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (!e) return <p className="text-muted-foreground">Equipo no encontrado.</p>;

  async function verFactura() {
    const { data, error } = await supabase.storage.from("facturas").createSignedUrl(e!.factura_path!, 120);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  const emp = e.empleado as { id: string; nombre: string } | null;
  return (
    <div>
      <PageHeader title={e.serie} desc={`${cat.nombre(e.tipo_id)} · ${cat.nombre(e.marca_id)} ${e.modelo ?? ""}`}>
        <EstadoEquipo estado={e.estado} />
        {e.prestamo_hasta && e.estado === "asignado" && <span className="inline-flex items-center rounded border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs font-medium">Préstamo hasta {fmtFecha(e.prestamo_hasta)}</span>}
        {me?.can("equipos_editar") && <EditarEquipo e={e} />}
        {me?.can("equipos_editar") && e.estado === "en_reparacion" && <FinalizarReparacion id={e.id} empleado={emp?.nombre ?? null} />}
        {me?.can("equipos_editar") && (e.estado as string) === "en_alistamiento" && <MarcarListo id={e.id} />}
        {me?.can("equipos_editar") && e.estado !== "de_baja" && !(e.estado === "en_reparacion" && !me?.isAdmin) && <CambiarEstado id={e.id} actual={e.estado} admin={!!me?.isAdmin} empleadoId={emp?.id ?? null} tecnicoId={me!.id} puedeEntregar={!!me?.can("actas_entrega")} />}
        {me?.isAdmin && <CorregirSerie id={e.id} serie={e.serie} />}
      </PageHeader>
      <GarantiaYReparacion e={e} />
      <div className="grid gap-6 lg:grid-cols-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-card p-5 text-sm lg:col-span-1">
          <Dato k="Sede" v={cat.nombre(e.sede_id)} />
          <Dato k="Asignado a" v={emp ? <Link to="/empleados/$id" params={{ id: emp.id }} className="text-primary hover:underline">{emp.nombre}</Link> : "—"} />
          <Dato k="Fecha de ingreso" v={fmtFecha(e.fecha_ingreso)} />
          <Dato k="Fin de garantía" v={fmtFecha(e.garantia_fin)} />
          <Dato k="Proveedor" v={e.proveedor ?? "—"} />
          <Dato k="Valor de compra" v={e.valor_compra != null ? `$${Number(e.valor_compra).toLocaleString("es-CO")}` : "—"} />
          <Dato k="Código interno" v={e.codigo_interno ? "Sí" : "No"} />
          <Dato k="Activo fijo" v={e.activo_fijo ?? "—"} />
          <Dato k="Año de compra" v={e.anio_compra ?? "—"} />
          <Dato k="Nombre de equipo" v={e.nombre_equipo ?? "—"} />
          <Dato k="Factura" v={e.factura_numero ?? "—"} />
          <div className="col-span-2"><Dato k="Sistema operativo" v={e.sistema_operativo ?? "—"} /></div>
          <div className="col-span-2"><Dato k="Novedad" v={e.novedad ?? "—"} /></div>
          <div className="col-span-2"><dt className="text-xs text-muted-foreground">Observaciones</dt><dd className="whitespace-pre-wrap">{e.observaciones || "—"}</dd></div>
          {e.factura_path && <div className="col-span-2"><Button size="sm" variant="outline" onClick={verFactura}>Ver factura</Button></div>}
        </dl>
        <div className="rounded-md border border-border bg-card lg:col-span-2">
          <div className="border-b border-border px-5 py-3 font-medium">Historial de cambios ({q.data!.h.length})</div>
          <Timeline h={q.data!.h} usuarios={q.data!.usuarios} />
        </div>
      </div>
    </div>
  );
}

type Hist = { id: string; evento: string; detalle: string | null; acta_id: string | null; user_id: string | null; created_at: string };

function Timeline({ h, usuarios }: { h: Hist[]; usuarios: Record<string, string> }) {
  const pag = usePaginacion();
  const visibles = h.slice(pag.desde, pag.desde + pag.tamano);
  if (!h.length) return <p className="p-5 text-sm text-muted-foreground">Sin movimientos registrados.</p>;
  return (
    <div className="p-5">
      <ol className="relative">
        {visibles.map((x) => (
          <li key={x.id} className="relative border-l-2 border-accent pb-3 pl-5 last:pb-0">
            <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-primary" />
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-start justify-between gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/50">
                <div>
                  <div className="text-sm font-medium">{EVENTOS[x.evento] ?? x.evento}</div>
                  <div className="text-xs text-muted-foreground">{fmtFecha(x.created_at, true)} · {x.user_id ? (usuarios[x.user_id] ?? "Usuario") : "Sistema"}</div>
                </div>
                {(x.detalle || x.acta_id) && <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />}
              </CollapsibleTrigger>
              {(x.detalle || x.acta_id) && (
                <CollapsibleContent className="px-1 pb-1">
                  {x.detalle && <div className="mt-1 rounded bg-muted/50 p-2 text-sm text-muted-foreground">{x.detalle.replace(/en_reparacion/g, "en reparación").replace(/de_baja/g, "de baja")}</div>}
                  {x.acta_id && <Link to="/actas/$id" params={{ id: x.acta_id }} className="mt-1 inline-block text-xs text-primary hover:underline">Ver acta</Link>}
                </CollapsibleContent>
              )}
            </Collapsible>
          </li>
        ))}
      </ol>
      {h.length > 10 && <DataTablePagination total={h.length} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{k}</dt><dd>{v}</dd></div>;
}

type Eq = {
  id: string; modelo: string | null; marca_id: string | null; sede_id: string | null; tipo_id: string | null;
  proveedor: string | null; garantia_fin: string | null; observaciones: string | null;
  activo_fijo: string | null; nombre_equipo: string | null; sistema_operativo: string | null;
  factura_numero: string | null; anio_compra: number | null; novedad: string | null; fecha_ingreso: string | null;
  valor_compra: number | null; proveedor_id: string | null;
};

function EditarEquipo({ e }: { e: Eq }) {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const [open, setOpen] = useState(false);
  const provs = useQuery({ queryKey: ["proveedores_lista"], enabled: open, queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [] });
  const [f, setF] = useState({
    modelo: e.modelo ?? "", marca_id: e.marca_id ?? "", sede_id: e.sede_id ?? "", tipo_id: e.tipo_id ?? "",
    proveedor_id: e.proveedor_id ?? "", garantia_fin: e.garantia_fin ?? "", observaciones: e.observaciones ?? "",
    activo_fijo: e.activo_fijo ?? "", nombre_equipo: e.nombre_equipo ?? "", sistema_operativo: e.sistema_operativo ?? "",
    factura_numero: e.factura_numero ?? "", anio_compra: e.anio_compra ? String(e.anio_compra) : "", novedad: e.novedad ?? "",
    fecha_ingreso: e.fecha_ingreso ?? "", valor_compra: e.valor_compra != null ? String(e.valor_compra) : "",
  });
  async function guardar() {
    const anio = f.anio_compra.trim() ? parseInt(f.anio_compra.trim(), 10) : null;
    if (anio !== null && (isNaN(anio) || anio < 1990 || anio > 2100)) return toast.error("Año de compra inválido");
    const valor = f.valor_compra.trim() ? Number(f.valor_compra) : null;
    if (valor !== null && (!isFinite(valor) || valor < 0)) return toast.error("Valor de compra inválido");
    const provNombre = f.proveedor_id ? provs.data?.find((p) => p.id === f.proveedor_id)?.nombre ?? e.proveedor : e.proveedor_id ? null : e.proveedor;
    const { error } = await supabase.from("equipos").update({
      modelo: f.modelo || null, marca_id: f.marca_id || null, sede_id: f.sede_id || null,
      proveedor_id: f.proveedor_id || null, proveedor: provNombre, valor_compra: valor,
      garantia_fin: f.garantia_fin || null, observaciones: f.observaciones || null,
      activo_fijo: f.activo_fijo.trim() || null, nombre_equipo: f.nombre_equipo.trim() || null,
      sistema_operativo: f.sistema_operativo.trim() || null, factura_numero: f.factura_numero.trim() || null,
      anio_compra: anio, novedad: f.novedad.trim() || null, ...(f.fecha_ingreso ? { fecha_ingreso: f.fecha_ingreso } : {}),
      ...(f.tipo_id ? { tipo_id: f.tipo_id } : {}),
    }).eq("id", e.id);
    if (error) return toast.error(error.code === "23505" ? "Ese activo fijo ya existe en otro equipo." : errMsg(error));
    toast.success("Equipo actualizado"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", e.id] }); qc.invalidateQueries({ queryKey: ["equipos"] });
  }
  const s = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Editar</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar equipo</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Tipo de equipo</Label><select className={s} value={f.tipo_id} onChange={(x) => setF({ ...f, tipo_id: x.target.value })}><option value="">—</option>{cat.byTipo("tipo_equipo").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="space-y-1"><Label>Marca</Label><select className={s} value={f.marca_id} onChange={(x) => setF({ ...f, marca_id: x.target.value })}><option value="">—</option>{cat.byTipo("marca").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="space-y-1"><Label>Modelo</Label><Input value={f.modelo} onChange={(x) => setF({ ...f, modelo: x.target.value })} /></div>
          <div className="space-y-1"><Label>Activo fijo</Label><Input value={f.activo_fijo} onChange={(x) => setF({ ...f, activo_fijo: x.target.value })} /></div>
          <div className="space-y-1"><Label>Nombre de equipo</Label><Input value={f.nombre_equipo} onChange={(x) => setF({ ...f, nombre_equipo: x.target.value })} /></div>
          <div className="space-y-1"><Label>Sistema operativo</Label><Input value={f.sistema_operativo} onChange={(x) => setF({ ...f, sistema_operativo: x.target.value })} /></div>
          <div className="space-y-1"><Label>Sede</Label><select className={s} value={f.sede_id} onChange={(x) => setF({ ...f, sede_id: x.target.value })}><option value="">—</option>{cat.byTipo("sede").map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div className="space-y-1"><Label>Proveedor</Label><select className={s} value={f.proveedor_id} onChange={(x) => setF({ ...f, proveedor_id: x.target.value })}><option value="">{e.proveedor && !e.proveedor_id ? `${e.proveedor} (texto anterior)` : "—"}</option>{(provs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="space-y-1"><Label>Valor de compra (COP)</Label><Input type="number" min={0} value={f.valor_compra} onChange={(x) => setF({ ...f, valor_compra: x.target.value })} /></div>
          <div className="space-y-1"><Label>Número de factura</Label><Input value={f.factura_numero} onChange={(x) => setF({ ...f, factura_numero: x.target.value })} /></div>
          <div className="space-y-1"><Label>Año de compra</Label><Input inputMode="numeric" value={f.anio_compra} onChange={(x) => setF({ ...f, anio_compra: x.target.value })} /></div>
          <div className="space-y-1"><Label>Fecha de ingreso</Label><Input type="date" value={f.fecha_ingreso} onChange={(x) => setF({ ...f, fecha_ingreso: x.target.value })} /></div>
          <div className="space-y-1"><Label>Fin de garantía</Label><Input type="date" value={f.garantia_fin} onChange={(x) => setF({ ...f, garantia_fin: x.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Novedad</Label><Input value={f.novedad} onChange={(x) => setF({ ...f, novedad: x.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Observaciones</Label><Textarea value={f.observaciones} onChange={(x) => setF({ ...f, observaciones: x.target.value })} /></div>
          <p className="text-xs text-muted-foreground sm:col-span-2">La serie no es editable. El Administrador puede corregirla indicando un motivo.</p>
        </div>
        <DialogFooter><Button onClick={guardar}>Guardar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GarantiaYReparacion({ e }: { e: { garantia_fin: string | null; proveedor_id: string | null; proveedor: string | null; estado: string; reparacion_proveedor_id: string | null; reparacion_inicio: string | null } }) {
  const ids = [e.proveedor_id, e.reparacion_proveedor_id].filter(Boolean) as string[];
  const q = useQuery({ queryKey: ["proveedor", "equipo", ...ids], enabled: ids.length > 0, queryFn: async () => ((await supabase.from("proveedores").select("*").in("id", ids)).data ?? []) as Prov[] });
  const compra = q.data?.find((p) => p.id === e.proveedor_id);
  const rep = q.data?.find((p) => p.id === e.reparacion_proveedor_id);
  const hoy = new Date().toISOString().slice(0, 10);
  const nombreProv = compra?.nombre ?? e.proveedor;
  const mes = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { month: "short", year: "numeric" });
  return (
    <div className="mb-4 space-y-3">
      {e.garantia_fin && (
        e.garantia_fin >= hoy
          ? <Badge className="bg-success text-success-foreground hover:bg-success"><ShieldCheck className="mr-1 h-3.5 w-3.5" />En garantía{nombreProv ? ` con ${nombreProv}` : ""} hasta {mes(e.garantia_fin)}</Badge>
          : <Badge variant="secondary"><ShieldOff className="mr-1 h-3.5 w-3.5" />Garantía vencida desde {mes(e.garantia_fin)}</Badge>
      )}
      {e.estado === "en_reparacion" && rep && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
          <div><Wrench className="mr-1 inline h-4 w-4" />En reparación con <b>{rep.nombre}</b>{e.reparacion_inicio ? ` desde ${fmtFecha(e.reparacion_inicio)}` : ""}{rep.contacto_nombre ? ` · Asesor: ${rep.contacto_nombre}` : ""}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <ContactoProveedor p={rep} compacto />
          </div>
        </div>
      )}
    </div>
  );
}

function MarcarListo({ id }: { id: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nota, setNota] = useState("");
  async function guardar() {
    const { error } = await supabase.rpc("marcar_alistado", { p_equipo: id, p_nota: nota.trim() });
    if (error) return toast.error(errMsg(error));
    toast.success("Equipo disponible"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", id] }); qc.invalidateQueries({ queryKey: ["equipos"] }); qc.invalidateQueries({ queryKey: ["panel"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Marcar como listo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Alistamiento terminado</DialogTitle></DialogHeader>
        <div className="space-y-1"><Label>Nota (copia, formateo, limpieza…)</Label><Textarea value={nota} onChange={(e) => setNota(e.target.value)} /></div>
        <DialogFooter><Button onClick={guardar}>Dejar disponible</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CambiarEstado({ id, actual, admin, empleadoId, tecnicoId, puedeEntregar }: { id: string; actual: string; admin: boolean; empleadoId: string | null; tecnicoId: string; puedeEntregar: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const adjuntar = useServerFn(adjuntarFirmaTecnico);
  const [conting, setConting] = useState(false);
  const [contEq, setContEq] = useState("");
  const [contHasta, setContHasta] = useState(new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  const [buscaC, setBuscaC] = useState("");
  const puedeConting = actual === "asignado" && !!empleadoId && puedeEntregar;
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState(actual === "en_reparacion" ? "de_baja" : "en_reparacion");
  const [motivo, setMotivo] = useState("");
  const [prov, setProv] = useState("");
  const servicio = useQuery({ queryKey: ["proveedores_lista", "servicio"], enabled: open, queryFn: async () => (await supabase.from("proveedores").select("id, nombre").eq("activo", true).contains("etiquetas", [ETIQUETA_SERVICIO]).order("nombre")).data ?? [] });
  async function guardar() {
    if (!motivo.trim()) return toast.error("El motivo es obligatorio");
    const usarC = estado === "en_reparacion" && conting && puedeConting;
    if (usarC && !contEq) return toast.error("Seleccione el equipo de contingencia");
    const { error } = await supabase.rpc("cambiar_estado_equipo", { p_equipo: id, p_estado: estado as "disponible", p_motivo: motivo.trim(), ...(estado === "en_reparacion" && prov ? { p_proveedor: prov } : {}) });
    if (error) return toast.error(errMsg(error));
    toast.success("Estado actualizado"); setOpen(false); setMotivo(""); setProv("");
    qc.invalidateQueries({ queryKey: ["equipo", id] }); qc.invalidateQueries({ queryKey: ["equipos"] }); qc.invalidateQueries({ queryKey: ["proveedor"] });
    if (usarC) {
      const { data: acta, error: e1 } = await supabase.from("actas").insert({ tipo: "entrega", empleado_id: empleadoId!, tecnico_id: tecnicoId, es_prestamo: true, prestamo_hasta: contHasta, prestamo_reparacion_equipo_id: id, observaciones: "Equipo de contingencia mientras se repara su equipo." }).select("id").single();
      if (e1) return toast.error("No se pudo crear el préstamo: " + errMsg(e1));
      const { error: e2 } = await supabase.from("acta_items").insert({ acta_id: acta.id, equipo_id: contEq, direccion: "entrega", estado_fisico: "Bueno" });
      if (e2) return toast.error("No se pudo crear el préstamo: " + errMsg(e2));
      try { await adjuntar({ data: { actaId: acta.id } }); } catch { /* opcional */ }
      toast.success("Acta de préstamo creada. Proceda con la firma.");
      nav({ to: "/actas/$id", params: { id: acta.id } });
    }
  }
  const disp = useQuery({ queryKey: ["equipos", "disponibles-cont"], enabled: open && conting, queryFn: async () => (await supabase.from("equipos").select("id, serie, modelo, tipo_id, activo_fijo").eq("estado", "disponible").order("created_at", { ascending: false }).limit(1000)).data ?? [] });
  const catC = useCatalogos();
  const listaC = (disp.data ?? []).filter((x) => !buscaC || [x.serie, x.modelo, x.activo_fijo, catC.nombre(x.tipo_id)].some((v) => (v ?? "").toLowerCase().includes(buscaC.toLowerCase()))).slice(0, 50);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Cambiar estado</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cambiar estado</DialogTitle></DialogHeader>
        <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={estado} onChange={(e) => setEstado(e.target.value)}>
          {actual !== "disponible" && actual !== "en_reparacion" && (actual !== "asignado" || admin) && <option value="disponible">Disponible</option>}
          {actual !== "en_reparacion" && <option value="en_reparacion">En reparación{actual === "asignado" ? " (sigue ligado al empleado)" : ""}</option>}
          {admin && <option value="de_baja">De baja (definitivo)</option>}
        </select>
        {estado === "en_reparacion" && (
          <div className="space-y-1"><Label>Proveedor de servicio técnico</Label>
            <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={prov} onChange={(e) => setProv(e.target.value)}>
              <option value="">— Interno / sin proveedor —</option>
              {(servicio.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            {servicio.data && !servicio.data.length && <p className="text-xs text-muted-foreground">No hay proveedores con el tipo "Servicio Técnico / Reparaciones".</p>}
          </div>
        )}
        {estado === "en_reparacion" && puedeConting && (
          <div className="space-y-2 rounded border border-border p-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={conting} onChange={(e) => setConting(e.target.checked)} />¿Asignar un equipo de contingencia temporal al empleado?</label>
            {conting && (<>
              <Input placeholder="Buscar serie, modelo, tipo…" value={buscaC} onChange={(e) => setBuscaC(e.target.value)} />
              <select className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm" value={contEq} onChange={(e) => setContEq(e.target.value)}>
                <option value="">— Seleccione equipo disponible —</option>
                {listaC.map((x) => <option key={x.id} value={x.id}>{catC.nombre(x.tipo_id)} {x.modelo ?? ""} · {x.serie}</option>)}
              </select>
              <div className="space-y-1"><Label>Fecha estimada de devolución</Label><Input type="date" value={contHasta} onChange={(e) => setContHasta(e.target.value)} /></div>
            </>)}
          </div>
        )}
        <div className="space-y-1"><Label>Motivo *</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter><Button onClick={guardar} variant={estado === "de_baja" ? "destructive" : "default"}>Confirmar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorregirSerie({ id, serie }: { id: string; serie: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nueva, setNueva] = useState(serie);
  const [motivo, setMotivo] = useState("");
  async function guardar() {
    const { error } = await supabase.rpc("corregir_serie", { p_equipo: id, p_serie: nueva, p_motivo: motivo });
    if (error) return toast.error(error.code === "23505" ? "Esa serie ya existe." : errMsg(error));
    toast.success("Serie corregida"); setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", id] }); qc.invalidateQueries({ queryKey: ["equipos"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost">Corregir serie</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Corregir número de serie</DialogTitle></DialogHeader>
        <div className="space-y-1"><Label>Nueva serie</Label><Input value={nueva} onChange={(e) => setNueva(e.target.value)} /></div>
        <div className="space-y-1"><Label>Motivo de la corrección *</Label><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
        <DialogFooter><Button onClick={guardar} disabled={!motivo.trim() || !nueva.trim()}>Corregir</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
