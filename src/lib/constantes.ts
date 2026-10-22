export const PERMISOS = [
  {
    id: "equipos_editar",
    grupo: "Inventario y Abastecimiento",
    label: "Gestionar equipos, estados, alistamiento y fallas",
    desc: "Registrar y editar equipos, cambiar estado, finalizar alistamientos/reparaciones y atender reportes de falla.",
  },
  {
    id: "reabastecimiento_gestionar",
    grupo: "Inventario y Abastecimiento",
    label: "Reabastecimiento, pedidos de compra y alertas de stock",
    desc: "Crear y gestionar pedidos a proveedores, recibir líneas de compra y configurar mínimos de alerta de stock.",
  },
  {
    id: "proveedores_editar",
    grupo: "Inventario y Abastecimiento",
    label: "Directorio de proveedores y artículos asociados",
    desc: "Crear y editar proveedores, vincular artículos/precios de referencia, recibir lotes y exportar directorio.",
  },
  {
    id: "cargas_masivas",
    grupo: "Inventario y Abastecimiento",
    label: "Carga masiva (Excel completo y CSV)",
    desc: "Importar inventario completo desde Excel o lotes de equipos y empleados por CSV.",
  },
  {
    id: "empleados_editar",
    grupo: "Personas y Actas",
    label: "Gestionar empleados y acceso al portal (PIN)",
    desc: "Registrar, editar, retirar o reactivar empleados y generar/regenerar su PIN de acceso.",
  },
  {
    id: "actas_entrega",
    grupo: "Personas y Actas",
    label: "Crear actas de entrega y préstamos de contingencia",
    desc: "Generar actas de entrega de equipos, préstamos temporales y actas de cambio (junto con devolución).",
  },
  {
    id: "actas_devolucion",
    grupo: "Personas y Actas",
    label: "Crear actas de devolución",
    desc: "Generar actas de devolución definiendo estado de destino (disponible, alistamiento o reparación).",
  },
  {
    id: "firmas_capturar",
    grupo: "Personas y Actas",
    label: "Capturar firmas en pantalla y enlaces remotos",
    desc: "Recoger la firma del empleado en el dispositivo o generar enlaces únicos de firma por correo/WhatsApp.",
  },
  {
    id: "repositorio_ver",
    grupo: "Personas y Actas",
    label: "Repositorio de actas y descarga de PDF / ZIP",
    desc: "Consultar el repositorio histórico de actas y descargar actas firmadas en PDF individual o archivo ZIP.",
  },
  {
    id: "estadisticas_ver",
    grupo: "Análisis y Configuración",
    label: "Ver estadísticas e indicadores ejecutivos",
    desc: "Acceder al tablero de KPIs, gráficas de utilización, fallas, garantías y exportar análisis a Excel/PDF.",
  },
  {
    id: "reportes_exportar",
    grupo: "Análisis y Configuración",
    label: "Generar y exportar reportes",
    desc: "Exportar reportes detallados de inventario, actas firmadas, histórico por empleado, pedidos y proveedores.",
  },
  {
    id: "catalogos_editar",
    grupo: "Análisis y Configuración",
    label: "Gestionar catálogos maestros",
    desc: "Crear, renombrar y activar/desactivar marcas, tipos de equipo, sedes, áreas y empresas.",
  },
] as const;
export type Permiso = (typeof PERMISOS)[number]["id"];

export const CATALOGOS = [
  { id: "marca", label: "Marcas" },
  { id: "tipo_equipo", label: "Tipos de equipo" },
  { id: "sede", label: "Sedes" },
  { id: "area", label: "Áreas" },
  { id: "empresa", label: "Empresas" },
] as const;
export type CatalogoTipo = (typeof CATALOGOS)[number]["id"];

export const ESTADO_EQUIPO: Record<string, { label: string; cls: string; dot?: string }> = {
  disponible: {
    label: "Disponible",
    cls: "bg-success/12 text-success border-success/25",
    dot: "bg-success",
  },
  asignado: {
    label: "Asignado",
    cls: "bg-primary/12 text-primary border-primary/25",
    dot: "bg-primary",
  },
  en_alistamiento: {
    label: "En alistamiento",
    cls: "bg-accent text-accent-foreground border-border",
    dot: "bg-muted-foreground",
  },
  en_reparacion: {
    label: "En reparación",
    cls: "bg-warning/15 text-warning-foreground border-warning/30",
    dot: "bg-warning",
  },
  de_baja: {
    label: "De baja",
    cls: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground/60",
  },
};

export const ESTADO_ACTA: Record<string, { label: string; cls: string; dot?: string }> = {
  pendiente: {
    label: "Pendiente de firma",
    cls: "bg-warning/15 text-warning-foreground border-warning/30",
    dot: "bg-warning",
  },
  firmada: {
    label: "Firmada",
    cls: "bg-success/12 text-success border-success/25",
    dot: "bg-success",
  },
  anulada: {
    label: "Anulada",
    cls: "bg-destructive/12 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
};

export const TIPO_ACTA: Record<string, string> = { entrega: "Entrega", devolucion: "Devolución", cambio: "Cambio" };

export const DESTINO_DEVOLUCION: Record<string, string> = { disponible: "Disponible inmediato", en_alistamiento: "En alistamiento / revisión", en_reparacion: "En reparación" };

export function fmtFecha(d?: string | null, hora = false) {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? d + "T12:00:00" : d);
  return date.toLocaleString("es-CO", hora
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

export function descargarCSV(nombre: string, filas: Record<string, unknown>[]) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]!);
  const esc = (v: unknown) => {
    const raw = String(v ?? "");
    const safe = /^[=+\-@\t\r]/.test(raw.trimStart()) ? `'${raw}` : raw;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = "\uFEFF" + [cols.join(";"), ...filas.map((f) => cols.map((c) => esc(f[c])).join(";"))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

export function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  return m.replace(/^PAZ_Y_SALVO:\s*/, "");
}
