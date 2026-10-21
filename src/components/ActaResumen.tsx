import { TIPO_ACTA, fmtFecha } from "@/lib/constantes";

export type ActaVista = {
  numero: number;
  tipo: string;
  created_at: string;
  observaciones: string | null;
  tecnico: string | null;
  empleado: { nombre: string; identificacion: string; cargo: string; area: string; sede: string; empresa?: string };
  equipos: { serie: string; activo_fijo?: string; modelo: string; tipo: string; marca: string }[];
};

export function ActaResumen({ a }: { a: ActaVista }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card text-sm">
      <div className="bg-primary px-5 py-3 text-primary-foreground">
        <div className="font-display text-xs font-bold tracking-[0.2em] text-sidebar-primary">FINESA</div>
        <div className="font-display text-lg font-bold">Acta de {TIPO_ACTA[a.tipo]?.toLowerCase()} No. {a.numero}</div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Empleado</div>
          <div className="font-medium">{a.empleado.nombre}</div>
          <div className="text-muted-foreground">C.C. {a.empleado.identificacion}</div>
          <div className="text-muted-foreground">{[a.empleado.cargo, a.empleado.area, a.empleado.sede].filter(Boolean).join(" · ")}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Fecha / técnico</div>
          <div>{fmtFecha(a.created_at, true)}</div>
          <div className="text-muted-foreground">{a.tecnico ?? "—"}</div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3">
        <div className="mb-2 text-xs uppercase text-muted-foreground">Equipos</div>
        <ul className="divide-y divide-border">
          {a.equipos.map((q) => (
            <li key={q.serie} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{q.tipo} {q.marca} {q.modelo}</span>
              <span className="font-mono text-xs">{q.serie}{q.activo_fijo ? ` · AF ${q.activo_fijo}` : ""}</span>
            </li>
          ))}
        </ul>
      </div>
      {a.observaciones && (
        <div className="border-t border-border px-5 py-3">
          <div className="text-xs uppercase text-muted-foreground">Observaciones</div>
          <p className="whitespace-pre-wrap">{a.observaciones}</p>
        </div>
      )}
    </div>
  );
}
