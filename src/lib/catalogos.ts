import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CatItem = { id: string; tipo: string; nombre: string; activo: boolean };

export const catalogosQuery = queryOptions({
  queryKey: ["catalogos"],
  queryFn: async () => {
    const { data, error } = await supabase.from("catalogo_items").select("id, tipo, nombre, activo").order("nombre");
    if (error) throw error;
    return data as CatItem[];
  },
});

export function useCatalogos() {
  const q = useQuery(catalogosQuery);
  const all = q.data ?? [];
  const byTipo = (tipo: string, soloActivos = true) => all.filter((c) => c.tipo === tipo && (!soloActivos || c.activo));
  const nombre = (id?: string | null) => all.find((c) => c.id === id)?.nombre ?? "—";
  return { ...q, all, byTipo, nombre };
}
