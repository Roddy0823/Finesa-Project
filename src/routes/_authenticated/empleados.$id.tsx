import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { TIPO_ACTA, errMsg, fmtFecha } from "@/lib/constantes";
import { habilitarAccesoEmpleado, retirarEmpleado } from "@/lib/usuarios.functions";
import { urlArchivo } from "@/lib/firmas.functions";
import { descargarPdfActa } from "@/lib/descargarPdf";
import { PageHeader, EstadoActa, EstadoEquipo } from "@/components/Estado";
import { DataTablePagination, usePaginacion } from "@/components/DataTablePagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormEmpleado } from "./empleados.index";
import { toast } from "sonner";
import { cn, copiarTexto } from "@/lib/utils";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileSignature,
  History,
  IdCard,
  KeyRound,
  Laptop,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserMinus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/empleados/$id")({
  head: () => ({
    meta: [
      { title: "Perfil del empleado — Finesa" },
      { name: "description", content: "Equipos asignados, historial de actas y movimientos del colaborador." },
    ],
  }),
  component: PerfilEmpleado,
});

const EVENTO_LABEL: Record<string, string> = {
  ingreso: "Ingreso al inventario",
  entrega: "Entrega a empleado",
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
  edicion: "Actualización de ficha",
  asignado: "Asignado",
};

function iniciales(nombre: string) {
  return (
    nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "C"
  );
}

const selCls =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium text-foreground shadow-2xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function PerfilEmpleado() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  const cat = useCatalogos();
  const qc = useQueryClient();
  const habilitar = useServerFn(habilitarAccesoEmpleado);
  const retirar = useServerFn(retirarEmpleado);
  const obtenerUrlPdf = useServerFn(urlArchivo);

  const [tabHist, setTabHist] = useState<"actas" | "equipos">("actas");
  const [buscaActa, setBuscaActa] = useState("");
  const [tipoActa, setTipoActa] = useState("");
  const [estadoActa, setEstadoActa] = useState("");

  const [buscaMov, setBuscaMov] = useState("");
  const [eventoMov, setEventoMov] = useState("");

  const pagActas = usePaginacion({ id, buscaActa, tipoActa, estadoActa }, 25);
  const pagMovs = usePaginacion({ id, buscaMov, eventoMov }, 25);

  const q = useQuery({
    queryKey: ["empleado", id],
    queryFn: async () => {
      const [e, eq, ac] = await Promise.all([
        supabase.from("empleados").select("*").eq("id", id).maybeSingle(),
        supabase.from("equipos").select("*").eq("empleado_id", id).order("created_at", { ascending: false }),
        supabase.from("actas").select("*").eq("empleado_id", id).order("created_at", { ascending: false }),
      ]);
      if (e.error) throw e.error;

      const actas = ac.data ?? [];
      const equiposActuales = eq.data ?? [];
      const actaIds = actas.map((a) => a.id);
      const eqIdsActuales = equiposActuales.map((x) => x.id);

      // Movimientos de equipos asociados a las actas del empleado o sus equipos actuales
      let movs: {
        id: string;
        equipo_id: string;
        evento: string;
        detalle: string | null;
        acta_id: string | null;
        user_id: string | null;
        created_at: string;
      }[] = [];

      const promesasHist = [];
      if (actaIds.length > 0) {
        promesasHist.push(
          supabase
            .from("equipo_historial")
            .select("id, equipo_id, evento, detalle, acta_id, user_id, created_at")
            .in("acta_id", actaIds.slice(0, 200))
            .order("created_at", { ascending: false }),
        );
      }
      if (eqIdsActuales.length > 0) {
        promesasHist.push(
          supabase
            .from("equipo_historial")
            .select("id, equipo_id, evento, detalle, acta_id, user_id, created_at")
            .in("equipo_id", eqIdsActuales.slice(0, 200))
            .order("created_at", { ascending: false }),
        );
      }

      if (promesasHist.length > 0) {
        const resHist = await Promise.all(promesasHist);
        const mapaMovs = new Map<string, (typeof movs)[number]>();
        for (const r of resHist) {
          for (const item of r.data ?? []) {
            mapaMovs.set(item.id, item);
          }
        }
        movs = [...mapaMovs.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      }

      const eqIdsHist = [...new Set(movs.map((m) => m.equipo_id))];
      const userIdsHist = [...new Set(movs.map((m) => m.user_id).filter(Boolean))] as string[];

      const [eqHistRes, usrRes] = await Promise.all([
        eqIdsHist.length
          ? supabase.from("equipos").select("id, serie, modelo, tipo_id, marca_id").in("id", eqIdsHist.slice(0, 200))
          : Promise.resolve({ data: [] }),
        userIdsHist.length
          ? supabase.from("profiles").select("id, nombre, email").in("id", userIdsHist.slice(0, 200))
          : Promise.resolve({ data: [] }),
      ]);

      const mapaEquipos = Object.fromEntries((eqHistRes.data ?? []).map((x) => [x.id, x]));
      const mapaUsuarios = Object.fromEntries((usrRes.data ?? []).map((u) => [u.id, u.nombre || u.email]));

      return {
        e: e.data,
        equipos: equiposActuales,
        actas,
        movs,
        mapaEquipos,
        mapaUsuarios,
      };
    },
  });

  const e = q.data?.e;
  const equipos = q.data?.equipos ?? [];
  const actas = q.data?.actas ?? [];
  const movs = q.data?.movs ?? [];
  const mapaEquipos = q.data?.mapaEquipos ?? {};
  const mapaUsuarios = q.data?.mapaUsuarios ?? {};

  const actasFiltradas = useMemo(() => {
    const t = buscaActa.trim().toLowerCase();
    return actas.filter((a) => {
      if (tipoActa && a.tipo !== tipoActa) return false;
      if (estadoActa && a.estado !== estadoActa) return false;
      if (
        t &&
        !String(a.numero).includes(t) &&
        !(a.tecnico_nombre ?? "").toLowerCase().includes(t) &&
        !(a.observaciones ?? "").toLowerCase().includes(t)
      ) {
        return false;
      }
      return true;
    });
  }, [actas, buscaActa, tipoActa, estadoActa]);

  const movsFiltrados = useMemo(() => {
    const t = buscaMov.trim().toLowerCase();
    return movs.filter((m) => {
      if (eventoMov && m.evento !== eventoMov) return false;
      if (t) {
        const eq = mapaEquipos[m.equipo_id];
        const serie = eq?.serie?.toLowerCase() ?? "";
        const modelo = eq?.modelo?.toLowerCase() ?? "";
        const det = (m.detalle ?? "").toLowerCase();
        const ev = (EVENTO_LABEL[m.evento] ?? m.evento).toLowerCase();
        if (!serie.includes(t) && !modelo.includes(t) && !det.includes(t) && !ev.includes(t)) return false;
      }
      return true;
    });
  }, [movs, buscaMov, eventoMov, mapaEquipos]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Cargando perfil del colaborador…</p>;
  if (!e) return <p className="text-sm text-muted-foreground">Empleado no encontrado.</p>;

  const asignados = equipos.filter((x) => x.estado === "asignado");
  const enReparacion = equipos.filter((x) => x.estado === "en_reparacion");
  const actasPagina = actasFiltradas.slice(pagActas.desde, pagActas.desde + pagActas.tamano);
  const movsPagina = movsFiltrados.slice(pagMovs.desde, pagMovs.desde + pagMovs.tamano);

  async function onHabilitar() {
    if (e?.user_id && !confirm("Se generará un PIN nuevo y el anterior dejará de funcionar. ¿Continuar?")) return;
    try {
      const r = await habilitar({ data: { empleadoId: id } });
      if ("error" in r) return toast.error(r.error);
      const texto = `Portal Finesa — Cédula: ${r.cedula} · PIN: ${r.pin}`;
      await copiarTexto(texto);
      toast.success(`PIN de acceso generado: ${r.pin}`, {
        description: "Copiado al portapapeles. Entréguelo al colaborador: ingresa con su cédula y este PIN.",
        duration: 30000,
      });
      qc.invalidateQueries({ queryKey: ["empleado", id] });
      qc.invalidateQueries({ queryKey: ["empleados"] });
    } catch (x) {
      toast.error(errMsg(x));
    }
  }

  async function onRetirar() {
    if (asignados.length) {
      return toast.error(
        `Paz y salvo pendiente: el empleado tiene ${asignados.length} equipo(s) asignado(s). Realice primero el acta de devolución.`,
      );
    }
    if (!confirm("¿Marcar al empleado como inactivo? Se conservará todo su historial documental.")) return;
    try {
      const r = await retirar({ data: { empleadoId: id } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Colaborador retirado correctamente");
      qc.invalidateQueries({ queryKey: ["empleado", id] });
      qc.invalidateQueries({ queryKey: ["empleados"] });
    } catch (x) {
      toast.error(errMsg(x));
    }
  }

  async function reactivar() {
    const { error } = await supabase.from("empleados").update({ activo: true }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Colaborador reactivado");
    qc.invalidateQueries({ queryKey: ["empleado", id] });
    qc.invalidateQueries({ queryKey: ["empleados"] });
  }

  async function descargarActa(actaId: string, numero: number) {
    await descargarPdfActa(obtenerUrlPdf, actaId, `acta-${numero}.pdf`);
  }

  return (
    <div className="space-y-5">
      {/* Navegación superior */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/empleados" className="inline-flex items-center gap-1 font-medium hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Empleados
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-foreground">{e.nombre}</span>
      </div>

      <PageHeader
        title={e.nombre}
        desc={`C.C. ${e.identificacion} · ${e.cargo || "Sin cargo asignado"} · ${cat.nombre(e.area_id)} · ${cat.nombre(e.sede_id)}`}
      >
        {!e.activo && (
          <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
            Inactivo
          </span>
        )}
        {(me?.can("actas_entrega") || me?.can("actas_devolucion")) && e.activo && (
          <Button size="sm" asChild>
            <Link to="/actas/nueva">
              <FileSignature className="mr-1.5 h-3.5 w-3.5" />
              Nueva acta
            </Link>
          </Button>
        )}
        {me?.can("empleados_editar") && (
          <>
            <FormEmpleado
              inicial={{
                id: e.id,
                nombre: e.nombre,
                identificacion: e.identificacion,
                email: e.email ?? "",
                cargo: e.cargo ?? "",
                area_id: e.area_id ?? "",
                sede_id: e.sede_id ?? "",
                empresa_id: e.empresa_id ?? "",
              }}
            />
            {e.activo && (
              <Button size="sm" variant="outline" onClick={onHabilitar}>
                <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                {e.user_id ? "Regenerar PIN" : "Habilitar portal"}
              </Button>
            )}
            {e.activo ? (
              <Button size="sm" variant="destructive" onClick={onRetirar}>
                <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                Retirar
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={reactivar}>
                <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                Reactivar
              </Button>
            )}
          </>
        )}
      </PageHeader>

      {/* Tarjetas de resumen del colaborador */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Identificación y correo</span>
            <IdCard className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-base font-bold text-foreground">
            <span>C.C. {e.identificacion}</span>
            <button
              type="button"
              title="Copiar cédula"
              onClick={async () => {
                if (await copiarTexto(e.identificacion)) toast.success("Cédula copiada");
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{e.email || "Sin correo registrado"}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Ubicación organizacional</span>
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 truncate font-display text-sm font-bold text-foreground">
            {cat.nombre(e.area_id)} · {cat.nombre(e.sede_id)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Empresa: <b className="font-medium text-foreground">{cat.nombre(e.empresa_id)}</b>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Estado de Paz y Salvo</span>
            <Laptop className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {asignados.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                En Paz y Salvo
              </span>
            ) : (
              <span className="font-display text-xl font-bold text-foreground">
                {asignados.length} {asignados.length === 1 ? "equipo asignado" : "equipos asignados"}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {enReparacion.length > 0
              ? `${enReparacion.length} equipo(s) adicional(es) en reparación`
              : "Sin equipos pendientes en taller"}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Portal del empleado</span>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            {e.user_id ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PIN Habilitado
              </span>
            ) : (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                Sin PIN configurado
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {actas.length} {actas.length === 1 ? "acta registrada" : "actas registradas"} en su historial
          </div>
        </div>
      </div>

      {/* Equipos actuales a cargo del colaborador */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Laptop className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              Equipos vinculados actualmente ({equipos.length})
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {asignados.length} asignado(s) · {enReparacion.length} en reparación
          </span>
        </div>

        {!equipos.length ? (
          <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
            <CheckCircle2 className="h-7 w-7 text-success" />
            <p className="text-sm font-medium text-foreground">Colaborador en Paz y Salvo</p>
            <p className="text-xs text-muted-foreground">No tiene equipos asignados ni pendientes de devolución.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Serie / Código</th>
                  <th className="px-4 py-2.5">Tipo de equipo</th>
                  <th className="px-4 py-2.5">Marca y Modelo</th>
                  <th className="px-4 py-2.5">Sede</th>
                  <th className="px-4 py-2.5">Modalidad</th>
                  <th className="px-4 py-2.5">Estado</th>
                  <th className="w-8 px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {equipos.map((x) => (
                  <tr key={x.id} className="group transition-colors hover:bg-muted/35">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/equipos/$id"
                          params={{ id: x.id }}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          {x.serie}
                        </Link>
                        <button
                          type="button"
                          title="Copiar serie"
                          onClick={async () => {
                            if (await copiarTexto(x.serie)) toast.success(`Serie ${x.serie} copiada`);
                          }}
                          className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                      {x.activo_fijo && (
                        <div className="font-mono text-[10px] text-muted-foreground">AF: {x.activo_fijo}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-foreground">{cat.nombre(x.tipo_id)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{cat.nombre(x.marca_id)}</span> {x.modelo ?? ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{cat.nombre(x.sede_id)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {x.prestamo_hasta ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning-foreground">
                          <CalendarClock className="h-3 w-3" />
                          Préstamo hasta {fmtFecha(x.prestamo_hasta)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Asignación estándar</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <EstadoEquipo estado={x.estado} />
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Link
                        to="/equipos/$id"
                        params={{ id: x.id }}
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historiales Paginados (25 filas por página): Actas y Movimientos de Equipos */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-5 py-3.5">
          <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setTabHist("actas")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                tabHist === "actas"
                  ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <FileSignature className="h-3.5 w-3.5 text-primary" />
              <span>Historial de actas</span>
              <span className="rounded-full bg-primary/12 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
                {actas.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTabHist("equipos")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                tabHist === "equipos"
                  ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <History className="h-3.5 w-3.5 text-primary" />
              <span>Historial de equipos</span>
              <span className="rounded-full bg-primary/12 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
                {movs.length}
              </span>
            </button>
          </div>

          {tabHist === "actas" ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar # acta o técnico…"
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
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar serie, modelo o detalle…"
                  className="h-9 pl-8 text-xs"
                  value={buscaMov}
                  onChange={(ev) => setBuscaMov(ev.target.value)}
                />
              </div>
              <select className={selCls} value={eventoMov} onChange={(ev) => setEventoMov(ev.target.value)}>
                <option value="">Todos los eventos</option>
                {Object.entries(EVENTO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {(buscaMov || eventoMov) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setBuscaMov("");
                    setEventoMov("");
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Limpiar
                </Button>
              )}
            </div>
          )}
        </div>

        {tabHist === "actas" ? (
          <div className="p-4">
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Acta</th>
                    <th className="px-4 py-2.5">Tipo</th>
                    <th className="px-4 py-2.5">Fecha elaboración</th>
                    <th className="px-4 py-2.5">Fecha firma</th>
                    <th className="px-4 py-2.5">Técnico responsable</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {actasPagina.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-muted/35">
                      <td className="px-4 py-2.5">
                        <Link
                          to="/actas/$id"
                          params={{ id: a.id }}
                          className="font-mono text-xs font-semibold text-primary hover:underline"
                        >
                          #{a.numero}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-medium text-foreground">
                        {TIPO_ACTA[a.tipo] ?? a.tipo}
                        {a.es_prestamo && (
                          <span className="ml-1.5 rounded border border-warning/40 bg-warning/15 px-1.5 py-0.2 text-[10px] font-medium text-warning-foreground">
                            Préstamo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {fmtFecha(a.created_at, true)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {a.firmado_at ? fmtFecha(a.firmado_at, true) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.tecnico_nombre || "—"}</td>
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
                              Ver acta
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!actasPagina.length && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                        No hay actas registradas para este colaborador con los filtros actuales.
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
        ) : (
          <div className="p-4">
            <div className="overflow-x-auto rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead className="border-b border-border/70 bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5">Fecha y hora</th>
                    <th className="px-4 py-2.5">Equipo</th>
                    <th className="px-4 py-2.5">Evento</th>
                    <th className="px-4 py-2.5">Detalle del movimiento</th>
                    <th className="px-4 py-2.5">Registrado por</th>
                    <th className="px-4 py-2.5 text-right">Acta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {movsPagina.map((m) => {
                    const eq = mapaEquipos[m.equipo_id];
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-muted/35">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                          {fmtFecha(m.created_at, true)}
                        </td>
                        <td className="px-4 py-2.5">
                          {eq ? (
                            <div>
                              <Link
                                to="/equipos/$id"
                                params={{ id: eq.id }}
                                className="font-mono text-xs font-semibold text-primary hover:underline"
                              >
                                {eq.serie}
                              </Link>
                              <div className="text-[11px] text-muted-foreground">
                                {cat.nombre(eq.tipo_id)} · {cat.nombre(eq.marca_id)} {eq.modelo ?? ""}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {EVENTO_LABEL[m.evento] ?? m.evento}
                          </span>
                        </td>
                        <td className="max-w-md px-4 py-2.5 text-xs text-muted-foreground">
                          {m.detalle
                            ? m.detalle.replace(/en_reparacion/g, "en reparación").replace(/de_baja/g, "de baja")
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {m.user_id ? (mapaUsuarios[m.user_id] ?? "Usuario") : "Sistema"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {m.acta_id ? (
                            <Link
                              to="/actas/$id"
                              params={{ id: m.acta_id }}
                              className="text-xs font-medium text-primary hover:underline"
                            >
                              Ver acta →
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!movsPagina.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                        Sin movimientos de equipos asociados a este colaborador.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <DataTablePagination
              total={movsFiltrados.length}
              pagina={pagMovs.pagina}
              tamano={pagMovs.tamano}
              onPagina={pagMovs.setPagina}
              onTamano={pagMovs.setTamano}
            />
          </div>
        )}
      </section>
    </div>
  );
}
