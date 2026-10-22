import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/pglite";

describe("PGlite test setup", () => {
  it("carga el esquema de base de datos sin errores", async () => {
    const db = await createTestDatabase();
    const res = await db.query("select count(*)::int as total from pg_tables where schemaname = 'public'");
    expect((res.rows[0] as { total: number }).total).toBeGreaterThan(10);
  });
});
