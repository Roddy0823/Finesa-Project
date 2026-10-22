import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useTheme } from "@/lib/theme";
import { limpiarActividadGlobal } from "@/lib/inactividad";
import {
  Search,
  LayoutDashboard,
  Laptop,
  Users,
  FileSignature,
  FolderOpen,
  Tags,
  UserCog,
  FileBarChart,
  Upload,
  Truck,
  ShoppingCart,
  BarChart3,
  ScrollText,
  Settings,
  Sun,
  Moon,
  Monitor,
  Plus,
  LogOut,
  ArrowRight,
  CornerDownLeft,
  Sparkles,
  Loader2,
  Inbox,
} from "lucide-react";
import { EstadoEquipo, EstadoActa } from "@/components/Estado";

export const COMMAND_PALETTE_EVENT = "finesa:open-command-palette";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onCustomOpen = () => setOpen(true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_EVENT, onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onCustomOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const liveSearch = useQuery({
    queryKey: ["cmdk-search", debouncedQuery],
    enabled: open && !!me?.isStaff && debouncedQuery.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const q = debouncedQuery.replace(/[,()%]/g, " ").trim();
      const num = Number.isInteger(Number(q)) && Number(q) > 0 ? Number(q) : null;

      const [eqRes, empRes, actaRes] = await Promise.all([
        supabase
          .from("equipos")
          .select("id, serie, modelo, activo_fijo, nombre_equipo, estado")
          .or(`serie.ilike.%${q}%,modelo.ilike.%${q}%,activo_fijo.ilike.%${q}%,nombre_equipo.ilike.%${q}%`)
          .limit(5),
        supabase
          .from("empleados")
          .select("id, nombre, identificacion, cargo, activo")
          .or(`nombre.ilike.%${q}%,identificacion.ilike.%${q}%,cargo.ilike.%${q}%`)
          .limit(5),
        num
          ? supabase
              .from("actas")
              .select("id, numero, tipo, estado, empleado:empleados(nombre)")
              .eq("numero", num)
              .limit(4)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        equipos: eqRes.data ?? [],
        empleados: empRes.data ?? [],
        actas: (actaRes.data ?? []) as {
          id: string;
          numero: number;
          tipo: string;
          estado: string;
          empleado: { nombre: string } | null;
        }[],
      };
    },
  });

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  async function cerrarSesion() {
    limpiarActividadGlobal();
    try {
      await Promise.race([
        supabase.rpc("log_evento", { p_accion: "LOGOUT", p_detalle: "Cierre de sesión desde paleta de comandos" }),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } catch {
      /* continuar */
    }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    limpiarActividadGlobal();
    nav({ to: "/", replace: true });
  }

  if (!me) return null;

  const can = (p: Parameters<typeof me.can>[0]) => me.can(p);

  const itemCls =
    "group relative flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-foreground/90 outline-none transition-colors data-[selected=true]:bg-primary/12 data-[selected=true]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50";

  const groupCls =
    "overflow-hidden px-2 py-1.5 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/80";

  const hasLiveResults =
    (liveSearch.data?.equipos.length ?? 0) > 0 ||
    (liveSearch.data?.empleados.length ?? 0) > 0 ||
    (liveSearch.data?.actas.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl overflow-hidden border-border/80 bg-popover/95 p-0 shadow-2xl backdrop-blur-xl [&>button]:hidden">
        <DialogTitle className="sr-only">Paleta de comandos y búsqueda rápida</DialogTitle>
        <CommandPrimitive className="flex h-full w-full flex-col overflow-hidden bg-transparent text-popover-foreground" loop>
          {/* Input Header */}
          <div className="flex items-center gap-2.5 border-b border-border/70 bg-muted/20 px-4 py-3">
            {liveSearch.isFetching ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder={
                me.isStaff
                  ? "Buscar serie, activo fijo, empleado, #acta o ejecutar comando..."
                  : "Escribir un comando o buscar sección..."
              }
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Limpiar
              </button>
            )}
            <kbd className="hidden rounded border border-border/80 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Command List */}
          <CommandPrimitive.List className="max-h-[420px] overflow-y-auto overflow-x-hidden p-1.5">
            <CommandPrimitive.Empty className="py-12 text-center text-sm text-muted-foreground">
              No se encontraron comandos ni registros para{" "}
              <span className="font-medium text-foreground">"{query}"</span>.
            </CommandPrimitive.Empty>

            {/* Live Database Results */}
            {me.isStaff && debouncedQuery.length >= 2 && hasLiveResults && (
              <>
                {liveSearch.data!.equipos.length > 0 && (
                  <CommandPrimitive.Group heading="Equipos en inventario" className={groupCls}>
                    {liveSearch.data!.equipos.map((e) => (
                      <CommandPrimitive.Item
                        key={`eq-${e.id}`}
                        value={`equipo ${e.serie} ${e.modelo ?? ""} ${e.activo_fijo ?? ""} ${e.nombre_equipo ?? ""}`}
                        onSelect={() => run(() => nav({ to: "/equipos/$id", params: { id: e.id } }))}
                        className={itemCls}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-primary">
                          <Laptop className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-foreground">{e.serie}</span>
                            {e.activo_fijo && (
                              <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                                AF: {e.activo_fijo}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {[e.modelo, e.nombre_equipo].filter(Boolean).join(" · ") || "Ver hoja de vida del equipo"}
                          </div>
                        </div>
                        <EstadoEquipo estado={e.estado} />
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}

                {liveSearch.data!.empleados.length > 0 && (
                  <CommandPrimitive.Group heading="Empleados" className={groupCls}>
                    {liveSearch.data!.empleados.map((emp) => (
                      <CommandPrimitive.Item
                        key={`emp-${emp.id}`}
                        value={`empleado ${emp.nombre} ${emp.identificacion ?? ""} ${emp.cargo ?? ""}`}
                        onSelect={() => run(() => nav({ to: "/empleados/$id", params: { id: emp.id } }))}
                        className={itemCls}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-primary">
                          <Users className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-foreground">{emp.nombre}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {emp.identificacion ? `CC ${emp.identificacion}` : "Sin documento"}{" "}
                            {emp.cargo ? `· ${emp.cargo}` : ""}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {emp.activo ? "Activo" : "Retirado"}
                        </span>
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}

                {liveSearch.data!.actas.length > 0 && (
                  <CommandPrimitive.Group heading="Actas digitales" className={groupCls}>
                    {liveSearch.data!.actas.map((a) => (
                      <CommandPrimitive.Item
                        key={`acta-${a.id}`}
                        value={`acta ${a.numero} ${a.empleado?.nombre ?? ""}`}
                        onSelect={() => run(() => nav({ to: "/actas/$id", params: { id: a.id } }))}
                        className={itemCls}
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/80 text-primary">
                          <FileSignature className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">
                            <span className="font-mono text-xs text-primary">#{a.numero}</span> ·{" "}
                            {a.empleado?.nombre ?? "Empleado"}
                          </div>
                          <div className="text-xs capitalize text-muted-foreground">Acta de {a.tipo}</div>
                        </div>
                        <EstadoActa estado={a.estado} />
                      </CommandPrimitive.Item>
                    ))}
                  </CommandPrimitive.Group>
                )}
                <CommandPrimitive.Separator className="my-1 h-px bg-border/60" />
              </>
            )}

            {/* Quick Actions */}
            {me.isStaff && (
              <CommandPrimitive.Group heading="Acciones rápidas" className={groupCls}>
                {(can("actas_entrega") || can("actas_devolucion")) && (
                  <CommandPrimitive.Item
                    value="crear nueva acta entrega devolucion cambio"
                    onSelect={() => run(() => nav({ to: "/actas/nueva" }))}
                    className={itemCls}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1 font-medium">Crear nueva acta digital</span>
                    <span className="text-xs text-muted-foreground">Entrega / Devolución</span>
                  </CommandPrimitive.Item>
                )}
                <CommandPrimitive.Item
                  value="ver equipos disponibles en stock"
                  onSelect={() => run(() => nav({ to: "/equipos", search: { tab: "activos", estado: "disponible" } }))}
                  className={itemCls}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-success/15 text-success">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1">Filtrar equipos disponibles para asignar</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
                </CommandPrimitive.Item>
                {can("repositorio_ver") && (
                  <CommandPrimitive.Item
                    value="actas pendientes de firma"
                    onSelect={() => run(() => nav({ to: "/actas", search: { estado: "pendiente" } }))}
                    className={itemCls}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
                      <FileSignature className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1">Ver actas pendientes de firma</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
                  </CommandPrimitive.Item>
                )}
              </CommandPrimitive.Group>
            )}

            {/* Navigation */}
            <CommandPrimitive.Group heading="Navegación" className={groupCls}>
              {me.isEmpleado ? (
                <CommandPrimitive.Item
                  value="mis equipos y actas portal"
                  onSelect={() => run(() => nav({ to: "/mi-portal" }))}
                  className={itemCls}
                >
                  <Inbox className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                  <span className="flex-1">Mis equipos y actas</span>
                </CommandPrimitive.Item>
              ) : (
                <>
                  <CommandPrimitive.Item
                    value="ir a panel inicio dashboard resumen"
                    onSelect={() => run(() => nav({ to: "/panel" }))}
                    className={itemCls}
                  >
                    <LayoutDashboard className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                    <span className="flex-1">Panel principal</span>
                    <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      Inicio
                    </kbd>
                  </CommandPrimitive.Item>
                  <CommandPrimitive.Item
                    value="ir a equipos inventario computadores activos"
                    onSelect={() => run(() => nav({ to: "/equipos" }))}
                    className={itemCls}
                  >
                    <Laptop className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                    <span className="flex-1">Equipos e inventario</span>
                  </CommandPrimitive.Item>
                  {can("reabastecimiento_gestionar") && (
                    <CommandPrimitive.Item
                      value="ir a reabastecimiento pedidos compras alertas stock"
                      onSelect={() => run(() => nav({ to: "/reabastecimiento" }))}
                      className={itemCls}
                    >
                      <ShoppingCart className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Reabastecimiento y pedidos</span>
                    </CommandPrimitive.Item>
                  )}
                  {can("proveedores_editar") && (
                    <CommandPrimitive.Item
                      value="ir a proveedores directorio aliados"
                      onSelect={() => run(() => nav({ to: "/proveedores" }))}
                      className={itemCls}
                    >
                      <Truck className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Proveedores</span>
                    </CommandPrimitive.Item>
                  )}
                  {can("cargas_masivas") && (
                    <CommandPrimitive.Item
                      value="ir a carga masiva importar excel csv"
                      onSelect={() => run(() => nav({ to: "/carga-masiva" }))}
                      className={itemCls}
                    >
                      <Upload className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Carga masiva (Excel / CSV)</span>
                    </CommandPrimitive.Item>
                  )}
                  <CommandPrimitive.Item
                    value="ir a empleados personas colaboradores paz y salvo"
                    onSelect={() => run(() => nav({ to: "/empleados" }))}
                    className={itemCls}
                  >
                    <Users className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                    <span className="flex-1">Empleados</span>
                  </CommandPrimitive.Item>
                  {can("repositorio_ver") && (
                    <CommandPrimitive.Item
                      value="ir a repositorio de actas firmadas pdf"
                      onSelect={() => run(() => nav({ to: "/actas" }))}
                      className={itemCls}
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Repositorio de actas</span>
                    </CommandPrimitive.Item>
                  )}
                  {can("estadisticas_ver") && (
                    <CommandPrimitive.Item
                      value="ir a estadisticas metricas graficas indicadores kpi"
                      onSelect={() => run(() => nav({ to: "/estadisticas" }))}
                      className={itemCls}
                    >
                      <BarChart3 className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Estadísticas e indicadores</span>
                    </CommandPrimitive.Item>
                  )}
                  {can("reportes_exportar") && (
                    <CommandPrimitive.Item
                      value="ir a reportes exportar excel pdf"
                      onSelect={() => run(() => nav({ to: "/reportes" }))}
                      className={itemCls}
                    >
                      <FileBarChart className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Reportes y exportaciones</span>
                    </CommandPrimitive.Item>
                  )}
                  {(me.isAdmin || can("catalogos_editar")) && (
                    <CommandPrimitive.Item
                      value="ir a catalogos marcas tipos sedes areas empresas"
                      onSelect={() => run(() => nav({ to: "/catalogos" }))}
                      className={itemCls}
                    >
                      <Tags className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                      <span className="flex-1">Catálogos maestros</span>
                    </CommandPrimitive.Item>
                  )}
                  {me.isAdmin && (
                    <>
                      <CommandPrimitive.Item
                        value="ir a usuarios y permisos auxiliares roles"
                        onSelect={() => run(() => nav({ to: "/usuarios" }))}
                        className={itemCls}
                      >
                        <UserCog className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                        <span className="flex-1">Usuarios y permisos</span>
                      </CommandPrimitive.Item>
                      <CommandPrimitive.Item
                        value="ir a auditoria bitacora seguridad"
                        onSelect={() => run(() => nav({ to: "/auditoria" }))}
                        className={itemCls}
                      >
                        <ScrollText className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                        <span className="flex-1">Auditoría del sistema</span>
                      </CommandPrimitive.Item>
                    </>
                  )}
                </>
              )}
              <CommandPrimitive.Item
                value="ir a ajustes configuracion perfil firma portal empleados"
                onSelect={() => run(() => nav({ to: "/ajustes" }))}
                className={itemCls}
              >
                <Settings className="h-4 w-4 text-muted-foreground group-data-[selected=true]:text-primary" />
                <span className="flex-1">Ajustes y configuración</span>
              </CommandPrimitive.Item>
            </CommandPrimitive.Group>

            {/* Theme & Appearance */}
            <CommandPrimitive.Separator className="my-1 h-px bg-border/60" />
            <CommandPrimitive.Group heading="Apariencia y sesión" className={groupCls}>
              <CommandPrimitive.Item
                value="tema modo oscuro dark mode"
                onSelect={() => run(() => setTheme("dark"))}
                className={itemCls}
              >
                <Moon className="h-4 w-4 text-primary" />
                <span className="flex-1">Cambiar a Modo Oscuro</span>
                {theme === "dark" && <span className="text-xs text-primary">Activo</span>}
              </CommandPrimitive.Item>
              <CommandPrimitive.Item
                value="tema modo claro light mode"
                onSelect={() => run(() => setTheme("light"))}
                className={itemCls}
              >
                <Sun className="h-4 w-4 text-amber-500" />
                <span className="flex-1">Cambiar a Modo Claro</span>
                {theme === "light" && <span className="text-xs text-primary">Activo</span>}
              </CommandPrimitive.Item>
              <CommandPrimitive.Item
                value="tema automatico sistema system"
                onSelect={() => run(() => setTheme("system"))}
                className={itemCls}
              >
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1">Usar tema del sistema</span>
                {theme === "system" && <span className="text-xs text-primary">Activo</span>}
              </CommandPrimitive.Item>
              <CommandPrimitive.Item
                value="cerrar sesion salir logout"
                onSelect={() => run(cerrarSesion)}
                className={itemCls}
              >
                <LogOut className="h-4 w-4 text-destructive" />
                <span className="flex-1 text-destructive">Cerrar sesión</span>
              </CommandPrimitive.Item>
            </CommandPrimitive.Group>
          </CommandPrimitive.List>

          {/* Raycast / Linear Footer */}
          <div className="flex items-center justify-between border-t border-border/70 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-primary/80" />
              <span className="font-medium text-foreground/80">Finesa Command</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/80 bg-background px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
                <span>Navegar</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center rounded border border-border/80 bg-background px-1 py-0.5 font-mono text-[10px]">
                  <CornerDownLeft className="h-2.5 w-2.5" />
                </kbd>
                <span>Ejecutar</span>
              </span>
            </div>
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
