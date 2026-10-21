import { ESTADO_ACTA, ESTADO_EQUIPO } from "@/lib/constantes";
import { cn } from "@/lib/utils";

export function EstadoEquipo({ estado }: { estado: string }) {
  const e = ESTADO_EQUIPO[estado] ?? { label: estado, cls: "" };
  return <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", e.cls)}>{e.label}</span>;
}

export function EstadoActa({ estado }: { estado: string }) {
  const e = ESTADO_ACTA[estado] ?? { label: estado, cls: "" };
  return <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium", e.cls)}>{e.label}</span>;
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
