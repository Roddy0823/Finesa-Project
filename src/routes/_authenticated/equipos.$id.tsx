import { FinalizarReparacion } from "@/components/FinalizarReparacion";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { adjuntarFirmaTecnico } from "@/lib/ajustes.functions";
import { urlArchivo } from "@/lib/firmas.functions";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { TIPO_ACTA, errMsg, fmtFecha } from "@/lib/constantes";
import { PageHeader, EstadoActa, EstadoEquipo } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DataTablePagination, usePaginacion } from "@/components/DataTablePagination";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronDown,
  Copy,
  CreditCard,
  Download,
  FileSignature,
  FileText,
  History,
  Laptop,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ETIQUETA_SERVICIO, type Prov } from "@/lib/proveedores";
import { ContactoProveedor } from "@/components/ContactoProveedor";
import { cn, copiarTexto } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/equipos/$id")({
  head: () => ({
    meta: [
      { title: "Ficha del equipo — Finesa" },
      { name: "description", content: "Especificaciones técnicas, historial de movimientos y actas del equipo." },
    ],
  }),
  component: FichaEquipo,
});

const EVENTOS: Record<string, string> = {
  ingreso: "Ingreso al inventario",
  entrega: "Entrega a colaborador",
  devolucion: "Devolución de equipo",
  en_reparacion: "Enviado a reparación",
  de_baja: "Dado de baja",
  cambio: "Acta de cambio",
  alistado: "Alistamiento terminado",
  en_alistamiento: "En alistamiento",
  falla_reportada: "Falla reportada",
  falla_atendido: "Falla atendida",
  falla_descartado: "Falla descartada",
  falla_en_reparacion: "Falla → reparación",
  disponible: "Disponible",
  correccion_serie: "Corrección de serie",
  acta_anulada: "Acta anulada",
  carga_inicial: "Asignación por carga inicial",
  asignacion: "Cambio de responsable",
  edicion: "Cambio de datos",
  asignado: "Asignado",
};

type ActaItemEquipo = {
  id: string;
  direccion: string | null;
  estado_fisico: string | null;
  accesorios: string | null;
  nota: string | null;
  estado_destino: string | null;
  acta: {
    id: string;
    numero: number;
    tipo: "entrega" | "devolucion" | "cambio";
    estado: "pendiente" | "firmada" | "anulada";
    es_prestamo: boolean;
    prestamo_hasta: string | null;
    created_at: string;
    firmado_at: string | null;
    pdf_path: string | null;
    tecnico_nombre: string | null;
    empleado: { id: string; nombre: string; identificacion: string } | null;
  } | null;
};

const selCls =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function FichaEquipo() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const cat = useCatalogos();

  const q = useQuery({
    queryKey: ["equipo", id],
    queryFn: async () => {
      const [e, h, ai] = await Promise.all([
        supabase.from("equipos").select("*, empleado:empleados(id, nombre, identificacion)").eq("id", id).maybeSingle(),
        supabase.from("equipo_historial").select("*").eq("equipo_id", id).order("created_at", { ascending: false }),
        supabase
          .from("acta_items")
          .select(
            "id, direccion, estado_fisico, accesorios, nota, estado_destino, acta:actas(id, numero, tipo, estado, es_prestamo, prestamo_hasta, created_at, firmado_at, pdf_path, tecnico_nombre, empleado:empleados(id, nombre, identificacion))",
          )
          .eq("equipo_id", id),
      ]);
      if (e.error) throw e.error;
      const ids = [...new Set((h.data ?? []).map((x) => x.user_id).filter(Boolean))] as string[];
      const { data: ps } = ids.length
        ? await supabase.from("profiles").select("id, nombre, email").in("id", ids)
        : { data: [] };
      const usuarios = Object.fromEntries((ps ?? []).map((p) => [p.id, p.nombre || p.email]));
      const actasEquipo = ((ai.data ?? []) as unknown as ActaItemEquipo[])
        .filter((x) => x.acta !== null)
        .sort((a, b) => (b.acta?.created_at ?? "").localeCompare(a.acta?.created_at ?? ""));
      return { e: e.data, h: h.data ?? [], actasEquipo, usuarios };
    },
  });

  const e = q.data?.e;
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Cargando ficha del equipo…</p>;
  if (!e) return <p className="text-sm text-muted-foreground">Equipo no encontrado.</p>;

  async function verFactura() {
    const { data, error } = await supabase.storage.from("facturas").createSignedUrl(e!.factura_path!, 120);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function verDocumentoBaja() {
    if (!e?.baja_documento_path) return;
    const { data, error } = await supabase.storage.from("facturas").createSignedUrl(e.baja_documento_path, 120);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const emp = e.empleado as { id: string; nombre: string; identificacion?: string } | null;
  const hoyIso = new Date().toISOString().slice(0, 10);
  const enGarantia = !!e.garantia_fin && e.garantia_fin >= hoyIso;

  return (
    <div className="space-y-5">
      {/* Navegación superior */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/equipos" className="inline-flex items-center gap-1 font-medium hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Inventario
        </Link>
        <span>/</span>
        <span className="font-mono font-semibold text-foreground">{e.serie}</span>
      </div>

      <PageHeader
        title={e.serie}
        desc={`${cat.nombre(e.tipo_id)} · ${cat.nombre(e.marca_id)} ${e.modelo ?? ""}${e.activo_fijo ? ` · Activo fijo: ${e.activo_fijo}` : ""}`}
      >
        <EstadoEquipo estado={e.estado} />
        {e.prestamo_hasta && e.estado === "asignado" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-medium text-warning-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Préstamo hasta {fmtFecha(e.prestamo_hasta)}
          </span>
        )}
        {me?.can("equipos_editar") && <EditarEquipo e={e} />}
        {me?.can("equipos_editar") && e.estado === "en_reparacion" && (
          <FinalizarReparacion id={e.id} empleado={emp?.nombre ?? null} />
        )}
        {me?.can("equipos_editar") && (e.estado as string) === "en_alistamiento" && <MarcarListo id={e.id} />}
        {me?.can("equipos_editar") && e.estado !== "de_baja" && !(e.estado === "en_reparacion" && !me?.isAdmin) && (
          <CambiarEstado
            id={e.id}
            actual={e.estado}
            admin={!!me?.isAdmin}
            empleadoId={emp?.id ?? null}
            tecnicoId={me!.id}
            puedeEntregar={!!me?.can("actas_entrega")}
          />
        )}
        {me?.isAdmin && <CorregirSerie id={e.id} serie={e.serie} />}
      </PageHeader>

      <GarantiaYReparacion e={e} />

      {/* Tarjetas ejecutivas de estado del activo */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Custodia actual</span>
            <UserCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 truncate font-display text-sm font-bold text-foreground">
            {emp ? (
              <Link to="/empleados/$id" params={{ id: emp.id }} className="text-primary hover:underline">
                {emp.nombre}
              </Link>
            ) : e.estado === "disponible" ? (
              "Disponible en bodega"
            ) : (
              "Sin responsable asignado"
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {emp?.identificacion ? `C.C. ${emp.identificacion}` : `Sede: ${cat.nombre(e.sede_id)}`}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Identificadores técnicos</span>
            <Laptop className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-sm font-bold text-foreground">
            <span>{e.serie}</span>
            <button
              type="button"
              title="Copiar serie"
              onClick={async () => {
                if (await copiarTexto(e.serie)) toast.success("Serie copiada");
              }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            AF: <b className="font-mono text-foreground">{e.activo_fijo || "—"}</b> · Host:{" "}
            <b className="font-mono text-foreground">{e.nombre_equipo || "—"}</b>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Adquisición y valor</span>
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 font-mono text-base font-bold text-foreground">
            {e.valor_compra != null ? `$${Number(e.valor_compra).toLocaleString("es-CO")}` : "Sin valor registrado"}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            Proveedor: <b className="font-medium text-foreground">{e.proveedor || "—"}</b>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Garantía y trazabilidad</span>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {e.garantia_fin ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                  enGarantia
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {enGarantia ? "Vigente hasta " : "Venció "}
                {fmtFecha(e.garantia_fin)}
              </span>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Sin fecha de garantía</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {q.data!.h.length} movimiento(s) · {q.data!.actasEquipo.length} acta(s)
          </div>
        </div>
      </div>

      {/* Contenido principal: Ficha técnica + Historiales paginados */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Ficha técnica del activo</h2>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {e.baja_documento_path && (
                  <Button size="sm" variant="outline" className="h-7 border-destructive/30 text-xs text-destructive hover:bg-destructive/10" onClick={verDocumentoBaja}>
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    Soporte de baja
                  </Button>
                )}
                {e.factura_path && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={verFactura}>
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    Ver factura
                  </Button>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 p-5 text-xs">
              <Dato k="Tipo de equipo" v={cat.nombre(e.tipo_id)} />
              <Dato k="Marca y modelo" v={`${cat.nombre(e.marca_id)} ${e.modelo ?? ""}`.trim() || "—"} />
              <Dato k="Sede actual" v={cat.nombre(e.sede_id)} />
              <Dato
                k="Asignado a"
                v={
                  emp ? (
                    <Link to="/empleados/$id" params={{ id: emp.id }} className="font-semibold text-primary hover:underline">
                      {emp.nombre}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Dato k="Fecha de ingreso" v={fmtFecha(e.fecha_ingreso)} />
              <Dato k="Fin de garantía" v={fmtFecha(e.garantia_fin)} />
              <Dato k="Proveedor" v={e.proveedor ?? "—"} />
              <Dato
                k="Valor de compra"
                v={e.valor_compra != null ? `$${Number(e.valor_compra).toLocaleString("es-CO")}` : "—"}
              />
              <Dato k="Código interno" v={e.codigo_interno ? "Sí (FIN-ACC)" : "No"} />
              <Dato k="Activo fijo" v={e.activo_fijo ?? "—"} />
              <Dato k="Año de compra" v={e.anio_compra ?? "—"} />
              <Dato k="Nombre de equipo" v={e.nombre_equipo ?? "—"} />
              <Dato k="Número de factura" v={e.factura_numero ?? "—"} />
              <Dato k="Sistema operativo" v={e.sistema_operativo ?? "—"} />
              <div className="col-span-2 border-t border-border/60 pt-3">
                <Dato k="Novedad registrada" v={e.novedad ?? "—"} />
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] font-medium text-muted-foreground">Observaciones</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/15 p-2.5 text-xs text-foreground">
                  {e.observaciones || "Sin observaciones."}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Panel de Historiales Paginados (25 filas por página) */}
        <div className="lg:col-span-2">
          <HistorialesEquipo
            equipoId={e.id}
            h={q.data!.h}
            actasEquipo={q.data!.actasEquipo}
            usuarios={q.data!.usuarios}
          />
        </div>
      </div>
    </div>
  );
}

type Hist = {
  id: string;
  evento: string;
  detalle: string | null;
  acta_id: string | null;
  user_id: string | null;
  created_at: string;
};

function HistorialesEquipo({
  equipoId,
  h,
  actasEquipo,
  usuarios,
}: {
  equipoId: string;
  h: Hist[];
  actasEquipo: ActaItemEquipo[];
  usuarios: Record<string, string>;
}) {
  const obtenerUrlPdf = useServerFn(urlArchivo);
  const [tab, setTab] = useState<"movimientos" | "actas">("movimientos");

  // Filtros Historial de Movimientos
  const [buscaMov, setBuscaMov] = useState("");
  const [filtroEv, setFiltroEv] = useState("");

  // Filtros Historial de Actas
  const [buscaActa, setBuscaActa] = useState("");
  const [tipoActa, setTipoActa] = useState("");
  const [estadoActa, setEstadoActa] = useState("");

  const pagMov = usePaginacion({ equipoId, buscaMov, filtroEv }, 25);
  const pagActas = usePaginacion({ equipoId, buscaActa, tipoActa, estadoActa }, 25);

  const movsFiltrados = useMemo(() => {
    const t = buscaMov.trim().toLowerCase();
    return h.filter((x) => {
      if (filtroEv && x.evento !== filtroEv) return false;
      if (t) {
        const ev = (EVENTOS[x.evento] ?? x.evento).toLowerCase();
        const det = (x.detalle ?? "").toLowerCase();
        const usr = (x.user_id ? (usuarios[x.user_id] ?? "") : "sistema").toLowerCase();
        if (!ev.includes(t) && !det.includes(t) && !usr.includes(t)) return false;
      }
      return true;
    });
  }, [h, buscaMov, filtroEv, usuarios]);

  const actasFiltradas = useMemo(() => {
    const t = buscaActa.trim().toLowerCase();
    return actasEquipo.filter((item) => {
      const a = item.acta;
      if (!a) return false;
      if (tipoActa && a.tipo !== tipoActa) return false;
      if (estadoActa && a.estado !== estadoActa) return false;
      if (t) {
        const num = String(a.numero);
        const emp = (a.empleado?.nombre ?? "").toLowerCase();
        const ced = (a.empleado?.identificacion ?? "").toLowerCase();
        const tec = (a.tecnico_nombre ?? "").toLowerCase();
        if (!num.includes(t) && !emp.includes(t) && !ced.includes(t) && !tec.includes(t)) return false;
      }
      return true;
    });
  }, [actasEquipo, buscaActa, tipoActa, estadoActa]);

  const movsPagina = movsFiltrados.slice(pagMov.desde, pagMov.desde + pagMov.tamano);
  const actasPagina = actasFiltradas.slice(pagActas.desde, pagActas.desde + pagActas.tamano);

  async function descargarActa(actaId: string, numero: number) {
    await descargarPdfActa(obtenerUrlPdf, actaId, `acta-${numero}.pdf`);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
      {/* Cabecera de pestañas y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-5 py-3.5">
        <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setTab("movimientos")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              tab === "movimientos"
                ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="h-3.5 w-3.5 text-primary" />
            <span>Historial del equipo</span>
            <span className="rounded-full bg-primary/12 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
              {h.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("actas")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              tab === "actas"
                ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileSignature className="h-3.5 w-3.5 text-primary" />
            <span>Historial de actas</span>
            <span className="rounded-full bg-primary/12 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
              {actasEquipo.length}
            </span>
          </button>
        </div>

        {tab === "movimientos" ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar evento o detalle…"
                className="h-9 pl-8 text-xs"
                value={buscaMov}
                onChange={(ev) => setBuscaMov(ev.target.value)}
              />
            </div>
            <select className={selCls} value={filtroEv} onChange={(ev) => setFiltroEv(ev.target.value)}>
              <option value="">Todos los eventos</option>
              {Object.entries(EVENTOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {(buscaMov || filtroEv) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setBuscaMov("");
                  setFiltroEv("");
                }}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Limpiar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-52">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar # acta o empleado…"
                className="h-9 pl-8 text-xs"
                value={buscaActa}
                onChange={(ev) => setBuscaActa(ev.target.value)}
              />
            </div>
            <select className={selCls} value={tipoActa} onChange={(ev) => setTipoActa(ev.target.value)}>
              <option value="">Todos los tipos</option>
              <option value="entrega">Entrega</option>
              <option value="devolucion">Devolución</option>
              <option value="cambio">Cambio</option>
            </select>
            <select className={selCls} value={estadoActa} onChange={(ev) => setEstadoActa(ev.target.value)}>
              <option value="">Todos los estados</option>
              <option value="firmada">Firmada</option>
              <option value="pendiente">Pendiente</option>
              <option value="anulada">Anulada</option>
            </select>
            {(buscaActa || tipoActa || estadoActa) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => {
                  setBuscaActa("");
                  setTipoActa("");
                  setEstadoActa("");
                }}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Limpiar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Cuerpo del historial activo */}
      {tab === "movimientos" ? (
        <div className="p-5">
          {!movsPagina.length ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No hay movimientos que coincidan con los filtros seleccionados.
            </p>
          ) : (
            <ol className="relative space-y-2.5">
              {movsPagina.map((x) => (
                <li key={x.id} className="relative border-l-2 border-border/80 pb-2 pl-5 last:pb-0">
                  <span className="absolute -left-[6px] top-2.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <Collapsible defaultOpen={movsPagina.length <= 5}>
                    <div className="rounded-xl border border-border/70 bg-background/50 p-3 transition-colors hover:border-border">
                      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-2 text-left">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                              {EVENTOS[x.evento] ?? x.evento}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {fmtFecha(x.created_at, true)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              · Por{" "}
                              <b className="font-medium text-foreground">
                                {x.user_id ? (usuarios[x.user_id] ?? "Usuario") : "Sistema"}
                              </b>
                            </span>
                          </div>
                          {x.detalle && (
                            <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground group-data-[state=open]:hidden">
                              {x.detalle.replace(/en_reparacion/g, "en reparación").replace(/de_baja/g, "de baja")}
                            </p>
                          )}
                        </div>
                        {(x.detalle || x.acta_id) && (
                          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                        )}
                      </CollapsibleTrigger>

                      {(x.detalle || x.acta_id) && (
                        <CollapsibleContent className="mt-2.5 border-t border-border/60 pt-2.5">
                          {x.detalle && (
                            <div className="rounded-lg bg-muted/40 p-2.5 text-xs leading-relaxed text-foreground">
                              {x.detalle.replace(/en_reparacion/g, "en reparación").replace(/de_baja/g, "de baja")}
                            </div>
                          )}
                          {x.acta_id && (
                            <div className="mt-2 flex justify-end">
                              <Link
                                to="/actas/$id"
                                params={{ id: x.acta_id }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                <FileSignature className="h-3.5 w-3.5" />
                                Ver acta vinculada →
                              </Link>
                            </div>
                          )}
                        </CollapsibleContent>
                      )}
                    </div>
                  </Collapsible>
                </li>
              ))}
            </ol>
          )}

          <DataTablePagination
            total={movsFiltrados.length}
            pagina={pagMov.pagina}
            tamano={pagMov.tamano}
            onPagina={pagMov.setPagina}
            onTamano={pagMov.setTamano}
          />
        </div>
      ) : (
        <div className="p-5">
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Acta</th>
                  <th className="px-4 py-2.5">Tipo / Movimiento</th>
                  <th className="px-4 py-2.5">Colaborador</th>
                  <th className="px-4 py-2.5">Estado físico / Accesorios</th>
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="px-4 py-2.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {actasPagina.map((item) => {
                  const a = item.acta!;
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/actas/$id"
                          params={{ id: a.id }}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          #{a.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-medium text-foreground">{TIPO_ACTA[a.tipo] ?? a.tipo}</span>
                        {a.tipo === "cambio" && item.direccion && (
                          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.2 text-[10px] text-muted-foreground">
                            {item.direccion === "devolucion" ? "Devuelto" : "Entregado"}
                          </span>
                        )}
                        {a.es_prestamo && (
                          <span className="ml-1.5 rounded border border-warning/40 bg-warning/15 px-1.5 py-0.2 text-[10px] font-medium text-warning-foreground">
                            Préstamo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {a.empleado ? (
                          <Link
                            to="/empleados/$id"
                            params={{ id: a.empleado.id }}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {a.empleado.nombre}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="max-w-xs px-4 py-2.5 text-xs text-muted-foreground">
                        <div>Estado: {item.estado_fisico || "—"}</div>
                        {item.accesorios && <div className="truncate text-[11px]">Acc.: {item.accesorios}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {fmtFecha(a.firmado_at ?? a.created_at, true)}
                      </td>
                      <td className="px-4 py-2.5">
                        <EstadoActa estado={a.estado} />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {a.pdf_path && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => void descargarActa(a.id, a.numero)}
                              title="Descargar PDF firmado"
                            >
                              <Download className="mr-1 h-3 w-3" />
                              PDF
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" asChild>
                            <Link to="/actas/$id" params={{ id: a.id }}>
                              Ver
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!actasPagina.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      Este equipo aún no registra actas con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <DataTablePagination
            total={actasFiltradas.length}
            pagina={pagActas.pagina}
            tamano={pagActas.tamano}
            onPagina={pagActas.setPagina}
            onTamano={pagActas.setTamano}
          />
        </div>
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{v}</dd>
    </div>
  );
}

type Eq = {
  id: string;
  modelo: string | null;
  marca_id: string | null;
  sede_id: string | null;
  tipo_id: string | null;
  proveedor: string | null;
  garantia_fin: string | null;
  observaciones: string | null;
  activo_fijo: string | null;
  nombre_equipo: string | null;
  sistema_operativo: string | null;
  factura_numero: string | null;
  anio_compra: number | null;
  novedad: string | null;
  fecha_ingreso: string | null;
  valor_compra: number | null;
  proveedor_id: string | null;
};

function EditarEquipo({ e }: { e: Eq }) {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const [open, setOpen] = useState(false);
  const provs = useQuery({
    queryKey: ["proveedores_lista"],
    enabled: open,
    queryFn: async () => (await supabase.from("proveedores").select("id, nombre").order("nombre")).data ?? [],
  });
  const [f, setF] = useState({
    modelo: e.modelo ?? "",
    marca_id: e.marca_id ?? "",
    sede_id: e.sede_id ?? "",
    tipo_id: e.tipo_id ?? "",
    proveedor_id: e.proveedor_id ?? "",
    garantia_fin: e.garantia_fin ?? "",
    observaciones: e.observaciones ?? "",
    activo_fijo: e.activo_fijo ?? "",
    nombre_equipo: e.nombre_equipo ?? "",
    sistema_operativo: e.sistema_operativo ?? "",
    factura_numero: e.factura_numero ?? "",
    anio_compra: e.anio_compra ? String(e.anio_compra) : "",
    novedad: e.novedad ?? "",
    fecha_ingreso: e.fecha_ingreso ?? "",
    valor_compra: e.valor_compra != null ? String(e.valor_compra) : "",
  });

  async function guardar() {
    const anio = f.anio_compra.trim() ? parseInt(f.anio_compra.trim(), 10) : null;
    if (anio !== null && (isNaN(anio) || anio < 1990 || anio > 2100)) return toast.error("Año de compra inválido");
    const valor = f.valor_compra.trim() ? Number(f.valor_compra) : null;
    if (valor !== null && (!isFinite(valor) || valor < 0)) return toast.error("Valor de compra inválido");
    const provNombre = f.proveedor_id
      ? (provs.data?.find((p) => p.id === f.proveedor_id)?.nombre ?? e.proveedor)
      : e.proveedor_id
        ? null
        : e.proveedor;
    const { error } = await supabase
      .from("equipos")
      .update({
        modelo: f.modelo || null,
        marca_id: f.marca_id || null,
        sede_id: f.sede_id || null,
        proveedor_id: f.proveedor_id || null,
        proveedor: provNombre,
        valor_compra: valor,
        garantia_fin: f.garantia_fin || null,
        observaciones: f.observaciones || null,
        activo_fijo: f.activo_fijo.trim() || null,
        nombre_equipo: f.nombre_equipo.trim() || null,
        sistema_operativo: f.sistema_operativo.trim() || null,
        factura_numero: f.factura_numero.trim() || null,
        anio_compra: anio,
        novedad: f.novedad.trim() || null,
        ...(f.fecha_ingreso ? { fecha_ingreso: f.fecha_ingreso } : {}),
        ...(f.tipo_id ? { tipo_id: f.tipo_id } : {}),
      })
      .eq("id", e.id);
    if (error) return toast.error(error.code === "23505" ? "Ese activo fijo ya existe en otro equipo." : errMsg(error));
    toast.success("Equipo actualizado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", e.id] });
    qc.invalidateQueries({ queryKey: ["equipos"] });
  }

  const s = "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Editar ficha del equipo</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Tipo de equipo</Label>
            <select className={s} value={f.tipo_id} onChange={(x) => setF({ ...f, tipo_id: x.target.value })}>
              <option value="">—</option>
              {cat.byTipo("tipo_equipo").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Marca</Label>
            <select className={s} value={f.marca_id} onChange={(x) => setF({ ...f, marca_id: x.target.value })}>
              <option value="">—</option>
              {cat.byTipo("marca").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Modelo</Label>
            <Input value={f.modelo} onChange={(x) => setF({ ...f, modelo: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Activo fijo</Label>
            <Input value={f.activo_fijo} onChange={(x) => setF({ ...f, activo_fijo: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nombre de equipo</Label>
            <Input value={f.nombre_equipo} onChange={(x) => setF({ ...f, nombre_equipo: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sistema operativo</Label>
            <Input value={f.sistema_operativo} onChange={(x) => setF({ ...f, sistema_operativo: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sede</Label>
            <select className={s} value={f.sede_id} onChange={(x) => setF({ ...f, sede_id: x.target.value })}>
              <option value="">—</option>
              {cat.byTipo("sede").map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Proveedor</Label>
            <select className={s} value={f.proveedor_id} onChange={(x) => setF({ ...f, proveedor_id: x.target.value })}>
              <option value="">
                {e.proveedor && !e.proveedor_id ? `${e.proveedor} (texto anterior)` : "—"}
              </option>
              {(provs.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor de compra (COP)</Label>
            <Input
              type="number"
              min={0}
              value={f.valor_compra}
              onChange={(x) => setF({ ...f, valor_compra: x.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Número de factura</Label>
            <Input value={f.factura_numero} onChange={(x) => setF({ ...f, factura_numero: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Año de compra</Label>
            <Input inputMode="numeric" value={f.anio_compra} onChange={(x) => setF({ ...f, anio_compra: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fecha de ingreso</Label>
            <Input type="date" value={f.fecha_ingreso} onChange={(x) => setF({ ...f, fecha_ingreso: x.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fin de garantía</Label>
            <Input type="date" value={f.garantia_fin} onChange={(x) => setF({ ...f, garantia_fin: x.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Novedad</Label>
            <Input value={f.novedad} onChange={(x) => setF({ ...f, novedad: x.target.value })} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Observaciones</Label>
            <Textarea value={f.observaciones} onChange={(x) => setF({ ...f, observaciones: x.target.value })} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            La serie no es editable. El Administrador puede corregirla indicando un motivo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GarantiaYReparacion({
  e,
}: {
  e: {
    garantia_fin: string | null;
    proveedor_id: string | null;
    proveedor: string | null;
    estado: string;
    reparacion_proveedor_id: string | null;
    reparacion_inicio: string | null;
  };
}) {
  const ids = [e.proveedor_id, e.reparacion_proveedor_id].filter(Boolean) as string[];
  const q = useQuery({
    queryKey: ["proveedor", "equipo", ...ids],
    enabled: ids.length > 0,
    queryFn: async () => ((await supabase.from("proveedores").select("*").in("id", ids)).data ?? []) as Prov[],
  });
  const compra = q.data?.find((p) => p.id === e.proveedor_id);
  const rep = q.data?.find((p) => p.id === e.reparacion_proveedor_id);
  const hoy = new Date().toISOString().slice(0, 10);
  const nombreProv = compra?.nombre ?? e.proveedor;
  const mes = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-CO", { month: "short", year: "numeric" });

  if (!e.garantia_fin && !(e.estado === "en_reparacion" && rep)) return null;

  return (
    <div className="space-y-3">
      {e.garantia_fin &&
        (e.garantia_fin >= hoy ? (
          <Badge className="bg-success text-success-foreground hover:bg-success">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            En garantía{nombreProv ? ` con ${nombreProv}` : ""} hasta {mes(e.garantia_fin)}
          </Badge>
        ) : (
          <Badge variant="secondary">
            <ShieldOff className="mr-1 h-3.5 w-3.5" />
            Garantía vencida desde {mes(e.garantia_fin)}
          </Badge>
        ))}
      {e.estado === "en_reparacion" && rep && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 p-3.5 text-sm">
          <div>
            <Wrench className="mr-1.5 inline h-4 w-4" />
            En reparación con <b>{rep.nombre}</b>
            {e.reparacion_inicio ? ` desde ${fmtFecha(e.reparacion_inicio)}` : ""}
            {rep.contacto_nombre ? ` · Asesor: ${rep.contacto_nombre}` : ""}
          </div>
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
    toast.success("Equipo disponible");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", id] });
    qc.invalidateQueries({ queryKey: ["equipos"] });
    qc.invalidateQueries({ queryKey: ["panel"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Marcar como listo</Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Alistamiento terminado</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Nota (copia, formateo, limpieza…)</Label>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={guardar}>Dejar disponible</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CambiarEstado({
  id,
  actual,
  admin,
  empleadoId,
  tecnicoId,
  puedeEntregar,
}: {
  id: string;
  actual: string;
  admin: boolean;
  empleadoId: string | null;
  tecnicoId: string;
  puedeEntregar: boolean;
}) {
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
  const [soporteBaja, setSoporteBaja] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const servicio = useQuery({
    queryKey: ["proveedores_lista", "servicio"],
    enabled: open,
    queryFn: async () =>
      (
        await supabase
          .from("proveedores")
          .select("id, nombre")
          .eq("activo", true)
          .contains("etiquetas", [ETIQUETA_SERVICIO])
          .order("nombre")
      ).data ?? [],
  });
  async function guardar() {
    if (!motivo.trim()) return toast.error("El motivo es obligatorio");
    const usarC = estado === "en_reparacion" && conting && puedeConting;
    if (usarC && !contEq) return toast.error("Seleccione el equipo de contingencia");
    setGuardando(true);
    let bajaPath: string | null = null;
    try {
      if (estado === "de_baja" && soporteBaja) {
        if (soporteBaja.size > 10 * 1024 * 1024) throw new Error("El soporte de baja supera 10 MB");
        const ext = soporteBaja.name.split(".").pop()?.toLowerCase() ?? "pdf";
        bajaPath = `baja_${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("facturas")
          .upload(bajaPath, soporteBaja, { contentType: soporteBaja.type });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.rpc("cambiar_estado_equipo", {
        p_equipo: id,
        p_estado: estado as "disponible",
        p_motivo: motivo.trim(),
        ...(estado === "en_reparacion" && prov ? { p_proveedor: prov } : {}),
        ...(estado === "de_baja" && bajaPath ? { p_documento_baja: bajaPath } : {}),
      });
      if (error) return toast.error(errMsg(error));
      toast.success("Estado actualizado");
      setOpen(false);
      setMotivo("");
      setProv("");
      setSoporteBaja(null);
      qc.invalidateQueries({ queryKey: ["equipo", id] });
      qc.invalidateQueries({ queryKey: ["equipos"] });
      qc.invalidateQueries({ queryKey: ["proveedor"] });
    } catch (e) {
      toast.error(errMsg(e));
      return;
    } finally {
      setGuardando(false);
    }
    if (usarC) {
      const { data: acta, error: e1 } = await supabase
        .from("actas")
        .insert({
          tipo: "entrega",
          empleado_id: empleadoId!,
          tecnico_id: tecnicoId,
          es_prestamo: true,
          prestamo_hasta: contHasta,
          prestamo_reparacion_equipo_id: id,
          observaciones: "Equipo de contingencia mientras se repara su equipo.",
        })
        .select("id")
        .single();
      if (e1) return toast.error("No se pudo crear el préstamo: " + errMsg(e1));
      const { error: e2 } = await supabase
        .from("acta_items")
        .insert({ acta_id: acta.id, equipo_id: contEq, direccion: "entrega", estado_fisico: "Bueno" });
      if (e2) return toast.error("No se pudo crear el préstamo: " + errMsg(e2));
      try {
        await adjuntar({ data: { actaId: acta.id } });
      } catch {
        /* opcional */
      }
      toast.success("Acta de préstamo creada. Proceda con la firma.");
      nav({ to: "/actas/$id", params: { id: acta.id } });
    }
  }
  const disp = useQuery({
    queryKey: ["equipos", "disponibles-cont"],
    enabled: open && conting,
    queryFn: async () =>
      (
        await supabase
          .from("equipos")
          .select("id, serie, modelo, tipo_id, activo_fijo")
          .eq("estado", "disponible")
          .order("created_at", { ascending: false })
          .limit(1000)
      ).data ?? [],
  });
  const catC = useCatalogos();
  const listaC = (disp.data ?? [])
    .filter(
      (x) =>
        !buscaC ||
        [x.serie, x.modelo, x.activo_fijo, catC.nombre(x.tipo_id)].some((v) =>
          (v ?? "").toLowerCase().includes(buscaC.toLowerCase()),
        ),
    )
    .slice(0, 50);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Cambiar estado
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cambiar estado del equipo</DialogTitle>
        </DialogHeader>
        <select
          className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
        >
          {actual !== "disponible" && actual !== "en_reparacion" && (actual !== "asignado" || admin) && (
            <option value="disponible">Disponible</option>
          )}
          {actual !== "en_reparacion" && (
            <option value="en_reparacion">
              En reparación{actual === "asignado" ? " (sigue ligado al empleado)" : ""}
            </option>
          )}
          {admin && <option value="de_baja">De baja (definitivo)</option>}
        </select>
        {estado === "en_reparacion" && (
          <div className="space-y-1">
            <Label>Proveedor de servicio técnico</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              value={prov}
              onChange={(e) => setProv(e.target.value)}
            >
              <option value="">— Interno / sin proveedor —</option>
              {(servicio.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {servicio.data && !servicio.data.length && (
              <p className="text-xs text-muted-foreground">
                No hay proveedores con el tipo "Servicio Técnico / Reparaciones".
              </p>
            )}
          </div>
        )}
        {estado === "en_reparacion" && puedeConting && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={conting} onChange={(e) => setConting(e.target.checked)} />
              ¿Asignar un equipo de contingencia temporal al empleado?
            </label>
            {conting && (
              <>
                <Input
                  placeholder="Buscar serie, modelo, tipo…"
                  value={buscaC}
                  onChange={(e) => setBuscaC(e.target.value)}
                />
                <select
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                  value={contEq}
                  onChange={(e) => setContEq(e.target.value)}
                >
                  <option value="">— Seleccione equipo disponible —</option>
                  {listaC.map((x) => (
                    <option key={x.id} value={x.id}>
                      {catC.nombre(x.tipo_id)} {x.modelo ?? ""} · {x.serie}
                    </option>
                  ))}
                </select>
                <div className="space-y-1">
                  <Label>Fecha estimada de devolución</Label>
                  <Input type="date" value={contHasta} onChange={(e) => setContHasta(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}
        {estado === "de_baja" && (
          <div className="space-y-1.5 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <Label className="text-xs font-semibold text-destructive">
              Soporte técnico o acta de baja (opcional)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Adjunte concepto pericial, soporte de descarte o acta contable (PDF o imagen, máx 10 MB).
            </p>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary-foreground"
              onChange={(e) => setSoporteBaja(e.target.files?.[0] ?? null)}
            />
            {soporteBaja && (
              <p className="font-mono text-[11px] text-muted-foreground">
                Archivo: <span className="font-medium text-foreground">{soporteBaja.name}</span> ({(soporteBaja.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label>Motivo *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando} variant={estado === "de_baja" ? "destructive" : "default"}>
            {guardando ? "Procesando…" : "Confirmar"}
          </Button>
        </DialogFooter>
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
    toast.success("Serie corregida");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["equipo", id] });
    qc.invalidateQueries({ queryKey: ["equipos"] });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Corregir serie
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Corregir número de serie</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Nueva serie</Label>
          <Input value={nueva} onChange={(e) => setNueva(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Motivo de la corrección *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button onClick={guardar} disabled={!motivo.trim() || !nueva.trim()}>
            Corregir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
