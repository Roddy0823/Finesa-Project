import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { CampanaAlertas } from "@/components/StockAlertas";
import { CommandPalette, openCommandPalette } from "@/components/CommandPalette";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { meQuery, useMe } from "@/lib/me";
import { catalogosQuery } from "@/lib/catalogos";
import { obtenerConfigPortal } from "@/lib/ajustes.functions";
import type { Permiso } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Laptop,
  Users,
  FileSignature,
  FolderOpen,
  Tags,
  UserCog,
  FileBarChart,
  Upload,
  LogOut,
  Menu,
  X,
  Inbox,
  Settings,
  Loader2,
  Truck,
  ShoppingCart,
  BarChart3,
  Package,
  ShieldCheck,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const IDLE_CONFIG_EVENT = "finesa:idle-config-changed";
export const IDLE_STORAGE_KEY = "finesa-idle-min";

export function leerMinutosInactividad(): number {
  if (typeof window === "undefined") return 30;
  const raw = Number(localStorage.getItem(IDLE_STORAGE_KEY));
  if (raw === 0 || raw === 15 || raw === 30 || raw === 60) return raw;
  return 30;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user ?? null;
    if (!user) {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw redirect({ to: "/" });
      user = data.user;
    }
    void context.queryClient.prefetchQuery(meQuery);
    void context.queryClient.prefetchQuery(catalogosQuery);
    return { user };
  },
  component: Shell,
});

type NavItem = { to: string; label: string; icon: typeof Laptop; show: boolean };
type NavGroup = { id: string; label?: string; icon?: typeof Laptop; items: NavItem[] };

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Shell() {
  const { data: me, isLoading, isError: meError, refetch: refetchMe } = useMe();
  const obtenerConfigFn = useServerFn(obtenerConfigPortal);
  const configPortal = useQuery({
    queryKey: ["config-portal"],
    queryFn: () => obtenerConfigFn(),
    enabled: !!me?.isEmpleado,
    staleTime: 5 * 60_000,
  });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [idleMin, setIdleMin] = useState<number>(30);
  const [idleRestanteSeg, setIdleRestanteSeg] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const cargando = useRouterState({ select: (s) => s.status === "pending" });
  const path = useRouterState({ select: (s) => s.location.pathname });

  const registrarActividad = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRestanteSeg((prev) => (prev !== null ? null : prev));
  }, []);

  useEffect(() => {
    try {
      setAbiertos(JSON.parse(localStorage.getItem("nav-grupos") || "{}"));
    } catch {
      /* vacío */
    }
    setIdleMin(leerMinutosInactividad());
    const onIdleCfg = () => {
      lastActivityRef.current = Date.now();
      setIdleRestanteSeg(null);
      setIdleMin(leerMinutosInactividad());
    };
    window.addEventListener(IDLE_CONFIG_EVENT, onIdleCfg);
    const mq = window.matchMedia("(min-width: 1024px)");
    const upd = () => setMini(mq.matches && localStorage.getItem("nav-mini") === "1");
    upd();
    mq.addEventListener("change", upd);
    return () => {
      window.removeEventListener(IDLE_CONFIG_EVENT, onIdleCfg);
      mq.removeEventListener("change", upd);
    };
  }, []);

  function toggleMini() {
    setMini((m) => {
      localStorage.setItem("nav-mini", m ? "0" : "1");
      return !m;
    });
  }

  const salir = useCallback(
    async (motivo = "Cierre de sesión") => {
      try {
        await supabase.rpc("log_evento", { p_accion: "LOGOUT", p_detalle: motivo });
      } catch {
        /* continuar cierre */
      }
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      nav({ to: "/", replace: true });
    },
    [qc, nav],
  );

  useEffect(() => {
    if (!me || idleMin <= 0) {
      setIdleRestanteSeg(null);
      return;
    }
    let lastTouch = 0;
    const onEvent = () => {
      const now = Date.now();
      if (now - lastTouch < 2000) return;
      lastTouch = now;
      lastActivityRef.current = now;
      setIdleRestanteSeg((prev) => (prev !== null ? null : prev));
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((ev) => window.addEventListener(ev, onEvent, { passive: true }));

    const limitMs = idleMin * 60_000;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remainingMs = limitMs - elapsed;
      if (remainingMs <= 0) {
        window.clearInterval(timer);
        toast.info("Su sesión se cerró automáticamente por inactividad.");
        void salir(`Cierre automático por inactividad (${idleMin} min)`);
      } else if (remainingMs <= 60_000) {
        setIdleRestanteSeg(Math.ceil(remainingMs / 1000));
      } else {
        setIdleRestanteSeg((prev) => (prev !== null ? null : prev));
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, onEvent));
      window.clearInterval(timer);
    };
  }, [me, idleMin, salir]);

  if (isLoading || (me?.isEmpleado && configPortal.isLoading)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-xs font-medium tracking-wide">Sincronizando espacio de trabajo…</span>
      </div>
    );
  }

  if (me?.isEmpleado && configPortal.data?.portalEmpleadosActivo === false) {
    return (
      <div className="login-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-xl backdrop-blur-xl">
          <h1 className="text-lg font-semibold text-foreground">Portal de empleados deshabilitado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            El acceso al portal de empleados no se encuentra habilitado en este momento. Comuníquese con la Mesa de servicios.
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => void salir()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (meError && !me) {
    return (
      <div className="login-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-xl backdrop-blur-xl">
          <h1 className="text-lg font-semibold text-foreground">Conexión interrumpida</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No fue posible sincronizar su perfil en este momento. Verifique su conexión e intente nuevamente.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button className="w-full" onClick={() => refetchMe()}>
              Reintentar conexión
            </Button>
            <Button variant="outline" className="w-full" onClick={() => void salir()}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!me || !me.activo || (!me.isStaff && !me.isEmpleado)) {
    return (
      <div className="login-bg flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="max-w-sm rounded-2xl border border-border/80 bg-card/90 p-7 shadow-xl backdrop-blur-xl">
          <h1 className="text-lg font-semibold text-foreground">Cuenta sin acceso</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Su cuenta está suspendida o no tiene un rol asignado. Contacte al Administrador.
          </p>
          <Button variant="outline" className="mt-5 w-full" onClick={() => void salir()}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  const can = (p: Permiso) => me.can(p);
  const grupos: NavGroup[] = me.isEmpleado
    ? [{ id: "portal", items: [{ to: "/mi-portal", label: "Mis equipos y actas", icon: Inbox, show: true }] }]
    : [
        { id: "inicio", items: [{ to: "/panel", label: "Panel", icon: LayoutDashboard, show: true }] },
        {
          id: "inventario",
          label: "Inventario",
          icon: Package,
          items: [
            { to: "/equipos", label: "Equipos", icon: Laptop, show: true },
            { to: "/reabastecimiento", label: "Reabastecimiento", icon: ShoppingCart, show: can("reabastecimiento_gestionar") },
            { to: "/proveedores", label: "Proveedores", icon: Truck, show: can("proveedores_editar") },
            { to: "/carga-masiva", label: "Carga masiva", icon: Upload, show: can("cargas_masivas") },
          ],
        },
        {
          id: "actas",
          label: "Personas y actas",
          icon: FileSignature,
          items: [
            { to: "/empleados", label: "Empleados", icon: Users, show: true },
            { to: "/actas/nueva", label: "Nueva acta", icon: FileSignature, show: can("actas_entrega") || can("actas_devolucion") },
            { to: "/actas", label: "Repositorio de actas", icon: FolderOpen, show: can("repositorio_ver") },
          ],
        },
        {
          id: "analisis",
          label: "Análisis",
          icon: BarChart3,
          items: [
            { to: "/estadisticas", label: "Estadísticas", icon: BarChart3, show: can("estadisticas_ver") },
            { to: "/reportes", label: "Reportes", icon: FileBarChart, show: can("reportes_exportar") },
          ],
        },
        {
          id: "admin",
          label: "Administración",
          icon: ShieldCheck,
          items: [
            { to: "/catalogos", label: "Catálogos", icon: Tags, show: me.isAdmin || can("catalogos_editar") },
            { to: "/usuarios", label: "Usuarios y permisos", icon: UserCog, show: me.isAdmin },
            { to: "/auditoria", label: "Auditoría", icon: ScrollText, show: me.isAdmin },
          ],
        },
      ];

  const visibles = grupos.map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);
  const enRuta = (to: string) =>
    to === "/actas" || to === "/panel" ? path === to : path === to || path.startsWith(to + "/");
  const grupoActivo = (g: NavGroup) =>
    g.items.some((i) => enRuta(i.to) && !(i.to === "/actas" && path === "/actas/nueva"));

  const rol = me.isAdmin ? "Administrador" : me.isStaff ? "Auxiliar de soporte" : "Empleado";

  const linkCls = (compacto: boolean) =>
    cn(
      "group relative flex items-center gap-2.5 rounded-lg py-1.5 text-[13px] font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
      compacto ? "justify-center px-2 py-2" : "px-2.5",
    );

  const renderLink = (i: NavItem, sub: boolean) => (
    <Link
      key={i.to}
      to={i.to}
      title={mini ? i.label : undefined}
      onClick={() => setOpen(false)}
      activeOptions={{ exact: i.to === "/actas" || i.to === "/panel" }}
      className={cn(linkCls(mini), sub && !mini && "pl-8")}
      activeProps={{
        className:
          "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[inset_2px_0_0_0_var(--color-primary)]",
      }}
    >
      <i.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-sidebar-accent-foreground group-[.font-semibold]:text-primary" />
      {!mini && <span className="truncate">{i.label}</span>}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <CommandPalette />

      {idleRestanteSeg !== null && (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-warning/40 bg-card/95 px-4 py-2.5 text-xs shadow-2xl backdrop-blur-md">
          <ShieldAlert className="h-4 w-4 shrink-0 text-warning-foreground" />
          <span>
            Por seguridad, su sesión se cerrará por inactividad en{" "}
            <b className="font-mono text-foreground">{idleRestanteSeg}s</b>.
          </span>
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={registrarActividad}>
            Mantener sesión
          </Button>
        </div>
      )}

      {cargando && (
        <>
          <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-[carga_1.2s_ease-in-out_infinite] bg-primary" />
          </div>
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border/80 bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Sincronizando…
          </div>
        </>
      )}

      {/* Sidebar única con todos los controles de la App Shell */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          mini && "lg:w-16",
        )}
      >
        {/* Brand + Alertas + Tema + Contraer */}
        <div
          className={cn(
            "flex h-14 items-center justify-between border-b border-sidebar-border px-3.5",
            mini && "lg:justify-center lg:px-2",
          )}
        >
          <Link
            to={me.isEmpleado ? "/mi-portal" : "/panel"}
            className={cn("flex items-center gap-2.5", mini && "lg:hidden")}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shadow-sm">
              F
            </div>
            <div className="leading-none">
              <div className="font-display text-sm font-bold tracking-tight text-sidebar-accent-foreground">
                FINESA
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-muted-foreground">Inventario y actas</div>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            {!mini && me.isStaff && <CampanaAlertas />}
            <button
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              className="hidden rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:inline-flex"
              onClick={() => toggleMini()}
              aria-label={mini ? "Expandir menú" : "Contraer menú"}
              title={mini ? "Expandir menú" : "Contraer menú"}
            >
              {mini ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Paleta de comandos ⌘K en la barra lateral */}
        <div className={cn("space-y-1.5 px-2.5 pt-2.5", mini && "lg:px-2")}>
          <button
            type="button"
            onClick={openCommandPalette}
            title="Buscar o ejecutar comando (Ctrl+K / ⌘K)"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground shadow-2xs transition-colors hover:border-primary/40 hover:bg-background hover:text-foreground",
              mini && "lg:justify-center lg:px-0 lg:py-2",
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            {!mini && (
              <>
                <span className="flex-1 truncate text-left">Buscar o comando…</span>
                <kbd className="rounded border border-border/80 bg-muted/60 px-1.5 py-0.2 font-mono text-[10px] font-medium text-muted-foreground">
                  ⌘K
                </kbd>
              </>
            )}
          </button>
          {mini && me.isStaff && (
            <div className="hidden flex-col items-center gap-1.5 lg:flex">
              <CampanaAlertas />
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 py-3">
          {visibles.map((g) => {
            if (!g.label) {
              return (
                <div key={g.id} className="space-y-0.5">
                  {g.items.map((i) => renderLink(i, false))}
                </div>
              );
            }
            const activo = grupoActivo(g);
            const abierto = mini || activo || abiertos[g.id] !== false;
            const Icon = g.icon!;
            return (
              <div key={g.id} className={cn("pt-1", mini && "border-t border-sidebar-border pt-1.5 first:border-0")}>
                {!mini && (
                  <button
                    onClick={() =>
                      setAbiertos((a) => {
                        const n = { ...a, [g.id]: !abierto };
                        localStorage.setItem("nav-grupos", JSON.stringify(n));
                        return n;
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-sidebar-accent-foreground",
                      activo && "text-sidebar-accent-foreground",
                    )}
                    aria-expanded={abierto}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span className="flex-1 text-left">{g.label}</span>
                    <ChevronDown
                      className={cn("h-3 w-3 opacity-60 transition-transform duration-150", abierto && "rotate-180")}
                    />
                  </button>
                )}
                {abierto && <div className="mt-0.5 space-y-0.5">{g.items.map((i) => renderLink(i, false))}</div>}
              </div>
            );
          })}
        </nav>

        {/* User Footer */}
        <div className={cn("border-t border-sidebar-border p-3", mini && "lg:p-2")}>
          <div className={cn("flex items-center gap-2.5", mini && "lg:flex-col")}>
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/12 font-mono text-xs font-semibold text-primary"
              title={me.nombre}
            >
              {getInitials(me.nombre || "U")}
            </div>
            <div className={cn("min-w-0 flex-1", mini && "lg:hidden")}>
              <div className="truncate text-xs font-semibold text-sidebar-accent-foreground">{me.nombre}</div>
              <div className="truncate text-[11px] text-muted-foreground">{rol}</div>
            </div>
          </div>

          <div className={cn("mt-2.5 flex items-center gap-1.5", mini && "lg:flex-col")}>
            <Link
              to="/ajustes"
              title="Ajustes"
              onClick={() => setOpen(false)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sidebar-border bg-background/50 px-2.5 py-1.5 text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                mini && "lg:w-full lg:px-0",
              )}
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground border-primary/30" }}
            >
              <Settings className="h-3.5 w-3.5 shrink-0" />
              {!mini && <span>Ajustes</span>}
            </Link>
            <button
              onClick={() => void salir()}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/50 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main Content Area (sin barra superior en escritorio) */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-13 items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setOpen(true)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Abrir menú"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="font-display text-sm font-bold tracking-tight text-foreground">FINESA</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
