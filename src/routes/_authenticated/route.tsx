import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { CampanaAlertas } from "@/components/StockAlertas";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { obtenerConfigPortal } from "@/lib/ajustes.functions";
import type { Permiso } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Laptop, Users, FileSignature, FolderOpen, Tags, UserCog, FileBarChart, Upload, LogOut, Menu, X, Inbox, Settings, Loader2, Truck, ShoppingCart, BarChart3,
  Package, ShieldCheck, ChevronDown, PanelLeftClose, PanelLeftOpen, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });
    return { user: data.user };
  },
  component: Shell,
});

type NavItem = { to: string; label: string; icon: typeof Laptop; show: boolean };
type NavGroup = { id: string; label?: string; icon?: typeof Laptop; items: NavItem[] };

function Shell() {
  const { data: me, isLoading } = useMe();
  const obtenerConfigFn = useServerFn(obtenerConfigPortal);
  const configPortal = useQuery({
    queryKey: ["config-portal"],
    queryFn: () => obtenerConfigFn(),
    enabled: !!me?.isEmpleado,
  });
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const cargando = useRouterState({ select: (s) => s.status === "pending" });
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    try { setAbiertos(JSON.parse(localStorage.getItem("nav-grupos") || "{}")); } catch { /* vacío */ }
    const mq = window.matchMedia("(min-width: 1024px)");
    const upd = () => setMini(mq.matches && localStorage.getItem("nav-mini") === "1");
    upd(); mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  function toggleMini() {
    setMini((m) => { localStorage.setItem("nav-mini", m ? "0" : "1"); return !m; });
  }

  async function salir() {
    await supabase.rpc("log_evento", { p_accion: "LOGOUT", p_detalle: "Cierre de sesión" });
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/", replace: true });
  }

  if (isLoading || (me?.isEmpleado && configPortal.isLoading)) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Cargando…</div>;

  if (me?.isEmpleado && configPortal.data?.portalEmpleadosActivo === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">Portal de empleados deshabilitado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">El acceso al portal de empleados no se encuentra habilitado en este momento. Comuníquese con la Mesa de servicios.</p>
        <Button variant="outline" onClick={salir}>Cerrar sesión</Button>
      </div>
    );
  }

  if (!me || !me.activo || (!me.isStaff && !me.isEmpleado)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">Cuenta sin acceso</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Su cuenta está suspendida o no tiene un rol asignado. Contacte al Administrador.</p>
        <Button variant="outline" onClick={salir}>Cerrar sesión</Button>
      </div>
    );
  }

  const can = (p: Permiso) => me.can(p);
  const grupos: NavGroup[] = me.isEmpleado
    ? [{ id: "portal", items: [{ to: "/mi-portal", label: "Mis equipos y actas", icon: Inbox, show: true }] }]
    : [
        { id: "inicio", items: [{ to: "/panel", label: "Panel", icon: LayoutDashboard, show: true }] },
        { id: "inventario", label: "Inventario", icon: Package, items: [
          { to: "/equipos", label: "Equipos", icon: Laptop, show: true },
          { to: "/reabastecimiento", label: "Reabastecimiento", icon: ShoppingCart, show: can("reabastecimiento_gestionar") },
          { to: "/proveedores", label: "Proveedores", icon: Truck, show: can("proveedores_editar") },
          { to: "/carga-masiva", label: "Carga masiva", icon: Upload, show: can("cargas_masivas") },
        ] },
        { id: "actas", label: "Personas y actas", icon: FileSignature, items: [
          { to: "/empleados", label: "Empleados", icon: Users, show: true },
          { to: "/actas/nueva", label: "Nueva acta", icon: FileSignature, show: can("actas_entrega") || can("actas_devolucion") },
          { to: "/actas", label: "Repositorio de actas", icon: FolderOpen, show: can("repositorio_ver") },
        ] },
        { id: "analisis", label: "Análisis", icon: BarChart3, items: [
          { to: "/estadisticas", label: "Estadísticas", icon: BarChart3, show: can("estadisticas_ver") },
          { to: "/reportes", label: "Reportes", icon: FileBarChart, show: can("reportes_exportar") },
        ] },
        { id: "admin", label: "Administración", icon: ShieldCheck, items: [
          { to: "/catalogos", label: "Catálogos", icon: Tags, show: me.isAdmin || can("catalogos_editar") },
          { to: "/usuarios", label: "Usuarios y permisos", icon: UserCog, show: me.isAdmin },
          { to: "/auditoria", label: "Auditoría", icon: ScrollText, show: me.isAdmin },
        ] },
      ];
  const visibles = grupos.map((g) => ({ ...g, items: g.items.filter((i) => i.show) })).filter((g) => g.items.length);
  const enRuta = (to: string) => to === "/actas" || to === "/panel" ? path === to : path === to || path.startsWith(to + "/");
  const grupoActivo = (g: NavGroup) => g.items.some((i) => enRuta(i.to) && !(i.to === "/actas" && path === "/actas/nueva"));

  const rol = me.isAdmin ? "Administrador" : me.isStaff ? "Auxiliar de soporte" : "Empleado";

  const linkCls = (compacto: boolean) => cn("flex items-center gap-3 rounded py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", compacto ? "justify-center px-2" : "px-3");
  const renderLink = (i: NavItem, sub: boolean) => (
    <Link
      key={i.to}
      to={i.to}
      title={mini ? i.label : undefined}
      onClick={() => setOpen(false)}
      activeOptions={{ exact: i.to === "/actas" || i.to === "/panel" }}
      className={cn(linkCls(mini), sub && !mini && "pl-9")}
      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
    >
      <i.icon className="h-4 w-4 shrink-0" /> {!mini && i.label}
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      {cargando && (
        <>
          <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/20"><div className="h-full w-1/3 animate-[carga_1.2s_ease-in-out_infinite] bg-primary" /></div>
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-md"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando datos...</div>
        </>
      )}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-all lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
        mini && "lg:w-16",
      )}>
        <div className={cn("flex h-16 items-center justify-between border-b border-sidebar-border px-5", mini && "lg:justify-center lg:px-2")}>
          <div className={cn(mini && "lg:hidden")}>
            <div className="font-display text-lg font-extrabold tracking-tight text-sidebar-accent-foreground">FINESA</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-sidebar-primary">Inventario y actas</div>
          </div>
          {me.isStaff && !mini && <CampanaAlertas />}
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
          <button className="hidden rounded p-1 hover:bg-sidebar-accent lg:block" onClick={() => toggleMini()} aria-label={mini ? "Expandir menú" : "Contraer menú"} title={mini ? "Expandir menú" : "Contraer menú"}>
            {mini ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibles.map((g) => {
            if (!g.label) return <div key={g.id}>{g.items.map((i) => renderLink(i, false))}</div>;
            const activo = grupoActivo(g);
            const abierto = mini || activo || !!abiertos[g.id];
            const Icon = g.icon!;
            return (
              <div key={g.id} className={cn(mini && "border-t border-sidebar-border pt-1 first:border-0")}>
                {!mini && (
                  <button
                    onClick={() => setAbiertos((a) => { const n = { ...a, [g.id]: !abierto }; localStorage.setItem("nav-grupos", JSON.stringify(n)); return n; })}
                    className={cn(linkCls(false), "w-full", activo && "text-sidebar-accent-foreground font-medium")}
                    aria-expanded={abierto}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{g.label}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />
                  </button>
                )}
                {abierto && <div className="space-y-0.5">{g.items.map((i) => renderLink(i, true))}</div>}
              </div>
            );
          })}
        </nav>
        <div className={cn("border-t border-sidebar-border p-4", mini && "lg:p-2")}>
          <div className={cn("flex items-start justify-between gap-2", mini && "lg:flex-col lg:items-center")}>
            <div className={cn("min-w-0", mini && "lg:hidden")}>
              <div className="truncate text-sm font-medium text-sidebar-accent-foreground">{me.nombre}</div>
              <div className="text-xs text-sidebar-primary">{rol}</div>
            </div>
            <Link
              to="/ajustes"
              title="Ajustes"
              className="flex shrink-0 items-center gap-1.5 rounded border border-sidebar-border px-2 py-1.5 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <Settings className="h-3.5 w-3.5" /> {!mini && "Ajustes"}
            </Link>
          </div>
          <button onClick={salir} title="Cerrar sesión" className={cn("mt-3 flex items-center gap-2 text-xs hover:text-sidebar-accent-foreground", mini && "lg:mx-auto")}>
            <LogOut className="h-3.5 w-3.5" /> {!mini && "Cerrar sesión"}
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-foreground/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu className="h-5 w-5" /></button>
          <span className="font-display font-extrabold text-primary">FINESA</span>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
