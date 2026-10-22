import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DataTablePagination, FilasSkeleton, usePaginacion } from "@/components/DataTablePagination";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { descargarCSV, errMsg } from "@/lib/constantes";
import { copiarTexto, cn, sanitizarBusquedaPostgrest } from "@/lib/utils";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  IdCard,
  Laptop,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/empleados/")({
  head: () => ({
    meta: [
      { title: "Empleados — Finesa" },
      { name: "description", content: "Directorio de colaboradores, estado de paz y salvo y acceso al portal." },
    ],
  }),
  component: Empleados,
});

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

function Empleados() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const nav = useNavigate();
  const [t, setT] = useState("");
  const [texto, setTexto] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setTexto(sanitizarBusquedaPostgrest(t)), 220);
    return () => clearTimeout(h);
  }, [t]);

  const [estado, setEstado] = useState<"activos" | "inactivos" | "todos">("activos");
  const [sede, setSede] = useState("");
  const [area, setArea] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [portal, setPortal] = useState<"" | "con_pin" | "sin_pin">("");

  const pag = usePaginacion({ texto, estado, sede, area, empresa, portal }, 25);

  const resumenQ = useQuery({
    queryKey: ["empleados", "resumen_kpis"],
    queryFn: async () => {
      const [tot, act, pin] = await Promise.all([
        supabase.from("empleados").select("id", { count: "exact", head: true }),
        supabase.from("empleados").select("id", { count: "exact", head: true }).eq("activo", true),
        supabase
          .from("empleados")
          .select("id", { count: "exact", head: true })
          .eq("activo", true)
          .not("user_id", "is", null),
      ]);
      const total = tot.count ?? 0;
      const activos = act.count ?? 0;
      const conPortal = pin.count ?? 0;
      return {
        total,
        activos,
        inactivos: Math.max(0, total - activos),
        conPortal,
      };
    },
  });

  const q = useQuery({
    queryKey: ["empleados", "pagina", texto, estado, sede, area, empresa, portal, pag.desde, pag.tamano],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let s = supabase.from("empleados").select("*", { count: "exact" });
      if (estado !== "todos") s = s.eq("activo", estado === "activos");
      if (sede) s = s.eq("sede_id", sede);
      if (area) s = s.eq("area_id", area);
      if (empresa) s = s.eq("empresa_id", empresa);
      if (portal === "con_pin") s = s.not("user_id", "is", null);
      if (portal === "sin_pin") s = s.is("user_id", null);
      if (texto) {
        s = s.or(
          `nombre.ilike.%${texto}%,identificacion.ilike.%${texto}%,email.ilike.%${texto}%,cargo.ilike.%${texto}%`,
        );
      }
      const { data, count, error } = await s.order("nombre").order("id").range(pag.desde, pag.hasta);
      if (error) throw error;
      const filas = data ?? [];
      const ids = filas.map((e) => e.id);
      const conteoEquipos: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: eqs } = await supabase
          .from("equipos")
          .select("empleado_id")
          .eq("estado", "asignado")
          .in("empleado_id", ids);
        for (const r of eqs ?? []) {
          if (r.empleado_id) conteoEquipos[r.empleado_id] = (conteoEquipos[r.empleado_id] ?? 0) + 1;
        }
      }
      return { filas, total: count ?? 0, conteoEquipos };
    },
  });

  const lista = q.data?.filas ?? [];
  const total = q.data?.total ?? 0;
  const conteoEquipos = q.data?.conteoEquipos ?? {};
  const kpis = resumenQ.data ?? { total: 0, activos: 0, inactivos: 0, conPortal: 0 };
  const hayFiltros = Boolean(t || texto || sede || area || empresa || portal || estado !== "activos");

  async function exportarDirectorio() {
    let s = supabase.from("empleados").select("*").order("nombre");
    if (estado !== "todos") s = s.eq("activo", estado === "activos");
    if (sede) s = s.eq("sede_id", sede);
    if (area) s = s.eq("area_id", area);
    if (empresa) s = s.eq("empresa_id", empresa);
    if (portal === "con_pin") s = s.not("user_id", "is", null);
    if (portal === "sin_pin") s = s.is("user_id", null);
    if (texto) {
      s = s.or(
        `nombre.ilike.%${texto}%,identificacion.ilike.%${texto}%,email.ilike.%${texto}%,cargo.ilike.%${texto}%`,
      );
    }
    const { data, error } = await s.limit(5000);
    if (error) return toast.error(errMsg(error));
    if (!data?.length) return toast.info("No hay empleados con los filtros actuales");
    descargarCSV(
      `empleados_${new Date().toISOString().slice(0, 10)}.csv`,
      data.map((e) => ({
        Nombre: e.nombre,
        Identificacion: e.identificacion,
        Correo: e.email ?? "",
        Cargo: e.cargo ?? "",
        Area: cat.nombre(e.area_id),
        Sede: cat.nombre(e.sede_id),
        Empresa: cat.nombre(e.empresa_id),
        Estado: e.activo ? "Activo" : "Inactivo",
        Portal_PIN: e.user_id ? "Habilitado" : "Sin configurar",
      })),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Empleados"
        desc="Directorio corporativo de colaboradores, control de equipos a cargo, estado de paz y salvo y acceso al portal."
      >
        <Button variant="outline" size="sm" onClick={exportarDirectorio}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Exportar CSV
        </Button>
        {me?.can("empleados_editar") && <FormEmpleado />}
      </PageHeader>

      {/* KPIs ejecutivos */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setEstado("activos")}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            estado === "activos" ? "border-primary/40 ring-1 ring-primary/20" : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Colaboradores activos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {kpis.activos.toLocaleString("es-CO")}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">En nómina activa para asignación de equipos.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setEstado("activos");
            setPortal(portal === "con_pin" ? "" : "con_pin");
          }}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            portal === "con_pin" ? "border-primary/40 ring-1 ring-primary/20" : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Acceso al Portal (PIN)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {kpis.conPortal.toLocaleString("es-CO")}
            </span>
            <span className="text-xs text-muted-foreground">
              {kpis.activos > 0 ? `${Math.round((kpis.conPortal / kpis.activos) * 100)}%` : "0%"} habilitados
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Autoconsulta de actas, certificaciones y fallas.</p>
        </button>

        <button
          type="button"
          onClick={() => setEstado("inactivos")}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            estado === "inactivos"
              ? "border-primary/40 ring-1 ring-primary/20"
              : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Retirados / Inactivos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
              <UserMinus className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {kpis.inactivos.toLocaleString("es-CO")}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Con historial de actas preservado y paz y salvo.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setEstado("todos");
            setPortal("");
          }}
          className={cn(
            "rounded-2xl border bg-card p-4 text-left shadow-2xs transition-all",
            estado === "todos" ? "border-primary/40 ring-1 ring-primary/20" : "border-border/80 hover:border-border",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total histórico</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
            {kpis.total.toLocaleString("es-CO")}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Colaboradores registrados en el ecosistema.</p>
        </button>
      </div>

      {/* Barra de búsqueda y filtros */}
      <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, cédula, cargo o correo electrónico…"
              className="pl-9 pr-8"
              value={t}
              onChange={(e) => setT(e.target.value)}
            />
            {t && (
              <button
                type="button"
                onClick={() => setT("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex rounded-xl border border-border/80 bg-muted/40 p-1">
            {(
              [
                ["activos", "Activos"],
                ["inactivos", "Inactivos"],
                ["todos", "Todos"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setEstado(k)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-all",
                  estado === k
                    ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <select className={selCls} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {cat.byTipo("sede", false).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select className={selCls} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>
            {cat.byTipo("area", false).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select className={selCls} value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Empresa">
            <option value="">Todas las empresas</option>
            {cat.byTipo("empresa", false).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <select
            className={selCls}
            value={portal}
            onChange={(e) => setPortal(e.target.value as "" | "con_pin" | "sin_pin")}
            aria-label="Portal de empleados"
          >
            <option value="">Portal: Todos</option>
            <option value="con_pin">Con PIN habilitado</option>
            <option value="sin_pin">Sin PIN configurado</option>
          </select>

          {hayFiltros && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setT("");
                setTexto("");
                setSede("");
                setArea("");
                setEmpresa("");
                setPortal("");
                setEstado("activos");
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Tabla de colaboradores */}
      <div
        className={cn(
          "overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-2xs transition-opacity",
          q.isFetching && !q.isLoading && "opacity-65",
        )}
      >
        <table className="w-full text-sm">
          <thead className="border-b border-border/70 bg-muted/35 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3">Identificación</th>
              <th className="px-4 py-3">Cargo y Área</th>
              <th className="px-4 py-3">Sede / Empresa</th>
              <th className="px-4 py-3">Equipos a cargo</th>
              <th className="px-4 py-3">Portal</th>
              <th className="w-8 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {q.isLoading && <FilasSkeleton columnas={7} />}
            {lista.map((e) => {
              const eqCount = conteoEquipos[e.id] ?? 0;
              return (
                <tr
                  key={e.id}
                  onClick={() => nav({ to: "/empleados/$id", params: { id: e.id } })}
                  className="group cursor-pointer transition-colors hover:bg-muted/45"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold",
                          e.activo
                            ? "border-primary/25 bg-primary/10 text-primary"
                            : "border-destructive/30 bg-destructive/10 text-destructive",
                        )}
                      >
                        {iniciales(e.nombre)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/empleados/$id"
                            params={{ id: e.id }}
                            onClick={(ev) => ev.stopPropagation()}
                            className="truncate font-semibold text-foreground group-hover:text-primary hover:underline"
                          >
                            {e.nombre}
                          </Link>
                          {!e.activo && (
                            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.2 text-[10px] font-medium text-destructive">
                              Inactivo
                            </span>
                          )}
                        </div>
                        {e.email ? (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <span className="truncate">{e.email}</span>
                            <button
                              type="button"
                              title="Copiar correo"
                              onClick={async (ev) => {
                                ev.stopPropagation();
                                if (await copiarTexto(e.email!)) toast.success("Correo copiado");
                              }}
                              className="rounded p-0.5 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-muted-foreground/60">Sin correo registrado</div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-2 py-1 font-mono text-xs">
                      <span>{e.identificacion}</span>
                      <button
                        type="button"
                        title="Copiar identificación"
                        onClick={async (ev) => {
                          ev.stopPropagation();
                          if (await copiarTexto(e.identificacion)) toast.success("Identificación copiada");
                        }}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-foreground">{e.cargo || "—"}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{cat.nombre(e.area_id)}</div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-foreground">{cat.nombre(e.sede_id)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{cat.nombre(e.empresa_id)}</div>
                  </td>

                  <td className="px-4 py-3">
                    {eqCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                        <Laptop className="h-3 w-3" />
                        {eqCount} {eqCount === 1 ? "equipo" : "equipos"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        Paz y salvo
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs">
                    {e.user_id ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-0.5 text-[11px] font-medium text-success">
                        <ShieldCheck className="h-3 w-3" />
                        PIN activo
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin PIN</span>
                    )}
                  </td>

                  <td className="px-2 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </td>
                </tr>
              );
            })}
            {!q.isLoading && !lista.length && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No hay empleados que coincidan con los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        total={total}
        pagina={pag.pagina}
        tamano={pag.tamano}
        onPagina={pag.setPagina}
        onTamano={pag.setTamano}
      />
    </div>
  );
}

export type EmpleadoForm = {
  id?: string;
  nombre: string;
  identificacion: string;
  email: string;
  cargo: string;
  area_id: string;
  sede_id: string;
  empresa_id: string;
};

export function FormEmpleado({ inicial }: { inicial?: EmpleadoForm }) {
  const qc = useQueryClient();
  const cat = useCatalogos();
  const [open, setOpen] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const vacio: EmpleadoForm = {
    nombre: "",
    identificacion: "",
    email: "",
    cargo: "",
    area_id: "",
    sede_id: "",
    empresa_id: "",
  };
  const [f, setF] = useState<EmpleadoForm>(inicial ?? vacio);

  useEffect(() => {
    if (open && inicial) setF(inicial);
  }, [open, inicial]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const row = {
        nombre: f.nombre.trim(),
        identificacion: f.identificacion.trim(),
        email: f.email.trim().toLowerCase() || null,
        cargo: f.cargo.trim() || null,
        area_id: f.area_id || null,
        sede_id: f.sede_id || null,
        empresa_id: f.empresa_id || null,
      };
      const { error } = f.id
        ? await supabase.from("empleados").update(row).eq("id", f.id)
        : await supabase.from("empleados").insert(row);
      if (error) {
        toast.error(error.code === "23505" ? "Ya existe un empleado con esa identificación." : errMsg(error));
        return;
      }
      toast.success(f.id ? "Ficha del empleado actualizada" : "Empleado registrado exitosamente");
      setOpen(false);
      if (!f.id) setF(vacio);
      qc.invalidateQueries({ queryKey: ["empleados"] });
      if (f.id) qc.invalidateQueries({ queryKey: ["empleado", f.id] });
    } finally {
      setGuardando(false);
    }
  }

  const s = "h-9 w-full rounded-lg border border-input bg-background/80 px-3 text-sm";
  const opt = (tipo: string) =>
    cat.byTipo(tipo).map((c) => (
      <option key={c.id} value={c.id}>
        {c.nombre}
      </option>
    ));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={inicial ? "outline" : "default"} className="gap-1.5">
          {inicial ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {inicial ? "Editar ficha" : "Registrar empleado"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{inicial ? "Editar ficha del colaborador" : "Registrar nuevo colaborador"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Información personal y ubicación organizacional utilizada en la generación de actas digitales.
          </p>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <IdCard className="h-3.5 w-3.5 text-primary" />
              Datos personales y contacto
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Nombre completo *</Label>
                <Input
                  required
                  placeholder="Ej. Laura Marcela Gómez"
                  value={f.nombre}
                  onChange={(e) => setF({ ...f, nombre: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Documento de identidad (Cédula) *</Label>
                <Input
                  required
                  placeholder="Ej. 1030506070"
                  className="font-mono"
                  value={f.identificacion}
                  onChange={(e) => setF({ ...f, identificacion: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Correo corporativo</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="usuario@finesa.com.co"
                    className="pl-8"
                    value={f.email}
                    onChange={(e) => setF({ ...f, email: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Ubicación organizacional
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Cargo</Label>
                <Input
                  placeholder="Ej. Analista de Crédito"
                  value={f.cargo}
                  onChange={(e) => setF({ ...f, cargo: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Área / Departamento</Label>
                <select className={s} value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })}>
                  <option value="">— Seleccione —</option>
                  {opt("area")}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sede</Label>
                <select className={s} value={f.sede_id} onChange={(e) => setF({ ...f, sede_id: e.target.value })}>
                  <option value="">— Seleccione —</option>
                  {opt("sede")}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Empresa</Label>
                <select
                  className={s}
                  value={f.empresa_id}
                  onChange={(e) => setF({ ...f, empresa_id: e.target.value })}
                >
                  <option value="">— Seleccione —</option>
                  {opt("empresa")}
                </select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar colaborador"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
