import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, withUser } from "../helpers/pglite";
import { asignarRol, concederPermiso, crearCatalogosBasicos, crearUsuario } from "../helpers/fixtures";

const ADMIN_A = "10000000-0000-4000-8000-000000000001";
const AUX_A = "10000000-0000-4000-8000-000000000002";
const OWNER_B = "20000000-0000-4000-8000-000000000001";
const AUX_B = "20000000-0000-4000-8000-000000000002";

describe("RLS: Aislamiento Multi-Ecosistema", () => {
  let db: PGlite;
  let catA: { tipoId: string; marcaId: string; sedeId: string };
  let catB: { tipoId: string; marcaId: string; sedeId: string };

  beforeEach(async () => {
    db = await createTestDatabase();

    // Crear usuarios de ecosistema A (Admin y Auxiliar)
    await crearUsuario(db, ADMIN_A, "adminA@finesa.com", "Admin A");
    await asignarRol(db, ADMIN_A, "admin");
    await crearUsuario(db, AUX_A, "auxA@finesa.com", "Auxiliar A");
    await asignarRol(db, AUX_A, "auxiliar", ADMIN_A);
    await concederPermiso(db, AUX_A, "equipos_editar");
    await concederPermiso(db, AUX_A, "empleados_editar");

    // Crear auxiliar de ecosistema B (asociado a OWNER_B)
    await crearUsuario(db, AUX_B, "auxB@finesa.com", "Auxiliar B");
    await asignarRol(db, AUX_B, "auxiliar", OWNER_B);
    await concederPermiso(db, AUX_B, "equipos_editar");

    // Catálogos para cada ecosistema
    catA = await crearCatalogosBasicos(db, ADMIN_A);
    catB = await crearCatalogosBasicos(db, OWNER_B);

    // Empleado en Ecosistema A
    await db.query(
      `insert into public.empleados (nombre, identificacion, owner_id)
       values ('Empleado A', '101010', $1::uuid)`,
      [ADMIN_A]
    );

    // Empleado en Ecosistema B
    await db.query(
      `insert into public.empleados (nombre, identificacion, owner_id)
       values ('Empleado B', '202020', $1::uuid)`,
      [OWNER_B]
    );

    // Equipo en Ecosistema A
    await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SR-ECO-A1', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid)`,
      [catA.tipoId, catA.marcaId, catA.sedeId, ADMIN_A]
    );

    // Equipo en Ecosistema B
    await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SR-ECO-B1', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid)`,
      [catB.tipoId, catB.marcaId, catB.sedeId, OWNER_B]
    );
  });

  it("Admin A solo puede ver empleados de su propio ecosistema", async () => {
    await withUser(db, ADMIN_A, async () => {
      const res = await db.query("select identificacion from public.empleados");
      const ids = res.rows.map((r) => (r as { identificacion: string }).identificacion);
      expect(ids).toContain("101010");
      expect(ids).not.toContain("202020");
    });
  });

  it("Auxiliar A solo ve empleados del ecosistema de su Administrador", async () => {
    await withUser(db, AUX_A, async () => {
      const res = await db.query("select identificacion from public.empleados");
      const ids = res.rows.map((r) => (r as { identificacion: string }).identificacion);
      expect(ids).toContain("101010");
      expect(ids).not.toContain("202020");
    });
  });

  it("Auxiliar B no ve equipos del ecosistema A", async () => {
    await withUser(db, AUX_B, async () => {
      const res = await db.query("select serie from public.equipos");
      const series = res.rows.map((r) => (r as { serie: string }).serie);
      expect(series).toContain("SR-ECO-B1");
      expect(series).not.toContain("SR-ECO-A1");
    });
  });

  it("Auxiliar A no puede insertar equipos asignados al ecosistema B", async () => {
    await withUser(db, AUX_A, async () => {
      // Intenta insertar con owner_id = OWNER_B (la política RLS with check exige owner_id = my_owner_id())
      await expect(
        db.query(
          `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
           values ('HACK-01', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid)`,
          [catA.tipoId, catA.marcaId, catA.sedeId, OWNER_B]
        )
      ).rejects.toThrow();
    });
  });

  it("Admin A solo ve catálogos de su ecosistema", async () => {
    await withUser(db, ADMIN_A, async () => {
      const res = await db.query("select id from public.catalogo_items");
      const ids = res.rows.map((r) => (r as { id: string }).id);
      expect(ids).toContain(catA.tipoId);
      expect(ids).not.toContain(catB.tipoId);
    });
  });
});
