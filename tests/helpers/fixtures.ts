import type { PGlite } from "@electric-sql/pglite";

export interface TestUser {
  id: string;
  email: string;
  nombre: string;
}

/**
 * Inserta un usuario con perfil en la base de datos de pruebas.
 */
export async function crearUsuario(db: PGlite, id: string, email: string, nombre: string): Promise<TestUser> {
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1::uuid, $2::text, jsonb_build_object('nombre', $3::text))`,
    [id, email, nombre]
  );
  // El trigger on_auth_user_created inserta el perfil
  return { id, email, nombre };
}

/**
 * Asigna rol a un usuario (como superusuario / service_role).
 */
export async function asignarRol(
  db: PGlite,
  userId: string,
  role: "admin" | "auxiliar" | "empleado",
  ownerId?: string | null
): Promise<void> {
  await db.query(
    `insert into public.user_roles (user_id, role, owner_id)
     values ($1::uuid, $2::public.app_role, $3::uuid)`,
    [userId, role, ownerId ?? (role === "admin" ? userId : null)]
  );
}

/**
 * Concede un permiso de base de datos a un usuario.
 */
export async function concederPermiso(
  db: PGlite,
  userId: string,
  permiso: string
): Promise<void> {
  await db.query(
    `insert into public.user_permisos (user_id, permiso)
     values ($1::uuid, $2::public.app_permiso)`,
    [userId, permiso]
  );
}

/**
 * Crea ítems de catálogo mínimos requeridos (tipo de equipo, marca, sede).
 */
export async function crearCatalogosBasicos(db: PGlite, ownerId: string): Promise<{ tipoId: string; marcaId: string; sedeId: string }> {
  const tipoRes = await db.query(
    `insert into public.catalogo_items (tipo, nombre, owner_id)
     values ('tipo_equipo', 'Portátil Test', $1::uuid) returning id`,
    [ownerId]
  );
  const marcaRes = await db.query(
    `insert into public.catalogo_items (tipo, nombre, owner_id)
     values ('marca', 'Dell Test', $1::uuid) returning id`,
    [ownerId]
  );
  const sedeRes = await db.query(
    `insert into public.catalogo_items (tipo, nombre, owner_id)
     values ('sede', 'Principal Test', $1::uuid) returning id`,
    [ownerId]
  );

  return {
    tipoId: (tipoRes.rows[0] as { id: string }).id,
    marcaId: (marcaRes.rows[0] as { id: string }).id,
    sedeId: (sedeRes.rows[0] as { id: string }).id,
  };
}
