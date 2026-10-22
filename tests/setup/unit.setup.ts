import { vi } from "vitest";
import { requestHeaders } from "../helpers/request";

// Variables de entorno mínimas que leen los módulos de servidor.
process.env["SUPABASE_URL"] = "http://supabase.test";
process.env["SUPABASE_PUBLISHABLE_KEY"] = "anon-test-key";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "service-role-secret-de-pruebas";

// Cabeceras HTTP simuladas (IP del cliente, user-agent) para clientIp() y la firma.
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: (name: string) => requestHeaders.get(name.toLowerCase()),
  getRequestIP: () => requestHeaders.get("x-socket-ip") ?? undefined,
}));

// createServerFn simulado: conserva el validador (zod) y expone el handler para
// invocarlo directamente con { data, context } sin servidor HTTP.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (d: unknown) => unknown = (d) => d;
    let middleware: unknown[] = [];
    const builder = {
      middleware(m: unknown[]) {
        middleware = m;
        return builder;
      },
      inputValidator(v: (d: unknown) => unknown) {
        validator = v;
        return builder;
      },
      handler(fn: (opts: { data: unknown; context: unknown }) => unknown) {
        const call = (opts: { data?: unknown; context?: unknown } = {}) =>
          fn({ data: validator(opts.data), context: opts.context });
        return Object.assign(call, { middlewareList: middleware });
      },
    };
    return builder;
  },
}));

// El middleware real valida el JWT contra Supabase; en pruebas el contexto se inyecta.
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: "requireSupabaseAuth" },
}));
