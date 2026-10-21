import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { configurarPortalEmpleados, obtenerConfigPortal } from "@/lib/ajustes.functions";
import { errMsg } from "@/lib/constantes";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, ShieldAlert, CheckCircle2 } from "lucide-react";

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
    <section className="max-w-xl rounded-md border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>Portal de empleados en el inicio de sesión</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Controla si la pestaña <b>Empleado</b> (ingreso con cédula y PIN) es visible en la pantalla de login o si únicamente se muestra el acceso de <b>Mesa de servicios</b>.
          </p>
        </div>
        <Switch
          checked={activo}
          disabled={q.isLoading || guardando}
          onCheckedChange={cambiar}
          aria-label="Habilitar portal de empleados"
        />
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
        {activo ? (
          <>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <span>
              <b>Habilitado:</b> En el login aparecen las opciones <b>Empleado</b> y <b>Mesa de servicios</b>.
            </span>
          </>
        ) : (
          <>
            <ShieldAlert className="h-4 w-4 shrink-0 text-warning-foreground" />
            <span>
              <b>Deshabilitado:</b> El login muestra únicamente <b>Mesa de servicios</b> (los enlaces directos para firmar actas siguen funcionando con normalidad).
            </span>
          </>
        )}
      </div>
    </section>
  );
}
