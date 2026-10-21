import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { PageHeader, EstadoActa } from "@/components/Estado";
import { ESTADO_EQUIPO, TIPO_ACTA, fmtFecha } from "@/lib/constantes";
import { Button } from "@/components/ui/button";
import { BannerStock } from "@/components/StockAlertas";
import { PanelAlertas } from "@/components/PanelAlertas";

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({ meta: [{ title: "Panel — Finesa" }, { name: "description", content: "Resumen del inventario y actas." }] }),
  component: Panel,
});

function Panel() {
  const { data: me } = useMe();
  const stats = useQuery({
    queryKey: ["panel"],
    enabled: !!me?.isStaff,
    queryFn: async () => {
      const [eq, pend, ult] = await Promise.all([
        supabase.rpc("panel_conteos"),
        supabase.from("actas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("actas").select("id, numero, tipo, estado, created_at, empleado:empleados(nombre)").order("created_at", { ascending: false }).limit(8),
      ]);
      const conteo: Record<string, number> = {};
      let total = 0;
      for (const e of (eq.data ?? []) as { estado: string; total: number }[]) { conteo[e.estado] = Number(e.total); total += Number(e.total); }
      return { conteo, total, pendientes: pend.count ?? 0, ultimas: ult.data ?? [] };
    },
  });

  if (me?.isEmpleado) return <Navigate to="/mi-portal" replace />;
  const s = stats.data;

  return (
    <div>
      <PageHeader title={`Hola, ${me?.nombre.split(" ")[0] ?? ""}`} desc="Estado general del inventario y actas.">
        {(me?.can("actas_entrega") || me?.can("actas_devolucion")) && <Button asChild><Link to="/actas/nueva">Nueva acta</Link></Button>}
      </PageHeader>
      <BannerStock />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label="Equipos totales" value={s?.total} search={{ tab: "activos" }} />
        {Object.entries(ESTADO_EQUIPO).map(([k, v]) => <Stat key={k} label={v.label} value={s?.conteo[k] ?? 0} search={k === "disponible" || k === "asignado" ? { tab: "activos", estado: k } : { tab: k as "en_reparacion" | "en_alistamiento" | "de_baja" }} />)}
      </div>
      <PanelAlertas puedeEditar={!!me?.can("equipos_editar")} />
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">Actas pendientes de firma</div>
          <div className="mt-2 font-display text-4xl font-bold text-warning-foreground">{s?.pendientes ?? "—"}</div>
          <Link to="/actas" search={{ estado: "pendiente" }} className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline">Ver pendientes</Link>
        </div>
        <div className="rounded-md border border-border bg-card lg:col-span-2">
          <div className="border-b border-border px-5 py-3 font-medium">Últimas actas</div>
          <ul className="divide-y divide-border">
            {(s?.ultimas ?? []).map((a) => (
              <li key={a.id}>
                <Link to="/actas/$id" params={{ id: a.id }} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted">
                  <span><span className="font-mono text-xs text-muted-foreground">#{a.numero}</span> {TIPO_ACTA[a.tipo]} · {(a.empleado as { nombre: string } | null)?.nombre}</span>
                  <span className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">{fmtFecha(a.created_at)}</span><EstadoActa estado={a.estado} /></span>
                </Link>
              </li>
            ))}
            {s && !s.ultimas.length && <li className="px-5 py-6 text-sm text-muted-foreground">Aún no hay actas.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, search }: { label: string; value?: number | undefined; search: { tab?: "activos" | "en_reparacion" | "en_alistamiento" | "de_baja"; estado?: "disponible" | "asignado" } }) {
  return (
    <Link to="/equipos" search={search} className="block rounded-md border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-muted">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value ?? "—"}</div>
    </Link>
  );
}
