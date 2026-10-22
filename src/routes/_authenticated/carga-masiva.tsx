import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/lib/me";
import { useCatalogos } from "@/lib/catalogos";
import { fmtFecha, errMsg } from "@/lib/constantes";
import { COLUMNAS, HOJAS, descargarPlantilla, type HojaId } from "@/lib/cargaMasiva";
import { PageHeader } from "@/components/Estado";
import { ImportExcel } from "@/components/ImportExcel";
import { toast } from "sonner";
import { FileSpreadsheet, History, Laptop, Link2, ShieldCheck, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/carga-masiva")({
  head: () => ({
    meta: [
      { title: "Carga masiva — Finesa" },
      { name: "description", content: "Importe empleados, equipos y asignaciones desde la plantilla Excel oficial." },
    ],
  }),
  component: CargaMasiva,
});

const HOJA_INFO: Record<HojaId, { icon: typeof Users; desc: string }> = {
  empleados: { icon: Users, desc: "Colaboradores nuevos. Los que ya existen (misma cédula) no se modifican." },
  equipos: { icon: Laptop, desc: "Equipos nuevos en estado Disponible. Sin serial se genera un código FIN-ACC." },
  asignaciones: { icon: Link2, desc: "Vincula equipo ↔ empleado como carga inicial (sin acta), con trazabilidad." },
};

function CargaMasiva() {
  const { data: me } = useMe();
  const cat = useCatalogos();
  const proveedores = useQuery({
    queryKey: ["proveedores-nombres"],
    enabled: !!me?.isStaff,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("proveedores").select("nombre").eq("activo", true).order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });
  const historial = useQuery({
    queryKey: ["cargas-masivas-recientes"],
    enabled: !!me?.isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("auditoria").select("id, detalle, created_at").eq("accion", "CARGA_MASIVA").order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
  });

  if (!me?.can("cargas_masivas")) {
    return <p className="text-sm text-muted-foreground">No tiene permiso para realizar cargas masivas.</p>;
  }

  function plantilla() {
    try {
      descargarPlantilla({ catalogos: cat.all, proveedores: proveedores.data ?? [] });
      toast.success("Plantilla descargada con los catálogos vigentes");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carga masiva"
        desc="Importe empleados, inventario y asignaciones en un solo archivo. Todo se valida fila por fila antes de guardar."
      />

      {/* Pasos */}
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Descargue la plantilla", "Incluye instrucciones, ejemplos y los catálogos vigentes."],
          ["Diligencie las hojas", "Empleados, Inventario_Equipos y/o Asignaciones."],
          ["Suba y revise", "Vea qué se importará, qué ya existe y qué tiene errores."],
          ["Importe y descargue el informe", "Resultado fila por fila en Excel, registrado en auditoría."],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-2xl border border-border/80 bg-card p-3.5 shadow-2xs">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 font-mono text-xs font-bold text-primary">{i + 1}</span>
            <div>
              <div className="text-xs font-semibold text-foreground">{t}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{d}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <ImportExcel isAdmin={!!me.isAdmin} puedeEmpleados={me.can("empleados_editar")} puedeEquipos={me.can("equipos_editar")} onPlantilla={plantilla} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileSpreadsheet className="h-4 w-4 text-primary" />Hojas de la plantilla</div>
            <ul className="mt-3 space-y-3">
              {(["empleados", "equipos", "asignaciones"] as HojaId[]).map((h) => {
                const Icon = HOJA_INFO[h].icon;
                return (
                  <li key={h} className="text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground"><Icon className="h-3.5 w-3.5 text-muted-foreground" />{HOJAS[h].nombre}</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{HOJA_INFO[h].desc}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Obligatorias: <span className="font-medium text-foreground">{COLUMNAS[h].filter((c) => c.requerido).map((c) => c.encabezado.replace(" *", "")).join(", ")}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><ShieldCheck className="h-4 w-4 text-success" />Reglas de seguridad</div>
            <ul className="mt-2.5 list-disc space-y-1 pl-4 text-[11px] text-muted-foreground">
              <li>Nunca se modifican ni eliminan registros existentes.</li>
              <li>Cédula, serial y activo fijo se validan contra duplicados.</li>
              <li>Solo el Administrador puede crear valores de catálogo nuevos.</li>
              <li>Equipos asignados u ocupados no se reasignan: use actas.</li>
              <li>Cada carga queda registrada en la bitácora de auditoría.</li>
            </ul>
          </section>

          {me.isAdmin && (
            <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><History className="h-4 w-4 text-primary" />Cargas recientes</div>
              <ul className="mt-2.5 divide-y divide-border/60">
                {historial.isLoading && <li className="py-2 text-[11px] text-muted-foreground">Cargando…</li>}
                {!historial.isLoading && !historial.data?.length && <li className="py-2 text-[11px] text-muted-foreground">Aún no hay cargas registradas.</li>}
                {historial.data?.map((h) => (
                  <li key={h.id} className="py-2">
                    <div className="font-mono text-[10px] text-muted-foreground">{fmtFecha(h.created_at, true)}</div>
                    <div className="text-[11px] leading-relaxed text-foreground">{h.detalle}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
