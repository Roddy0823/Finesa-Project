import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Permiso } from "./constantes";

export type Me = {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  roles: string[];
  permisos: Permiso[];
  isAdmin: boolean;
  isStaff: boolean;
  isEmpleado: boolean;
  can: (p: Permiso) => boolean;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 10_000,
  refetchOnWindowFocus: true,
  queryFn: async (): Promise<Me | null> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const id = u.user.id;
    const [p, r, pe] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id),
      supabase.from("user_permisos").select("permiso").eq("user_id", id),
    ]);
    const roles = (r.data ?? []).map((x) => x.role as string);
    const dbPermisos = (pe.data ?? []).map((x) => x.permiso as Permiso);
    const rawExtra = (u.user.app_metadata as { permisos_extra?: unknown } | undefined)?.permisos_extra;
    const extraPermisos = Array.isArray(rawExtra)
      ? (rawExtra.filter((x): x is string => typeof x === "string") as Permiso[])
      : [];
    const permisos = [...new Set<Permiso>([...dbPermisos, ...extraPermisos])];
    const activo = p.data?.activo ?? false;
    const isAdmin = activo && roles.includes("admin");
    const isStaff = activo && (isAdmin || roles.includes("auxiliar"));
    return {
      id,
      email: u.user.email ?? "",
      nombre: p.data?.nombre || u.user.email || "",
      activo,
      roles,
      permisos,
      isAdmin,
      isStaff,
      isEmpleado: activo && roles.includes("empleado") && !isStaff,
      can: (x) => isAdmin || (isStaff && permisos.includes(x)),
    };
  },
});

export function useMe() {
  return useQuery(meQuery);
}
