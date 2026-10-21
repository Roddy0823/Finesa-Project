import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { Prov } from "@/lib/proveedores";
import { copiarTexto } from "@/lib/utils";

type P = Partial<Pick<Prov, "contacto_nombre" | "asesor_telefono" | "whatsapp" | "telefono" | "email" | "direccion" | "sitio_web">>;

/** Datos de contacto en solo lectura, con botón para copiar cada dato. */
export function ContactoProveedor({ p, compacto = false }: { p: P; compacto?: boolean }) {
  const filas: [string, string | null | undefined][] = [
    ["Asesor", p.contacto_nombre], ["Teléfono directo", p.asesor_telefono], ["Celular", p.whatsapp],
    ["Teléfono empresa", p.telefono], ["Correo", p.email],
    ...(compacto ? [] : ([["Dirección", p.direccion], ["Sitio web", p.sitio_web]] as [string, string | null | undefined][])),
  ];
  const visibles = filas.filter(([, v]) => v);
  if (!visibles.length) return <p className="text-xs text-muted-foreground">Sin datos de contacto registrados.</p>;
  return (
    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {visibles.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1">
          <dt className="text-muted-foreground">{k}:</dt>
          <dd className="truncate font-medium">{v}</dd>
          <button type="button" className="text-muted-foreground hover:text-primary" aria-label={`Copiar ${k}`}
            onClick={() => { copiarTexto(v!); toast.success(`${k} copiado`); }}>
            <Copy className="h-3 w-3" />
          </button>
        </div>
      ))}
    </dl>
  );
}
