import * as XLSX from "xlsx";
import Papa from "papaparse";

/* ──────────────────────────────────────────────────────────────────────────
 * Carga masiva: lectura, normalización, validación previa y plantilla Excel.
 * Todo se valida antes de escribir; la base de datos (RLS, triggers y la RPC
 * `asignar_carga_inicial`) sigue siendo la frontera de seguridad.
 * ────────────────────────────────────────────────────────────────────────── */

export type HojaId = "empleados" | "equipos" | "asignaciones";
export type CatTipo = "sede" | "area" | "empresa" | "marca" | "tipo_equipo";
export type EstadoFila = "nuevo" | "existe" | "error";
type Celda = string | number | boolean | Date | null | undefined;
type RowRaw = Record<string, Celda>;

export const HOJAS: Record<HojaId, { nombre: string; titulo: string }> = {
  empleados: { nombre: "Empleados", titulo: "Empleados" },
  equipos: { nombre: "Inventario_Equipos", titulo: "Equipos" },
  asignaciones: { nombre: "Asignaciones", titulo: "Asignaciones" },
};

export const CAT_LABEL: Record<CatTipo, string> = {
  tipo_equipo: "Tipo de equipo",
  marca: "Marca",
  sede: "Sede",
  area: "Área",
  empresa: "Empresa",
};

export const MAX_FILAS_HOJA = 5000;
export const MAX_TAMANO_MB = 15;

/* ── Columnas de la plantilla (encabezado visible + alias aceptados) ─────── */

type ColDef = { campo: string; encabezado: string; alias: string[]; requerido?: boolean; ancho: number; ayuda: string; ejemplo: string };

export const COLUMNAS: Record<HojaId, ColDef[]> = {
  empleados: [
    { campo: "cedula", encabezado: "Cédula *", alias: ["cedula", "identificacion", "documento", "numero de identificacion", "cc"], requerido: true, ancho: 16, ayuda: "Número de documento sin puntos ni espacios. Único en todo el sistema.", ejemplo: "1020304050" },
    { campo: "nombre", encabezado: "Nombre Completo *", alias: ["nombre completo", "nombre", "nombres y apellidos"], requerido: true, ancho: 30, ayuda: "Nombres y apellidos del colaborador.", ejemplo: "Ana María Pérez Gómez" },
    { campo: "email", encabezado: "Correo Corporativo", alias: ["correo corporativo", "correo", "email", "correo electronico"], ancho: 30, ayuda: "Correo válido. Opcional.", ejemplo: "ana.perez@finesa.com" },
    { campo: "cargo", encabezado: "Cargo", alias: ["cargo empleado", "cargo"], ancho: 24, ayuda: "Cargo actual. Opcional.", ejemplo: "Analista contable" },
    { campo: "area", encabezado: "Área Funcional", alias: ["area funcional", "area"], ancho: 22, ayuda: "Debe existir en el catálogo de Áreas (ver hoja Catalogos).", ejemplo: "Contabilidad" },
    { campo: "sede", encabezado: "Sede", alias: ["sede"], ancho: 18, ayuda: "Debe existir en el catálogo de Sedes.", ejemplo: "Bogotá" },
    { campo: "empresa", encabezado: "Empresa", alias: ["empresa"], ancho: 18, ayuda: "Debe existir en el catálogo de Empresas.", ejemplo: "Finesa S.A" },
  ],
  equipos: [
    { campo: "tipo", encabezado: "Tipo de Equipo *", alias: ["tipo de equipo", "tipo"], requerido: true, ancho: 18, ayuda: "Debe existir en el catálogo de Tipos de equipo.", ejemplo: "Portátil" },
    { campo: "marca", encabezado: "Marca", alias: ["marca"], ancho: 16, ayuda: "Debe existir en el catálogo de Marcas.", ejemplo: "Lenovo" },
    { campo: "modelo", encabezado: "Modelo", alias: ["modelo"], ancho: 20, ayuda: "Referencia comercial.", ejemplo: "ThinkPad E14 Gen 5" },
    { campo: "serie", encabezado: "Serial", alias: ["serial", "serie", "numero de serie"], ancho: 18, ayuda: "Único. Si se deja vacío se genera un código FIN-ACC automático (periféricos).", ejemplo: "PF3ABC12" },
    { campo: "activo_fijo", encabezado: "Activo Fijo", alias: ["activo fijo", "activo_fijo", "placa"], ancho: 14, ayuda: "Placa de activo fijo. Única si se diligencia.", ejemplo: "AF-000123" },
    { campo: "nombre_equipo", encabezado: "Nombre Equipo", alias: ["nombre equipo", "nombre del equipo", "nombre_equipo", "hostname"], ancho: 18, ayuda: "Hostname o nombre de red.", ejemplo: "FIN-BOG-0123" },
    { campo: "so", encabezado: "Sistema Operativo", alias: ["sistema operativo", "sistema_operativo", "so"], ancho: 18, ayuda: "Ej: Windows 11 Pro.", ejemplo: "Windows 11 Pro" },
    { campo: "proveedor", encabezado: "Proveedor", alias: ["proveedor"], ancho: 22, ayuda: "Si coincide con un proveedor registrado se vincula automáticamente.", ejemplo: "Proveedor SAS" },
    { campo: "fecha_ingreso", encabezado: "Fecha Ingreso", alias: ["fecha ingreso", "fecha de ingreso", "fecha_ingreso"], ancho: 14, ayuda: "AAAA-MM-DD o DD/MM/AAAA. Vacío = hoy.", ejemplo: "2026-01-15" },
    { campo: "anio", encabezado: "Año de Compra", alias: ["ano de compra", "anio de compra", "anio_compra", "ano compra"], ancho: 13, ayuda: "Año de 4 dígitos.", ejemplo: "2026" },
    { campo: "valor", encabezado: "Valor Compra", alias: ["valor compra", "valor de compra", "valor_compra", "valor"], ancho: 14, ayuda: "Número sin símbolos (COP).", ejemplo: "3500000" },
    { campo: "factura", encabezado: "Número Factura", alias: ["numero factura", "factura", "no factura", "factura_numero"], ancho: 16, ayuda: "Número de factura de compra.", ejemplo: "FE-4587" },
    { campo: "garantia", encabezado: "Garantía Hasta", alias: ["garantia hasta", "garantia fin", "garantia_fin", "fin de garantia"], ancho: 14, ayuda: "AAAA-MM-DD o DD/MM/AAAA.", ejemplo: "2029-01-15" },
    { campo: "sede", encabezado: "Sede", alias: ["sede"], ancho: 16, ayuda: "Vacío = se toma la sede del empleado al que se asigna.", ejemplo: "Bogotá" },
    { campo: "observaciones", encabezado: "Observaciones", alias: ["observaciones", "notas"], ancho: 30, ayuda: "Texto libre.", ejemplo: "" },
  ],
  asignaciones: [
    { campo: "cedula", encabezado: "Cédula Empleado *", alias: ["cedula empleado", "cedula", "identificacion"], requerido: true, ancho: 18, ayuda: "Cédula de un empleado de la hoja Empleados o ya registrado.", ejemplo: "1020304050" },
    { campo: "identificador", encabezado: "Identificador Equipo (Serial / Activo) *", alias: ["identificador equipo serial activo", "identificador", "serial", "serie", "activo fijo"], requerido: true, ancho: 34, ayuda: "Serial o activo fijo de un equipo de la hoja Inventario_Equipos o ya registrado y Disponible.", ejemplo: "PF3ABC12" },
  ],
};

/* ── Normalización ───────────────────────────────────────────────────────── */

const BAD = new Set(["", "#N/D", "N/D", "NAN", "NONE", "NULL", "PENDIENTE", "NN", "N/A", "NA", "-", "--"]);
const MARCA_FIX: Record<string, string> = { plantrnics: "Plantronics", logitec: "Logitech", hp: "HP", asus: "ASUS", startech: "StarTech", lenovo: "Lenovo", logitech: "Logitech", dell: "Dell" };
const NO_MARCA = new Set(["optical mouse", "optical", "4 ports hub", "4 port slim hub", "hub", "thinkpad ultra", "pdt", "generico", "genérico"]);
const EMPRESA_FIX: Record<string, string> = { "finesa s.a": "Finesa S.A", "finesa s.a.": "Finesa S.A", finesa: "Finesa S.A" };

export const normHeader = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[*()/\\:_.-]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const pad = (n: number) => String(n).padStart(2, "0");

function txt(v: Celda): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  let s = String(v);
  s = s.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return BAD.has(s.toUpperCase()) ? null : s;
}

export const normCedula = (v: string | null) => (v ? v.replace(/[\s.,]/g, "").toUpperCase() : null);
const normCodigo = (v: string | null) => (v ? v.replace(/\s+/g, "").toUpperCase() : null);
const normMarca = (v: string | null) => (!v || NO_MARCA.has(v.toLowerCase()) ? null : (MARCA_FIX[v.toLowerCase()] ?? v));
const normEmpresa = (v: string | null) => (v ? (EMPRESA_FIX[v.toLowerCase()] ?? v) : null);
const catKey = (t: CatTipo, n: string) => `${t}|${n.trim().toLowerCase()}`;

function fechaValida(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1990 && y <= 2100;
}

/** Devuelve AAAA-MM-DD, null si vacío o "invalida" si no se reconoce. */
function fecha(v: Celda): string | null | "invalida" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? "invalida" : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p && fechaValida(p.y, p.m, p.d) ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : "invalida";
  }
  const s = txt(v);
  if (!s) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) return fechaValida(+m[1]!, +m[2]!, +m[3]!) ? `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}` : "invalida";
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (m) return fechaValida(+m[3]!, +m[2]!, +m[1]!) ? `${m[3]}-${pad(+m[2]!)}-${pad(+m[1]!)}` : "invalida";
  return "invalida";
}

/** Convierte valores monetarios en formato colombiano o internacional. */
function numero(v: Celda): number | null | "invalido" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : "invalido";
  let s = txt(v);
  if (!s) return null;
  s = s.replace(/[$\sCOP]/gi, "");
  if (s.includes(".") && s.includes(",")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : "invalido";
}

/* ── Lectura del archivo ─────────────────────────────────────────────────── */

export type HojaLeida = { hoja: HojaId; nombreHoja: string; filas: { n: number; get: (campo: string) => Celda }[]; columnasFaltantes: string[]; ignoradas: number };
export type Lectura = { archivo: string; hojas: Partial<Record<HojaId, HojaLeida>>; hojasIgnoradas: string[] };

function clasificarPorNombre(nombre: string): HojaId | null | "omitir" {
  const n = normHeader(nombre);
  if (n.includes("instruc") || n.includes("catalog") || n.includes("ayuda") || n.includes("lista")) return "omitir";
  if (n.includes("asign")) return "asignaciones";
  if (n.includes("emplead") || n.includes("colaborador")) return "empleados";
  if (n.includes("equipo") || n.includes("inventario")) return "equipos";
  return null;
}

function clasificarPorEncabezados(headers: string[]): HojaId | null {
  const h = new Set(headers.map(normHeader));
  const tiene = (...xs: string[]) => xs.some((x) => h.has(x));
  if (tiene("identificador equipo serial activo", "identificador")) return "asignaciones";
  if (tiene("tipo de equipo", "tipo", "serial", "serie")) return "equipos";
  if (tiene("cedula", "identificacion") && tiene("nombre", "nombre completo")) return "empleados";
  return null;
}

function construirHoja(hoja: HojaId, nombreHoja: string, rows: RowRaw[]): HojaLeida {
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  const mapa = new Map<string, string>();
  for (const k of headers) mapa.set(normHeader(k), k);
  const resolver = new Map<string, string | undefined>();
  for (const c of COLUMNAS[hoja]) resolver.set(c.campo, c.alias.map((a) => mapa.get(normHeader(a))).find(Boolean));
  const columnasFaltantes = COLUMNAS[hoja].filter((c) => c.requerido && !resolver.get(c.campo)).map((c) => c.encabezado.replace(" *", ""));
  let ignoradas = 0;
  const filas: HojaLeida["filas"] = [];
  rows.forEach((r, i) => {
    const valores = Object.values(r);
    if (valores.every((v) => txt(v) === null)) return;
    // Filas de ejemplo de la plantilla (comienzan por "EJEMPLO") se ignoran
    if (valores.some((v) => typeof v === "string" && v.trim().toUpperCase().startsWith("EJEMPLO"))) {
      ignoradas++;
      return;
    }
    filas.push({ n: i + 2, get: (campo) => { const k = resolver.get(campo); return k ? r[k] : undefined; } });
  });
  return { hoja, nombreHoja, filas, columnasFaltantes, ignoradas };
}

export async function leerArchivo(file: File): Promise<Lectura> {
  if (file.size > MAX_TAMANO_MB * 1024 * 1024) throw new Error(`El archivo supera el tamaño máximo de ${MAX_TAMANO_MB} MB.`);
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  const hojas: Partial<Record<HojaId, HojaLeida>> = {};
  const hojasIgnoradas: string[] = [];

  const registrar = (nombreHoja: string, rows: RowRaw[]) => {
    if (!rows.length) return;
    let tipo = clasificarPorNombre(nombreHoja);
    if (tipo === "omitir") return;
    if (!tipo) tipo = clasificarPorEncabezados(Object.keys(rows[0]!));
    if (!tipo || hojas[tipo]) { hojasIgnoradas.push(nombreHoja); return; }
    if (rows.length > MAX_FILAS_HOJA) throw new Error(`La hoja "${nombreHoja}" supera el máximo de ${MAX_FILAS_HOJA.toLocaleString("es-CO")} filas por carga.`);
    hojas[tipo] = construirHoja(tipo, nombreHoja, rows);
  };

  if (ext === "csv" || ext === "txt") {
    const texto = await file.text();
    const res = Papa.parse<Record<string, string>>(texto.replace(/^\uFEFF/, ""), { header: true, skipEmptyLines: true, delimiter: "" });
    registrar(file.name, res.data as RowRaw[]);
  } else if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    for (const nombre of wb.SheetNames) {
      const ws = wb.Sheets[nombre];
      if (!ws) continue;
      registrar(nombre, XLSX.utils.sheet_to_json<RowRaw>(ws, { raw: true, defval: null }));
    }
  } else {
    throw new Error("Formato no soportado. Use un archivo .xlsx, .xls o .csv.");
  }

  if (!Object.keys(hojas).length) {
    throw new Error("No se encontraron hojas reconocibles. Use la plantilla oficial con las hojas Empleados, Inventario_Equipos y/o Asignaciones.");
  }
  return { archivo: file.name, hojas, hojasIgnoradas };
}

/* ── Validación previa ───────────────────────────────────────────────────── */

export type CatRef = { tipo: CatTipo; nombre: string };
export type FilaValidada = {
  hoja: HojaId;
  fila: number;
  identificador: string;
  descripcion: string;
  estado: EstadoFila;
  errores: string[];
  avisos: string[];
  datos?: Record<string, unknown> | undefined;
  refs?: Record<string, CatRef> | undefined;
  /** Asignaciones: claves para resolver ids al procesar */
  asig?: { cedula: string; codigo: string } | undefined;
};

export type Contexto = {
  catalogos: { id: string; tipo: string; nombre: string; activo: boolean }[];
  empleados: { id: string; identificacion: string; sede_id: string | null; activo: boolean }[];
  equipos: { id: string; serie: string; activo_fijo: string | null; estado: string; empleado_id: string | null }[];
  proveedores: { id: string; nombre: string }[];
  esAdmin: boolean;
  puedeEmpleados: boolean;
  puedeEquipos: boolean;
};

export type Validacion = {
  filas: Record<HojaId, FilaValidada[]>;
  faltantes: CatRef[];
  advertenciasGenerales: string[];
};

export function validar(lectura: Lectura, ctx: Contexto): Validacion {
  const hoy = new Date();
  const hoyIso = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;
  const advertenciasGenerales: string[] = [];

  const catalogo = new Map<string, { id: string; activo: boolean }>();
  for (const c of ctx.catalogos) catalogo.set(catKey(c.tipo as CatTipo, c.nombre), { id: c.id, activo: c.activo });
  const faltantes = new Map<string, CatRef>();

  /** Resuelve un valor de catálogo; si no existe registra error (auxiliar) o lo agenda para crear (admin). */
  function resolverCat(tipo: CatTipo, nombre: string | null, fila: FilaValidada, campo: string) {
    if (!nombre) return;
    const hit = catalogo.get(catKey(tipo, nombre));
    if (hit) {
      if (!hit.activo) fila.avisos.push(`${CAT_LABEL[tipo]} "${nombre}" está inactivo en el catálogo`);
      fila.datos![campo] = hit.id;
      return;
    }
    if (ctx.esAdmin) {
      faltantes.set(catKey(tipo, nombre), { tipo, nombre });
      fila.refs = { ...(fila.refs ?? {}), [campo]: { tipo, nombre } };
      fila.avisos.push(`Se creará ${CAT_LABEL[tipo].toLowerCase()} "${nombre}" en el catálogo`);
    } else {
      fila.errores.push(`${CAT_LABEL[tipo]} "${nombre}" no existe en el catálogo (solo el Administrador puede crearlo)`);
    }
  }

  for (const h of Object.values(lectura.hojas)) {
    if (h?.columnasFaltantes.length) advertenciasGenerales.push(`La hoja "${h.nombreHoja}" no tiene la(s) columna(s) obligatoria(s): ${h.columnasFaltantes.join(", ")}.`);
    if (h?.ignoradas) advertenciasGenerales.push(`Se ignoraron ${h.ignoradas} fila(s) de ejemplo en "${h.nombreHoja}".`);
  }
  if (lectura.hojasIgnoradas.length) advertenciasGenerales.push(`Hojas no reconocidas (ignoradas): ${lectura.hojasIgnoradas.join(", ")}.`);

  /* Empleados */
  const empDb = new Map(ctx.empleados.map((e) => [normCedula(e.identificacion)!, e]));
  const empArchivo = new Map<string, FilaValidada>();
  const sedeEmpArchivo = new Map<string, { id?: string | undefined; ref?: CatRef | undefined }>();
  const filasEmp: FilaValidada[] = [];
  for (const r of lectura.hojas.empleados?.filas ?? []) {
    const cedula = normCedula(txt(r.get("cedula")));
    const nombre = txt(r.get("nombre"));
    const f: FilaValidada = { hoja: "empleados", fila: r.n, identificador: cedula ?? "—", descripcion: nombre ?? "(sin nombre)", estado: "nuevo", errores: [], avisos: [], datos: {} };
    if (!ctx.puedeEmpleados) f.errores.push("No tiene el permiso «Editar empleados» para crear colaboradores");
    if (!cedula) f.errores.push("La cédula es obligatoria");
    else if (!/^[A-Z0-9-]{3,30}$/.test(cedula)) f.errores.push("Cédula inválida: use solo números o letras (3 a 30 caracteres)");
    if (!nombre) f.errores.push("El nombre completo es obligatorio");
    else if (nombre.length < 3 || nombre.length > 120) f.errores.push("El nombre debe tener entre 3 y 120 caracteres");
    let email = txt(r.get("email"))?.toLowerCase() ?? null;
    if (email && email.toUpperCase().startsWith("PENDIENTE")) email = null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) f.errores.push(`Correo "${email}" inválido`);

    if (cedula && empArchivo.has(cedula)) f.errores.push(`Cédula repetida en el archivo (fila ${empArchivo.get(cedula)!.fila})`);
    const duplicadaArchivo = !!cedula && empArchivo.has(cedula);
    const existente = cedula ? empDb.get(cedula) : undefined;
    f.datos = { identificacion: cedula, nombre, email, cargo: txt(r.get("cargo")) };
    resolverCat("area", txt(r.get("area")), f, "area_id");
    resolverCat("sede", txt(r.get("sede")), f, "sede_id");
    resolverCat("empresa", normEmpresa(txt(r.get("empresa"))), f, "empresa_id");

    if (existente && !duplicadaArchivo) {
      // Un registro existente nunca se modifica: sus demás columnas no se validan
      f.estado = "existe";
      f.errores = [];
      f.avisos = [existente.activo ? "Ya registrado: se conserva la información actual (no se modifica)" : "Ya registrado (inactivo): no se modifica"];
      f.refs = undefined;
      f.datos = undefined;
    } else if (f.errores.length) f.estado = "error";
    if (cedula && !empArchivo.has(cedula)) {
      empArchivo.set(cedula, f);
      sedeEmpArchivo.set(cedula, { id: (f.datos?.sede_id as string | undefined) ?? existente?.sede_id ?? undefined, ref: f.refs?.sede_id });
    }
    filasEmp.push(f);
  }

  /* Equipos */
  const eqSerieDb = new Map(ctx.equipos.map((e) => [e.serie.toUpperCase(), e]));
  const eqAfDb = new Map(ctx.equipos.filter((e) => e.activo_fijo).map((e) => [e.activo_fijo!.toUpperCase(), e]));
  const provMap = new Map(ctx.proveedores.map((p) => [p.nombre.trim().toLowerCase(), p]));
  const eqArchivo = new Map<string, FilaValidada>();

  // Sede por asignación: identificador → cédula
  const cedulaPorCodigo = new Map<string, string>();
  for (const r of lectura.hojas.asignaciones?.filas ?? []) {
    const c = normCodigo(txt(r.get("identificador")));
    const ced = normCedula(txt(r.get("cedula")));
    if (c && ced && !cedulaPorCodigo.has(c)) cedulaPorCodigo.set(c, ced);
  }

  const filasEq: FilaValidada[] = [];
  for (const r of lectura.hojas.equipos?.filas ?? []) {
    const serie = normCodigo(txt(r.get("serie")));
    const af = normCodigo(txt(r.get("activo_fijo")));
    const tipo = txt(r.get("tipo"));
    const modelo = txt(r.get("modelo"));
    const marcaTxt = normMarca(txt(r.get("marca")));
    const f: FilaValidada = {
      hoja: "equipos", fila: r.n, identificador: serie ?? af ?? "(código automático)",
      descripcion: [tipo, marcaTxt, modelo].filter(Boolean).join(" · ") || "(sin descripción)",
      estado: "nuevo", errores: [], avisos: [], datos: { estado: "disponible" },
    };
    if (!ctx.puedeEquipos) f.errores.push("No tiene el permiso «Editar equipos» para registrar inventario");
    if (!tipo) f.errores.push("El tipo de equipo es obligatorio");
    if (serie && serie.length > 60) f.errores.push("El serial supera 60 caracteres");
    if (!serie && !af) f.avisos.push("Sin serial ni activo fijo: se generará un código FIN-ACC automático");
    else if (!serie) f.avisos.push("Sin serial: se generará un código FIN-ACC; se identificará por su activo fijo");

    const dupSerie = serie ? eqArchivo.get(`S:${serie}`) : undefined;
    const dupAf = af ? eqArchivo.get(`A:${af}`) : undefined;
    if (dupSerie) f.errores.push(`Serial repetido en el archivo (fila ${dupSerie.fila})`);
    if (dupAf) f.errores.push(`Activo fijo repetido en el archivo (fila ${dupAf.fila})`);
    const existeSerie = serie ? eqSerieDb.get(serie) : undefined;
    const existeAf = af ? eqAfDb.get(af) : undefined;
    if (existeAf && (!existeSerie || existeSerie.id !== existeAf.id)) {
      if (!existeSerie && serie) f.errores.push(`El activo fijo ${af} ya pertenece a otro equipo registrado`);
    }

    const fIng = fecha(r.get("fecha_ingreso"));
    if (fIng === "invalida") f.errores.push("Fecha de ingreso inválida (use AAAA-MM-DD o DD/MM/AAAA)");
    else if (fIng && fIng > hoyIso) f.errores.push("La fecha de ingreso no puede ser futura");
    const gar = fecha(r.get("garantia"));
    if (gar === "invalida") f.errores.push("Fecha de garantía inválida (use AAAA-MM-DD o DD/MM/AAAA)");
    else if (gar && fIng && fIng !== "invalida" && gar < fIng) f.errores.push("La garantía no puede terminar antes de la fecha de ingreso");
    const anioTxt = txt(r.get("anio"));
    let anio: number | null = null;
    if (anioTxt) {
      if (!/^\d{4}$/.test(anioTxt) || +anioTxt < 1990 || +anioTxt > hoy.getFullYear() + 1) f.errores.push(`Año de compra "${anioTxt}" inválido`);
      else anio = +anioTxt;
    }
    const valor = numero(r.get("valor"));
    if (valor === "invalido") f.errores.push("Valor de compra inválido (use solo números)");
    else if (valor !== null && valor < 0) f.errores.push("El valor de compra no puede ser negativo");

    const provTxt = txt(r.get("proveedor"));
    const prov = provTxt ? provMap.get(provTxt.toLowerCase()) : undefined;
    if (provTxt && !prov) f.avisos.push(`Proveedor "${provTxt}" no está en el directorio: se guardará solo como texto`);

    f.datos = {
      estado: "disponible",
      modelo,
      serie: serie ?? "",
      activo_fijo: af,
      nombre_equipo: txt(r.get("nombre_equipo")),
      sistema_operativo: txt(r.get("so")),
      proveedor: prov?.nombre ?? provTxt,
      proveedor_id: prov?.id ?? null,
      fecha_ingreso: fIng && fIng !== "invalida" ? fIng : undefined,
      garantia_fin: gar && gar !== "invalida" ? gar : null,
      anio_compra: anio,
      valor_compra: typeof valor === "number" && valor >= 0 ? valor : null,
      factura_numero: txt(r.get("factura")),
      observaciones: txt(r.get("observaciones")),
    };
    resolverCat("tipo_equipo", tipo, f, "tipo_id");
    resolverCat("marca", marcaTxt, f, "marca_id");
    const sedeTxt = txt(r.get("sede"));
    if (sedeTxt) resolverCat("sede", sedeTxt, f, "sede_id");
    else {
      const ced = (serie && cedulaPorCodigo.get(serie)) || (af && cedulaPorCodigo.get(af)) || null;
      const s = ced ? sedeEmpArchivo.get(ced) : undefined;
      const sedeDb = ced ? empDb.get(ced)?.sede_id : undefined;
      if (s?.id) f.datos.sede_id = s.id;
      else if (s?.ref) f.refs = { ...(f.refs ?? {}), sede_id: s.ref };
      else if (sedeDb) f.datos.sede_id = sedeDb;
      if (f.datos.sede_id || f.refs?.sede_id) f.avisos.push("Sede tomada del empleado al que se asigna");
    }

    if (f.errores.length && (dupSerie || dupAf)) f.estado = "error";
    else if (existeSerie || (!serie && existeAf)) {
      // Un equipo existente nunca se modifica: sus demás columnas no se validan
      f.estado = "existe";
      f.errores = [];
      f.avisos = [`Ya registrado en el inventario (${(existeSerie ?? existeAf)!.estado.replace(/_/g, " ")}): no se modifica`];
      f.datos = undefined;
      f.refs = undefined;
    } else if (f.errores.length) f.estado = "error";
    if (serie && !dupSerie) eqArchivo.set(`S:${serie}`, f);
    if (af && !dupAf) eqArchivo.set(`A:${af}`, f);
    filasEq.push(f);
  }

  /* Asignaciones */
  const eqPorCodigoDb = new Map<string, Contexto["equipos"][number]>();
  for (const e of ctx.equipos) {
    eqPorCodigoDb.set(e.serie.toUpperCase(), e);
    if (e.activo_fijo && !eqPorCodigoDb.has(e.activo_fijo.toUpperCase())) eqPorCodigoDb.set(e.activo_fijo.toUpperCase(), e);
  }
  const usados = new Map<string, number>();
  const filasAsig: FilaValidada[] = [];
  for (const r of lectura.hojas.asignaciones?.filas ?? []) {
    const cedula = normCedula(txt(r.get("cedula")));
    const codigo = normCodigo(txt(r.get("identificador")));
    const f: FilaValidada = { hoja: "asignaciones", fila: r.n, identificador: `${codigo ?? "—"} → ${cedula ?? "—"}`, descripcion: "", estado: "nuevo", errores: [], avisos: [] };
    if (!ctx.puedeEquipos) f.errores.push("No tiene el permiso «Editar equipos» para registrar asignaciones");
    if (!cedula) f.errores.push("La cédula del empleado es obligatoria");
    if (!codigo) f.errores.push("El identificador del equipo es obligatorio");

    if (cedula) {
      const fe = empArchivo.get(cedula);
      const ed = empDb.get(cedula);
      if (fe && fe.estado === "error") f.errores.push(`El empleado de la fila ${fe.fila} (Empleados) tiene errores`);
      else if (!fe && !ed) f.errores.push(`El empleado ${cedula} no existe en el archivo ni en el sistema`);
      else if (ed && !ed.activo) f.errores.push(`El empleado ${cedula} está inactivo`);
      f.descripcion = fe?.descripcion && fe.descripcion !== "(sin nombre)" ? fe.descripcion : ed ? "Empleado registrado" : "";
    }
    if (codigo) {
      const fq = eqArchivo.get(`S:${codigo}`) ?? eqArchivo.get(`A:${codigo}`);
      const dq = eqPorCodigoDb.get(codigo);
      if (usados.has(codigo)) f.errores.push(`Equipo repetido en asignaciones (fila ${usados.get(codigo)})`);
      if (fq && fq.estado === "error") f.errores.push(`El equipo de la fila ${fq.fila} (Inventario_Equipos) tiene errores`);
      else if (fq && fq.estado === "nuevo") { /* se crea en esta carga como disponible */ }
      else if (dq) {
        const empId = cedula ? empDb.get(cedula)?.id : undefined;
        if (dq.estado === "asignado" && dq.empleado_id && dq.empleado_id === empId) {
          if (!f.errores.length) { f.estado = "existe"; f.avisos.push("El equipo ya está asignado a este empleado"); }
        } else if (dq.estado === "asignado") f.errores.push("El equipo ya está asignado a otro empleado (use un acta de devolución)");
        else if (dq.estado !== "disponible") f.errores.push(`El equipo está en estado «${dq.estado.replace(/_/g, " ")}» y no puede asignarse`);
      } else f.errores.push(`El equipo ${codigo} no existe en el archivo ni en el inventario`);
      usados.set(codigo, r.n);
    }
    if (f.errores.length) f.estado = "error";
    if (f.estado === "nuevo") f.asig = { cedula: cedula!, codigo: codigo! };
    filasAsig.push(f);
  }

  return {
    filas: { empleados: filasEmp, equipos: filasEq, asignaciones: filasAsig },
    faltantes: [...faltantes.values()],
    advertenciasGenerales,
  };
}

export function resumen(filas: FilaValidada[]) {
  return {
    total: filas.length,
    nuevos: filas.filter((f) => f.estado === "nuevo").length,
    existentes: filas.filter((f) => f.estado === "existe").length,
    errores: filas.filter((f) => f.estado === "error").length,
    avisos: filas.filter((f) => f.estado === "nuevo" && f.avisos.length).length,
  };
}

/* ── Plantilla Excel completa ────────────────────────────────────────────── */

export function descargarPlantilla(opts: {
  catalogos: { tipo: string; nombre: string; activo: boolean }[];
  proveedores: { nombre: string }[];
}) {
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: "Plantilla de carga masiva — Inventario TI Finesa", Author: "Finesa Inventario TI", CreatedDate: new Date() };

  const lista = (t: CatTipo) => opts.catalogos.filter((c) => c.tipo === t && c.activo).map((c) => c.nombre).sort((a, b) => a.localeCompare(b, "es"));
  const primero = (t: CatTipo, def: string) => lista(t)[0] ?? def;

  // 1. Instrucciones
  const ins: (string | number)[][] = [
    ["PLANTILLA DE CARGA MASIVA — INVENTARIO TI"],
    [`Generada el ${new Date().toLocaleString("es-CO")}`],
    [],
    ["CÓMO USAR ESTA PLANTILLA"],
    ["1.", "Diligencie las hojas Empleados, Inventario_Equipos y/o Asignaciones. Puede usar solo las que necesite."],
    ["2.", "No cambie el nombre de las hojas ni de los encabezados. Las columnas marcadas con * son obligatorias."],
    ["3.", "Los valores de Tipo, Marca, Sede, Área y Empresa deben coincidir con la hoja Catalogos (no distingue mayúsculas)."],
    ["4.", "Las filas que comienzan por EJEMPLO se ignoran automáticamente: puede sobrescribirlas o borrarlas."],
    ["5.", "Fechas en formato AAAA-MM-DD (recomendado) o DD/MM/AAAA. Valores monetarios sin símbolos."],
    ["6.", "Suba el archivo en Carga masiva: el sistema valida todo antes de guardar y muestra un informe fila por fila."],
    ["7.", "Los registros que ya existen (misma cédula o serial) se omiten sin modificarse. Las filas con error no se importan."],
    ["8.", "Las asignaciones se registran como carga inicial (sin acta). Para entregas nuevas use el módulo de Actas."],
    [],
    ["LÍMITES"],
    ["•", `Máximo ${MAX_FILAS_HOJA.toLocaleString("es-CO")} filas por hoja y ${MAX_TAMANO_MB} MB por archivo.`],
    ["•", "Los equipos nuevos ingresan en estado Disponible; los incluidos en Asignaciones quedan Asignados."],
    [],
  ];
  for (const h of ["empleados", "equipos", "asignaciones"] as HojaId[]) {
    ins.push([`HOJA «${HOJAS[h].nombre}»`]);
    ins.push(["Columna", "Obligatoria", "Descripción", "Ejemplo"]);
    for (const c of COLUMNAS[h]) ins.push([c.encabezado.replace(" *", ""), c.requerido ? "Sí" : "No", c.ayuda, c.ejemplo]);
    ins.push([]);
  }
  const wsIns = XLSX.utils.aoa_to_sheet(ins);
  wsIns["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 95 }, { wch: 26 }];
  wsIns["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }];
  XLSX.utils.book_append_sheet(wb, wsIns, "Instrucciones");

  // 2. Hojas de datos con filas de ejemplo
  const sede = primero("sede", "Bogotá");
  const ejemplos: Record<HojaId, Record<string, string>[]> = {
    empleados: [
      { cedula: "EJEMPLO-1020304050", nombre: "Ana María Pérez Gómez", email: "ana.perez@finesa.com", cargo: "Analista contable", area: primero("area", "Contabilidad"), sede, empresa: primero("empresa", "Finesa S.A") },
      { cedula: "EJEMPLO-79888777", nombre: "Carlos Andrés Ruiz", email: "", cargo: "Asesor comercial", area: lista("area")[1] ?? primero("area", "Comercial"), sede, empresa: primero("empresa", "Finesa S.A") },
    ],
    equipos: [
      { tipo: primero("tipo_equipo", "Portátil"), marca: primero("marca", "Lenovo"), modelo: "ThinkPad E14 Gen 5", serie: "EJEMPLO-PF3ABC12", activo_fijo: "AF-000123", nombre_equipo: "FIN-BOG-0123", so: "Windows 11 Pro", proveedor: opts.proveedores[0]?.nombre ?? "Proveedor SAS", fecha_ingreso: "2026-01-15", anio: "2026", valor: "3500000", factura: "FE-4587", garantia: "2029-01-15", sede: "", observaciones: "" },
      { tipo: lista("tipo_equipo")[1] ?? "Mouse", marca: lista("marca")[1] ?? "Logitech", modelo: "M90", serie: "EJEMPLO-", activo_fijo: "", nombre_equipo: "", so: "", proveedor: "", fecha_ingreso: "2026-01-15", anio: "2026", valor: "45000", factura: "", garantia: "", sede, observaciones: "Sin serial: se genera código FIN-ACC" },
    ],
    asignaciones: [{ cedula: "EJEMPLO-1020304050", identificador: "EJEMPLO-PF3ABC12" }],
  };
  for (const h of ["empleados", "equipos", "asignaciones"] as HojaId[]) {
    const cols = COLUMNAS[h];
    const aoa: string[][] = [cols.map((c) => c.encabezado), ...ejemplos[h].map((e) => cols.map((c) => e[c.campo] ?? ""))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map((c) => ({ wch: c.ancho }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }) };
    // Forzar formato texto en columnas de identificación para conservar ceros a la izquierda
    const textoCols = cols.map((c, i) => (["cedula", "serie", "activo_fijo", "identificador", "factura"].includes(c.campo) ? i : -1)).filter((i) => i >= 0);
    for (let r = 1; r <= 1000; r++) {
      for (const c of textoCols) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: "s", v: "", z: "@" };
        else ws[ref].z = "@";
      }
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: cols.length - 1 } });
    XLSX.utils.book_append_sheet(wb, ws, HOJAS[h].nombre);
  }

  // 3. Catálogos vigentes (valores válidos)
  const listas: [string, string[]][] = [
    ["Tipos de equipo", lista("tipo_equipo")],
    ["Marcas", lista("marca")],
    ["Sedes", lista("sede")],
    ["Áreas", lista("area")],
    ["Empresas", lista("empresa")],
    ["Proveedores", opts.proveedores.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"))],
  ];
  const maxLen = Math.max(1, ...listas.map(([, l]) => l.length));
  const aoaCat: string[][] = [listas.map(([t]) => t)];
  for (let i = 0; i < maxLen; i++) aoaCat.push(listas.map(([, l]) => l[i] ?? ""));
  const wsCat = XLSX.utils.aoa_to_sheet(aoaCat);
  wsCat["!cols"] = listas.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, wsCat, "Catalogos");

  XLSX.writeFile(wb, `plantilla_carga_masiva_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}

/* ── Informe de resultados ───────────────────────────────────────────────── */

const ETIQUETA_ESTADO: Record<string, string> = { nuevo: "Importado", existe: "Omitido (ya existe)", error: "Con error (no importado)", fallo: "Falló al guardar" };

export function descargarInforme(
  filas: (FilaValidada & { resultado?: "nuevo" | "existe" | "error" | "fallo" | undefined; detalleResultado?: string | undefined })[],
  metricas: [string, string | number][],
  archivo: string,
) {
  const wb = XLSX.utils.book_new();
  const wsRes = XLSX.utils.aoa_to_sheet([["Informe de carga masiva"], ["Archivo", archivo], ["Fecha", new Date().toLocaleString("es-CO")], [], ["Métrica", "Valor"], ...metricas]);
  wsRes["!cols"] = [{ wch: 40 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsRes, "Resumen");
  const det = filas.map((f) => ({
    Hoja: HOJAS[f.hoja].nombre,
    Fila: f.fila,
    Identificador: f.identificador,
    Descripción: f.descripcion,
    Resultado: ETIQUETA_ESTADO[f.resultado ?? f.estado] ?? f.estado,
    Errores: [...f.errores, f.detalleResultado].filter(Boolean).join(" · "),
    Avisos: f.avisos.join(" · "),
  }));
  const wsDet = XLSX.utils.json_to_sheet(det);
  wsDet["!cols"] = [{ wch: 20 }, { wch: 7 }, { wch: 28 }, { wch: 34 }, { wch: 24 }, { wch: 70 }, { wch: 60 }];
  if (det.length) wsDet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: det.length, c: 6 } }) };
  XLSX.utils.book_append_sheet(wb, wsDet, "Detalle");
  XLSX.writeFile(wb, `informe_carga_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}
