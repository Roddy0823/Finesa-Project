import { fetchAll } from "@/lib/fetchAll";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { ESTADO_EQUIPO, TIPO_ACTA, descargarCSV, fmtFecha } from "@/lib/constantes";

import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { ESTADOS_PEDIDO, pedidoAtrasado } from "@/lib/proveedores";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({ meta: [{ title: "Reportes — Finesa" }, { name: "description", content: "Exportación de inventario y actas en Excel y PDF." }] }),
  component: Reportes,
});

type Emp = { nombre: string; identificacion: string } | null;

function Reportes() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [estado, setEstado] = useState("");
  const [sede, setSede] = useState("");
  const [cargando, setCargando] = useState(false);
  const [pDesde, setPDesde] = useState(hoy.slice(0, 8) + "01");
  const [pHasta, setPHasta] = useState(hoy);
  const [pEstado, setPEstado] = useState("");
  const [pProv, setPProv] = useState("");
  const [busca, setBusca] = useState("");
  const [empId, setEmpId] = useState("");
  const [eDesde, setEDesde] = useState("");
  const [eHasta, setEHasta] = useState("");
  const [eTipo, setETipo] = useState("");
  const provs = useQuery({ queryKey: ["proveedores_lista"], queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [] });
  const emps = useQuery({
    queryKey: ["reporte_emp_busca", busca], enabled: busca.trim().length >= 2,
    queryFn: async () => { const t = busca.trim().replace(/[,%()]/g, ""); return (await supabase.from("empleados").select("id, nombre, identificacion").or(`nombre.ilike.%${t}%,identificacion.ilike.%${t}%`).order("nombre").limit(15)).data ?? []; },
  });
  if (!me?.can("reportes_exportar")) return <p className="text-muted-foreground">No tiene permiso para exportar reportes.</p>;

  async function datosInventario() {
    return fetchAll((a, b) => {
      let q = supabase.from("equipos").select("*, empleado:empleados(nombre, identificacion)").order("serie").order("id");
      if (estado) q = q.eq("estado", estado as "disponible");
      if (sede) q = q.eq("sede_id", sede);
      return q.range(a, b);
    });
  }

  async function inventario(formato: "csv" | "pdf") {
    setCargando(true);
    try {
      const data = await datosInventario();
      if (!data?.length) return toast.info("No hay datos para exportar");
      if (formato === "csv") {
        descargarCSV(`inventario_${hoy}.csv`, data.map((e) => {
          const emp = e.empleado as Emp;
          return { serie: e.serie, activo_fijo: e.activo_fijo ?? "", tipo: cat.nombre(e.tipo_id), marca: cat.nombre(e.marca_id), modelo: e.modelo ?? "", sede: cat.nombre(e.sede_id), estado: ESTADO_EQUIPO[e.estado]?.label, asignado_a: emp?.nombre ?? "", identificacion: emp?.identificacion ?? "", fecha_ingreso: e.fecha_ingreso, anio_compra: e.anio_compra ?? "", garantia_fin: e.garantia_fin ?? "", proveedor: e.proveedor ?? "", nombre_equipo: e.nombre_equipo ?? "", novedad: e.novedad ?? "" };
        }));
      } else {
        const cuenta: Record<string, number> = {};
        data.forEach((e) => { const l = ESTADO_EQUIPO[e.estado]?.label ?? e.estado; cuenta[l] = (cuenta[l] ?? 0) + 1; });
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE INVENTARIO ACTUAL",
          subtitulo: `Estado: ${estado ? ESTADO_EQUIPO[estado as "disponible"]?.label : "Todos"}  ·  Sede: ${sede ? cat.nombre(sede) : "Todas"}`,
          resumen: [`Total equipos: ${data.length}`, ...Object.entries(cuenta).map(([k, v]) => `${k}: ${v}`)],
          columnas: ["Serie", "Activo fijo", "Tipo", "Marca", "Modelo", "Sede", "Estado", "Responsable", "Cédula"],
          filas: data.map((e) => { const emp = e.empleado as Emp; return [e.serie, e.activo_fijo ?? "", cat.nombre(e.tipo_id), cat.nombre(e.marca_id), e.modelo ?? "", cat.nombre(e.sede_id), ESTADO_EQUIPO[e.estado]?.label ?? "", emp?.nombre ?? "", emp?.identificacion ?? ""]; }),
          archivo: `inventario_${hoy}.pdf`,
        });
      }
      await supabase.rpc("log_evento", { p_accion: "EXPORTAR", p_detalle: `Reporte de inventario (${formato.toUpperCase()})` });
    } catch (e) { toast.error((e as Error).message); } finally { setCargando(false); }
  }

  async function actas(formato: "csv" | "pdf") {
    setCargando(true);
    try {
      const data = await fetchAll((a, b) => supabase.from("actas").select("*, empleado:empleados(nombre, identificacion), items:acta_items(estado_fisico, equipo:equipos(serie, activo_fijo, modelo, tipo_id, marca_id))").eq("estado", "firmada").gte("firmado_at", desde).lte("firmado_at", hasta + "T23:59:59").order("firmado_at").order("id").range(a, b));
      if (!data?.length) return toast.info("No hay actas firmadas en el periodo");
      type It = { estado_fisico: string | null; equipo: { serie: string; activo_fijo: string | null; modelo: string | null; tipo_id: string; marca_id: string | null } | null };
      const filas = data.flatMap((a) => {
        const emp = a.empleado as Emp;
        const items = ((a.items ?? []) as unknown as It[]).filter((i) => i.equipo);
        return items.map((i) => ({ a, emp, e: i.equipo!, estado: i.estado_fisico ?? "" }));
      });
      const ent = data.filter((a) => a.tipo === "entrega").length;
      const eqEnt = filas.filter((f) => f.a.tipo === "entrega").length;
      if (formato === "csv") {
        descargarCSV(`actas_firmadas_${desde}_${hasta}.csv`, filas.map(({ a, emp, e, estado }) => ({
          numero_acta: a.numero, tipo: TIPO_ACTA[a.tipo], fecha_firma: fmtFecha(a.firmado_at, true), empleado: emp?.nombre ?? "", identificacion: emp?.identificacion ?? "", tecnico: a.tecnico_nombre ?? "",
          tipo_equipo: cat.nombre(e.tipo_id), marca: cat.nombre(e.marca_id), modelo: e.modelo ?? "", serie: e.serie, activo_fijo: e.activo_fijo ?? "", estado_fisico: estado, medio_firma: a.firma_medio ?? "",
        })));
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE ACTAS FIRMADAS — DETALLE DE EQUIPOS",
          subtitulo: `Periodo: ${fmtFecha(desde)} a ${fmtFecha(hasta)}`,
          resumen: [`Actas: ${data.length} (${ent} entregas, ${data.length - ent} devoluciones)`, `Equipos entregados: ${eqEnt}`, `Equipos devueltos: ${filas.length - eqEnt}`],
          columnas: ["Acta", "Tipo", "Fecha de firma", "Empleado", "Cédula", "Técnico", "Tipo equipo", "Marca", "Modelo", "Serie", "Activo fijo"],
          filas: filas.map(({ a, emp, e }) => [`#${a.numero}`, TIPO_ACTA[a.tipo], fmtFecha(a.firmado_at, true), emp?.nombre ?? "", emp?.identificacion ?? "", a.tecnico_nombre ?? "", cat.nombre(e.tipo_id), cat.nombre(e.marca_id), e.modelo ?? "", e.serie, e.activo_fijo ?? ""]),
          archivo: `actas_firmadas_${desde}_${hasta}.pdf`,
        });
      }
      await supabase.rpc("log_evento", { p_accion: "EXPORTAR", p_detalle: `Actas firmadas con detalle de equipos ${desde} a ${hasta} (${formato.toUpperCase()})` });
    } catch (e) { toast.error((e as Error).message); } finally { setCargando(false); }
  }

  async function proveedores(formato: "csv" | "pdf") {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("resumen_proveedores");
      if (error) throw error;
      if (!data?.length) return toast.info("No hay proveedores registrados");
      const filas = data.map((r) => ({ proveedor: r.nombre, equipos: Number(r.equipos), en_garantia: Number(r.en_garantia), valor: Number(r.valor), reparaciones: Number(r.reparaciones), en_reparacion: Number(r.en_reparacion), dias_promedio_reparacion: r.dias_promedio ?? "" }));
      if (formato === "csv") descargarCSV(`proveedores_${hoy}.csv`, filas);
      else (await import("@/lib/reportePdf")).reportePdf({
        titulo: "RESUMEN POR PROVEEDOR", subtitulo: `Generado el ${fmtFecha(hoy)}`,
        resumen: [`Proveedores: ${filas.length}`, `Equipos suministrados: ${filas.reduce((a, f) => a + f.equipos, 0)}`, `En garantía: ${filas.reduce((a, f) => a + f.en_garantia, 0)}`],
        columnas: ["Proveedor", "Equipos", "En garantía", "Valor", "Reparados", "En reparación", "Días prom. reparación"],
        filas: filas.map((f) => [f.proveedor, String(f.equipos), String(f.en_garantia), `$${f.valor.toLocaleString("es-CO")}`, String(f.reparaciones), String(f.en_reparacion), String(f.dias_promedio_reparacion)]),
        archivo: `proveedores_${hoy}.pdf`,
      });
      await supabase.rpc("log_evento", { p_accion: "EXPORTAR", p_detalle: `Resumen por proveedor (${formato.toUpperCase()})` });
    } catch (e) { toast.error((e as Error).message); } finally { setCargando(false); }
  }

  async function pedidos(formato: "csv" | "pdf") {
    setCargando(true);
    try {
      type L = { tipo_id: string; cantidad: number; recibida: number; precio_estimado: number | null };
      type P = { numero: number; estado: string; fecha_pedido: string | null; fecha_esperada: string | null; created_at: string; cerrado_at: string | null; creado_nombre: string | null; proveedor: { nombre: string } | null; lineas: L[] };
      const data = (await fetchAll((a, b) => {
        let q = supabase.from("pedidos_compra").select("numero, estado, fecha_pedido, fecha_esperada, created_at, cerrado_at, creado_nombre, proveedor:proveedores(nombre), lineas:pedido_lineas(tipo_id, cantidad, recibida, precio_estimado)").gte("created_at", pDesde).lte("created_at", pHasta + "T23:59:59");
        if (pEstado === "atrasado") q = q.in("estado", ["pedido", "parcial"]).lt("fecha_esperada", hoy);
        else if (pEstado) q = q.eq("estado", pEstado);
        if (pProv) q = q.eq("proveedor_id", pProv);
        return q.order("numero").range(a, b);
      })) as unknown as P[];
      if (!data?.length) return toast.info("No hay pedidos en el periodo");
      const est = (p: P) => (pedidoAtrasado(p) ? "Atrasado" : ESTADOS_PEDIDO[p.estado] ?? p.estado);
      const filas = data.flatMap((p) => p.lineas.map((l) => ({ p, l, valor: l.cantidad * (Number(l.precio_estimado) || 0) })));
      const total = filas.reduce((x, f) => x + f.valor, 0);
      if (formato === "csv") {
        descargarCSV(`reabastecimiento_${pDesde}_${pHasta}.csv`, filas.map(({ p, l, valor }) => ({
          pedido: p.numero, proveedor: p.proveedor?.nombre ?? "", estado: est(p), creado: fmtFecha(p.created_at), solicitado_por: p.creado_nombre ?? "", fecha_pedido: p.fecha_pedido ?? "", entrega_esperada: p.fecha_esperada ?? "", cerrado: p.cerrado_at ? fmtFecha(p.cerrado_at) : "",
          articulo: cat.nombre(l.tipo_id), cantidad: l.cantidad, recibida: l.recibida, precio_estimado: l.precio_estimado ?? "", valor: valor,
        })));
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE REABASTECIMIENTO", subtitulo: `Periodo: ${fmtFecha(pDesde)} a ${fmtFecha(pHasta)}`,
          resumen: [`Pedidos: ${data.length}`, `Unidades pedidas: ${filas.reduce((x, f) => x + f.l.cantidad, 0)}`, `Unidades recibidas: ${filas.reduce((x, f) => x + f.l.recibida, 0)}`, `Valor estimado: $${Math.round(total).toLocaleString("es-CO")}`],
          columnas: ["Pedido", "Proveedor", "Estado", "Creado", "Solicitó", "Entrega", "Artículo", "Pedida", "Recibida", "Precio", "Valor"],
          filas: filas.map(({ p, l, valor }) => [`#${p.numero}`, p.proveedor?.nombre ?? "", est(p), fmtFecha(p.created_at), p.creado_nombre ?? "", p.fecha_esperada ? fmtFecha(p.fecha_esperada) : "—", cat.nombre(l.tipo_id), String(l.cantidad), String(l.recibida), l.precio_estimado != null ? `$${Number(l.precio_estimado).toLocaleString("es-CO")}` : "—", `$${Math.round(valor).toLocaleString("es-CO")}`]),
          archivo: `reabastecimiento_${pDesde}_${pHasta}.pdf`,
        });
      }
      await supabase.rpc("log_evento", { p_accion: "EXPORTAR", p_detalle: `Reporte de reabastecimiento ${pDesde} a ${pHasta} (${formato.toUpperCase()})` });
    } catch (e) { toast.error((e as Error).message); } finally { setCargando(false); }
  }

  async function actasEmpleado(formato: "csv" | "pdf") {
    if (!empId) return toast.info("Seleccione un empleado");
    setCargando(true);
    try {
      const emp = (await supabase.from("empleados").select("nombre, identificacion, cargo").eq("id", empId).single()).data;
      const data = await fetchAll((a, b) => {
        let q = supabase.from("actas").select("*, items:acta_items(estado_fisico, equipo:equipos(serie, activo_fijo, modelo, tipo_id, marca_id))").eq("empleado_id", empId).eq("estado", "firmada");
        if (eDesde) q = q.gte("firmado_at", eDesde);
        if (eHasta) q = q.lte("firmado_at", eHasta + "T23:59:59");
        if (eTipo) q = q.eq("tipo", eTipo as "entrega");
        return q.order("firmado_at").order("id").range(a, b);
      });
      if (!data?.length) return toast.info("El empleado no tiene actas firmadas con esos filtros");
      const enPoder = (await supabase.from("equipos").select("id", { count: "exact", head: true }).eq("empleado_id", empId).in("estado", ["asignado", "en_reparacion"])).count ?? 0;
      type It = { estado_fisico: string | null; equipo: { serie: string; activo_fijo: string | null; modelo: string | null; tipo_id: string; marca_id: string | null } | null };
      const filas = data.flatMap((a) => ((a.items ?? []) as unknown as It[]).filter((i) => i.equipo).map((i) => ({ a, e: i.equipo!, estado: i.estado_fisico ?? "" })));
      const ent = filas.filter((f) => f.a.tipo === "entrega").length;
      const base = `actas_${emp?.identificacion ?? "empleado"}`;
      if (formato === "csv") {
        descargarCSV(`${base}.csv`, filas.map(({ a, e, estado }) => ({
          numero_acta: a.numero, tipo: TIPO_ACTA[a.tipo], fecha_firma: fmtFecha(a.firmado_at, true), empleado: emp?.nombre ?? "", identificacion: emp?.identificacion ?? "", tecnico: a.tecnico_nombre ?? "",
          tipo_equipo: cat.nombre(e.tipo_id), marca: cat.nombre(e.marca_id), modelo: e.modelo ?? "", serie: e.serie, activo_fijo: e.activo_fijo ?? "", estado_fisico: estado,
        })));
      } else {
        (await import("@/lib/reportePdf")).reportePdf({
          titulo: "REPORTE DE ACTAS POR EMPLEADO",
          subtitulo: `${emp?.nombre ?? ""} · C.C. ${emp?.identificacion ?? ""}${emp?.cargo ? ` · ${emp.cargo}` : ""}${eDesde || eHasta ? `  ·  Periodo: ${eDesde ? fmtFecha(eDesde) : "inicio"} a ${eHasta ? fmtFecha(eHasta) : "hoy"}` : ""}`,
          resumen: [`Actas: ${data.length}`, `Equipos entregados: ${ent}`, `Equipos devueltos: ${filas.length - ent}`, `Equipos en su poder hoy: ${enPoder}`],
          columnas: ["Acta", "Tipo", "Fecha de firma", "Técnico", "Tipo equipo", "Marca", "Modelo", "Serie", "Activo fijo", "Estado físico"],
          filas: filas.map(({ a, e, estado }) => [`#${a.numero}`, TIPO_ACTA[a.tipo], fmtFecha(a.firmado_at, true), a.tecnico_nombre ?? "", cat.nombre(e.tipo_id), cat.nombre(e.marca_id), e.modelo ?? "", e.serie, e.activo_fijo ?? "", estado]),
          archivo: `${base}.pdf`,
        });
      }
      await supabase.rpc("log_evento", { p_accion: "EXPORTAR", p_detalle: `Actas del empleado ${emp?.identificacion ?? empId} (${formato.toUpperCase()})` });
    } catch (e) { toast.error((e as Error).message); } finally { setCargando(false); }
  }

  const s = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";
  return (
    <div>
      <PageHeader title="Reportes" desc="Exportaciones en Excel (CSV) o PDF." />
      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="font-bold">Inventario actual</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Estado</Label><select className={s} value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos</option>{Object.entries(ESTADO_EQUIPO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div className="space-y-1"><Label>Sede</Label><select className={s} value={sede} onChange={(e) => setSede(e.target.value)}><option value="">Todas</option>{cat.byTipo("sede", false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          </div>
          <div className="flex gap-2"><Button disabled={cargando} onClick={() => inventario("csv")}>Excel</Button><Button disabled={cargando} variant="outline" onClick={() => inventario("pdf")}>PDF</Button></div>
        </section>
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="font-bold">Actas firmadas en un periodo</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div className="space-y-1"><Label>Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          </div>
          <div className="flex gap-2"><Button disabled={cargando} onClick={() => actas("csv")}>Excel</Button><Button disabled={cargando} variant="outline" onClick={() => actas("pdf")}>PDF</Button></div>
        </section>
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="font-bold">Actas por empleado</h2>
          <div className="space-y-1"><Label>Empleado (nombre o cédula)</Label>
            <Input value={busca} onChange={(e) => { setBusca(e.target.value); setEmpId(""); }} placeholder="Escriba al menos 2 caracteres" />
            {busca.trim().length >= 2 && !empId && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-border">
                {(emps.data ?? []).map((e) => <button key={e.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setEmpId(e.id); setBusca(`${e.nombre} · ${e.identificacion}`); }}>{e.nombre} <span className="text-muted-foreground">· {e.identificacion}</span></button>)}
                {emps.data && !emps.data.length && <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</p>}
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Desde</Label><Input type="date" value={eDesde} onChange={(e) => setEDesde(e.target.value)} /></div>
            <div className="space-y-1"><Label>Hasta</Label><Input type="date" value={eHasta} onChange={(e) => setEHasta(e.target.value)} /></div>
            <div className="space-y-1"><Label>Tipo</Label><select className={s} value={eTipo} onChange={(e) => setETipo(e.target.value)}><option value="">Todas</option><option value="entrega">Entrega</option><option value="devolucion">Devolución</option></select></div>
          </div>
          <div className="flex gap-2"><Button disabled={cargando || !empId} onClick={() => actasEmpleado("csv")}>Excel</Button><Button disabled={cargando || !empId} variant="outline" onClick={() => actasEmpleado("pdf")}>PDF</Button></div>
        </section>
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="font-bold">Pedidos de reabastecimiento</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Desde</Label><Input type="date" value={pDesde} onChange={(e) => setPDesde(e.target.value)} /></div>
            <div className="space-y-1"><Label>Hasta</Label><Input type="date" value={pHasta} onChange={(e) => setPHasta(e.target.value)} /></div>
            <div className="space-y-1"><Label>Estado</Label><select className={s} value={pEstado} onChange={(e) => setPEstado(e.target.value)}><option value="">Todos</option>{Object.entries(ESTADOS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="atrasado">Atrasados</option></select></div>
            <div className="space-y-1"><Label>Proveedor</Label><select className={s} value={pProv} onChange={(e) => setPProv(e.target.value)}><option value="">Todos</option>{(provs.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          </div>
          <div className="flex gap-2"><Button disabled={cargando} onClick={() => pedidos("csv")}>Excel</Button><Button disabled={cargando} variant="outline" onClick={() => pedidos("pdf")}>PDF</Button></div>
        </section>
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <h2 className="font-bold">Resumen por proveedor</h2>
          <p className="text-sm text-muted-foreground">Equipos suministrados, en garantía, valor y reparaciones de cada proveedor.</p>
          <div className="flex gap-2"><Button disabled={cargando} onClick={() => proveedores("csv")}>Excel</Button><Button disabled={cargando} variant="outline" onClick={() => proveedores("pdf")}>PDF</Button></div>
        </section>
      </div>
    </div>
  );
}
