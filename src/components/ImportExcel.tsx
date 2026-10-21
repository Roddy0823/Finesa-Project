import { useState } from "react";
import { Progress } from "@/components/ui/progress";
import * as XLSX from "xlsx";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { errMsg } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Row = Record<string, unknown>;
type CatTipo = "sede" | "area" | "empresa" | "marca" | "tipo_equipo";
const BAD = new Set(["", "#N/D", "N/D", "NAN", "NONE", "PENDIENTE", "NN", "N", "N/A", "NA", "-"]);
const cl = (v: unknown) => {
  if (v === null || v === undefined) return null;
  let s = String(v).trim().replace(/\s+/g, " ");
  if (/^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return BAD.has(s.toUpperCase()) ? null : s;
};
const MARCA: Record<string, string> = { plantrnics: "Plantronics", logitec: "Logitech", hp: "HP", asus: "ASUS", startech: "StarTech", lenovo: "Lenovo", logitech: "Logitech" };
const NOMARCA = new Set(["optical mouse", "optical", "4 ports hub", "4 port slim hub", "hub", "thinkpad ultra", "pdt"]);
const marca = (v: unknown) => { const s = cl(v); if (!s || NOMARCA.has(s.toLowerCase())) return null; return MARCA[s.toLowerCase()] ?? s; };
const empresa = (v: unknown) => { const s = cl(v); if (!s) return null; return ({ "finesa s.a": "Finesa S.A", finesa: "Finesa S.A" } as Record<string, string>)[s.toLowerCase()] ?? s; };
const col = (r: Row, ...names: string[]) => { for (const n of names) { const k = Object.keys(r).find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (k) return r[k]; } return undefined; };

type Reporte = { hoja: string; fila: number; identificador: string; motivo: string };
type Plan = { emp: Row[]; eq: Row[]; asig: Row[]; resumen: string };

export function ImportExcel({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [prog, setProg] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [reporte, setReporte] = useState<Reporte[]>([]);

  async function leer(file: File) {
    const wb = XLSX.read(await file.arrayBuffer());
    const hoja = (k: string) => { const n = wb.SheetNames.find((s) => s.toLowerCase().includes(k)); return n ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[n]!, { raw: false }) : []; };
    const emp = hoja("emplead"), eq = hoja("equipo"), asig = hoja("asign");
    if (!emp.length && !eq.length) return toast.error("El archivo debe tener hojas 'Empleados', 'Inventario_Equipos' y/o 'Asignaciones'.");
    setReporte([]);
    setPlan({ emp, eq, asig, resumen: `${emp.length} empleados · ${eq.length} equipos · ${asig.length} asignaciones leídos` });
  }

  async function procesar() {
    if (!plan) return;
    const rep: Reporte[] = [];
    try {
      setProg("Preparando catálogos…"); setPct(3);
      const cats = await fetchAll((a, b) => supabase.from("catalogo_items").select("id, tipo, nombre").order("id").range(a, b));
      const cat = new Map(cats.map((c) => [`${c.tipo}|${c.nombre.toLowerCase()}`, c.id]));
      const need = new Map<string, { tipo: CatTipo; nombre: string }>();
      const add = (tipo: CatTipo, n: string | null) => { if (n && !cat.has(`${tipo}|${n.toLowerCase()}`)) need.set(`${tipo}|${n.toLowerCase()}`, { tipo, nombre: n }); };
      for (const r of plan.emp) { add("sede", cl(col(r, "Sede"))); add("area", cl(col(r, "Área Funcional", "Area"))); add("empresa", empresa(col(r, "Empresa"))); }
      for (const r of plan.eq) { add("tipo_equipo", cl(col(r, "Tipo de Equipo"))); add("marca", marca(col(r, "Marca"))); }
      if (need.size) {
        if (!isAdmin) throw new Error(`Faltan en catálogos: ${[...need.values()].map((c) => c.nombre).slice(0, 10).join(", ")}. Pida al Administrador crearlos.`);
        const { data, error } = await supabase.from("catalogo_items").insert([...need.values()]).select("id, tipo, nombre");
        if (error) throw error;
        for (const c of data) cat.set(`${c.tipo}|${c.nombre.toLowerCase()}`, c.id);
      }
      const cid = (t: CatTipo, n: string | null) => (n ? cat.get(`${t}|${n.toLowerCase()}`) ?? null : null);

      setProg("Cargando empleados…");
      const existentes = await fetchAll((a, b) => supabase.from("empleados").select("id, identificacion").order("id").range(a, b));
      const emps = new Map(existentes.map((e) => [e.identificacion, e.id]));
      const sedeEmp = new Map<string, string | null>();
      const nuevosEmp: Row[] = [];
      plan.emp.forEach((r, i) => {
        const ced = cl(col(r, "Cédula", "Cedula")); const nombre = cl(col(r, "Nombre Completo", "Nombre"));
        if (!ced || !nombre) return rep.push({ hoja: "Empleados", fila: i + 2, identificador: ced ?? "", motivo: "Falta cédula o nombre" });
        sedeEmp.set(ced, cid("sede", cl(col(r, "Sede"))));
        if (emps.has(ced)) return;
        const email = cl(col(r, "Correo Corporativo", "Correo"));
        nuevosEmp.push({ identificacion: ced, nombre, cargo: cl(col(r, "Cargo Empleado", "Cargo")), email: email && !email.toUpperCase().startsWith("PENDIENTE") ? email : null,
          area_id: cid("area", cl(col(r, "Área Funcional", "Area"))), sede_id: sedeEmp.get(ced), empresa_id: cid("empresa", empresa(col(r, "Empresa"))) });
        emps.set(ced, "");
      });
      for (let i = 0; i < nuevosEmp.length; i += 200) {
        setProg(`Cargando empleados… ${i}/${nuevosEmp.length}`); setPct(5 + Math.round((i / Math.max(1, nuevosEmp.length)) * 30));
        const { data, error } = await supabase.from("empleados").insert(nuevosEmp.slice(i, i + 200) as never).select("id, identificacion");
        if (error) throw error;
        for (const e of data) emps.set(e.identificacion, e.id);
      }

      setProg("Cargando equipos…");
      const idSede = new Map<string, string | null>();
      for (const r of plan.asig) { const id = cl(col(r, "Identificador Equipo (Serial / Activo)", "Identificador"))?.toUpperCase(); if (id && !idSede.has(id)) idSede.set(id, sedeEmp.get(cl(col(r, "Cédula Empleado", "Cédula")) ?? "") ?? null); }
      const eqEx = await fetchAll((a, b) => supabase.from("equipos").select("serie, activo_fijo").order("id").range(a, b));
      const ss = new Set(eqEx.map((e) => e.serie.toUpperCase())); const aa = new Set(eqEx.filter((e) => e.activo_fijo).map((e) => e.activo_fijo!.toUpperCase()));
      const nuevosEq: Row[] = [];
      plan.eq.forEach((r, i) => {
        const s = cl(col(r, "Serial", "Serie"))?.toUpperCase() ?? null; const af = cl(col(r, "Activo Fijo"))?.toUpperCase() ?? null;
        const t = cl(col(r, "Tipo de Equipo"));
        const why = [s && ss.has(s) ? `Serial ${s} repetido` : "", af && aa.has(af) ? `Activo fijo ${af} repetido` : "", !t ? "Falta tipo" : ""].filter(Boolean);
        if (why.length) return rep.push({ hoja: "Inventario_Equipos", fila: i + 2, identificador: s ?? af ?? "", motivo: why.join("; ") });
        if (s) ss.add(s); if (af) aa.add(af);
        const anio = cl(col(r, "Año de Compra"));
        const vRaw = cl(col(r, "Valor Compra", "Valor de Compra", "Valor"));
        const valor = vRaw ? Number(String(vRaw).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")) : NaN;
        nuevosEq.push({ tipo_id: cid("tipo_equipo", t), marca_id: cid("marca", marca(col(r, "Marca"))), modelo: cl(col(r, "Modelo")), serie: s, activo_fijo: af,
          proveedor: cl(col(r, "Proveedor")), anio_compra: anio && /^\d{4}$/.test(anio) ? Number(anio) : null, sede_id: (s && idSede.get(s)) || (af && idSede.get(af)) || null, estado: "disponible",
          valor_compra: isFinite(valor) && valor >= 0 ? valor : null });
      });
      for (let i = 0; i < nuevosEq.length; i += 200) {
        setProg(`Cargando equipos… ${i}/${nuevosEq.length}`); setPct(35 + Math.round((i / Math.max(1, nuevosEq.length)) * 35));
        const { error } = await supabase.from("equipos").insert(nuevosEq.slice(i, i + 200) as never);
        if (error) throw error;
      }

      setProg("Registrando asignaciones…");
      const disp = await fetchAll((a, b) => supabase.from("equipos").select("id, serie, activo_fijo").eq("estado", "disponible").order("id").range(a, b));
      const m = new Map<string, string>();
      for (const e of disp) { if (!m.has(e.serie.toUpperCase())) m.set(e.serie.toUpperCase(), e.id); if (e.activo_fijo && !m.has(e.activo_fijo.toUpperCase())) m.set(e.activo_fijo.toUpperCase(), e.id); }
      const usados = new Set<string>(); const items: { equipo_id: string; empleado_id: string }[] = [];
      plan.asig.forEach((r, i) => {
        const ced = cl(col(r, "Cédula Empleado", "Cédula")) ?? ""; const id = cl(col(r, "Identificador Equipo (Serial / Activo)", "Identificador"))?.toUpperCase() ?? "";
        const eq = m.get(id); const emp = emps.get(ced);
        const motivo = !eq ? "Equipo no disponible o no cargado" : usados.has(eq) ? "Equipo repetido en asignaciones" : !emp ? "Empleado no encontrado" : null;
        if (motivo) return rep.push({ hoja: "Asignaciones", fila: i + 2, identificador: `${id} / ${ced}`, motivo });
        usados.add(eq!); items.push({ equipo_id: eq!, empleado_id: emp! });
      });
      let n = 0;
      for (let i = 0; i < items.length; i += 300) {
        setProg(`Registrando asignaciones… ${i}/${items.length}`); setPct(70 + Math.round((i / Math.max(1, items.length)) * 30));
        const { data, error } = await supabase.rpc("asignar_carga_inicial", { p_items: items.slice(i, i + 300) });
        if (error) throw error;
        n += data ?? 0;
      }
      await supabase.rpc("log_evento", { p_accion: "CARGA_MASIVA", p_detalle: `Excel: ${nuevosEmp.length} empleados, ${nuevosEq.length} equipos, ${n} asignaciones, ${rep.length} filas omitidas` });
      toast.success(`${nuevosEmp.length} empleados, ${nuevosEq.length} equipos y ${n} asignaciones cargados`);
      setPlan(null); setReporte(rep);
      qc.invalidateQueries();
    } catch (e) { toast.error(errMsg(e)); setReporte(rep); } finally { setProg(null); setPct(0); }
  }

  function descargarReporte() {
    const ws = XLSX.utils.json_to_sheet(reporte.map((r) => ({ Hoja: r.hoja, Fila: r.fila, Identificador: r.identificador, Motivo: r.motivo })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Omitidos");
    XLSX.writeFile(wb, "reporte_carga.xlsx");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Suba un Excel con las hojas Empleados, Inventario_Equipos y Asignaciones. Los repetidos se omiten y quedan en un reporte descargable. Las asignaciones quedan registradas como carga inicial (sin acta).</p>
      <Input type="file" accept=".xlsx,.xls" className="w-auto" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ""; }} />
      {plan && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-4 text-sm">
          <span>{plan.resumen}</span>
          <Button disabled={!!prog} onClick={procesar}>{prog ?? "Procesar carga"}</Button>
          {prog && <div className="w-full basis-full space-y-1"><Progress value={pct} /><div className="text-xs text-muted-foreground">{pct}%</div></div>}
        </div>
      )}
      {reporte.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-4 text-sm">
          <span>{reporte.length} filas omitidas.</span>
          <Button variant="outline" onClick={descargarReporte}>Descargar reporte</Button>
        </div>
      )}
    </div>
  );
}
