import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, withUser } from "../helpers/pglite";
import { asignarRol, concederPermiso, crearCatalogosBasicos, crearUsuario } from "../helpers/fixtures";

const ADMIN_ID = "60000000-0000-4000-8000-000000000001";
const AUX_ID = "60000000-0000-4000-8000-000000000002";

describe("RLS y Triggers: Ciclo de Actas e Inmutabilidad de Auditoría", () => {
  let db: PGlite;
  let cat: { tipoId: string; marcaId: string; sedeId: string };
  let empId: string;
  let eqId: string;

  beforeEach(async () => {
    db = await createTestDatabase();

    await crearUsuario(db, ADMIN_ID, "admin@finesa.com", "Admin TI");
    await asignarRol(db, ADMIN_ID, "admin");

    await crearUsuario(db, AUX_ID, "aux@finesa.com", "Auxiliar TI");
    await asignarRol(db, AUX_ID, "auxiliar", ADMIN_ID);
    await concederPermiso(db, AUX_ID, "actas_entrega");
    await concederPermiso(db, AUX_ID, "equipos_editar");

    cat = await crearCatalogosBasicos(db, ADMIN_ID);

    const empRes = await db.query(
      `insert into public.empleados (nombre, identificacion, owner_id)
       values ('Empleado Test', '77889900', $1::uuid) returning id`,
      [ADMIN_ID]
    );
    empId = (empRes.rows[0] as { id: string }).id;

    const eqRes = await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
       values ('SN-ACTA-TEST', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
      [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
    );
    eqId = (eqRes.rows[0] as { id: string }).id;
  });

  it("Trigger auditoria_no_update: bloquea UPDATE sobre la tabla auditoria", async () => {
    // Insertamos un registro de auditoría
    await db.query(
      `insert into public.auditoria (user_id, tabla, accion, detalle)
       values ($1::uuid, 'equipos', 'TEST', 'Detalle inicial')`,
      [ADMIN_ID]
    );

    // Intentamos modificar el registro
    await expect(
      db.query(`update public.auditoria set detalle = 'Detalle alterado'`)
    ).rejects.toThrow(/La auditoría no puede modificarse ni eliminarse/);
  });

  it("Trigger auditoria_no_update: bloquea DELETE sobre la tabla auditoria", async () => {
    await db.query(
      `insert into public.auditoria (user_id, tabla, accion, detalle)
       values ($1::uuid, 'equipos', 'TEST', 'Detalle para borrar')`,
      [ADMIN_ID]
    );

    await expect(
      db.query(`delete from public.auditoria`)
    ).rejects.toThrow(/La auditoría no puede modificarse ni eliminarse/);
  });

  it("Seguridad de actas: el usuario autenticado no tiene permiso directo de UPDATE", async () => {
    const aRes = await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, estado, owner_id)
       values ('entrega', $1::uuid, $2::uuid, 'pendiente', $3::uuid) returning id`,
      [empId, ADMIN_ID, ADMIN_ID]
    );
    const actaId = (aRes.rows[0] as { id: string }).id;

    await withUser(db, ADMIN_ID, async () => {
      await expect(
        db.query(`update public.actas set estado = 'firmada' where id = $1::uuid`, [actaId])
      ).rejects.toThrow(/permission denied for table actas/);
    });
  });

  it("Trigger actas_before_update: un acta anulada no puede reactivarse ni cambiar de estado", async () => {
    // 1. Crear acta (el trigger actas_bi fuerza estado inicial 'pendiente')
    const aRes = await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, owner_id)
       values ('entrega', $1::uuid, $2::uuid, $3::uuid) returning id`,
      [empId, ADMIN_ID, ADMIN_ID]
    );
    const actaId = (aRes.rows[0] as { id: string }).id;

    // 2. Anular el acta legítimamente
    await db.query(
      `update public.actas set estado = 'anulada', anulada_motivo = 'Error de digitación' where id = $1::uuid`,
      [actaId]
    );

    // 3. Intentar reactivarla o cambiar su estado: el trigger actas_bu lo bloquea
    await expect(
      db.query(`update public.actas set estado = 'pendiente' where id = $1::uuid`, [actaId])
    ).rejects.toThrow(/Un acta anulada no puede cambiar de estado/);
  });

  it("Trigger actas_after_update: al firmar un acta de entrega, el equipo pasa automáticamente a 'asignado'", async () => {
    // 1. Crear acta pendiente
    const aRes = await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, estado, owner_id)
       values ('entrega', $1::uuid, $2::uuid, 'pendiente', $3::uuid) returning id`,
      [empId, ADMIN_ID, ADMIN_ID]
    );
    const actaId = (aRes.rows[0] as { id: string }).id;

    // 2. Asociar ítem de acta
    await db.query(
      `insert into public.acta_items (acta_id, equipo_id, direccion, estado_destino)
       values ($1::uuid, $2::uuid, 'entrega', 'disponible')`,
      [actaId, eqId]
    );

    // 3. Simular la firma del acta (update estado a 'firmada')
    await db.query(
      `update public.actas set estado = 'firmada', firmado_at = now() where id = $1::uuid`,
      [actaId]
    );

    // 4. Verificar que el trigger actas_after_update actualizó el equipo
    const eq = await db.query(`select estado, empleado_id from public.equipos where id = $1::uuid`, [eqId]);
    expect((eq.rows[0] as { estado: string }).estado).toBe("asignado");
    expect((eq.rows[0] as { empleado_id: string }).empleado_id).toBe(empId);

    // 5. Verificar que se registró en el historial del equipo
    const hist = await db.query(
      `select evento, acta_id from public.equipo_historial where equipo_id = $1::uuid and acta_id = $2::uuid`,
      [eqId, actaId]
    );
    expect(hist.rows).toHaveLength(1);
    expect((hist.rows[0] as { evento: string }).evento).toBe("entrega");
  });

  it("Storage WORM: las políticas RLS impiden DELETE y UPDATE sobre archivos en el bucket 'actas'", async () => {
    // 1. Insertamos un archivo de acta en storage como service_role
    await db.query(
      `insert into storage.objects (bucket_id, name, owner)
       values ('actas', 'acta-oficial-123.pdf', $1::uuid)`,
      [ADMIN_ID]
    );

    // 2. Intentamos modificar el archivo como usuario autenticado (debe ser bloqueado por la política WORM)
    await withUser(db, ADMIN_ID, async () => {
      const upRes = await db.query(
        `update storage.objects set name = 'acta-alterada.pdf' where bucket_id = 'actas'`
      );
      // RLS con using (false) hace que 0 filas sean actualizadas
      expect(upRes.affectedRows).toBe(0);

      // Intentamos eliminar el archivo (debe ser bloqueado por la política WORM)
      const delRes = await db.query(
        `delete from storage.objects where bucket_id = 'actas'`
      );
      expect(delRes.affectedRows).toBe(0);
    });
  });

  it("RPC panel_conteos_actas: totaliza las actas agrupadas por estado sin transferir filas", async () => {
    await db.query(
      `insert into public.actas (tipo, empleado_id, tecnico_id, estado, owner_id)
       values ('entrega', $1::uuid, $2::uuid, 'pendiente', $3::uuid)`,
      [empId, ADMIN_ID, ADMIN_ID]
    );

    await withUser(db, ADMIN_ID, async () => {
      const res = await db.query(
        `select * from public.panel_conteos_actas();`
      );
      const rows = res.rows as { estado: string; total: string | number }[];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      const row = rows.find((r) => r.estado === "pendiente");
      expect(row).toBeDefined();
      expect(Number(row!.total)).toBeGreaterThanOrEqual(1);
    });
  });
});
