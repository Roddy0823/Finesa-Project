import { TIPO_ACTA, DESTINO_DEVOLUCION, fmtFecha } from "@/lib/constantes";
import { cn } from "@/lib/utils";
import { AlertCircle, Clock, Laptop, PackageCheck } from "lucide-react";

export type ActaEquipoVista = {
  serie: string;
  activo_fijo?: string | null | undefined;
  modelo?: string | null | undefined;
  tipo?: string | null | undefined;
  marca?: string | null | undefined;
  direccion?: string | null | undefined;
  estado_fisico?: string | null | undefined;
  accesorios?: string | null | undefined;
  estado_destino?: string | null | undefined;
  nota?: string | null | undefined;
};

export type ActaVista = {
  numero: number;
  tipo: string;
  created_at: string;
  observaciones: string | null | undefined;
  tecnico: string | null | undefined;
  es_prestamo?: boolean | undefined;
  prestamo_hasta?: string | null | undefined;
  empleado: {
    nombre: string;
    identificacion: string;
    cargo?: string | null | undefined;
    area?: string | null | undefined;
    sede?: string | null | undefined;
    empresa?: string | null | undefined;
  };
  equipos: ActaEquipoVista[];
};

export function ActaResumen({ a }: { a: ActaVista }) {
  const empSub = [a.empleado?.cargo, a.empleado?.area, a.empleado?.sede, a.empleado?.empresa]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card text-sm shadow-2xs">
      <div className="bg-primary px-5 py-3.5 text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-display text-[11px] font-bold tracking-[0.2em] text-sidebar-primary opacity-90">
            FINESA S.A.
          </div>
          {a.es_prestamo && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/20 px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
              <Clock className="h-3 w-3" />
              Préstamo temporal {a.prestamo_hasta ? `hasta ${fmtFecha(a.prestamo_hasta)}` : ""}
            </span>
          )}
        </div>
        <div className="font-display text-lg font-bold tracking-tight">
          Acta de {TIPO_ACTA[a.tipo]?.toLowerCase() ?? a.tipo} No. {a.numero}
        </div>
      </div>

      {/* Empleado y Técnico */}
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Colaborador / Destinatario
          </div>
          <div className="mt-0.5 font-medium text-foreground">{a.empleado?.nombre || "—"}</div>
          <div className="font-mono text-xs text-muted-foreground">
            C.C. {a.empleado?.identificacion || "—"}
          </div>
          {empSub && <div className="mt-1 text-xs text-muted-foreground">{empSub}</div>}
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Fecha de emisión y Técnico
          </div>
          <div className="mt-0.5 font-medium text-foreground">{fmtFecha(a.created_at, true)}</div>
          <div className="text-xs text-muted-foreground">
            Responsable TI: <span className="font-medium text-foreground">{a.tecnico || "—"}</span>
          </div>
        </div>
      </div>

      {/* Lista detallada de equipos */}
      <div className="border-t border-border/70 px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Laptop className="h-3.5 w-3.5 text-primary" />
            <span>Equipos incluidos ({a.equipos?.length ?? 0})</span>
          </div>
        </div>

        {!a.equipos || a.equipos.length === 0 ? (
          <div className="rounded-lg border border-warning/35 bg-warning/10 p-3.5 text-center text-xs text-muted-foreground">
            <AlertCircle className="mx-auto mb-1 h-5 w-5 text-warning" />
            <p className="font-medium text-foreground">No hay equipos registrados en esta acta.</p>
            <p className="mt-0.5">
              Si el movimiento no se completó, puede anular esta acta para registrarla nuevamente.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 rounded-lg border border-border/70 bg-background/40">
            {a.equipos.map((q, idx) => {
              const eqNombre = [q.tipo, q.marca, q.modelo].filter(Boolean).join(" ") || "Equipo";
              const esEntrega = q.direccion === "entrega" || (!q.direccion && a.tipo === "entrega");
              const esDevolucion = q.direccion === "devolucion" || (!q.direccion && a.tipo === "devolucion");

              return (
                <li key={`${q.serie}-${idx}`} className="space-y-1.5 p-3 sm:p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(a.tipo === "cambio" || q.direccion) && (
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            esEntrega
                              ? "border-success/30 bg-success/15 text-success"
                              : "border-warning/30 bg-warning/15 text-warning-foreground",
                          )}
                        >
                          {esEntrega ? "Entrega" : "Devolución"}
                        </span>
                      )}
                      <span className="font-semibold text-foreground">{eqNombre}</span>
                      {q.estado_fisico && (
                        <span className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Estado: {q.estado_fisico}
                        </span>
                      )}
                      {esDevolucion && q.estado_destino && (
                        <span className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Queda: {DESTINO_DEVOLUCION[q.estado_destino] ?? q.estado_destino}
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-xs font-semibold text-primary">
                      {q.serie}
                      {q.activo_fijo && (
                        <span className="ml-1.5 font-normal text-muted-foreground">· AF {q.activo_fijo}</span>
                      )}
                    </div>
                  </div>

                  {(q.accesorios || q.nota) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {q.accesorios && (
                        <div className="flex items-center gap-1">
                          <PackageCheck className="h-3 w-3 shrink-0 text-primary/70" />
                          <span>Accesorios: <b className="font-medium text-foreground">{q.accesorios}</b></span>
                        </div>
                      )}
                      {q.nota && (
                        <div>
                          Nota: <span className="italic text-foreground">{q.nota}</span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {a.observaciones && (
        <div className="border-t border-border/70 bg-muted/20 px-5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Observaciones generales
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/90">{a.observaciones}</p>
        </div>
      )}
    </div>
  );
}
