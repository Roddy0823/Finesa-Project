import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { ESTADO_EQUIPO, TIPO_ACTA, fmtFecha } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { BannerStock } from "@/components/StockAlertas";
import { PanelAlertas } from "@/components/PanelAlertas";
import {
  Plus,
  Layers,
  CheckCircle2,
  UserCheck,
  Sparkles,
  Wrench,
  Archive,
  FileSignature,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — Finesa" }, { name: "description", content: "Resumen del inventario y actas." }] }),
  component: Panel,
});

const STAT_META: Record<
  string,
  { icon: typeof Layers; accent: string; bar: string }
> = {
  total: { icon: Layers, accent: "text-foreground bg-muted/80 border-border", bar: "bg-foreground" },
  disponible: { icon: CheckCircle2, accent: "text-success bg-success/12 border-success/25", bar: "bg-success" },
  asignado: { icon: UserCheck, accent: "text-primary bg-primary/12 border-primary/25", bar: "bg-primary" },
  en_alistamiento: { icon: Sparkles, accent: "text-accent-foreground bg-accent border-border", bar: "bg-muted-foreground" },
  en_reparacion: { icon: Wrench, accent: "text-warning-foreground bg-warning/15 border-warning/30", bar: "bg-warning" },
  de_baja: { icon: Archive, accent: "text-muted-foreground bg-muted border-border", bar: "bg-muted-foreground/40" },
};

function Panel() {
  const { data: me } = useMe();
  const stats = useQuery({
    queryKey: ["panel"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const [eq, pend, ult] = await Promise.all([
        supabase.rpc("panel_conteos"),
        supabase.from("actas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase
          .from("actas")
          .select("id, numero, tipo, estado, created_at, empleado:empleados(nombre)")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
      const conteo: Record<string, number> = {};
      let total = 0;
      for (const e of (eq.data ?? []) as { estado: string; total: number }[]) {
        conteo[e.estado] = Number(e.total);
        total += Number(e.total);
      }
      return { conteo, total, pendientes: pend.count ?? 0, ultimas: ult.data ?? [] };
    },
  });

  if (me?.isEmpleado) return <Navigate to="/mi-portal" replace />;
  const s = stats.data;
  const total = s?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hola, ${me?.nombre.split(" ")[0] ?? ""}`}
        desc="Resumen en tiempo real del inventario tecnológico y flujo de actas."
      >
        {(me?.can("actas_entrega") || me?.can("actas_devolucion")) && (
          <Button size="sm" asChild className="gap-1.5">
            <Link to="/actas/nueva">
              <Plus className="h-3.5 w-3.5" />
              <span>Nueva acta</span>
            </Link>
          </Button>
        )}
      </PageHeader>

      <BannerStock />

      {/* KPI Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat
          id="total"
          label="Equipos totales"
          value={s?.total}
          search={{ tab: "activos" }}
        />
        {Object.entries(ESTADO_EQUIPO).map(([k, v]) => (
          <Stat
            key={k}
            id={k}
            label={v.label}
            value={s?.conteo[k] ?? 0}
            pct={
              (k === "disponible" || k === "asignado") && total > 0
                ? Math.round(((s?.conteo[k] ?? 0) / total) * 100)
                : undefined
            }
            search={
              k === "disponible" || k === "asignado"
                ? { tab: "activos", estado: k }
                : { tab: k as "en_reparacion" | "en_alistamiento" | "de_baja" }
            }
          />
        ))}
      </div>

      {/* Stacked Distribution Bar */}
      {total > 0 && (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-muted-foreground">Distribución operativa del parque tecnológico</span>
            <span className="font-mono text-muted-foreground">{total} unidades registradas</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {Object.entries(ESTADO_EQUIPO).map(([k, v]) => {
              const count = s?.conteo[k] ?? 0;
              if (!count) return null;
              const width = `${(count / total) * 100}%`;
              const meta = STAT_META[k] ?? STAT_META.total!;
              return (
                <div
                  key={k}
                  style={{ width }}
                  title={`${v.label}: ${count} (${Math.round((count / total) * 100)}%)`}
                  className={cn("h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full", meta.bar)}
                />
              );
            })}
          </div>
        </div>
      )}

      <PanelAlertas puedeEditar={!!me?.can("equipos_editar")} />

      {/* Bottom Grid: Pending Signatures & Latest Actas */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pendientes de firma
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-warning/30 bg-warning/15 text-warning-foreground">
                <FileSignature className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-4 font-display text-4xl font-bold tracking-tight text-foreground">
              {s?.pendientes ?? "—"}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Actas emitidas en espera de firma presencial o mediante enlace remoto.
            </p>
          </div>
          <div className="mt-6 border-t border-border/60 pt-3">
            <Link
              to="/actas"
              search={{ estado: "pendiente" }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:underline"
            >
              <span>Revisar actas pendientes</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Actividad reciente de actas</h2>
              <p className="text-xs text-muted-foreground">Últimos movimientos de entrega, devolución y cambio</p>
            </div>
            {me?.can("repositorio_ver") && (
              <Link
                to="/actas"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>Ver todas</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          <ul className="divide-y divide-border/60">
            {(s?.ultimas ?? []).map((a) => (
              <li key={a.id}>
                <Link
                  to="/actas/$id"
                  params={{ id: a.id }}
                  className="group flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-medium text-foreground">
                      #{a.numero}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">
                        {(a.empleado as { nombre: string } | null)?.nombre ?? "Empleado"}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">· {TIPO_ACTA[a.tipo]}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                      {fmtFecha(a.created_at)}
                    </span>
                    <EstadoActa estado={a.estado} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </div>
                </Link>
              </li>
            ))}
            {s && !s.ultimas.length && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                Aún no se han registrado actas en el sistema.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({
  id,
  label,
  value,
  pct,
  search,
}: {
  id: string;
  label: string;
  value?: number | undefined;
  pct?: number | undefined;
  search: {
    tab?: "activos" | "en_reparacion" | "en_alistamiento" | "de_baja";
    estado?: "disponible" | "asignado";
  };
}) {
  const meta = STAT_META[id] ?? STAT_META.total!;
  const Icon = meta.icon;
  return (
    <Link
      to="/equipos"
      search={search}
      className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
          {label}
        </span>
        <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", meta.accent)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {value ?? "—"}
        </div>
        {pct !== undefined && (
          <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
        )}
      </div>
    </Link>
  );
}
