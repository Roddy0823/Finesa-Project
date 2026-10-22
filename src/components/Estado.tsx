import { ESTADO_ACTA, ESTADO_EQUIPO } from "@/lib/constantes";
import { cn } from "@/lib/utils";

export function EstadoEquipo({ estado }: { estado: string }) {
  const e = ESTADO_EQUIPO[estado] ?? { label: estado, cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        e.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", e.dot ?? "bg-current")} />
      {e.label}
    </span>
  );
}

export function EstadoActa({ estado }: { estado: string }) {
  const e = ESTADO_ACTA[estado] ?? { label: estado, cls: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight",
        e.cls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", e.dot ?? "bg-current")} />
      {e.label}
    </span>
  );
}

export function PageHeader({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {desc && <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
