import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase, withUser } from "../helpers/pglite";
import { asignarRol, concederPermiso, crearCatalogosBasicos, crearUsuario } from "../helpers/fixtures";

const ADMIN_ID = "30000000-0000-4000-8000-000000000001";
const AUX_ID = "30000000-0000-4000-8000-000000000002";

describe("RLS y Triggers: Equipos y Paz y Salvo", () => {
  let db: PGlite;
  let cat: { tipoId: string; marcaId: string; sedeId: string };
  let empleadoId: string;

  beforeEach(async () => {
    db = await createTestDatabase();

    await crearUsuario(db, ADMIN_ID, "admin@finesa.com", "Admin TI");
    await asignarRol(db, ADMIN_ID, "admin");

    await crearUsuario(db, AUX_ID, "aux@finesa.com", "Auxiliar TI");
    await asignarRol(db, AUX_ID, "auxiliar", ADMIN_ID);
    await concederPermiso(db, AUX_ID, "equipos_editar");
    await concederPermiso(db, AUX_ID, "empleados_editar");

    cat = await crearCatalogosBasicos(db, ADMIN_ID);

    // Crear un empleado
    const empRes = await db.query(
      `insert into public.empleados (nombre, identificacion, owner_id)
       values ('Carlos Empleado', '99887766', $1::uuid) returning id`,
      [ADMIN_ID]
    );
    empleadoId = (empRes.rows[0] as { id: string }).id;
  });

  it("Trigger equipos_bi: rechaza crear equipos con estado asignado directo", async () => {
    await withUser(db, AUX_ID, async () => {
      await expect(
        db.query(
          `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
           values ('SN-BAD-STATUS', $1::uuid, $2::uuid, $3::uuid, 'asignado', $4::uuid)`,
          [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
        )
      ).rejects.toThrow(/Un equipo nuevo solo puede registrarse como Disponible o En reparación/);
    });
  });

  it("Trigger equipos_ai: inserta automáticamente el evento 'ingreso' en el historial", async () => {
    await withUser(db, AUX_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-AUTO-HIST', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      const eqId = (eqRes.rows[0] as { id: string }).id;

      const hist = await db.query(
        `select evento, detalle from public.equipo_historial where equipo_id = $1::uuid`,
        [eqId]
      );
      expect(hist.rows).toHaveLength(1);
      expect((hist.rows[0] as { evento: string }).evento).toBe("ingreso");
      expect((hist.rows[0] as { detalle: string }).detalle).toContain("disponible");
    });
  });

  it("Trigger equipos_bu: la serie es inmutable y bloquea cambios directos", async () => {
    let eqId = "";
    await withUser(db, AUX_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-INMUTABLE-1', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      eqId = (eqRes.rows[0] as { id: string }).id;

      // Intento de modificar la serie directamente
      await expect(
        db.query(`update public.equipos set serie = 'SN-HACKED' where id = $1::uuid`, [eqId])
      ).rejects.toThrow(/El número de serie no se puede modificar/);
    });
  });

  it("RPC corregir_serie: el Administrador sí puede corregir la serie registrando un motivo", async () => {
    let eqId = "";
    await withUser(db, ADMIN_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-ERROR-TIPEO', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      eqId = (eqRes.rows[0] as { id: string }).id;

      // El admin ejecuta la RPC oficial
      await db.query(`select public.corregir_serie($1::uuid, 'SN-CORREGIDA-01', 'Corrección de placa')`, [eqId]);

      const eq = await db.query(`select serie from public.equipos where id = $1::uuid`, [eqId]);
      expect((eq.rows[0] as { serie: string }).serie).toBe("SN-CORREGIDA-01");

      const hist = await db.query(
        `select evento, detalle from public.equipo_historial where equipo_id = $1::uuid and evento = 'correccion_serie'`,
        [eqId]
      );
      expect(hist.rows).toHaveLength(1);
      expect((hist.rows[0] as { detalle: string }).detalle).toContain("Corrección de placa");
    });
  });

  it("Trigger equipos_bu: bloquea cambios directos de estado sin contexto", async () => {
    let eqId = "";
    await withUser(db, AUX_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-BLOQUEO-EST', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      eqId = (eqRes.rows[0] as { id: string }).id;

      // Intentar update directo de estado
      await expect(
        db.query(`update public.equipos set estado = 'en_reparacion' where id = $1::uuid`, [eqId])
      ).rejects.toThrow(/El estado del equipo solo cambia mediante actas firmadas o con un motivo registrado/);
    });
  });

  it("Trigger empleados_bu (Paz y Salvo): bloquea desactivar empleado si tiene equipos asignados", async () => {
    let eqId = "";
    // Insertamos equipo asignado al empleado (usando contexto service_role / app.estado_ok)
    await db.exec(`
      set app.estado_ok = '1';
    `);
    const eqRes = await db.query(
      `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, empleado_id, owner_id)
       values ('SN-ASIGNADO-EMP', $1::uuid, $2::uuid, $3::uuid, 'disponible', null, $4::uuid) returning id`,
      [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
    );
    eqId = (eqRes.rows[0] as { id: string }).id;

    await db.query(
      `update public.equipos set estado = 'asignado', empleado_id = $1::uuid where id = $2::uuid`,
      [empleadoId, eqId]
    );
    await db.exec(`
      set app.estado_ok = '';
    `);

    // Intentamos retirar o desactivar al empleado desde el rol del usuario
    await withUser(db, AUX_ID, async () => {
      await expect(
        db.query(`update public.empleados set activo = false where id = $1::uuid`, [empleadoId])
      ).rejects.toThrow(/PAZ_Y_SALVO/);
    });
  });

  it("RPC cambiar_estado_equipo: da de baja un equipo y adjunta el soporte técnico contable", async () => {
    let eqId = "";
    await withUser(db, ADMIN_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-PARA-BAJA', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      eqId = (eqRes.rows[0] as { id: string }).id;

      // El admin ejecuta la RPC para dar de baja con documento adjunto
      await db.query(
        `select public.cambiar_estado_equipo(
           $1::uuid,
           'de_baja'::public.equipo_estado,
           'Obsolescencia tecnológica comprobada',
           null,
           'bajas/acta-baja-101.pdf'
         )`,
        [eqId]
      );

      const eq = await db.query(
        `select estado, baja_documento_path from public.equipos where id = $1::uuid`,
        [eqId]
      );
      expect((eq.rows[0] as { estado: string }).estado).toBe("de_baja");
      expect((eq.rows[0] as { baja_documento_path: string }).baja_documento_path).toBe("bajas/acta-baja-101.pdf");

      const hist = await db.query(
        `select evento, detalle from public.equipo_historial where equipo_id = $1::uuid and evento = 'de_baja'`,
        [eqId]
      );
      expect(hist.rows).toHaveLength(1);
      expect((hist.rows[0] as { detalle: string }).detalle).toContain("Soporte de baja adjunto");
    });
  });

  it("RPC cambiar_estado_equipo: envía a reparación con argumentos nombrados sin ambigüedad", async () => {
    let eqId = "";
    await withUser(db, ADMIN_ID, async () => {
      const eqRes = await db.query(
        `insert into public.equipos (serie, tipo_id, marca_id, sede_id, estado, owner_id)
         values ('SN-REPARACION-1', $1::uuid, $2::uuid, $3::uuid, 'disponible', $4::uuid) returning id`,
        [cat.tipoId, cat.marcaId, cat.sedeId, ADMIN_ID]
      );
      eqId = (eqRes.rows[0] as { id: string }).id;

      // Invocación con argumentos nombrados (exactamente como lo hace PostgREST al recibir el JSON del frontend)
      await db.query(
        `select public.cambiar_estado_equipo(
           p_equipo => $1::uuid,
           p_estado => 'en_reparacion'::public.equipo_estado,
           p_motivo => 'Falla en tarjeta madre',
           p_proveedor => null
         )`,
        [eqId]
      );

      const eq = await db.query(
        `select estado, reparacion_inicio from public.equipos where id = $1::uuid`,
        [eqId]
      );
      expect((eq.rows[0] as { estado: string }).estado).toBe("en_reparacion");
      expect((eq.rows[0] as { reparacion_inicio: string | null }).reparacion_inicio).not.toBeNull();
    });
  });
});
