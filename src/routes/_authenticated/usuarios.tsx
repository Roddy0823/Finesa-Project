import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { PERMISOS, errMsg, fmtFecha, type Permiso } from "@/lib/constantes";
import {
  actualizarDatosAuxiliar,
  actualizarPermisos,
  cambiarEstadoUsuario,
  cambiarPasswordAuxiliar,
  crearAuxiliar,
  eliminarAuxiliar,
  obtenerPermisosExtraUsuarios,
} from "@/lib/usuarios.functions";
import { PageHeader } from "@/components/Estado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, copiarTexto } from "@/lib/utils";
import { toast } from "sonner";
import {
  Activity,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Grid,
  KeyRound,
  List,
  Lock,
  Mail,
  PenTool,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  Users,
  Wand2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios y permisos — Finesa" },
      { name: "description", content: "Gestión de auxiliares de soporte y matriz de control de acceso (RBAC)." },
    ],
  }),
  component: Usuarios,
});

type Fila = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  firma_path: string | null;
  created_at: string;
  roles: string[];
  permisos: Permiso[];
};

const PLANTILLAS_PERMISOS: {
  id: string;
  nombre: string;
  desc: string;
  permisos: Permiso[];
}[] = [
  {
    id: "operativo",
    nombre: "Soporte Operativo",
    desc: "Equipos, abastecimiento, proveedores, empleados, actas y firmas.",
    permisos: [
      "equipos_editar",
      "reabastecimiento_gestionar",
      "proveedores_editar",
      "empleados_editar",
      "actas_entrega",
      "actas_devolucion",
      "firmas_capturar",
      "repositorio_ver",
    ],
  },
  {
    id: "inventario",
    nombre: "Inventario y Compras",
    desc: "Gestión de activos, pedidos, proveedores, cargas masivas y catálogos.",
    permisos: [
      "equipos_editar",
      "reabastecimiento_gestionar",
      "proveedores_editar",
      "cargas_masivas",
      "catalogos_editar",
    ],
  },
  {
    id: "actas",
    nombre: "Mesa de Entregas y Actas",
    desc: "Empleados, generación de actas de entrega/devolución, firmas y archivo.",
    permisos: [
      "empleados_editar",
      "actas_entrega",
      "actas_devolucion",
      "firmas_capturar",
      "repositorio_ver",
    ],
  },
  {
    id: "analista",
    nombre: "Consulta y Reportes",
    desc: "Acceso a repositorio de actas, tablero estadístico y exportación.",
    permisos: ["repositorio_ver", "estadisticas_ver", "reportes_exportar"],
  },
  {
    id: "completo",
    nombre: "Acceso Completo (12/12)",
    desc: "Habilita todos los módulos operativos para un auxiliar senior.",
    permisos: PERMISOS.map((p) => p.id),
  },
];

function iniciales(nombre: string) {
  return (
    nombre
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

function generarPasswordSegura(): string {
  const mayus = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const minus = "abcdefghijkmnopqrstuvwxyz";
  const nums = "23456789";
  const syms = "!@#$%&*+-=";
  const todo = mayus + minus + nums + syms;
  const rnd = new Uint32Array(14);
  crypto.getRandomValues(rnd);
  const chars = [
    mayus[(rnd[0] ?? 0) % mayus.length]!,
    minus[(rnd[1] ?? 0) % minus.length]!,
    nums[(rnd[2] ?? 0) % nums.length]!,
    syms[(rnd[3] ?? 0) % syms.length]!,
  ];
  for (let i = 4; i < 12; i++) {
    chars.push(todo[(rnd[i] ?? 0) % todo.length]!);
  }
  return chars.join("");
}

function evaluarFortaleza(p: string) {
  let score = 0;
  if (p.length >= 8) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^a-zA-Z0-9]/.test(p)) score++;
  const etiqueta =
    !p.length
      ? { texto: "Sin definir", cls: "text-muted-foreground", bar: "bg-muted" }
      : score <= 1
        ? { texto: "Débil", cls: "text-destructive", bar: "bg-destructive" }
        : score === 2
          ? { texto: "Aceptable", cls: "text-warning-foreground", bar: "bg-warning" }
          : score === 3
            ? { texto: "Fuerte", cls: "text-primary", bar: "bg-primary" }
            : { texto: "Muy fuerte", cls: "text-success", bar: "bg-success" };
  return { score, etiqueta };
}

const selCls =
  "h-9 rounded-lg border border-input bg-background/80 px-3 text-xs font-medium transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function Usuarios() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const extrasFn = useServerFn(obtenerPermisosExtraUsuarios);
  const actualizarPermisosFn = useServerFn(actualizarPermisos);

  const [busca, setBusca] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activos" | "suspendidos">("todos");
  const [filtroRol, setFiltroRol] = useState<"todos" | "admin" | "auxiliar">("todos");
  const [filtroPermiso, setFiltroPermiso] = useState<string>("");
  const [vista, setVista] = useState<"directorio" | "matriz">("directorio");
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [guardandoCelda, setGuardandoCelda] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["usuarios"],
    enabled: !!me?.isAdmin,
    queryFn: async (): Promise<Fila[]> => {
      const [p, r, pe, ex] = await Promise.all([
        supabase.from("profiles").select("*").order("nombre"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("user_permisos").select("user_id, permiso"),
        extrasFn(),
      ]);
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      if (pe.error) throw pe.error;

      const extrasMap = ex?.extras ?? {};
      const visibles = new Set((r.data ?? []).map((y) => y.user_id));
      return (p.data ?? [])
        .filter((x) => visibles.has(x.id))
        .map((x) => {
          const dbPerms = (pe.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.permiso as Permiso);
          const extraPerms = (extrasMap[x.id] ?? []) as Permiso[];
          return {
            id: x.id,
            nombre: x.nombre,
            email: x.email,
            activo: x.activo,
            firma_path: x.firma_path,
            created_at: x.created_at,
            roles: (r.data ?? []).filter((y) => y.user_id === x.id).map((y) => y.role),
            permisos: [...new Set<Permiso>([...dbPerms, ...extraPerms])],
          };
        })
        .filter((f) => f.roles.includes("admin") || f.roles.includes("auxiliar"))
        .sort((a, b) => {
          const aAdmin = a.roles.includes("admin") ? 0 : 1;
          const bAdmin = b.roles.includes("admin") ? 0 : 1;
          if (aAdmin !== bAdmin) return aAdmin - bAdmin;
          return a.nombre.localeCompare(b.nombre, "es");
        });
    },
  });

  const lista = q.data ?? [];

  const kpis = useMemo(() => {
    const total = lista.length;
    const auxiliares = lista.filter((u) => !u.roles.includes("admin"));
    const auxActivos = auxiliares.filter((u) => u.activo).length;
    const auxSuspendidos = auxiliares.length - auxActivos;
    const conFirma = lista.filter((u) => !!u.firma_path).length;
    const promPermisos = auxiliares.length
      ? Math.round(
          (auxiliares.reduce((acc, u) => acc + u.permisos.length, 0) / (auxiliares.length * PERMISOS.length)) * 100,
        )
      : 100;
    return { total, auxiliares: auxiliares.length, auxActivos, auxSuspendidos, conFirma, promPermisos };
  }, [lista]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return lista.filter((u) => {
      const esAdm = u.roles.includes("admin");
      if (t && !u.nombre.toLowerCase().includes(t) && !u.email.toLowerCase().includes(t)) return false;
      if (filtroEstado === "activos" && !u.activo) return false;
      if (filtroEstado === "suspendidos" && u.activo) return false;
      if (filtroRol === "admin" && !esAdm) return false;
      if (filtroRol === "auxiliar" && esAdm) return false;
      if (filtroPermiso && !esAdm && !u.permisos.includes(filtroPermiso as Permiso)) return false;
      return true;
    });
  }, [lista, busca, filtroEstado, filtroRol, filtroPermiso]);

  if (!me?.isAdmin) {
    return <p className="text-muted-foreground">Solo el Administrador puede gestionar usuarios y permisos.</p>;
  }

  const hayFiltros = Boolean(busca || filtroEstado !== "todos" || filtroRol !== "todos" || filtroPermiso);
  const usuarioDetalle = lista.find((u) => u.id === detalleId) ?? null;

  async function togglePermisoMatriz(u: Fila, perm: Permiso) {
    if (u.roles.includes("admin")) return;
    const key = `${u.id}:${perm}`;
    setGuardandoCelda(key);
    const tiene = u.permisos.includes(perm);
    const nuevos = tiene ? u.permisos.filter((p) => p !== perm) : [...u.permisos, perm];
    try {
      const r = await actualizarPermisosFn({ data: { userId: u.id, permisos: nuevos } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${tiene ? "Permiso revocado" : "Permiso otorgado"} a ${u.nombre || u.email}`,
      );
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGuardandoCelda(null);
    }
  }

  const gruposPermisos = [...new Set(PERMISOS.map((p) => p.grupo))];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usuarios y permisos"
        desc="Administre su equipo de auxiliares de soporte, asigne perfiles de acceso granulares (RBAC) y audite su actividad."
      >
        <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setVista("directorio")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              vista === "directorio"
                ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" />
            Directorio
          </button>
          <button
            type="button"
            onClick={() => setVista("matriz")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
              vista === "matriz"
                ? "bg-card text-foreground shadow-2xs ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Grid className="h-3.5 w-3.5" />
            Matriz RBAC
          </button>
        </div>
        <NuevoAuxiliar />
      </PageHeader>

      {/* KPIs ejecutivos del equipo */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Equipo de Mesa TI</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">{kpis.total}</span>
            <span className="text-xs text-muted-foreground">
              1 Admin · {kpis.auxiliares} {kpis.auxiliares === 1 ? "Auxiliar" : "Auxiliares"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Los administradores se asignan únicamente por SQL en Supabase.
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Estado de auxiliares</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-success/25 bg-success/10 text-success">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">{kpis.auxActivos}</span>
            <span className="text-xs text-success">activos</span>
            {kpis.auxSuspendidos > 0 && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                {kpis.auxSuspendidos} suspendido{kpis.auxSuspendidos === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            La suspensión revoca el acceso de forma inmediata en el servidor.
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Firmas técnicas activas</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <PenTool className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {kpis.conFirma} / {kpis.total}
            </span>
            <span className="text-xs text-muted-foreground">con firma en PDF</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Se estampa automáticamente al emitir actas de entrega o devolución.
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Cobertura RBAC promedio</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              {kpis.promPermisos}%
            </span>
            <span className="text-xs text-muted-foreground">de {PERMISOS.length} módulos</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Control granular por acción validado en políticas RLS y servidor.
          </p>
        </div>
      </div>

      {/* Barra interactiva de búsqueda y filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o correo electrónico…"
            className="pl-9"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selCls}
            value={filtroPermiso}
            onChange={(e) => setFiltroPermiso(e.target.value)}
            aria-label="Filtrar por permiso"
          >
            <option value="">Cualquier permiso ({PERMISOS.length})</option>
            {PERMISOS.map((p) => (
              <option key={p.id} value={p.id}>
                Permiso: {p.label.slice(0, 42)}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/30 p-1">
            {(
              [
                { id: "todos", label: "Todos" },
                { id: "admin", label: "Admin" },
                { id: "auxiliar", label: "Auxiliares" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setFiltroRol(r.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  filtroRol === r.id
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-xl border border-border/80 bg-muted/30 p-1">
            {(
              [
                { id: "todos", label: "Todos" },
                { id: "activos", label: "Activos" },
                { id: "suspendidos", label: "Suspendidos" },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setFiltroEstado(s.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  filtroEstado === s.id
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {hayFiltros && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setBusca("");
                setFiltroEstado("todos");
                setFiltroRol("todos");
                setFiltroPermiso("");
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Vista Directorio o Vista Matriz RBAC */}
      {vista === "directorio" ? (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead>Usuario</TableHead>
                <TableHead>Rol y acceso</TableHead>
                <TableHead>Permisos asignados</TableHead>
                <TableHead>Firma técnica</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Cargando equipo de soporte…
                  </TableCell>
                </TableRow>
              ) : !filtrados.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    No se encontraron usuarios con los filtros seleccionados.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((u) => (
                  <FilaUsuario
                    key={u.id}
                    u={u}
                    esYo={u.id === me.id}
                    onVerDetalle={() => setDetalleId(u.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Matriz interactiva de permisos (RBAC)</h2>
              <p className="text-xs text-muted-foreground">
                Haga clic en cualquier casilla de un auxiliar para otorgar o revocar ese permiso en tiempo real.
              </p>
            </div>
            <Badge variant="secondary" className="font-mono text-[11px]">
              {filtrados.length} usuario{filtrados.length === 1 ? "" : "s"} × {PERMISOS.length} permisos
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-muted/30">
                  <th className="sticky left-0 z-10 min-w-[270px] bg-card px-4 py-3 text-left font-semibold text-foreground">
                    Módulo / Permiso
                  </th>
                  {filtrados.map((u) => {
                    const esAdm = u.roles.includes("admin");
                    return (
                      <th key={u.id} className="min-w-[130px] px-3 py-3 text-center font-medium">
                        <button
                          type="button"
                          onClick={() => setDetalleId(u.id)}
                          className="group mx-auto flex flex-col items-center gap-1 text-center"
                        >
                          <div
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg border font-mono text-[11px] font-bold transition-transform group-hover:scale-105",
                              esAdm
                                ? "border-primary/40 bg-primary/15 text-primary"
                                : "border-border bg-muted text-foreground",
                            )}
                          >
                            {iniciales(u.nombre || u.email)}
                          </div>
                          <span className="max-w-[115px] truncate font-semibold text-foreground group-hover:text-primary">
                            {u.nombre || u.email.split("@")[0]}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {esAdm ? "Admin (Total)" : `${u.permisos.length}/${PERMISOS.length}`}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {gruposPermisos.map((grupo) => (
                  <>
                    <tr key={`grp-${grupo}`} className="bg-muted/25">
                      <td
                        colSpan={filtrados.length + 1}
                        className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {grupo}
                      </td>
                    </tr>
                    {PERMISOS.filter((p) => p.grupo === grupo).map((perm) => (
                      <tr key={perm.id} className="transition-colors hover:bg-muted/15">
                        <td className="sticky left-0 z-10 border-r border-border/50 bg-card px-4 py-2.5">
                          <div className="font-medium text-foreground">{perm.label}</div>
                          <div className="line-clamp-1 text-[11px] text-muted-foreground">{perm.desc}</div>
                        </td>
                        {filtrados.map((u) => {
                          const esAdm = u.roles.includes("admin");
                          const activo = esAdm || u.permisos.includes(perm.id);
                          const cellKey = `${u.id}:${perm.id}`;
                          const cargando = guardandoCelda === cellKey;
                          return (
                            <td key={u.id} className="px-3 py-2.5 text-center">
                              {esAdm ? (
                                <span
                                  title="El Administrador posee todos los permisos por diseño"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary"
                                >
                                  <Lock className="h-3.5 w-3.5" />
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={cargando}
                                  onClick={() => void togglePermisoMatriz(u, perm.id)}
                                  title={`${activo ? "Quitar" : "Otorgar"} «${perm.label}» a ${u.nombre || u.email}`}
                                  className={cn(
                                    "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                                    activo
                                      ? "border-success/40 bg-success/15 text-success hover:bg-success/25"
                                      : "border-border/70 bg-background/50 text-muted-foreground/30 hover:border-primary/40 hover:text-muted-foreground",
                                    cargando && "animate-pulse opacity-60",
                                  )}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Panel lateral interactivo de Ficha y Auditoría por Usuario */}
      <FichaUsuarioSheet
        u={usuarioDetalle}
        esYo={usuarioDetalle?.id === me.id}
        onClose={() => setDetalleId(null)}
      />
    </div>
  );
}

function FilaUsuario({
  u,
  esYo,
  onVerDetalle,
}: {
  u: Fila;
  esYo: boolean;
  onVerDetalle: () => void;
}) {
  const qc = useQueryClient();
  const estado = useServerFn(cambiarEstadoUsuario);
  const eliminar = useServerFn(eliminarAuxiliar);
  const admin = u.roles.includes("admin");
  const pct = admin ? 100 : Math.round((u.permisos.length / PERMISOS.length) * 100);

  async function toggle() {
    try {
      const r = await estado({ data: { userId: u.id, activo: !u.activo } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(u.activo ? "Cuenta suspendida inmediatamente" : "Cuenta reactivada");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  async function borrar() {
    if (
      !window.confirm(
        `¿Eliminar definitivamente la cuenta de ${u.nombre || u.email}? Esta acción queda registrada en auditoría y no se puede deshacer.`,
      )
    )
      return;
    try {
      const r = await eliminar({ data: { userId: u.id } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Cuenta de auxiliar eliminada");
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <TableRow className="group transition-colors hover:bg-muted/20">
      <TableCell>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVerDetalle}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-mono text-xs font-bold transition-transform hover:scale-105",
              admin
                ? "border-primary/35 bg-primary/15 text-primary"
                : u.activo
                  ? "border-border bg-muted/60 text-foreground"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {iniciales(u.nombre || u.email)}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onVerDetalle}
                className="truncate font-semibold text-foreground hover:text-primary hover:underline"
              >
                {u.nombre || "Sin nombre"}
              </button>
              {esYo && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.2 text-[10px] font-semibold text-primary">
                  Tú
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate font-mono text-[11px]">{u.email}</span>
              <button
                type="button"
                title="Copiar correo"
                onClick={async () => {
                  if (await copiarTexto(u.email)) toast.success("Correo copiado");
                }}
                className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </TableCell>

      <TableCell>
        {admin ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Administrador
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-foreground">
            <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
            Auxiliar de soporte
          </span>
        )}
        <div className="mt-1 text-[10px] text-muted-foreground">Alta: {fmtFecha(u.created_at)}</div>
      </TableCell>

      <TableCell>
        {admin ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Acceso total al ecosistema ({PERMISOS.length}/{PERMISOS.length})</span>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-primary/20">
              <div className="h-full w-full bg-primary" />
            </div>
          </div>
        ) : (
          <div className="max-w-xs space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {u.permisos.length} de {PERMISOS.length} permisos
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  pct === 0 ? "bg-muted" : pct < 40 ? "bg-warning" : "bg-primary",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            {u.permisos.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {u.permisos.slice(0, 3).map((pid) => {
                  const info = PERMISOS.find((x) => x.id === pid);
                  return (
                    <span
                      key={pid}
                      className="rounded-md border border-border/70 bg-background/70 px-1.5 py-0.2 text-[10px] text-muted-foreground"
                    >
                      {info?.label.split(",")[0] ?? pid}
                    </span>
                  );
                })}
                {u.permisos.length > 3 && (
                  <button
                    type="button"
                    onClick={onVerDetalle}
                    className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary hover:bg-primary/20"
                  >
                    +{u.permisos.length - 3} más
                  </button>
                )}
              </div>
            ) : (
              <span className="text-[11px] text-warning-foreground">Sin permisos asignados</span>
            )}
          </div>
        )}
      </TableCell>

      <TableCell>
        {u.firma_path ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckCircle2 className="h-3 w-3" />
            Configurada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            Pendiente
          </span>
        )}
      </TableCell>

      <TableCell>
        {u.activo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Activa
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
            Suspendida
          </span>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onVerDetalle}>
            <Activity className="mr-1 h-3.5 w-3.5" />
            Ficha
          </Button>
          {!admin && !esYo && (
            <>
              <EditarPermisos u={u} />
              <CambiarPassword u={u} />
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-8 text-xs",
                  u.activo ? "hover:border-warning/50 hover:text-warning-foreground" : "text-success",
                )}
                onClick={toggle}
              >
                {u.activo ? (
                  <>
                    <UserMinus className="mr-1 h-3.5 w-3.5" />
                    Suspender
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-1 h-3.5 w-3.5" />
                    Reactivar
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={borrar}
                title="Eliminar auxiliar"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SelectorPermisos({ value, onChange }: { value: Permiso[]; onChange: (v: Permiso[]) => void }) {
  const grupos = [...new Set(PERMISOS.map((p) => p.grupo))];
  const todosIds = PERMISOS.map((p) => p.id);
  const todosMarcados = todosIds.every((id) => value.includes(id));

  function aplicarPlantilla(permisos: Permiso[]) {
    onChange([...permisos]);
  }

  function toggleGrupo(grupo: string) {
    const idsGrupo = PERMISOS.filter((p) => p.grupo === grupo).map((p) => p.id);
    const todosEnGrupo = idsGrupo.every((id) => value.includes(id));
    if (todosEnGrupo) {
      onChange(value.filter((id) => !idsGrupo.includes(id)));
    } else {
      onChange([...new Set<Permiso>([...value, ...idsGrupo])]);
    }
  }

  return (
    <div className="space-y-4">
      {/* Plantillas rápidas de perfil */}
      <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Perfiles rápidos de permisos
          </span>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => onChange(todosMarcados ? [] : [...todosIds])}
          >
            {todosMarcados ? "Quitar todos (0/12)" : `Marcar todos (${PERMISOS.length}/${PERMISOS.length})`}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLANTILLAS_PERMISOS.map((pl) => {
            const coincide =
              pl.permisos.length === value.length && pl.permisos.every((id) => value.includes(id));
            return (
              <button
                key={pl.id}
                type="button"
                onClick={() => aplicarPlantilla(pl.permisos)}
                className={cn(
                  "flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all",
                  coincide
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/70 bg-background/70 hover:border-primary/40 hover:bg-background",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-foreground">{pl.nombre}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                    {pl.permisos.length} perm.
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{pl.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista detallada por grupo */}
      {grupos.map((grupo) => {
        const itemsGrupo = PERMISOS.filter((p) => p.grupo === grupo);
        const marcadosGrupo = itemsGrupo.filter((p) => value.includes(p.id)).length;
        return (
          <div key={grupo} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {grupo} ({marcadosGrupo}/{itemsGrupo.length})
              </div>
              <button
                type="button"
                onClick={() => toggleGrupo(grupo)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {marcadosGrupo === itemsGrupo.length ? "Desmarcar grupo" : "Marcar grupo"}
              </button>
            </div>
            <div className="grid gap-2 rounded-xl border border-border/80 bg-muted/15 p-3">
              {itemsGrupo.map((p) => {
                const checked = value.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 text-sm transition-colors",
                      checked
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent hover:bg-background/70",
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      onCheckedChange={(c) =>
                        onChange(c ? [...value, p.id] : value.filter((x) => x !== p.id))
                      }
                    />
                    <div className="leading-snug">
                      <div className="text-xs font-semibold text-foreground">{p.label}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{p.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditarPermisos({ u }: { u: Fila }) {
  const qc = useQueryClient();
  const fn = useServerFn(actualizarPermisos);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Permiso[]>(u.permisos);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await fn({ data: { userId: u.id, permisos: sel } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Permisos actualizados correctamente");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSel(u.permisos);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Shield className="mr-1 h-3.5 w-3.5" />
          Permisos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Permisos de {u.nombre || u.email}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Seleccione un perfil rápido o personalice los permisos individuales ({sel.length} de {PERMISOS.length} activos).
          </p>
        </DialogHeader>
        <SelectorPermisos value={sel} onChange={setSel} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar permisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevoAuxiliar() {
  const qc = useQueryClient();
  const fn = useServerFn(crearAuxiliar);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", email: "", password: "" });
  const [mostrarPwd, setMostrarPwd] = useState(false);
  const [sel, setSel] = useState<Permiso[]>(PLANTILLAS_PERMISOS[0]!.permisos);
  const [loading, setLoading] = useState(false);

  const evalPwd = evaluarFortaleza(f.password);

  function autogenerar() {
    const pwd = generarPasswordSegura();
    setF((prev) => ({ ...prev, password: pwd }));
    setMostrarPwd(true);
    toast.success("Contraseña segura generada");
  }

  async function copiarCredenciales() {
    if (!f.email || !f.password) return;
    const texto = `Acceso Finesa TI\nCorreo: ${f.email.trim()}\nContraseña temporal: ${f.password}`;
    if (await copiarTexto(texto)) {
      toast.success("Credenciales copiadas al portapapeles");
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fn({ data: { ...f, permisos: sel } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      await copiarCredenciales();
      toast.success("Auxiliar creado y credenciales copiadas al portapapeles.");
      setOpen(false);
      setF({ nombre: "", email: "", password: "" });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 text-xs">
          <UserPlus className="mr-1.5 h-4 w-4" />
          Nuevo auxiliar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Registrar nuevo auxiliar de soporte</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Cree una cuenta operativa dentro de su ecosistema y asigne su perfil de permisos iniciales.
          </p>
        </DialogHeader>
        <form onSubmit={crear} className="space-y-4">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre completo *</Label>
              <Input
                required
                placeholder="Ej. Carlos Mendoza"
                value={f.nombre}
                onChange={(e) => setF({ ...f, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Correo corporativo *</Label>
              <Input
                type="email"
                required
                placeholder="carlos.mendoza@finesa.com.co"
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/15 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Contraseña temporal (mín. 8, letras + números/símbolos)</Label>
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={autogenerar}>
                  <Wand2 className="mr-1 h-3 w-3 text-primary" />
                  Generar clave segura
                </Button>
                {f.email && f.password && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={copiarCredenciales}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar credenciales
                  </Button>
                )}
              </div>
            </div>
            <div className="relative">
              <Input
                type={mostrarPwd ? "text" : "password"}
                required
                minLength={8}
                maxLength={72}
                placeholder="Ingrese o genere una contraseña segura"
                value={f.password}
                onChange={(e) => setF({ ...f, password: e.target.value })}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setMostrarPwd((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {mostrarPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Fortaleza de la clave:</span>
              <span className={cn("font-semibold", evalPwd.etiqueta.cls)}>{evalPwd.etiqueta.texto}</span>
            </div>
          </div>

          <div>
            <Label className="mb-2 block text-xs font-semibold">Permisos de acceso</Label>
            <SelectorPermisos value={sel} onChange={setSel} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creando cuenta…" : "Crear auxiliar y copiar clave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CambiarPassword({ u }: { u: Fila }) {
  const fn = useServerFn(cambiarPasswordAuxiliar);
  const [open, setOpen] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [loading, setLoading] = useState(false);

  const evalPwd = evaluarFortaleza(p1);

  function autogenerar() {
    const pwd = generarPasswordSegura();
    setP1(pwd);
    setP2(pwd);
    setMostrar(true);
    toast.success("Contraseña segura generada");
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (p1 !== p2) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const r = await fn({ data: { userId: u.id, password: p1 } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      await copiarTexto(`Acceso Finesa TI (${u.email})\nNueva contraseña: ${p1}`);
      toast.success("Contraseña actualizada y copiada al portapapeles.");
      setOpen(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setP1("");
          setP2("");
          setMostrar(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <KeyRound className="mr-1 h-3.5 w-3.5" />
          Clave
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Nueva contraseña para {u.nombre || u.email}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            La contraseña debe incluir letras y al menos un número o símbolo.
          </p>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={autogenerar}>
              <Wand2 className="mr-1 h-3 w-3 text-primary" />
              Generar clave segura
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nueva contraseña (mín. 8)</Label>
            <div className="relative">
              <Input
                type={mostrar ? "text" : "password"}
                required
                minLength={8}
                value={p1}
                onChange={(e) => setP1(e.target.value)}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {mostrar ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirmar contraseña</Label>
            <Input
              type={mostrar ? "text" : "password"}
              required
              minLength={8}
              value={p2}
              onChange={(e) => setP2(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Fortaleza:</span>
            <span className={cn("font-semibold", evalPwd.etiqueta.cls)}>{evalPwd.etiqueta.texto}</span>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar y copiar clave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FichaUsuarioSheet({
  u,
  esYo,
  onClose,
}: {
  u: Fila | null;
  esYo: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editarNombreFn = useServerFn(actualizarDatosAuxiliar);
  const [nombre, setNombre] = useState("");
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [guardandoNombre, setGuardandoNombre] = useState(false);

  const esAdmin = !!u?.roles.includes("admin");

  const actividad = useQuery({
    queryKey: ["auditoria_usuario_detalle", u?.id],
    enabled: !!u?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("auditoria")
        .select("id, tabla, accion, detalle, created_at")
        .eq("user_id", u!.id)
        .order("created_at", { ascending: false })
        .limit(12);
      return data ?? [];
    },
  });

  async function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    if (!u || !nombre.trim()) return;
    setGuardandoNombre(true);
    try {
      const r = await editarNombreFn({ data: { userId: u.id, nombre: nombre.trim() } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Nombre actualizado");
      setEditandoNombre(false);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setGuardandoNombre(false);
    }
  }

  return (
    <Sheet
      open={!!u}
      onOpenChange={(o) => {
        if (!o) {
          setEditandoNombre(false);
          onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {u && (
          <>
            <SheetHeader className="border-b border-border/60 pb-4">
              <div className="flex items-start justify-between gap-3 pr-6">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl border font-mono text-sm font-bold",
                      esAdmin
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-muted text-foreground",
                    )}
                  >
                    {iniciales(u.nombre || u.email)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <SheetTitle className="text-base font-semibold tracking-tight">
                        {u.nombre || "Sin nombre"}
                      </SheetTitle>
                      {!esAdmin && !esYo && (
                        <button
                          type="button"
                          onClick={() => {
                            setNombre(u.nombre);
                            setEditandoNombre((v) => !v);
                          }}
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Editar nombre"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-5 space-y-6 text-sm">
              {editandoNombre && !esAdmin && (
                <form
                  onSubmit={guardarNombre}
                  className="flex items-end gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3.5"
                >
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Nuevo nombre completo</Label>
                    <Input
                      required
                      minLength={2}
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={guardandoNombre}>
                    {guardandoNombre ? "Guardando…" : "Guardar"}
                  </Button>
                </form>
              )}

              {/* Resumen de estado */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                  <div className="text-[11px] text-muted-foreground">Rol asignado</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {esAdmin ? "Administrador" : "Auxiliar de soporte"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                  <div className="text-[11px] text-muted-foreground">Estado de cuenta</div>
                  <div className={cn("mt-1 font-semibold", u.activo ? "text-success" : "text-destructive")}>
                    {u.activo ? "Activa" : "Suspendida"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                  <div className="text-[11px] text-muted-foreground">Firma en actas PDF</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {u.firma_path ? "Configurada" : "Sin registrar"}
                  </div>
                </div>
              </div>

              {/* Permisos habilitados */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Permisos activos ({esAdmin ? PERMISOS.length : u.permisos.length}/{PERMISOS.length})
                  </h3>
                  {!esAdmin && !esYo && <EditarPermisos u={u} />}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {PERMISOS.map((p) => {
                    const tiene = esAdmin || u.permisos.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
                          tiene
                            ? "border-success/25 bg-success/5 text-foreground"
                            : "border-border/50 bg-muted/10 text-muted-foreground/60",
                        )}
                      >
                        <CheckCircle2
                          className={cn(
                            "mt-0.5 h-3.5 w-3.5 shrink-0",
                            tiene ? "text-success" : "text-muted-foreground/30",
                          )}
                        />
                        <div>
                          <div className="font-medium leading-tight">{p.label}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{p.grupo}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Últimas acciones en Auditoría */}
              <div className="space-y-2.5">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  Actividad reciente en bitácora de auditoría
                </h3>
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card">
                  {actividad.isLoading ? (
                    <p className="p-4 text-xs text-muted-foreground">Cargando actividad…</p>
                  ) : !actividad.data?.length ? (
                    <p className="p-4 text-xs text-muted-foreground">
                      Sin registros recientes en la bitácora para este usuario.
                    </p>
                  ) : (
                    actividad.data.map((ev) => (
                      <div key={ev.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
                              {ev.accion}
                            </span>
                            <span className="text-[11px] font-medium text-muted-foreground">{ev.tabla}</span>
                          </div>
                          {ev.detalle && (
                            <p className="mt-1 truncate text-xs text-foreground">{ev.detalle}</p>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {fmtFecha(ev.created_at, true)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
