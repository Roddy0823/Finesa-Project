import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const TAMANOS = [10, 20, 50, 100] as const;

/** Estado de paginación; vuelve a la página 1 cuando cambia `reset` o el tamaño. */
export function usePaginacion(reset: unknown = null) {
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(50);
  const clave = JSON.stringify(reset);
  useEffect(() => { setPagina(1); }, [clave, tamano]);
  const desde = (pagina - 1) * tamano;
  return { pagina, setPagina, tamano, setTamano, desde, hasta: desde + tamano - 1 };
}

export function DataTablePagination({ total, pagina, tamano, onPagina, onTamano }: {
  total: number; pagina: number; tamano: number; onPagina: (p: number) => void; onTamano: (t: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano));
  const ini = total === 0 ? 0 : (pagina - 1) * tamano + 1;
  const fin = Math.min(total, pagina * tamano);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>Mostrando {ini.toLocaleString("es-CO")} a {fin.toLocaleString("es-CO")} de {total.toLocaleString("es-CO")} registros</span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span>Filas por página</span>
          <Select value={String(tamano)} onValueChange={(v) => onTamano(Number(v))}>
            <SelectTrigger className="h-8 w-[72px] bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>{TAMANOS.map((t) => <SelectItem key={t} value={String(t)}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <span>Página {Math.min(pagina, paginas)} de {paginas}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>Siguiente</Button>
        </div>
      </div>
    </div>
  );
}

export function FilasSkeleton({ columnas, filas = 8 }: { columnas: number; filas?: number }) {
  return (
    <>
      {Array.from({ length: filas }).map((_, i) => (
        <tr key={i}>{Array.from({ length: columnas }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
      ))}
    </>
  );
}
