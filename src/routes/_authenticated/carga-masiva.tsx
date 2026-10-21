import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { errMsg } from "@/lib/constantes";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ImportExcel } from "@/components/ImportExcel";

export const Route = createFileRoute("/_authenticated/carga-masiva")({
  head: () => ({ meta: [{ title: "Carga masiva — Finesa" }, { name: "description", content: "Importar equipos y empleados por CSV." }] }),
  component: CargaMasiva,
});

const PLANTILLAS = {
  equipos: "tipo;marca;modelo;serie;sede;fecha_ingreso;proveedor;garantia_fin;observaciones\nPortátil;Lenovo;ThinkPad E14;PF3ABC12;Bogotá;2026-01-15;Proveedor SAS;2028-01-15;\nMouse;Logitech;M90;;Bogotá;2026-01-15;;;Sin serie: se genera FIN-ACC",
  empleados: "nombre;identificacion;email;cargo;area;sede;empresa\nAna Pérez;1020304050;ana.perez@finesa.com;Analista;Contabilidad;Bogotá;Finesa",
};

type Fila = { n: number; datos: Record<string, unknown>; errores: string[] };

function CargaMasiva() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<"excel" | "equipos" | "empleados">("excel");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [procesando, setProcesando] = useState(false);

  if (!me?.can("cargas_masivas")) return <p className="text-muted-foreground">No tiene permiso para cargas masivas.</p>;

  const buscar = (t: string, nombre: string) => cat.all.find((c) => c.tipo === t && c.activo && c.nombre.trim().toLowerCase() === nombre.trim().toLowerCase())?.id;

  async function leer(file: File) {
    const texto = await file.text();
    const res = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: true, delimiter: "", transformHeader: (h) => h.trim().toLowerCase() });
    const rows = res.data;
    if (rows.length > 2000) return toast.error("Máximo 2000 filas por carga");
    const out: Fila[] = [];
    if (tipo === "equipos") {
      const series = rows.map((r) => (r.serie ?? "").trim().toUpperCase()).filter(Boolean);
      const { data: existentes } = await supabase.from("equipos").select("serie").in("serie", series.length ? series : ["__"]);
      const ya = new Set((existentes ?? []).map((e) => e.serie));
      const vistos = new Set<string>();
      rows.forEach((r, i) => {
        const err: string[] = [];
        const serie = (r.serie ?? "").trim().toUpperCase();
        const tipo_id = buscar("tipo_equipo", r.tipo ?? "");
        const marca_id = r.marca ? buscar("marca", r.marca) : null;
        const sede_id = r.sede ? buscar("sede", r.sede) : null;
        if (!tipo_id) err.push(`Tipo "${r.tipo ?? ""}" no existe en el catálogo`);
        if (r.marca && !marca_id) err.push(`Marca "${r.marca}" no existe`);
        if (r.sede && !sede_id) err.push(`Sede "${r.sede}" no existe`);
        if (serie && ya.has(serie)) err.push(`Serie ${serie} ya registrada`);
        if (serie && vistos.has(serie)) err.push(`Serie ${serie} duplicada en el archivo`);
        if (serie) vistos.add(serie);
        const fecha = (r.fecha_ingreso ?? "").trim();
        if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) err.push("fecha_ingreso debe ser AAAA-MM-DD");
        const gar = (r.garantia_fin ?? "").trim();
        if (gar && !/^\d{4}-\d{2}-\d{2}$/.test(gar)) err.push("garantia_fin debe ser AAAA-MM-DD");
        out.push({ n: i + 2, errores: err, datos: { tipo_id, marca_id, sede_id, modelo: r.modelo || null, serie, fecha_ingreso: fecha || undefined, proveedor: r.proveedor || null, garantia_fin: gar || null, observaciones: r.observaciones || null, estado: "disponible" } });
      });
    } else {
      const ids = rows.map((r) => (r.identificacion ?? "").trim()).filter(Boolean);
      const { data: existentes } = await supabase.from("empleados").select("identificacion").in("identificacion", ids.length ? ids : ["__"]);
      const ya = new Set((existentes ?? []).map((e) => e.identificacion));
      const vistos = new Set<string>();
      rows.forEach((r, i) => {
        const err: string[] = [];
        const ident = (r.identificacion ?? "").trim();
        if (!(r.nombre ?? "").trim()) err.push("Nombre obligatorio");
        if (!ident) err.push("Identificación obligatoria");
        if (ya.has(ident)) err.push(`Identificación ${ident} ya registrada`);
        if (vistos.has(ident)) err.push(`Identificación ${ident} duplicada en el archivo`);
        vistos.add(ident);
        const email = (r.email ?? "").trim().toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err.push("Correo inválido");
        const area_id = r.area ? buscar("area", r.area) : null;
        const sede_id = r.sede ? buscar("sede", r.sede) : null;
        const empresa_id = r.empresa ? buscar("empresa", r.empresa) : null;
        if (r.area && !area_id) err.push(`Área "${r.area}" no existe`);
        if (r.sede && !sede_id) err.push(`Sede "${r.sede}" no existe`);
        if (r.empresa && !empresa_id) err.push(`Empresa "${r.empresa}" no existe`);
        out.push({ n: i + 2, errores: err, datos: { nombre: (r.nombre ?? "").trim(), identificacion: ident, email: email || null, cargo: r.cargo || null, area_id, sede_id, empresa_id } });
      });
    }
    setFilas(out);
  }

  const conError = filas.filter((f) => f.errores.length).length;

  async function procesar() {
    setProcesando(true);
    try {
      const datos = filas.map((f) => f.datos);
      for (let i = 0; i < datos.length; i += 200) {
        const lote = datos.slice(i, i + 200);
        const { error } = tipo === "equipos"
          ? await supabase.from("equipos").insert(lote as never)
          : await supabase.from("empleados").insert(lote as never);
        if (error) throw new Error(`Lote desde la fila ${i + 2}: ${error.message}`);
      }
      await supabase.rpc("log_evento", { p_accion: "CARGA_MASIVA", p_detalle: `${datos.length} ${tipo} importados` });
      toast.success(`${datos.length} registros importados`);
      setFilas([]);
      qc.invalidateQueries({ queryKey: [tipo] });
    } catch (e) { toast.error(errMsg(e)); } finally { setProcesando(false); }
  }

  function plantilla() {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + PLANTILLAS[tipo as "equipos" | "empleados"]], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `plantilla_${tipo}.csv`; a.click();
  }

  return (
    <div>
      <PageHeader title="Carga masiva" desc="Importe desde CSV. Se valida todo antes de guardar; nada se inserta mientras haya errores." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border bg-card p-1">
          {(["excel", "equipos", "empleados"] as const).map((t) => (
            <button key={t} onClick={() => { setTipo(t); setFilas([]); }} className={`rounded px-4 py-1.5 text-sm ${tipo === t ? "bg-primary text-primary-foreground" : ""}`}>{t === "excel" ? "Excel completo" : t === "equipos" ? "Equipos (CSV)" : "Empleados (CSV)"}</button>
          ))}
        </div>
        {tipo !== "excel" && <><Button variant="outline" onClick={plantilla}>Descargar plantilla</Button>
        <Input type="file" accept=".csv,text/csv" className="w-auto" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ""; }} /></>}
      </div>
      {tipo === "excel" && <ImportExcel isAdmin={!!me?.isAdmin} />}
      <p className="mb-4 text-xs text-muted-foreground">Los nombres de tipo, marca, sede, área y empresa deben coincidir con los catálogos activos. Separador: punto y coma o coma.</p>
      {tipo !== "excel" && filas.length > 0 && (
        <>
          <div className={`mb-4 rounded-md border p-4 text-sm ${conError ? "border-destructive/30 bg-destructive/10" : "border-success/30 bg-success/10"}`}>
            {filas.length} filas leídas · {conError ? `${conError} con errores. Corrija el archivo y vuelva a cargarlo.` : "Sin errores. Puede procesar la carga."}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Registro</th><th className="px-3 py-2">Validación</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filas.map((f) => (
                  <tr key={f.n} className={f.errores.length ? "bg-destructive/5" : ""}>
                    <td className="px-3 py-2 font-mono text-xs">{f.n}</td>
                    <td className="px-3 py-2">{String(f.datos.serie || f.datos.nombre || f.datos.modelo || "(código automático)")}</td>
                    <td className="px-3 py-2 text-xs">{f.errores.length ? <span className="text-destructive">{f.errores.join(" · ")}</span> : <span className="text-success">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end"><Button disabled={!!conError || procesando} onClick={procesar}>{procesando ? "Importando…" : `Procesar ${filas.length} registros`}</Button></div>
        </>
      )}
    </div>
  );
}
