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
  staleTime: 2 * 60_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  queryFn: async (): Promise<Me | null> => {
    const { data: s } = await supabase.auth.getSession();
    let sessionUser = s.session?.user ?? null;
    if (!sessionUser) {
      const { data: u } = await supabase.auth.getUser();
      sessionUser = u.user;
    }
    if (!sessionUser) return null;
    const id = sessionUser.id;
    const [p, r, pe, freshUser] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id),
      supabase.from("user_permisos").select("permiso").eq("user_id", id),
      supabase.auth.getUser().catch(() => ({ data: { user: sessionUser } })),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    if (pe.error) throw pe.error;
    const user = freshUser.data?.user ?? sessionUser;
    const roles = (r.data ?? []).map((x) => x.role as string);
    const dbPermisos = (pe.data ?? []).map((x) => x.permiso as Permiso);
    const rawExtra = (user.app_metadata as { permisos_extra?: unknown } | undefined)?.permisos_extra;
    const extraPermisos = Array.isArray(rawExtra)
      ? (rawExtra.filter((x): x is string => typeof x === "string") as Permiso[])
      : [];
    const permisos = [...new Set<Permiso>([...dbPermisos, ...extraPermisos])];
    const activo = p.data?.activo ?? false;
    const isAdmin = activo && roles.includes("admin");
    const isStaff = activo && (isAdmin || roles.includes("auxiliar"));
    return {
      id,
      email: user.email ?? "",
      nombre: p.data?.nombre || user.email || "",
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
