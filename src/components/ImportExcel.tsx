import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { errMsg } from "@/lib/constantes";
import { cn } from "@/lib/utils";
import {
  CAT_LABEL,
  HOJAS,
  MAX_FILAS_HOJA,
  MAX_TAMANO_MB,
  descargarInforme,
  leerArchivo,
  normCedula,
  resumen,
  validar,
  type CatRef,
  type Contexto,
  type FilaValidada,
  type HojaId,
  type Lectura,
  type Validacion,
} from "@/lib/cargaMasiva";
import { DataTablePagination, usePaginacion } from "@/components/DataTablePagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  FileSpreadsheet,
  Info,
  Laptop,
  Link2,
  Loader2,
  RotateCcw,
  Search,
  Tags,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";

type Resultado = "nuevo" | "existe" | "error" | "fallo";
type FilaResultado = FilaValidada & { resultado?: Resultado | undefined; detalleResultado?: string | undefined };
type Fase = "idle" | "leyendo" | "revision" | "procesando" | "resultado";
type Paso = "catalogos" | "empleados" | "equipos" | "asignaciones";
type Filtro = "todos" | "nuevo" | "existe" | "error" | "avisos" | "fallo";

const HOJA_ICON: Record<HojaId, typeof Users> = { empleados: Users, equipos: Laptop, asignaciones: Link2 };
const ORDEN: HojaId[] = ["empleados", "equipos", "asignaciones"];
const LOTE = 200;

export function ImportExcel({
  isAdmin,
  puedeEmpleados,
  puedeEquipos,
  onPlantilla,
}: {
  isAdmin: boolean;
  puedeEmpleados: boolean;
  puedeEquipos: boolean;
  onPlantilla: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("idle");
  const [arrastrando, setArrastrando] = useState(false);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [val, setVal] = useState<Validacion | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [autorizaCat, setAutorizaCat] = useState(false);
  const [paso, setPaso] = useState<Paso | null>(null);
  const [pct, setPct] = useState(0);
  const [detallePaso, setDetallePaso] = useState("");
  const [final, setFinal] = useState<{ filas: FilaResultado[]; metricas: [string, number | string][]; catCreados: number; duracion: number } | null>(null);

  // Evita cerrar la pestaña en plena importación
  useEffect(() => {
    if (fase !== "procesando") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [fase]);

  async function cargarContexto(): Promise<Contexto> {
    const [catalogos, empleados, equipos, proveedores] = await Promise.all([
      fetchAll((a, b) => supabase.from("catalogo_items").select("id, tipo, nombre, activo").order("id").range(a, b)),
      fetchAll((a, b) => supabase.from("empleados").select("id, identificacion, sede_id, activo").order("id").range(a, b)),
      fetchAll((a, b) => supabase.from("equipos").select("id, serie, activo_fijo, estado, empleado_id").order("id").range(a, b)),
      fetchAll((a, b) => supabase.from("proveedores").select("id, nombre").order("id").range(a, b)),
    ]);
    return { catalogos, empleados, equipos, proveedores, esAdmin: isAdmin, puedeEmpleados, puedeEquipos };
  }

  async function seleccionar(file: File) {
    setFase("leyendo");
    setFinal(null);
    setAutorizaCat(false);
    try {
      const l = await leerArchivo(file);
      const c = await cargarContexto();
      setLectura(l);
      setCtx(c);
      setVal(validar(l, c));
      setFase("revision");
    } catch (e) {
      toast.error(errMsg(e));
      setFase("idle");
    }
  }

  async function revalidar() {
    if (!lectura) return;
    setFase("leyendo");
    try {
      const c = await cargarContexto();
      setCtx(c);
      setVal(validar(lectura, c));
      setFase("revision");
      toast.success("Validación actualizada con los datos más recientes");
    } catch (e) {
      toast.error(errMsg(e));
      setFase("revision");
    }
  }

  function reiniciar() {
    setFase("idle");
    setLectura(null);
    setVal(null);
    setCtx(null);
    setFinal(null);
    setAutorizaCat(false);
  }

  const res = useMemo(() => (val ? Object.fromEntries(ORDEN.map((h) => [h, resumen(val.filas[h])])) as Record<HojaId, ReturnType<typeof resumen>> : null), [val]);
  const totalNuevos = res ? ORDEN.reduce((s, h) => s + res[h].nuevos, 0) : 0;
  const totalErrores = res ? ORDEN.reduce((s, h) => s + res[h].errores, 0) : 0;
  const totalExistentes = res ? ORDEN.reduce((s, h) => s + res[h].existentes, 0) : 0;

  /* ── Importación ─────────────────────────────────────────────────────── */

  async function procesar() {
    if (!val || !ctx || !lectura) return;
    setConfirmar(false);
    setFase("procesando");
    const t0 = Date.now();
    const filas: Record<HojaId, FilaResultado[]> = {
      empleados: val.filas.empleados.map((f) => ({ ...f, ...(f.estado !== "nuevo" ? { resultado: f.estado } : {}) })),
      equipos: val.filas.equipos.map((f) => ({ ...f, ...(f.estado !== "nuevo" ? { resultado: f.estado } : {}) })),
      asignaciones: val.filas.asignaciones.map((f) => ({ ...f, ...(f.estado !== "nuevo" ? { resultado: f.estado } : {}) })),
    };
    let catCreados = 0;
    try {
      // 1. Catálogos faltantes (solo Administrador; la RLS lo vuelve a exigir)
      setPaso("catalogos"); setPct(2); setDetallePaso("Preparando catálogos…");
      const catMap = new Map(ctx.catalogos.map((c) => [`${c.tipo}|${c.nombre.trim().toLowerCase()}`, c.id]));
      if (val.faltantes.length) {
        const { data, error } = await supabase.from("catalogo_items").insert(val.faltantes.map((c) => ({ tipo: c.tipo, nombre: c.nombre }))).select("id, tipo, nombre");
        if (error) throw new Error(`No se pudieron crear los valores de catálogo: ${errMsg(error)}`);
        for (const c of data ?? []) catMap.set(`${c.tipo}|${c.nombre.trim().toLowerCase()}`, c.id);
        catCreados = data?.length ?? 0;
      }
      const resolver = (f: FilaValidada) => {
        const d = { ...(f.datos ?? {}) };
        for (const [campo, ref] of Object.entries(f.refs ?? {}) as [string, CatRef][]) d[campo] = catMap.get(`${ref.tipo}|${ref.nombre.trim().toLowerCase()}`) ?? null;
        return d;
      };

      // Inserta por lotes; si un lote falla, reintenta fila por fila para aislar el error
      async function insertar<T extends { id: string }>(tabla: "empleados" | "equipos", lista: FilaResultado[], columnas: string, base: number, rango: number, onOk: (f: FilaResultado, row: T) => void) {
        for (let i = 0; i < lista.length; i += LOTE) {
          const lote = lista.slice(i, i + LOTE);
          setPct(base + Math.round((i / Math.max(1, lista.length)) * rango));
          setDetallePaso(`${Math.min(i + LOTE, lista.length).toLocaleString("es-CO")} de ${lista.length.toLocaleString("es-CO")}`);
          const payload = lote.map(resolver);
          const { data, error } = await supabase.from(tabla).insert(payload as never).select(columnas);
          if (!error && data && data.length === lote.length) {
            (data as unknown as T[]).forEach((row, k) => { lote[k]!.resultado = "nuevo"; onOk(lote[k]!, row); });
            continue;
          }
          for (let k = 0; k < lote.length; k++) {
            const r = await supabase.from(tabla).insert(payload[k] as never).select(columnas).single();
            if (r.error || !r.data) { lote[k]!.resultado = "fallo"; lote[k]!.detalleResultado = traducirError(r.error); }
            else { lote[k]!.resultado = "nuevo"; onOk(lote[k]!, r.data as unknown as T); }
          }
        }
      }

      // 2. Empleados
      setPaso("empleados");
      const empIds = new Map(ctx.empleados.map((e) => [normCedula(e.identificacion)!, e.id]));
      await insertar<{ id: string; identificacion: string }>("empleados", filas.empleados.filter((f) => f.estado === "nuevo"), "id, identificacion", 5, 30, (_f, row) => empIds.set(normCedula(row.identificacion)!, row.id));

      // 3. Equipos
      setPaso("equipos");
      const eqIds = new Map<string, string>();
      for (const e of ctx.equipos) {
        if (e.estado !== "disponible" || e.empleado_id) continue;
        eqIds.set(e.serie.toUpperCase(), e.id);
        if (e.activo_fijo && !eqIds.has(e.activo_fijo.toUpperCase())) eqIds.set(e.activo_fijo.toUpperCase(), e.id);
      }
      await insertar<{ id: string; serie: string; activo_fijo: string | null }>("equipos", filas.equipos.filter((f) => f.estado === "nuevo"), "id, serie, activo_fijo", 35, 35, (f, row) => {
        eqIds.set(row.serie.toUpperCase(), row.id);
        if (row.activo_fijo) eqIds.set(row.activo_fijo.toUpperCase(), row.id);
        if (f.identificador.startsWith("(")) f.identificador = row.serie; // código FIN-ACC generado
      });

      // 4. Asignaciones (RPC transaccional con trazabilidad «carga_inicial»)
      setPaso("asignaciones");
      const pendientes = filas.asignaciones.filter((f) => f.estado === "nuevo" && f.asig);
      const items: { fila: FilaResultado; equipo_id: string; empleado_id: string }[] = [];
      for (const f of pendientes) {
        const empleado_id = empIds.get(f.asig!.cedula);
        const equipo_id = eqIds.get(f.asig!.codigo);
        if (!empleado_id || !equipo_id) {
          f.resultado = "fallo";
          f.detalleResultado = !empleado_id ? "El empleado no se pudo crear en esta carga" : "El equipo no se pudo crear o no está disponible";
          continue;
        }
        items.push({ fila: f, equipo_id, empleado_id });
      }
      const LOTE_ASIG = 150;
      for (let i = 0; i < items.length; i += LOTE_ASIG) {
        const lote = items.slice(i, i + LOTE_ASIG);
        setPct(70 + Math.round((i / Math.max(1, items.length)) * 28));
        setDetallePaso(`${Math.min(i + LOTE_ASIG, items.length).toLocaleString("es-CO")} de ${items.length.toLocaleString("es-CO")}`);
        const { error } = await supabase.rpc("asignar_carga_inicial", { p_items: lote.map(({ equipo_id, empleado_id }) => ({ equipo_id, empleado_id })) });
        if (error) {
          lote.forEach((x) => { x.fila.resultado = "fallo"; x.fila.detalleResultado = traducirError(error); });
          continue;
        }
        // Verificación posterior: confirma qué equipos quedaron asignados a quién
        const { data: ver } = await supabase.from("equipos").select("id, empleado_id, estado").in("id", lote.map((x) => x.equipo_id));
        const mapa = new Map((ver ?? []).map((e) => [e.id, e]));
        for (const x of lote) {
          const e = mapa.get(x.equipo_id);
          if (e && e.estado === "asignado" && e.empleado_id === x.empleado_id) x.fila.resultado = "nuevo";
          else { x.fila.resultado = "fallo"; x.fila.detalleResultado = "El equipo dejó de estar disponible o pertenece a otro ecosistema"; }
        }
      }

      setPct(99); setDetallePaso("Registrando en auditoría…");
      const cuenta = (h: HojaId, r: Resultado) => filas[h].filter((f) => f.resultado === r).length;
      const empOk = cuenta("empleados", "nuevo"), eqOk = cuenta("equipos", "nuevo"), asOk = cuenta("asignaciones", "nuevo");
      const fallos = ORDEN.reduce((s, h) => s + cuenta(h, "fallo"), 0);
      await supabase.rpc("log_evento", {
        p_accion: "CARGA_MASIVA",
        p_detalle: `Archivo ${lectura.archivo}: ${empOk} empleados, ${eqOk} equipos, ${asOk} asignaciones, ${catCreados} catálogos creados, ${totalExistentes} omitidos (ya existían), ${totalErrores + fallos} con error`,
      });

      const todas = ORDEN.flatMap((h) => filas[h]);
      setFinal({
        filas: todas,
        catCreados,
        duracion: Math.round((Date.now() - t0) / 1000),
        metricas: [
          ["Empleados creados", empOk],
          ["Equipos creados", eqOk],
          ["Asignaciones registradas", asOk],
          ["Valores de catálogo creados", catCreados],
          ["Omitidos (ya existían)", totalExistentes],
          ["Filas con error de validación", totalErrores],
          ["Fallos al guardar", fallos],
        ],
      });
      setPct(100);
      setFase("resultado");
      if (fallos) toast.warning(`Carga finalizada con ${fallos} fila(s) que no se pudieron guardar. Revise el informe.`);
      else toast.success(`Carga completada: ${empOk} empleados, ${eqOk} equipos y ${asOk} asignaciones`);
      void qc.invalidateQueries();
    } catch (e) {
      toast.error(errMsg(e));
      setFase("revision");
    } finally {
      setPaso(null);
      setDetallePaso("");
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  if (fase === "procesando") return <PanelProgreso paso={paso} pct={pct} detalle={detallePaso} hayCat={!!val?.faltantes.length} />;

  if (fase === "resultado" && final && lectura) {
    return <PanelResultado final={final} archivo={lectura.archivo} onNueva={reiniciar} />;
  }

  if ((fase === "revision" || fase === "leyendo") && lectura && val && res) {
    return (
      <div className="space-y-5">
        {/* Archivo */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-success/30 bg-success/10 text-success">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{lectura.archivo}</div>
              <div className="text-xs text-muted-foreground">
                Hojas detectadas: {ORDEN.filter((h) => lectura.hojas[h]).map((h) => `${lectura.hojas[h]!.nombreHoja} (${lectura.hojas[h]!.filas.length})`).join(" · ")}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={fase === "leyendo"} onClick={revalidar}>
              {fase === "leyendo" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
              Revalidar
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={reiniciar}>Cambiar archivo</Button>
          </div>
        </div>

        {val.advertenciasGenerales.length > 0 && (
          <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-xs">
            {val.advertenciasGenerales.map((a) => (
              <div key={a} className="flex items-start gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{a}</span></div>
            ))}
          </div>
        )}

        {/* KPIs por hoja */}
        <div className="grid gap-3 md:grid-cols-3">
          {ORDEN.map((h) => {
            const r = res[h];
            const Icon = HOJA_ICON[h];
            return (
              <div key={h} className={cn("rounded-2xl border bg-card p-4 shadow-2xs", r.total ? "border-border/80" : "border-dashed border-border/60 opacity-70")}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Icon className="h-4 w-4 text-primary" />{HOJAS[h].titulo}</div>
                  <span className="font-mono text-xs text-muted-foreground">{r.total.toLocaleString("es-CO")} filas</span>
                </div>
                {r.total ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Mini label="A importar" valor={r.nuevos} cls="text-success" />
                    <Mini label="Ya existen" valor={r.existentes} cls="text-muted-foreground" />
                    <Mini label="Con error" valor={r.errores} cls={r.errores ? "text-destructive" : "text-muted-foreground"} />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">Hoja no incluida en el archivo.</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Catálogos a crear */}
        {val.faltantes.length > 0 && (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Tags className="h-4 w-4 text-primary" />Se crearán {val.faltantes.length} valor(es) nuevo(s) en los catálogos</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {val.faltantes.map((c) => (
                <span key={`${c.tipo}|${c.nombre}`} className="rounded-full border border-border/80 bg-card px-2.5 py-0.5 text-[11px]">
                  <span className="text-muted-foreground">{CAT_LABEL[c.tipo]}:</span> <b className="font-medium text-foreground">{c.nombre}</b>
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Verifique que no sean errores de digitación (p. ej. «Bogota» vs «Bogotá»). Si lo son, corrija el archivo y vuelva a cargarlo.</p>
          </div>
        )}

        <TablaFilas filas={ORDEN.flatMap((h) => val.filas[h])} res={res} modo="validacion" />

        {/* Barra de acción */}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-lg backdrop-blur">
          <div className="text-xs">
            <div className="font-semibold text-foreground">
              {totalNuevos.toLocaleString("es-CO")} registro(s) listos para importar
            </div>
            <div className="text-muted-foreground">
              {totalExistentes.toLocaleString("es-CO")} ya existen y se omitirán
              {totalErrores > 0 && <> · <span className="font-medium text-destructive">{totalErrores.toLocaleString("es-CO")} con error no se importarán</span></>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => descargarInforme(ORDEN.flatMap((h) => val.filas[h]), ORDEN.flatMap((h) => [[`${HOJAS[h].titulo}: a importar`, res[h].nuevos], [`${HOJAS[h].titulo}: ya existen`, res[h].existentes], [`${HOJAS[h].titulo}: con error`, res[h].errores]] as [string, number][]), lectura.archivo)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Informe de validación
            </Button>
            <Button size="sm" disabled={!totalNuevos || fase === "leyendo"} onClick={() => setConfirmar(true)}>
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
              Importar {totalNuevos.toLocaleString("es-CO")} registro(s)
            </Button>
          </div>
        </div>

        <Dialog open={confirmar} onOpenChange={setConfirmar}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Confirmar importación</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <ul className="space-y-1.5 rounded-xl border border-border/80 bg-muted/25 p-3 text-xs">
                {ORDEN.filter((h) => res[h].nuevos).map((h) => (
                  <li key={h} className="flex justify-between"><span className="text-muted-foreground">{HOJAS[h].titulo} nuevos</span><b className="font-mono">{res[h].nuevos.toLocaleString("es-CO")}</b></li>
                ))}
                {val.faltantes.length > 0 && <li className="flex justify-between"><span className="text-muted-foreground">Valores de catálogo nuevos</span><b className="font-mono">{val.faltantes.length}</b></li>}
                {totalErrores > 0 && <li className="flex justify-between text-destructive"><span>Filas con error (se omiten)</span><b className="font-mono">{totalErrores}</b></li>}
              </ul>
              {totalErrores > 0 && (
                <p className="flex items-start gap-2 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />Solo se importarán las filas válidas. Las asignaciones que dependan de filas con error tampoco se registrarán.</p>
              )}
              {val.faltantes.length > 0 && (
                <label className="flex items-start gap-2.5 rounded-lg border border-border/80 p-2.5 text-xs">
                  <Checkbox checked={autorizaCat} onCheckedChange={(v) => setAutorizaCat(v === true)} className="mt-0.5" />
                  <span>Autorizo crear los {val.faltantes.length} valor(es) nuevo(s) en los catálogos del sistema.</span>
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">Las asignaciones se registran como carga inicial (sin acta) y quedan en el historial de cada equipo. La operación queda registrada en auditoría.</p>
              <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
                <Button size="sm" variant="outline" onClick={() => setConfirmar(false)}>Cancelar</Button>
                <Button size="sm" disabled={val.faltantes.length > 0 && !autorizaCat} onClick={procesar}>Iniciar importación</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  /* Estado inicial: zona de carga */
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files?.[0]; if (f) void seleccionar(f); }}
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors",
        arrastrando ? "border-primary bg-primary/5" : "border-border/80 bg-card hover:border-primary/40",
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        {fase === "leyendo" ? <Loader2 className="h-6 w-6 animate-spin" /> : <UploadCloud className="h-6 w-6" />}
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{fase === "leyendo" ? "Leyendo y validando el archivo…" : "Arrastre aquí su archivo de carga"}</h3>
      <p className="mt-1 max-w-md text-xs text-muted-foreground">
        Excel (.xlsx, .xls) con las hojas Empleados, Inventario_Equipos y/o Asignaciones, o un CSV de una sola hoja. Máximo {MAX_FILAS_HOJA.toLocaleString("es-CO")} filas por hoja y {MAX_TAMANO_MB} MB.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button size="sm" disabled={fase === "leyendo"} onClick={() => inputRef.current?.click()}>
          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
          Seleccionar archivo
        </Button>
        <Button size="sm" variant="outline" onClick={onPlantilla}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Descargar plantilla Excel
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.xlsm,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void seleccionar(f); e.target.value = ""; }}
      />
    </div>
  );
}

function traducirError(e: { message?: string; code?: string } | null): string {
  if (!e) return "Error desconocido al guardar";
  const m = e.message ?? "";
  if (e.code === "23505" || /duplicate key/i.test(m)) {
    if (/identificacion/i.test(m)) return "La cédula ya existe en el sistema (posiblemente en otro ecosistema)";
    if (/activo_fijo/i.test(m)) return "El activo fijo ya está registrado";
    if (/serie/i.test(m)) return "El serial ya está registrado";
    return "Registro duplicado";
  }
  if (e.code === "42501" || /row-level security/i.test(m)) return "Sin permiso para crear este registro";
  return m || "Error al guardar";
}

function Mini({ label, valor, cls }: { label: string; valor: number; cls: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 px-2 py-1.5">
      <div className={cn("font-mono text-base font-semibold", cls)}>{valor.toLocaleString("es-CO")}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* ── Tabla de filas con pestañas, filtros y paginación ─────────────────── */

function TablaFilas({ filas, res, modo }: { filas: FilaResultado[]; res?: Record<HojaId, ReturnType<typeof resumen>>; modo: "validacion" | "resultado" }) {
  const hojasConFilas = ORDEN.filter((h) => filas.some((f) => f.hoja === h));
  const [hoja, setHoja] = useState<HojaId | "todas">(hojasConFilas.length === 1 ? hojasConFilas[0]! : "todas");
  const [filtro, setFiltro] = useState<Filtro>(modo === "resultado" ? "fallo" : filas.some((f) => f.estado === "error") ? "error" : "todos");
  const [q, setQ] = useState("");

  const estadoDe = (f: FilaResultado): Resultado => (modo === "resultado" ? (f.resultado ?? f.estado) : f.estado);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => {
      if (hoja !== "todas" && f.hoja !== hoja) return false;
      const e = estadoDe(f);
      if (filtro === "avisos" ? !(f.avisos.length && e === "nuevo") : filtro === "fallo" ? !(e === "fallo" || e === "error") : filtro !== "todos" && e !== filtro) return false;
      if (t && !`${f.identificador} ${f.descripcion} ${f.errores.join(" ")}`.toLowerCase().includes(t)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, hoja, filtro, q, modo]);
  const pag = usePaginacion({ hoja, filtro, q });
  const pagina = visibles.slice(pag.desde, pag.desde + pag.tamano);

  const cuenta = (fx: Filtro) => filas.filter((f) => (hoja === "todas" || f.hoja === hoja) && (fx === "todos" ? true : fx === "avisos" ? f.avisos.length && estadoDe(f) === "nuevo" : fx === "fallo" ? ["fallo", "error"].includes(estadoDe(f)) : estadoDe(f) === fx)).length;
  const filtros: [Filtro, string][] =
    modo === "resultado"
      ? [["fallo", "No importadas"], ["nuevo", "Importadas"], ["existe", "Omitidas"], ["todos", "Todas"]]
      : [["todos", "Todas"], ["nuevo", "A importar"], ["existe", "Ya existen"], ["error", "Con error"], ["avisos", "Con avisos"]];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border/80 bg-muted/40 p-1">
          {(["todas", ...hojasConFilas] as const).map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHoja(h)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all", hoja === h ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60" : "text-muted-foreground hover:text-foreground")}
            >
              {h === "todas" ? "Todas las hojas" : HOJAS[h].titulo}
              {h !== "todas" && res && res[h].errores > 0 && modo === "validacion" && <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 font-mono text-[10px] text-destructive">{res[h].errores}</span>}
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cédula, serial o error…" className="h-8 pl-8 text-xs" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-border/60 px-4 py-2.5">
        {filtros.map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFiltro(k)}
            className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors", filtro === k ? "border-primary/40 bg-primary/10 text-primary" : "border-border/80 text-muted-foreground hover:text-foreground")}
          >
            {l} <span className="font-mono">({cuenta(k).toLocaleString("es-CO")})</span>
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Hoja · Fila</th>
              <th className="px-4 py-2.5">Identificador</th>
              <th className="px-4 py-2.5">Descripción</th>
              <th className="px-4 py-2.5">Estado</th>
              <th className="px-4 py-2.5">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pagina.map((f) => {
              const e = estadoDe(f);
              return (
                <tr key={`${f.hoja}-${f.fila}`} className={cn(e === "error" || e === "fallo" ? "bg-destructive/[0.04]" : "")}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{HOJAS[f.hoja].titulo} · <span className="font-mono">{f.fila}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-foreground">{f.identificador}</td>
                  <td className="max-w-[260px] truncate px-4 py-2.5 text-xs" title={f.descripcion}>{f.descripcion || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5"><BadgeEstado estado={e} modo={modo} /></td>
                  <td className="px-4 py-2.5 text-xs">
                    {[...f.errores, ...(f.detalleResultado ? [f.detalleResultado] : [])].map((m) => <div key={m} className="flex items-start gap-1 text-destructive"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{m}</div>)}
                    {f.avisos.map((m) => <div key={m} className="flex items-start gap-1 text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0 text-warning" />{m}</div>)}
                    {!f.errores.length && !f.avisos.length && !f.detalleResultado && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
            {!pagina.length && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">No hay filas para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-3 pb-3">
        <DataTablePagination total={visibles.length} pagina={pag.pagina} tamano={pag.tamano} onPagina={pag.setPagina} onTamano={pag.setTamano} />
      </div>
    </div>
  );
}

function BadgeEstado({ estado, modo }: { estado: Resultado; modo: "validacion" | "resultado" }) {
  const map: Record<Resultado, [string, string]> = {
    nuevo: [modo === "resultado" ? "Importado" : "A importar", "border-success/30 bg-success/10 text-success"],
    existe: ["Ya existe", "border-border bg-muted text-muted-foreground"],
    error: ["Con error", "border-destructive/30 bg-destructive/10 text-destructive"],
    fallo: ["Falló al guardar", "border-destructive/30 bg-destructive/10 text-destructive"],
  };
  const [l, c] = map[estado];
  return <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", c)}>{l}</span>;
}

/* ── Progreso ──────────────────────────────────────────────────────────── */

function PanelProgreso({ paso, pct, detalle, hayCat }: { paso: Paso | null; pct: number; detalle: string; hayCat: boolean }) {
  const pasos: [Paso, string][] = [
    ...(hayCat ? [["catalogos", "Creando valores de catálogo"] as [Paso, string]] : []),
    ["empleados", "Registrando empleados"],
    ["equipos", "Registrando equipos"],
    ["asignaciones", "Aplicando asignaciones"],
  ];
  const idx = pasos.findIndex(([p]) => p === paso);
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border/80 bg-card p-6 shadow-2xs">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Importando datos…</div>
      <p className="mt-1 text-xs text-muted-foreground">No cierre ni recargue esta pestaña hasta que finalice el proceso.</p>
      <div className="mt-5 space-y-1.5">
        <Progress value={pct} />
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>{detalle}</span><span className="font-mono">{pct}%</span></div>
      </div>
      <ol className="mt-5 space-y-2.5">
        {pasos.map(([p, l], i) => (
          <li key={p} className="flex items-center gap-2.5 text-xs">
            {i < idx ? <CheckCircle2 className="h-4 w-4 text-success" /> : i === idx ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CircleDashed className="h-4 w-4 text-muted-foreground/50" />}
            <span className={cn(i === idx ? "font-semibold text-foreground" : i < idx ? "text-foreground" : "text-muted-foreground")}>{l}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Resultado ─────────────────────────────────────────────────────────── */

function PanelResultado({ final, archivo, onNueva }: { final: { filas: FilaResultado[]; metricas: [string, number | string][]; catCreados: number; duracion: number }; archivo: string; onNueva: () => void }) {
  const m = Object.fromEntries(final.metricas) as Record<string, number>;
  const noImportadas = (m["Filas con error de validación"] ?? 0) + (m["Fallos al guardar"] ?? 0);
  const ok = noImportadas === 0;
  return (
    <div className="space-y-5">
      <div className={cn("flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5", ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/5")}>
        <div className="flex items-center gap-3">
          {ok ? <CheckCircle2 className="h-8 w-8 text-success" /> : <AlertTriangle className="h-8 w-8 text-warning" />}
          <div>
            <div className="text-base font-semibold text-foreground">{ok ? "Carga completada correctamente" : "Carga completada con observaciones"}</div>
            <div className="text-xs text-muted-foreground">{archivo} · {final.duracion}s · registrada en auditoría</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => descargarInforme(final.filas, final.metricas, archivo)}><Download className="mr-1.5 h-3.5 w-3.5" />Informe completo</Button>
          <Button size="sm" variant="outline" asChild><Link to="/equipos">Ver inventario</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to="/empleados">Ver empleados</Link></Button>
          <Button size="sm" onClick={onNueva}><UploadCloud className="mr-1.5 h-3.5 w-3.5" />Nueva carga</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { k: "Empleados creados", icon: Users, cls: "text-primary" },
          { k: "Equipos creados", icon: Laptop, cls: "text-primary" },
          { k: "Asignaciones registradas", icon: Link2, cls: "text-primary" },
          { k: "Omitidos (ya existían)", icon: CircleDashed, cls: "text-muted-foreground" },
        ].map(({ k, icon: Icon, cls }) => (
          <div key={k} className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">{k}<Icon className={cn("h-4 w-4", cls)} /></div>
            <div className="mt-1 font-mono text-2xl font-semibold text-foreground">{(m[k] ?? 0).toLocaleString("es-CO")}</div>
          </div>
        ))}
        <div className={cn("rounded-2xl border p-4 shadow-2xs", noImportadas ? "border-destructive/30 bg-destructive/5" : "border-border/80 bg-card")}>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">No importadas<XCircle className={cn("h-4 w-4", noImportadas ? "text-destructive" : "text-muted-foreground")} /></div>
          <div className={cn("mt-1 font-mono text-2xl font-semibold", noImportadas ? "text-destructive" : "text-foreground")}>{noImportadas.toLocaleString("es-CO")}</div>
        </div>
      </div>
      {final.catCreados > 0 && <p className="text-xs text-muted-foreground"><Tags className="mr-1 inline h-3.5 w-3.5" />Se crearon {final.catCreados} valor(es) nuevo(s) en los catálogos.</p>}
      <TablaFilas filas={final.filas} modo="resultado" />
    </div>
  );
}
