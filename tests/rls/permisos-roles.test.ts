import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, withUser } from "../helpers/pglite";
import { asignarRol, concederPermiso, crearCatalogosBasicos, crearUsuario } from "../helpers/fixtures";

const ADMIN_ID = "40000000-0000-4000-8000-000000000001";
const AUX_SIN_PERMISO = "40000000-0000-4000-8000-000000000002";
const AUX_CON_PERMISO = "40000000-0000-4000-8000-000000000003";

describe("RLS y Seguridad: Roles y Permisos Granulares", () => {
  let db: PGlite;
  let cat: { tipoId: string; marcaId: string; sedeId: string };
  let empleadoId: string;

  beforeEach(async () => {
    db = await createTestDatabase();

    await crearUsuario(db, ADMIN_ID, "admin@finesa.com", "Admin TI");
    await asignarRol(db, ADMIN_ID, "admin");

    // Auxiliar sin permisos
    await crearUsuario(db, AUX_SIN_PERMISO, "aux_no@finesa.com", "Auxiliar Sin Permisos");
    await asignarRol(db, AUX_SIN_PERMISO, "auxiliar", ADMIN_ID);

    // Auxiliar con permisos selectivos
    await crearUsuario(db, AUX_CON_PERMISO, "aux_si@finesa.com", "Auxiliar Con Permisos");
    await asignarRol(db, AUX_CON_PERMISO, "auxiliar", ADMIN_ID);

    cat = await crearCatalogosBasicos(db, ADMIN_ID);

    const empRes = await db.query(
      `insert into public.empleados (nombre, identificacion, owner_id)
       values ('Empleado Prueba', '55443322', $1::uuid) returning id`,
      [ADMIN_ID]
    );
    empleadoId = (empRes.rows[0] as { id: string }).id;
  });

  it("Seguridad de roles: usuario autenticado no tiene permiso de INSERT en user_roles", async () => {
    await withUser(db, AUX_SIN_PERMISO, async () => {
      await expect(
        db.query(
          `insert into public.user_roles (user_id, role, owner_id)
           values ($1::uuid, 'auxiliar', $2::uuid)`,
          [AUX_SIN_PERMISO, ADMIN_ID]
        )
      ).rejects.toThrow(/permission denied for table user_roles/);
    });
  });

  it("Trigger user_roles_guard_admin: rechaza la asignación de rol admin si auth.uid() está presente", async () => {
    // Simulamos un contexto donde auth.uid() está definido (llamada desde backend en nombre de usuario)
    await db.exec(`set request.jwt.claim.sub = '${ADMIN_ID}';`);
    try {
      await expect(
        db.query(
          `insert into public.user_roles (user_id, role, owner_id)
           values ($1::uuid, 'admin', null)`,
          [AUX_SIN_PERMISO]
        )
      ).rejects.toThrow(/El rol de Administrador solo se asigna directamente en la base de datos/);
    } finally {
      await db.exec(`set request.jwt.claim.sub = '';`);
    }
  });

  it("Restricción user_roles_un_solo_admin: la base de datos no tolera más de un administrador", async () => {
    // Intentando asignar como service_role/superusuario otro admin
    await expect(
      db.query(
        `insert into public.user_roles (user_id, role, owner_id)
         values ($1::uuid, 'admin', null)`,
        [AUX_CON_PERMISO]
      )
    ).rejects.toThrow(/user_roles_un_solo_admin/);
  });

  it("RLS Crear equipos: deniega la creación a quien no tenga 'equipos_editar'", async () => {
    await withUser(db, AUX_SIN_PERMISO, async () => {
      await expect(
        db.query(
          `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
           values ('SN-RECHAZADO', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid)`,
          [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
        )
      ).rejects.toThrow();
    });

    // Otorgamos el permiso
    await concederPermiso(db, AUX_CON_PERMISO, "equipos_editar");

    await withUser(db, AUX_CON_PERMISO, async () => {
      const res = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-PERMITIDO', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      expect(res.rows).toHaveLength(1);
    });
  });

  it("RLS Crear actas de entrega: exige permiso actas_entrega", async () => {
    await withUser(db, AUX_SIN_PERMISO, async () => {
      await expect(
        db.query(
          `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
           values ('entrega', $1::uuid, $2::uuid, $3::uuid)`,
          [empleadoId, AUX_SIN_PERMISO, ADMIN_ID]
        )
      ).rejects.toThrow();
    });

    await concederPermiso(db, AUX_CON_PERMISO, "actas_entrega");

    await withUser(db, AUX_CON_PERMISO, async () => {
      const res = await db.query(
        `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
         values ('entrega', $1::uuid, $2::uuid, $3::uuid) returning id`,
        [empleadoId, AUX_CON_PERMISO, ADMIN_ID]
      );
      expect(res.rows).toHaveLength(1);
    });
  });

  it("RLS Crear actas de cambio: exige ambos permisos (actas_entrega y actas_devolucion)", async () => {
    // Solo con actas_entrega
    await concederPermiso(db, AUX_CON_PERMISO, "actas_entrega");

    await withUser(db, AUX_CON_PERMISO, async () => {
      await expect(
        db.query(
          `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
           values ('cambio', $1::uuid, $2::uuid, $3::uuid)`,
          [empleadoId, AUX_CON_PERMISO, ADMIN_ID]
        )
      ).rejects.toThrow();
    });

    // Otorgamos también actas_devolucion
    await concederPermiso(db, AUX_CON_PERMISO, "actas_devolucion");

    await withUser(db, AUX_CON_PERMISO, async () => {
      const res = await db.query(
        `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
         values ('cambio', $1::uuid, $2::uuid, $3::uuid) returning id`,
        [empleadoId, AUX_CON_PERMISO, ADMIN_ID]
      );
      expect(res.rows).toHaveLength(1);
    });
  });
});
