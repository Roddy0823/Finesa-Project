import { useState } from "react";
import { Check, Copy, Globe, Mail, MapPin, Phone, Smartphone, UserCheck } from "lucide-react";
import { toast } from "sonner";
import type { Prov } from "@/lib/proveedores";
import { copiarTexto } from "@/lib/utils";

type P = Partial<Pick<Prov, "contacto_nombre" | "asesor_telefono" | "whatsapp" | "telefono" | "email" | "direccion" | "sitio_web">>;

const ICONOS: Record<string, typeof Phone> = {
  Asesor: UserCheck,
  "Teléfono directo": Phone,
  Celular: Smartphone,
  "Teléfono empresa": Phone,
  Correo: Mail,
  Dirección: MapPin,
  "Sitio web": Globe,
};

/** Datos de contacto interactivos con píldoras clicables para copiar cada dato. */
export function ContactoProveedor({ p, compacto = false }: { p: P; compacto?: boolean }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const filas: [string, string | null | undefined][] = [
    ["Asesor", p.contacto_nombre],
    ["Teléfono directo", p.asesor_telefono],
    ["Celular", p.whatsapp],
    ["Teléfono empresa", p.telefono],
    ["Correo", p.email],
    ...(compacto ? [] : ([["Dirección", p.direccion], ["Sitio web", p.sitio_web]] as [string, string | null | undefined][])),
  ];
  const visibles = filas.filter(([, v]) => v);
  if (!visibles.length) return <p className="text-xs text-muted-foreground">Sin datos de contacto registrados.</p>;

  function copiar(k: string, v: string) {
    copiarTexto(v);
    setCopiado(k);
    toast.success(`${k} copiado al portapapeles`);
    setTimeout(() => setCopiado((actual) => (actual === k ? null : actual)), 1600);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map(([k, v]) => {
        const Icon = ICONOS[k] ?? Phone;
        const ok = copiado === k;
        return (
          <button
            key={k}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copiar(k, v!);
            }}
            aria-label={`Copiar ${k}`}
            title={`Clic para copiar ${k}: ${v}`}
            className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 px-2.5 py-1 text-xs transition-all hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="text-muted-foreground">{k}:</span>
            <span className="truncate font-medium text-foreground">{v}</span>
            {ok ? (
              <Check className="h-3 w-3 shrink-0 text-success" />
            ) : (
              <Copy className="h-2.5 w-2.5 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
