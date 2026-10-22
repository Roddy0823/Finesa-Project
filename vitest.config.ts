import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

/**
 * Configuración de pruebas independiente de vite.config.ts (no carga los plugins
 * de TanStack Start / Nitro). Dos proyectos:
 *  - unit: funciones críticas de servidor con dependencias simuladas.
 *  - rls:  migraciones reales ejecutadas sobre Postgres embebido (PGlite) para
 *          validar políticas RLS, triggers y RPC de negocio.
 */
export default defineConfig({
  resolve: {
    alias: { "@": src },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.setup.ts"],
          restoreMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: "rls",
          environment: "node",
          include: ["tests/rls/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
