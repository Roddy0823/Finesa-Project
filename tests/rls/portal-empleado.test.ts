import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, withUser } from "../helpers/pglite";
import { asignarRol, crearCatalogosBasicos, crearUsuario } from "../helpers/fixtures";

const ADMIN_ID = "50000000-0000-4000-8000-000000000001";
const EMPLEADO_USER_1 = "50000000-0000-4000-8000-000000000002";
const EMPLEADO_USER_2 = "50000000-0000-4000-8000-000000000003";

describe("RLS y Portal: Restricciones del Rol Empleado", () => {
  let db: PGlite;
  let cat: { tipoId: string; marcaId: string; sedeId: string };
  let empRow1Id: string;
  let empRow2Id: string;
  let eqEmp1Id: string;
  let eqEmp2Id: string;
  let eqDispId: string;

  beforeEach(async () => {
    db = await createTestDatabase();

    await crearUsuario(db, ADMIN_ID, "admin@finesa.com", "Admin TI");
    await asignarRol(db, ADMIN_ID, "admin");

    // Empleado 1
    await crearUsuario(db, EMPLEADO_USER_1, "emp1@finesa.com", "Empleado Uno");
    await asignarRol(db, EMPLEADO_USER_1, "empleado");

    // Empleado 2
    await crearUsuario(db, EMPLEADO_USER_2, "emp2@finesa.com", "Empleado Dos");
    await asignarRol(db, EMPLEADO_USER_2, "empleado");

    cat = await crearCatalogosBasicos(db, ADMIN_ID);

    // Filas en public.empleados
    const resEmp1 = await db.query(
      `insert into public.empleados (nombre, identificacion, user_id, owner_id)
       values ('Empleado Uno', '111111', $1::uuid, $2::uuid) returning id`,
      [EMPLEADO_USER_1, ADMIN_ID]
    );
    empRow1Id = (resEmp1.rows[0] as { id: string }).id;

    const resEmp2 = await db.query(
      `insert into public.empleados (nombre, identificacion, user_id, owner_id)
       values ('Empleado Dos', '222222', $1::uuid, $2::uuid) returning id`,
      [EMPLEADO_USER_2, ADMIN_ID]
    );
    empRow2Id = (resEmp2.rows[0] as { id: string }).id;

    // Equipos: uno para Emp1, uno para Emp2, uno disponible
    await db.exec("set app.estado_ok = '1';");

    const r1 = await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SN-EMP-1', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
      [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
    );
    eqEmp1Id = (r1.rows[0] as { id: string }).id;
    await db.query(
      `update public.equipos set estado = 'asignado', empleado_id = $1::uuid where id = $2::uuid`,
      [empRow1Id, eqEmp1Id]
    );

    const r2 = await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SN-EMP-2', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
      [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
    );
    eqEmp2Id = (r2.rows[0] as { id: string }).id;
    await db.query(
      `update public.equipos set estado = 'asignado', empleado_id = $1::uuid where id = $2::uuid`,
      [empRow2Id, eqEmp2Id]
    );

    const r3 = await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SN-DISP', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
      [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
    );
    eqDispId = (r3.rows[0] as { id: string }).id;

    // Crear un acta para Emp1 y otra para Emp2
    await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
       values ('entrega', $1::uuid, $2::uuid, $3::uuid)`,
      [empRow1Id, ADMIN_ID, ADMIN_ID]
    );
    await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
       values ('entrega', $1::uuid, $2::uuid, $3::uuid)`,
      [empRow2Id, ADMIN_ID, ADMIN_ID]
    );

    await db.exec("set app.estado_ok = '';");
  });

  it("RLS Ver equipos: el empleado solo ve los equipos asignados a su persona", async () => {
    await withUser(db, EMPLEADO_USER_1, async () => {
      const res = await db.query("select serie from public.equipos");
      const series = res.rows.map((r) => (r as { serie: string }).serie);
      expect(series).toContain("SN-EMP-1");
      expect(series).not.toContain("SN-EMP-2");
      expect(series).not.toContain("SN-DISP");
    });
  });

  it("RLS Ver actas: el empleado solo ve sus propias actas", async () => {
    await withUser(db, EMPLEADO_USER_1, async () => {
      const res = await db.query("select empleado_id from public.actas");
      expect(res.rows).toHaveLength(1);
      expect((res.rows[0] as { empleado_id: string }).empleado_id).toBe(empRow1Id);
    });
  });

  it("RLS y permisos: ningún usuario autenticado tiene acceso directo a tokens_firma", async () => {
    // Insertamos un token como service_role
    await db.query(
      `insert into public.tokens_firma (acta_id, token, expires_at)
       select id, 'token-secreto-xyz', now() + interval '1 day' from public.actas limit 1`
    );

    await withUser(db, EMPLEADO_USER_1, async () => {
      await expect(
        db.query("select token from public.tokens_firma")
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("RPC reportar_falla: solo permite reportar sobre equipos propios a cargo", async () => {
    await withUser(db, EMPLEADO_USER_1, async () => {
      // Intenta reportar falla en equipo de otro empleado
      await expect(
        db.query(`select public.reportar_falla($1::uuid, 'Pantalla rota')`, [eqEmp2Id])
      ).rejects.toThrow(/El equipo no está a su cargo/);

      // Reporta falla en su propio equipo
      await db.query(`select public.reportar_falla($1::uuid, 'Teclado no responde')`, [eqEmp1Id]);

      const rep = await db.query(
        `select descripcion, estado from public.reportes_falla where equipo_id = $1::uuid`,
        [eqEmp1Id]
      );
      expect(rep.rows).toHaveLength(1);
      expect((rep.rows[0] as { estado: string }).estado).toBe("abierto");
    });
  });

  it("RLS Crear equipos: el empleado no puede insertar registros de equipos", async () => {
    await withUser(db, EMPLEADO_USER_1, async () => {
      await expect(
        db.query(
          `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
           values ('HACK-EMP', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid)`,
          [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
        )
      ).rejects.toThrow();
    });
  });
});
