import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearSupabaseMock, filtro, type SupabaseMock } from "../helpers/supabase-mock";

const h = vi.hoisted(() => ({
  admin: null as unknown as { client: Record<string, unknown> },
  ejecutar: vi.fn(),
  cargar: vi.fn(async () => ({ acta: { estado: "pendiente" } })),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: new Proxy({}, { get: (_t, p) => h.admin.client[p as string] }),
}));
vi.mock("@/lib/firmas.server", () => ({
  ejecutarFirma: h.ejecutar,
  cargarActaCompleta: h.cargar,
  actaDTO: (c: unknown) => c,
  clientIp: () => "127.0.0.1",
  registrarAuditoria: vi.fn(),
}));
vi.mock("@/lib/security.server", () => ({ checkRateLimit: () => ({ allowed: true }) }));
import { crearEnlaceFirma, obtenerActaPorToken, firmarConToken } from "@/lib/firmas.functions";

const ACTA = "a0000000-0000-4000-8000-000000000001";
const TOKEN = "a".repeat(64);
const NOW = Date.parse("2026-10-27T20:00:00Z");
const TTL = 15 * 60_000;
type Fn = (opts: { data: unknown; context?: unknown }) => Promise<Record<string, unknown>>;
const call = (fn: unknown, data: unknown, context?: unknown) => (fn as Fn)({ data, context });
let admin: SupabaseMock;
let row: Record<string, unknown>;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.ejecutar.mockClear();
  h.cargar.mockClear();
  row = { id: "token-id", token: TOKEN, acta_id: ACTA, used_at: null,
    created_at: new Date(NOW).toISOString(), expires_at: new Date(NOW + TTL).toISOString() };
  admin = crearSupabaseMock({ onQuery: (q) => {
    if (q.op === "select") return { data: row };
    if (q.op === "update") return { data: [{ id: row.id }] };
    return {};
  } });
  h.admin = admin as unknown as typeof h.admin;
});
afterEach(() => vi.useRealTimers());

describe("vigencia de enlaces de firma", () => {
  it("permite consultar antes del vencimiento y entrega su fecha límite", async () => {
    vi.setSystemTime(NOW + TTL - 1);
    const result = await call(obtenerActaPorToken, { token: TOKEN });
    expect(result.error).toBeNull();
    expect(result.expires).toBe(row.expires_at);
  });
  it.each([TTL, TTL + 1])("rechaza consultar y firmar a los %i ms, aunque la página ya estuviera abierta", async (elapsed) => {
    await call(obtenerActaPorToken, { token: TOKEN });
    vi.setSystemTime(NOW + elapsed);
    expect((await call(obtenerActaPorToken, { token: TOKEN })).error).toContain("15 minutos");
    await expect(call(firmarConToken, { token: TOKEN, firma: "data:image/png;base64,test" })).rejects.toThrow("nuevo enlace");
    expect(h.ejecutar).not.toHaveBeenCalled();
    expect(admin.find("tokens_firma", "update")).toHaveLength(0);
  });
  it("aplica 15 minutos también a enlaces antiguos emitidos por 48 horas", async () => {
    row.expires_at = new Date(NOW + 48 * 3600_000).toISOString();
    vi.setSystemTime(NOW + TTL);
    expect((await call(obtenerActaPorToken, { token: TOKEN })).acta).toBeNull();
    expect(h.cargar).not.toHaveBeenCalled();
  });
  it("no permite usar enlaces revocados", async () => {
    row.used_at = new Date(NOW).toISOString();
    await expect(call(firmarConToken, { token: TOKEN, firma: "data:image/png;base64,test" })).rejects.toThrow("utilizado");
    expect(h.ejecutar).not.toHaveBeenCalled();
  });
  it("vuelve a condicionar el consumo a las fechas y al uso del token", async () => {
    await call(firmarConToken, { token: TOKEN, firma: "data:image/png;base64,test" });
    const update = admin.find("tokens_firma", "update")[0]!;
    expect(filtro(update, "used_at", "is")).toBeNull();
    expect(filtro(update, "expires_at", "gt")).toBe(new Date(NOW).toISOString());
    expect(filtro(update, "created_at", "gt")).toBe(new Date(NOW - TTL).toISOString());
    expect(h.ejecutar).toHaveBeenCalledOnce();
  });
  it("genera enlaces distintos de 15 minutos e invalida el anterior", async () => {
    const sb = crearSupabaseMock({ onRpc: () => ({ data: true }), onQuery: () => ({ data: { id: ACTA, estado: "pendiente" } }) });
    const context = { userId: ACTA, supabase: sb.client };
    const first = await call(crearEnlaceFirma, { actaId: ACTA }, context);
    const second = await call(crearEnlaceFirma, { actaId: ACTA }, context);
    expect(first.expires).toBe(new Date(NOW + TTL).toISOString());
    expect(first.token).not.toBe(second.token);
    expect(admin.queries.map(q => q.op)).toEqual(["update", "insert", "update", "insert"]);
    expect(filtro(admin.queries[0]!, "acta_id")).toBe(ACTA);
  });
  it("no emite otro enlace si no pudo invalidar el anterior", async () => {
    admin.setOnQuery(() => ({ error: { message: "fallo" } }));
    const sb = crearSupabaseMock({ onRpc: () => ({ data: true }), onQuery: () => ({ data: { id: ACTA, estado: "pendiente" } }) });
    await expect(call(crearEnlaceFirma, { actaId: ACTA }, { userId: ACTA, supabase: sb.client })).rejects.toThrow("invalidar");
    expect(admin.find("tokens_firma", "insert")).toHaveLength(0);
  });
});
