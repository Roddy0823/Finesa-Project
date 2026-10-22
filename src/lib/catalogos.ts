import { queryOptions, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CatItem = { id: string; tipo: string; nombre: string; activo: boolean };

const EMPTY_ITEMS: CatItem[] = [];

export const catalogosQuery = queryOptions({
  queryKey: ["catalogos"],
  staleTime: 5 * 60_000,
  gcTime: 15 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from("catalogo_items").select("id, tipo, nombre, activo").order("nombre");
    if (error) throw error;
    return data as CatItem[];
  },
});

export function useCatalogos() {
  const q = useQuery(catalogosQuery);
  const all = q.data ?? EMPTY_ITEMS;

  const { mapNombre, mapActivos, mapTodos } = useMemo(() => {
    const mapNombre = new Map<string, string>();
    const mapActivos = new Map<string, CatItem[]>();
    const mapTodos = new Map<string, CatItem[]>();
    for (const item of all) {
      mapNombre.set(item.id, item.nombre);
      const tList = mapTodos.get(item.tipo);
      if (tList) tList.push(item);
      else mapTodos.set(item.tipo, [item]);
      if (item.activo) {
        const aList = mapActivos.get(item.tipo);
        if (aList) aList.push(item);
        else mapActivos.set(item.tipo, [item]);
      }
    }
    return { mapNombre, mapActivos, mapTodos };
  }, [all]);

  const byTipo = useCallback(
    (tipo: string, soloActivos = true): CatItem[] =>
      (soloActivos ? mapActivos.get(tipo) : mapTodos.get(tipo)) ?? EMPTY_ITEMS,
    [mapActivos, mapTodos],
  );

  const nombre = useCallback((id?: string | null): string => (id ? (mapNombre.get(id) ?? "—") : "—"), [mapNombre]);

  return { ...q, all, byTipo, nombre };
}
