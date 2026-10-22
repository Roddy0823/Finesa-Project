import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { configurarPortalEmpleados, obtenerConfigPortal } from "@/lib/ajustes.functions";
import { errMsg } from "@/lib/constantes";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, ShieldCheck, CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConfigPortalEmpleados() {
  const qc = useQueryClient();
  const obtenerFn = useServerFn(obtenerConfigPortal);
  const guardarFn = useServerFn(configurarPortalEmpleados);
  const [guardando, setGuardando] = useState(false);

  const q = useQuery({
    queryKey: ["config-portal"],
    queryFn: () => obtenerFn(),
  });

  const activo = q.data?.portalEmpleadosActivo ?? true;

  async function cambiar(nuevoValor: boolean) {
    if (nuevoValor === activo || guardando) return;
    setGuardando(true);
    try {
      const r = await guardarFn({ data: { activo: nuevoValor } });
      if ("error" in r && r.error) {
        toast.error(r.error);
        return;
      }
      qc.setQueryData(["config-portal"], { portalEmpleadosActivo: nuevoValor });
      qc.invalidateQueries({ queryKey: ["config-portal"] });
      toast.success(
        nuevoValor
          ? "Portal de empleados habilitado en el login."
          : "Portal de empleados deshabilitado. Solo se mostrará Mesa de servicios en el login.",
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-muted/20 px-6 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm">Acceso al Portal de empleados en el inicio de sesión</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Defina si los colaboradores pueden ingresar con su cédula y PIN desde la pantalla principal.
          </p>
        </div>
        <Switch
          checked={activo}
          disabled={q.isLoading || guardando}
          onCheckedChange={cambiar}
          aria-label="Habilitar portal de empleados"
        />
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <button
          type="button"
          disabled={q.isLoading || guardando}
          onClick={() => cambiar(true)}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-4 text-left transition-all",
            activo
              ? "border-primary bg-primary/6 ring-1 ring-primary/30"
              : "border-border/80 bg-background/40 hover:border-border hover:bg-muted/30",
          )}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Users className="h-3.5 w-3.5 text-primary" />
                Portal habilitado (Doble pestaña)
              </span>
              {activo && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              El login presenta el selector <b>Portal empleado</b> y <b>Mesa de servicios</b>. Los empleados consultan sus equipos, reportan fallas y certifican inventario.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-border/70 bg-muted/60 p-1 text-center text-[10px] font-medium">
            <span className="rounded bg-card py-1 text-foreground shadow-2xs">Portal empleado</span>
            <span className="py-1 text-muted-foreground">Mesa de servicios</span>
          </div>
        </button>

        <button
          type="button"
          disabled={q.isLoading || guardando}
          onClick={() => cambiar(false)}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-4 text-left transition-all",
            !activo
              ? "border-primary bg-primary/6 ring-1 ring-primary/30"
              : "border-border/80 bg-background/40 hover:border-border hover:bg-muted/30",
          )}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Lock className="h-3.5 w-3.5 text-warning-foreground" />
                Solo Mesa de servicios
              </span>
              {!activo && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Oculta el acceso de empleados en el login y bloquea sesiones de portal. Los enlaces únicos para firmar actas (`/firmar/...`) siguen operando normalmente.
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-primary/25 bg-primary/10 py-1.5 text-center text-[10px] font-semibold text-primary">
            <ShieldCheck className="mr-1 inline h-3 w-3" />
            Mesa de servicios TI
          </div>
        </button>
      </div>
    </section>
  );
}
